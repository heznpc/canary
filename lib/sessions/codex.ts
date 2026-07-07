/**
 * Codex CLI/Desktop rollout parser (service-side).
 *
 * Reads ~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl. Each line is
 * { timestamp, type, payload }:
 *   - session_meta: { id, cwd, originator, cli_version, … }
 *   - response_item: { type: "message" | "function_call" | "function_call_output" | "reasoning", … }
 *   - event_msg: { type: "user_message" | "agent_message" | "token_count" | …, message }
 *
 * Verified against the on-disk corpus 2026-07: tool calls are dominated by
 * `exec_command` with JSON-string arguments { cmd, workdir }; older rollouts
 * may use `shell` with { command: string[] }. Both are handled.
 */
import { createReadStream, statSync } from "fs";
import { createInterface } from "readline";

import {
  extractPathsFromCommand,
  isRuleSurface,
  type FileAccessEntry,
  type SessionDetail,
  type SessionDetailMessage,
  type SessionSummary,
} from "./types";

function parseLine(line: string): Record<string, unknown> | null {
  if (!line.trim()) return null;
  try {
    return JSON.parse(line) as Record<string, unknown>;
  } catch {
    return null;
  }
}

interface CommandCall {
  tool: string;
  cmd: string;
  workdir: string | null;
}

function commandOfFunctionCall(payload: Record<string, unknown>): CommandCall | null {
  const name = payload.name as string | undefined;
  if (!name) return null;
  if (name !== "exec_command" && name !== "shell") return null;
  let args: Record<string, unknown> = {};
  const raw = payload.arguments;
  if (typeof raw === "string") {
    try {
      args = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return { tool: name, cmd: raw.slice(0, 400), workdir: null };
    }
  } else if (raw && typeof raw === "object") {
    args = raw as Record<string, unknown>;
  }
  const cmdField = args.cmd ?? args.command;
  const cmd = Array.isArray(cmdField) ? cmdField.join(" ") : String(cmdField ?? "");
  const workdir = typeof args.workdir === "string" ? args.workdir : null;
  return { tool: name, cmd, workdir };
}

function fileAccessOfCommand(call: CommandCall, ts: string | null): FileAccessEntry[] {
  const paths = new Set<string>(extractPathsFromCommand(call.cmd));
  if (call.workdir) paths.add(call.workdir);
  return Array.from(paths).map((path) => ({
    ts,
    tool: call.tool,
    op: "bash" as const,
    path,
    flagged: isRuleSurface(path),
    detail: call.cmd.slice(0, 200),
  }));
}

function textOfResponseMessage(payload: Record<string, unknown>, cap = 20_000): string {
  const content = payload.content;
  if (!Array.isArray(content)) return "";
  const parts: string[] = [];
  for (const block of content) {
    if (!block || typeof block !== "object") continue;
    const b = block as Record<string, unknown>;
    if ((b.type === "input_text" || b.type === "output_text") && typeof b.text === "string") {
      parts.push(b.text);
    }
  }
  return parts.join("\n").slice(0, cap);
}

interface CodexScanResult {
  summary: SessionSummary;
  fileAccess: FileAccessEntry[];
  parseErrors: number;
}

export async function scanCodexSession(jsonlPath: string): Promise<CodexScanResult> {
  const stem = jsonlPath.split("/").pop()?.replace(/\.jsonl$/, "") ?? jsonlPath;
  const fileAccess: FileAccessEntry[] = [];
  let sessionId: string | null = null;
  let cwd: string | null = null;
  let originator: string | null = null;
  let title = "";
  let firstTs: string | null = null;
  let lastTs: string | null = null;
  let userCount = 0;
  let assistantCount = 0;
  let toolCount = 0;
  let parseErrors = 0;

  const rl = createInterface({ input: createReadStream(jsonlPath, "utf-8"), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) continue;
    const rec = parseLine(line);
    if (!rec) {
      parseErrors += 1;
      continue;
    }
    const ts = (rec.timestamp as string | undefined) ?? null;
    if (ts) {
      if (!firstTs || ts < firstTs) firstTs = ts;
      if (!lastTs || ts > lastTs) lastTs = ts;
    }
    const t = rec.type as string | undefined;
    const payload = (rec.payload as Record<string, unknown> | undefined) ?? {};
    if (t === "session_meta") {
      sessionId = (payload.id as string | undefined) ?? null;
      cwd = (payload.cwd as string | undefined) ?? null;
      originator = (payload.originator as string | undefined) ?? null;
      continue;
    }
    if (t === "event_msg") {
      const pt = payload.type as string | undefined;
      if (pt === "user_message") {
        userCount += 1;
        const text = String(payload.message ?? "").replace(/\s+/g, " ");
        if (!title && text) title = text.slice(0, 120);
      } else if (pt === "agent_message") {
        assistantCount += 1;
      }
      continue;
    }
    if (t === "response_item") {
      const pt = payload.type as string | undefined;
      if (pt === "function_call") {
        toolCount += 1;
        const call = commandOfFunctionCall(payload);
        if (call) fileAccess.push(...fileAccessOfCommand(call, ts));
      }
    }
  }

  const stat = statSync(jsonlPath);
  const summary: SessionSummary = {
    id: `codex:${sessionId ?? stem}`,
    source: "codex",
    jsonlPath,
    cwd,
    title: title || "(untitled)",
    firstTs,
    lastTs,
    userCount,
    assistantCount,
    toolCount,
    flaggedCount: fileAccess.filter((e) => e.flagged).length,
    originator,
    fileSizeBytes: stat.size,
  };
  return { summary, fileAccess, parseErrors };
}

/**
 * Full timeline for the detail view. User/assistant text comes from
 * event_msg (the human-visible channel); response_item messages with role
 * developer (injected instructions) are skipped, and role user/assistant
 * response_items are used only when no event_msg counterpart produced text —
 * the two channels duplicate the same turns in current rollouts.
 */
export async function parseCodexDetail(jsonlPath: string): Promise<SessionDetail> {
  const { summary, fileAccess, parseErrors } = await scanCodexSession(jsonlPath);
  const messages: SessionDetailMessage[] = [];
  let idx = 0;
  let sawEventText = false;

  const pushUnlessDuplicate = (m: SessionDetailMessage) => {
    const prev = messages[messages.length - 1];
    if (prev && prev.role === m.role && prev.text.slice(0, 200) === m.text.slice(0, 200)) return;
    messages.push(m);
  };

  const rl = createInterface({ input: createReadStream(jsonlPath, "utf-8"), crlfDelay: Infinity });
  for await (const line of rl) {
    const rec = parseLine(line);
    if (!rec) continue;
    const ts = (rec.timestamp as string | undefined) ?? null;
    const t = rec.type as string | undefined;
    const payload = (rec.payload as Record<string, unknown> | undefined) ?? {};
    if (t === "event_msg") {
      const pt = payload.type as string | undefined;
      if (pt === "user_message" || pt === "agent_message") {
        const text = String(payload.message ?? "");
        if (text) {
          sawEventText = true;
          pushUnlessDuplicate({
            idx: idx++,
            ts,
            role: pt === "user_message" ? "user" : "assistant",
            text: text.slice(0, 20_000),
          });
        }
      }
      continue;
    }
    if (t === "response_item") {
      const pt = payload.type as string | undefined;
      if (pt === "function_call") {
        const call = commandOfFunctionCall(payload);
        if (call) {
          const paths = fileAccessOfCommand(call, ts).map((e) => e.path);
          pushUnlessDuplicate({
            idx: idx++,
            ts,
            role: "tool",
            text: call.cmd.slice(0, 400),
            toolName: call.tool,
            paths,
          });
        } else {
          pushUnlessDuplicate({
            idx: idx++,
            ts,
            role: "tool",
            text: String(payload.arguments ?? "").slice(0, 200),
            toolName: (payload.name as string | undefined) ?? "tool",
            paths: [],
          });
        }
      } else if (pt === "message" && !sawEventText) {
        const role = payload.role as string | undefined;
        if (role === "user" || role === "assistant") {
          const text = textOfResponseMessage(payload);
          if (text) pushUnlessDuplicate({ idx: idx++, ts, role, text });
        }
      }
    }
  }

  return { summary, messages, fileAccess, parseErrors };
}
