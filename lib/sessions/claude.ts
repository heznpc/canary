/**
 * Claude Code CLI transcript parser (service-side).
 *
 * Reads ~/.claude/projects/<project>/<session-id>.jsonl message streams.
 * Schema notes mirror experiments/src/push-leakage/transcript-scan.ts —
 * that module computes leakage metrics; this one produces review surfaces
 * (session summaries, message timelines, file-access evidence).
 */
import { createReadStream } from "fs";
import { statSync } from "fs";
import { createInterface } from "readline";

import {
  extractPathsFromCommand,
  isRuleSurface,
  type FileAccessEntry,
  type SessionDetail,
  type SessionDetailMessage,
  type SessionSummary,
} from "./types";

const BOOKKEEPING_TYPES = new Set(["file-history-snapshot", "last-prompt"]);

const READ_TOOLS = new Set(["Read", "Glob", "Grep", "NotebookRead"]);
const WRITE_TOOLS = new Set(["Write", "Edit", "MultiEdit", "NotebookEdit"]);

function parseLine(line: string): Record<string, unknown> | null {
  if (!line.trim()) return null;
  try {
    return JSON.parse(line) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function textOfContent(content: unknown, cap = 20_000): string {
  if (typeof content === "string") return content.slice(0, cap);
  if (!Array.isArray(content)) return "";
  const parts: string[] = [];
  for (const block of content) {
    if (!block || typeof block !== "object") continue;
    const b = block as Record<string, unknown>;
    if (b.type === "text" && typeof b.text === "string") parts.push(b.text);
  }
  return parts.join("\n").slice(0, cap);
}

interface ToolUseBlock {
  name: string;
  input: Record<string, unknown>;
}

function toolUsesOf(content: unknown): ToolUseBlock[] {
  if (!Array.isArray(content)) return [];
  const out: ToolUseBlock[] = [];
  for (const block of content) {
    if (!block || typeof block !== "object") continue;
    const b = block as Record<string, unknown>;
    if (b.type === "tool_use" && typeof b.name === "string") {
      out.push({ name: b.name, input: (b.input as Record<string, unknown>) ?? {} });
    }
  }
  return out;
}

function fileAccessOfTool(tool: ToolUseBlock, ts: string | null): FileAccessEntry[] {
  const entries: FileAccessEntry[] = [];
  const push = (op: FileAccessEntry["op"], path: string, detail?: string) => {
    entries.push({ ts, tool: tool.name, op, path, flagged: isRuleSurface(path), detail });
  };
  const input = tool.input;
  const filePath =
    (input.file_path as string | undefined) ??
    (input.notebook_path as string | undefined) ??
    (input.path as string | undefined);
  if (READ_TOOLS.has(tool.name)) {
    if (filePath) push("read", filePath);
    return entries;
  }
  if (WRITE_TOOLS.has(tool.name)) {
    if (filePath) push("write", filePath);
    return entries;
  }
  if (tool.name === "Bash") {
    const cmd = (input.command as string | undefined) ?? "";
    for (const p of extractPathsFromCommand(cmd)) push("bash", p, cmd.slice(0, 200));
  }
  return entries;
}

interface ClaudeScanResult {
  summary: SessionSummary;
  fileAccess: FileAccessEntry[];
  parseErrors: number;
}

/**
 * Single streaming pass over one transcript producing the list-view summary
 * and the file-access evidence rows. Assistant messages are deduplicated by
 * message.id — Claude Code writes the same streamed assistant message to
 * disk more than once, and without this the tool counts inflate.
 */
export async function scanClaudeSession(jsonlPath: string): Promise<ClaudeScanResult> {
  const stem = jsonlPath.split("/").pop()?.replace(/\.jsonl$/, "") ?? jsonlPath;
  const seenAssistantIds = new Set<string>();
  const fileAccess: FileAccessEntry[] = [];
  let cwd: string | null = null;
  let gitBranch: string | null = null;
  let title = "";
  let summaryTitle = "";
  let firstTs: string | null = null;
  let lastTs: string | null = null;
  let userCount = 0;
  let assistantCount = 0;
  let toolCount = 0;
  let parseErrors = 0;

  const rl = createInterface({ input: createReadStream(jsonlPath, "utf-8"), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) continue;
    const msg = parseLine(line);
    if (!msg) {
      parseErrors += 1;
      continue;
    }
    const t = msg.type as string | undefined;
    if (!t) continue;
    if (t === "summary") {
      const s = msg.summary as string | undefined;
      if (s && !summaryTitle) summaryTitle = s;
      continue;
    }
    if (BOOKKEEPING_TYPES.has(t)) continue;
    const ts = (msg.timestamp as string | undefined) ?? null;
    if (ts) {
      if (!firstTs || ts < firstTs) firstTs = ts;
      if (!lastTs || ts > lastTs) lastTs = ts;
    }
    if (!cwd) cwd = (msg.cwd as string | undefined) ?? null;
    if (!gitBranch) gitBranch = (msg.gitBranch as string | undefined) ?? null;

    const message = msg.message as Record<string, unknown> | undefined;
    if (t === "user") {
      const text = textOfContent(message?.content, 2_000);
      if (text) {
        userCount += 1;
        if (!title) title = text.replace(/\s+/g, " ").slice(0, 120);
      }
    } else if (t === "assistant") {
      const id = message?.id as string | undefined;
      if (id) {
        if (seenAssistantIds.has(id)) continue;
        seenAssistantIds.add(id);
      }
      assistantCount += 1;
      for (const tool of toolUsesOf(message?.content)) {
        toolCount += 1;
        fileAccess.push(...fileAccessOfTool(tool, ts));
      }
    }
  }

  const stat = statSync(jsonlPath);
  const summary: SessionSummary = {
    id: `claude:${stem}`,
    source: "claude",
    jsonlPath,
    cwd,
    title: summaryTitle || title || "(untitled)",
    firstTs,
    lastTs,
    userCount,
    assistantCount,
    toolCount,
    flaggedCount: fileAccess.filter((e) => e.flagged).length,
    gitBranch,
    fileSizeBytes: stat.size,
  };
  return { summary, fileAccess, parseErrors };
}

/** Full message timeline for the detail view. */
export async function parseClaudeDetail(jsonlPath: string): Promise<SessionDetail> {
  const { summary, fileAccess, parseErrors } = await scanClaudeSession(jsonlPath);
  const messages: SessionDetailMessage[] = [];
  const seenAssistantIds = new Set<string>();
  let idx = 0;

  const rl = createInterface({ input: createReadStream(jsonlPath, "utf-8"), crlfDelay: Infinity });
  for await (const line of rl) {
    const msg = parseLine(line);
    if (!msg) continue;
    const t = msg.type as string | undefined;
    if (t !== "user" && t !== "assistant") continue;
    const ts = (msg.timestamp as string | undefined) ?? null;
    const message = msg.message as Record<string, unknown> | undefined;
    if (t === "user") {
      const text = textOfContent(message?.content);
      if (text) messages.push({ idx: idx++, ts, role: "user", text });
      continue;
    }
    const id = message?.id as string | undefined;
    if (id) {
      if (seenAssistantIds.has(id)) continue;
      seenAssistantIds.add(id);
    }
    const text = textOfContent(message?.content);
    if (text) messages.push({ idx: idx++, ts, role: "assistant", text });
    for (const tool of toolUsesOf(message?.content)) {
      const paths = fileAccessOfTool(tool, ts).map((e) => e.path);
      const inputExcerpt =
        (tool.input.command as string | undefined) ??
        (tool.input.file_path as string | undefined) ??
        (tool.input.pattern as string | undefined) ??
        JSON.stringify(tool.input).slice(0, 160);
      messages.push({
        idx: idx++,
        ts,
        role: "tool",
        text: String(inputExcerpt ?? "").slice(0, 400),
        toolName: tool.name,
        paths,
      });
    }
  }

  return { summary, messages, fileAccess, parseErrors };
}
