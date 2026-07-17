export const SESSION_SOURCE_VALUES = [
  "claude",
  "codex",
  "gemini",
  "claude-desktop",
  "generic",
] as const;

export type SessionSource = (typeof SESSION_SOURCE_VALUES)[number];

export type FileAccessOp = "read" | "write" | "bash";

export interface FileAccessEntry {
  ts: string | null;
  tool: string;
  op: FileAccessOp;
  path: string;
  /** True when the path is an agent rule/config surface (CLAUDE.md, settings, ~/.claude, …). */
  flagged: boolean;
  /** Short human excerpt: command text or edit target context. */
  detail?: string;
}

export interface SessionSummary {
  /** Stable id: `<source>:<jsonl file stem>`. */
  id: string;
  source: SessionSource;
  jsonlPath: string;
  cwd: string | null;
  title: string;
  firstTs: string | null;
  lastTs: string | null;
  userCount: number;
  assistantCount: number;
  toolCount: number;
  flaggedCount: number;
  gitBranch?: string | null;
  originator?: string | null;
  fileSizeBytes: number;
}

export type DetailRole = "user" | "assistant" | "tool";

export interface SessionDetailMessage {
  idx: number;
  ts: string | null;
  role: DetailRole;
  /** Message text, or for role=tool a one-line tool header. */
  text: string;
  /** role=tool only: tool name. */
  toolName?: string;
  /** role=tool only: extracted file paths. */
  paths?: string[];
}

export interface SessionDetail {
  summary: SessionSummary;
  messages: SessionDetailMessage[];
  fileAccess: FileAccessEntry[];
  parseErrors: number;
}

export interface FileAccessAggregate {
  path: string;
  flagged: boolean;
  reads: number;
  writes: number;
  bash: number;
  sessionIds: string[];
  lastTs: string | null;
}

const RULE_BASENAMES = new Set([
  "CLAUDE.md",
  "CLAUDE.local.md",
  "AGENTS.md",
  "AGENTS.override.md",
  "GEMINI.md",
  "copilot-instructions.md",
  "settings.json",
  "settings.local.json",
  "managed-settings.json",
  "config.toml",
]);

const RULE_DIR_MARKERS = ["/.claude/", "/.codex/", "/.cursor/", "/.github/instructions/"];

/**
 * A path is "flagged" when it is an agent rule/config surface — the surfaces
 * whose silent modification the review UI exists to investigate.
 */
export function isRuleSurface(path: string): boolean {
  const base = path.split("/").pop() ?? "";
  if (RULE_BASENAMES.has(base)) return true;
  return RULE_DIR_MARKERS.some((marker) => path.includes(marker));
}

/**
 * Extract absolute and home-relative filesystem paths from a shell command.
 * Heuristic by design: URLs (containing "//") are excluded, results capped.
 */
export function extractPathsFromCommand(cmd: string, cap = 8): string[] {
  const out = new Set<string>();
  const re = /(?:^|[\s"'=(:])((?:~|\/)[A-Za-z0-9_.@\-/]{2,})/g;
  for (const m of cmd.matchAll(re)) {
    const p = m[1];
    if (!p || p.includes("//")) continue;
    out.add(p.replace(/[).,;:'"]+$/, ""));
    if (out.size >= cap) break;
  }
  return Array.from(out);
}
