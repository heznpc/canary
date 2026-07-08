/**
 * Generic JSONL transcript parser.
 *
 * This handles agent logs that are not Codex rollout files and not exactly
 * Claude Code streams: Gemini CLI chat JSONL, Claude Desktop local-agent
 * queue-operation files, and future local transcript stores. It intentionally
 * extracts conservative metadata and a reviewer timeline without assuming a
 * vendor-specific schema.
 */
import { createReadStream, statSync } from "fs";
import { createInterface } from "readline";

import {
  extractPathsFromCommand,
  isRuleSurface,
  type FileAccessEntry,
  type SessionDetail,
  type SessionDetailMessage,
  type SessionSource,
  type SessionSummary,
} from "./types";

interface GenericScanResult {
  summary: SessionSummary;
  fileAccess: FileAccessEntry[];
  parseErrors: number;
}

function parseLine(line: string): Record<string, unknown> | null {
  if (!line.trim()) return null;
  try {
    return JSON.parse(line) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function stringField(obj: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return null;
}

function textOf(value: unknown, cap = 20_000): string {
  if (value == null) return "";
  if (typeof value === "string") return value.slice(0, cap);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    return value
      .map((item) => textOf(item, cap))
      .filter(Boolean)
      .join("\n")
      .slice(0, cap);
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const parts: string[] = [];
    for (const key of ["text", "content", "message", "input", "output", "lastPrompt", "aiTitle"]) {
      if (key in obj) {
        const text = textOf(obj[key], cap);
        if (text) parts.push(text);
      }
    }
    if (parts.length > 0) return parts.join("\n").slice(0, cap);
  }
  return "";
}

function roleOf(obj: Record<string, unknown>): SessionDetailMessage["role"] | null {
  const t = stringField(obj, ["type", "role", "speaker", "author"]);
  if (!t) return null;
  const lowered = t.toLowerCase();
  if (lowered === "user" || lowered === "human") return "user";
  if (lowered === "assistant" || lowered === "agent" || lowered === "model" || lowered === "gemini") {
    return "assistant";
  }
  if (
    lowered.includes("tool") ||
    lowered === "info" ||
    lowered === "queue-operation" ||
    lowered === "attachment" ||
    lowered === "mode"
  ) {
    return "tool";
  }
  return null;
}

function fileAccessFromText(text: string, ts: string | null, tool: string): FileAccessEntry[] {
  return extractPathsFromCommand(text).map((path) => ({
    ts,
    tool,
    op: "bash" as const,
    path,
    flagged: isRuleSurface(path),
    detail: text.slice(0, 200),
  }));
}

function fileAccessOfRecord(obj: Record<string, unknown>, ts: string | null): FileAccessEntry[] {
  const out: FileAccessEntry[] = [];
  const pushText = (tool: string, value: unknown) => {
    const text = textOf(value, 1_000);
    if (text) out.push(...fileAccessFromText(text, ts, tool));
  };

  pushText("record", obj.command ?? obj.cmd ?? obj.input ?? obj.output);

  const scanContent = (content: unknown) => {
    if (!Array.isArray(content)) return;
    for (const block of content) {
      if (!block || typeof block !== "object") continue;
      const b = block as Record<string, unknown>;
      if (b.type === "tool_use" || b.toolName || b.name) {
        pushText(String(b.name ?? b.toolName ?? "tool"), b.input ?? b.command ?? b);
      }
    }
  };

  scanContent(obj.content);
  if (obj.message && typeof obj.message === "object") {
    scanContent((obj.message as Record<string, unknown>).content);
  }

  const toolCalls = obj.toolCalls;
  if (Array.isArray(toolCalls)) {
    for (const call of toolCalls) {
      if (!call || typeof call !== "object") continue;
      const c = call as Record<string, unknown>;
      pushText(String(c.name ?? c.tool ?? "tool"), c.args ?? c.input ?? c.command ?? c);
    }
  }

  return out;
}

function messageText(obj: Record<string, unknown>): string {
  if ("message" in obj) return textOf(obj.message);
  if ("content" in obj) return textOf(obj.content);
  if ("lastPrompt" in obj) return textOf(obj.lastPrompt);
  if ("aiTitle" in obj) return textOf(obj.aiTitle);
  return textOf(obj);
}

export async function scanGenericSession(
  jsonlPath: string,
  source: SessionSource = "generic",
): Promise<GenericScanResult> {
  const stem = jsonlPath.split("/").pop()?.replace(/\.jsonl$/, "") ?? jsonlPath;
  const fileAccess: FileAccessEntry[] = [];
  let sessionId: string | null = null;
  let cwd: string | null = null;
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
    const obj = parseLine(line);
    if (!obj) {
      parseErrors += 1;
      continue;
    }
    sessionId = sessionId ?? stringField(obj, ["sessionId", "session_id", "conversationId", "id"]);
    cwd = cwd ?? stringField(obj, ["cwd", "workspace", "projectPath", "repoPath"]);
    const ts = stringField(obj, ["timestamp", "time", "createdAt", "startTime", "lastUpdated"]);
    if (ts) {
      if (!firstTs || ts < firstTs) firstTs = ts;
      if (!lastTs || ts > lastTs) lastTs = ts;
    }
    const role = roleOf(obj);
    if (role === "user") {
      userCount += 1;
      const text = messageText(obj).replace(/\s+/g, " ");
      if (!title && text) title = text.slice(0, 120);
    } else if (role === "assistant") {
      assistantCount += 1;
    } else if (role === "tool") {
      toolCount += 1;
    }
    fileAccess.push(...fileAccessOfRecord(obj, ts));
  }

  const stat = statSync(jsonlPath);
  const summary: SessionSummary = {
    id: `${source}:${sessionId ?? stem}`,
    source,
    jsonlPath,
    cwd,
    title: title || "(untitled)",
    firstTs,
    lastTs,
    userCount,
    assistantCount,
    toolCount,
    flaggedCount: fileAccess.filter((e) => e.flagged).length,
    fileSizeBytes: stat.size,
  };
  return { summary, fileAccess, parseErrors };
}

export async function parseGenericDetail(
  jsonlPath: string,
  source: SessionSource = "generic",
): Promise<SessionDetail> {
  const { summary, fileAccess, parseErrors } = await scanGenericSession(jsonlPath, source);
  const messages: SessionDetailMessage[] = [];
  let idx = 0;

  const rl = createInterface({ input: createReadStream(jsonlPath, "utf-8"), crlfDelay: Infinity });
  for await (const line of rl) {
    const obj = parseLine(line);
    if (!obj) continue;
    const role = roleOf(obj);
    if (!role) continue;
    const text = messageText(obj);
    if (!text) continue;
    const ts = stringField(obj, ["timestamp", "time", "createdAt", "startTime", "lastUpdated"]);
    const paths = fileAccessOfRecord(obj, ts).map((e) => e.path);
    messages.push({
      idx: idx++,
      ts,
      role,
      text: text.slice(0, 20_000),
      toolName: role === "tool" ? stringField(obj, ["type", "name", "toolName"]) ?? "event" : undefined,
      paths: role === "tool" ? paths : undefined,
    });
  }

  return { summary, messages, fileAccess, parseErrors };
}
