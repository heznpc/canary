/**
 * Transcript scanner for Claude Code CLI sessions.
 *
 * Walks ~/.claude/projects/<projectdir>/<sessionid>.jsonl and extracts
 * per-session metadata used by the agent-push leakage axis (APL/PLR/MIP).
 *
 * Schema notes (CLI, version 2.x):
 *   - One JSON object per line (jsonl).
 *   - Top-level fields per message: type, timestamp, cwd, sessionId,
 *     gitBranch, version, uuid, parentUuid.
 *   - Tool calls live in assistant messages at message.content[].
 *     Bash invocations: { type: "tool_use", name: "Bash", input: { command } }.
 *   - "file-history-snapshot" messages are bookkeeping; ignore for time bounds.
 *   - "last-prompt" and "system" messages may have null timestamp; ignore.
 *
 * Desktop / Cowork sessions ("~/Library/Application Support/Claude/...")
 * use a different schema and are out of scope for this prototype.
 */

import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { homedir } from "os";

export interface SessionRecord {
  sessionId: string;
  cwd: string | null;
  startTs: string | null; // ISO, first non-bookkeeping message
  endTs: string | null; // ISO, last non-bookkeeping message
  gitBranches: string[];
  bashCount: number;
  gitCommandCount: number;
  pushCommandCount: number;
  source: "cli";
  jsonlPath: string;
}

const BOOKKEEPING_TYPES = new Set(["file-history-snapshot", "last-prompt"]);

function parseLine(line: string): Record<string, unknown> | null {
  if (!line.trim()) return null;
  try {
    return JSON.parse(line) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function extractToolCommand(msg: Record<string, unknown>): { isGit: boolean; isPush: boolean } {
  const message = msg.message as Record<string, unknown> | undefined;
  const content = message?.content;
  if (!Array.isArray(content)) return { isGit: false, isPush: false };
  let isGit = false;
  let isPush = false;
  for (const block of content) {
    if (
      block && typeof block === "object" && (block as Record<string, unknown>).type === "tool_use" &&
      (block as Record<string, unknown>).name === "Bash"
    ) {
      const input = (block as Record<string, unknown>).input as Record<string, unknown> | undefined;
      const cmd = (input?.command as string | undefined) ?? "";
      if (/\bgit\b/.test(cmd)) {
        isGit = true;
        if (/\bgit\s+push\b/.test(cmd)) isPush = true;
      }
    }
  }
  return { isGit, isPush };
}

export function scanSessionFile(jsonlPath: string): SessionRecord {
  const lines = readFileSync(jsonlPath, "utf-8").split("\n");
  const sessionId = jsonlPath.split("/").pop()?.replace(/\.jsonl$/, "") ?? "";
  const branches = new Set<string>();
  let cwd: string | null = null;
  let startTs: string | null = null;
  let endTs: string | null = null;
  let bashCount = 0;
  let gitCount = 0;
  let pushCount = 0;

  for (const line of lines) {
    const msg = parseLine(line);
    if (!msg) continue;
    const t = msg.type as string | undefined;
    if (!t || BOOKKEEPING_TYPES.has(t)) continue;
    const ts = msg.timestamp as string | undefined;
    if (ts) {
      if (!startTs || ts < startTs) startTs = ts;
      if (!endTs || ts > endTs) endTs = ts;
    }
    const c = msg.cwd as string | undefined;
    if (c && !cwd) cwd = c;
    const branch = msg.gitBranch as string | undefined;
    if (branch) branches.add(branch);
    if (t === "assistant") {
      const tools = extractToolCommand(msg);
      const message = msg.message as Record<string, unknown> | undefined;
      const content = message?.content;
      if (Array.isArray(content)) {
        for (const block of content) {
          if (
            block && typeof block === "object" &&
            (block as Record<string, unknown>).type === "tool_use" &&
            (block as Record<string, unknown>).name === "Bash"
          ) bashCount++;
        }
      }
      if (tools.isGit) gitCount++;
      if (tools.isPush) pushCount++;
    }
  }

  return {
    sessionId,
    cwd,
    startTs,
    endTs,
    gitBranches: Array.from(branches),
    bashCount,
    gitCommandCount: gitCount,
    pushCommandCount: pushCount,
    source: "cli",
    jsonlPath,
  };
}

export interface ScanOptions {
  /** Root projects directory. Defaults to ~/.claude/projects. */
  projectsRoot?: string;
  /** Optional substring filter on the encoded project dir name (e.g. "IdeaProjects"). */
  pathFilter?: string;
  /** Skip files larger than this many bytes (defensive; default 50MB). */
  maxFileBytes?: number;
}

export function scanAllSessions(opts: ScanOptions = {}): SessionRecord[] {
  const root = opts.projectsRoot ?? join(homedir(), ".claude", "projects");
  const pathFilter = opts.pathFilter;
  const maxBytes = opts.maxFileBytes ?? 50 * 1024 * 1024;

  const out: SessionRecord[] = [];
  let projectDirs: string[] = [];
  try {
    projectDirs = readdirSync(root);
  } catch (e) {
    console.error(`[transcript-scan] cannot read ${root}: ${(e as Error).message}`);
    return out;
  }
  for (const dir of projectDirs) {
    if (pathFilter && !dir.includes(pathFilter)) continue;
    const full = join(root, dir);
    let entries: string[] = [];
    try {
      entries = readdirSync(full);
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.endsWith(".jsonl")) continue;
      const fp = join(full, entry);
      try {
        const s = statSync(fp);
        if (s.size > maxBytes) {
          console.error(`[transcript-scan] skip oversized ${fp} (${s.size} bytes)`);
          continue;
        }
        out.push(scanSessionFile(fp));
      } catch (e) {
        console.error(`[transcript-scan] failed ${fp}: ${(e as Error).message}`);
      }
    }
  }
  return out;
}

/**
 * Aggregate sessions by cwd. The cwd may be a worktree of a real repo;
 * downstream code is responsible for normalizing worktrees to their main repo.
 */
export interface CwdAggregate {
  cwd: string;
  sessionCount: number;
  firstStartTs: string | null;
  lastEndTs: string | null;
  totalBash: number;
  totalGit: number;
  totalPush: number;
  branches: string[];
}

export function aggregateByCwd(sessions: SessionRecord[]): CwdAggregate[] {
  const byCwd = new Map<string, CwdAggregate>();
  for (const s of sessions) {
    if (!s.cwd) continue;
    let agg = byCwd.get(s.cwd);
    if (!agg) {
      agg = {
        cwd: s.cwd,
        sessionCount: 0,
        firstStartTs: null,
        lastEndTs: null,
        totalBash: 0,
        totalGit: 0,
        totalPush: 0,
        branches: [],
      };
      byCwd.set(s.cwd, agg);
    }
    agg.sessionCount++;
    if (s.startTs && (!agg.firstStartTs || s.startTs < agg.firstStartTs)) agg.firstStartTs = s.startTs;
    if (s.endTs && (!agg.lastEndTs || s.endTs > agg.lastEndTs)) agg.lastEndTs = s.endTs;
    agg.totalBash += s.bashCount;
    agg.totalGit += s.gitCommandCount;
    agg.totalPush += s.pushCommandCount;
    for (const b of s.gitBranches) if (!agg.branches.includes(b)) agg.branches.push(b);
  }
  return Array.from(byCwd.values()).sort((a, b) =>
    (b.lastEndTs ?? "").localeCompare(a.lastEndTs ?? ""),
  );
}
