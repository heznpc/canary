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
  /**
   * Absolute paths that the session touched via cross-repo Bash commands
   * (e.g. `cd /path && git ...` or `git -C /path ...`), distinct from
   * the session's own cwd. Used to attribute parent-cwd bulk operations
   * to specific child repos.
   */
  touchedRepos: string[];
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

interface BashStats {
  isGit: boolean;
  isPush: boolean;
  /** Absolute paths the command operates on, when distinguishable from the session cwd. */
  touchedPaths: string[];
}

/**
 * Extract repo paths a single Bash command operates on.
 *
 * Patterns handled:
 *   - `git -C <path> ...`
 *   - `cd <path> && git ...` (any chained git command)
 *   - `cd <path>; git ...`
 *
 * Returns absolute paths. Relative paths are dropped because we can't
 * resolve them without knowing the calling cwd at command time (which may
 * differ from the session cwd if multiple `cd`s have run in the same chain).
 */
function extractTouchedPaths(cmd: string): string[] {
  const out = new Set<string>();
  // git -C <path>
  const dashC = /\bgit\s+-C\s+("([^"]+)"|'([^']+)'|(\S+))/g;
  for (const m of cmd.matchAll(dashC)) {
    const p = m[2] ?? m[3] ?? m[4];
    if (p && p.startsWith("/")) out.add(p);
  }
  // cd <path> followed in the same chain by a git invocation. We only
  // attribute when the chain actually contains `git` (otherwise the cd
  // could be for `ls`, `cat`, etc., which doesn't count as a repo touch).
  if (/\bgit\b/.test(cmd)) {
    const cdRe = /(?:^|[;&|]|&&|\|\|)\s*cd\s+("([^"]+)"|'([^']+)'|(\S+))/g;
    for (const m of cmd.matchAll(cdRe)) {
      const p = m[2] ?? m[3] ?? m[4];
      if (p && p.startsWith("/")) out.add(p);
    }
  }
  return Array.from(out);
}

function bashStats(msg: Record<string, unknown>): BashStats {
  const message = msg.message as Record<string, unknown> | undefined;
  const content = message?.content;
  const stats: BashStats = { isGit: false, isPush: false, touchedPaths: [] };
  if (!Array.isArray(content)) return stats;
  const seenPaths = new Set<string>();
  for (const block of content) {
    if (
      block && typeof block === "object" && (block as Record<string, unknown>).type === "tool_use" &&
      (block as Record<string, unknown>).name === "Bash"
    ) {
      const input = (block as Record<string, unknown>).input as Record<string, unknown> | undefined;
      const cmd = (input?.command as string | undefined) ?? "";
      if (/\bgit\b/.test(cmd)) {
        stats.isGit = true;
        if (/\bgit\s+push\b/.test(cmd)) stats.isPush = true;
        for (const p of extractTouchedPaths(cmd)) seenPaths.add(p);
      }
    }
  }
  stats.touchedPaths = Array.from(seenPaths);
  return stats;
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
  const touched = new Set<string>();

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
      const stats = bashStats(msg);
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
      if (stats.isGit) gitCount++;
      if (stats.isPush) pushCount++;
      for (const p of stats.touchedPaths) touched.add(p);
    }
  }

  // Drop touched paths that exactly equal the cwd — they're already
  // captured by the primary cwd-match join, no need to double-count.
  if (cwd) touched.delete(cwd);

  return {
    sessionId,
    cwd,
    startTs,
    endTs,
    gitBranches: Array.from(branches),
    bashCount,
    gitCommandCount: gitCount,
    pushCommandCount: pushCount,
    touchedRepos: Array.from(touched),
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
 * Aggregate sessions by repo path. Each session contributes to its `cwd`'s
 * aggregate (primary attribution) AND to every path in `touchedRepos`
 * (cross-repo attribution via `git -C <path>` or `cd <path> && git ...`).
 *
 * Two counters are tracked separately to surface the parent-cwd opacity
 * pattern:
 *   - `cwdSessionCount` — sessions whose cwd was this path (primary).
 *   - `crossRepoSessionCount` — sessions that touched this path while
 *     operating from a different cwd (e.g. parent-dir bulk operations).
 *
 * For metric purposes both flavours count as "agent-touched", but a tool
 * that only watches session cwd would miss the cross-repo flavour.
 */
export interface RepoAggregate {
  repoPath: string;
  /** Total sessions (cwd + cross-repo, deduped). */
  sessionCount: number;
  cwdSessionCount: number;
  crossRepoSessionCount: number;
  firstStartTs: string | null;
  lastEndTs: string | null;
  totalBash: number;
  totalGit: number;
  totalPush: number;
  branches: string[];
}

export function aggregateByRepo(sessions: SessionRecord[]): RepoAggregate[] {
  const byPath = new Map<string, { agg: RepoAggregate; sessionIds: Set<string> }>();

  function bump(
    path: string,
    s: SessionRecord,
    kind: "cwd" | "cross",
  ): void {
    let entry = byPath.get(path);
    if (!entry) {
      entry = {
        agg: {
          repoPath: path,
          sessionCount: 0,
          cwdSessionCount: 0,
          crossRepoSessionCount: 0,
          firstStartTs: null,
          lastEndTs: null,
          totalBash: 0,
          totalGit: 0,
          totalPush: 0,
          branches: [],
        },
        sessionIds: new Set<string>(),
      };
      byPath.set(path, entry);
    }
    const { agg, sessionIds } = entry;
    if (kind === "cwd") agg.cwdSessionCount++;
    else agg.crossRepoSessionCount++;

    // Bash/git counts are per-session — only attribute once per (path, session).
    if (!sessionIds.has(s.sessionId)) {
      sessionIds.add(s.sessionId);
      agg.sessionCount++;
      agg.totalBash += s.bashCount;
      agg.totalGit += s.gitCommandCount;
      agg.totalPush += s.pushCommandCount;
    }
    if (s.startTs && (!agg.firstStartTs || s.startTs < agg.firstStartTs)) agg.firstStartTs = s.startTs;
    if (s.endTs && (!agg.lastEndTs || s.endTs > agg.lastEndTs)) agg.lastEndTs = s.endTs;
    for (const b of s.gitBranches) if (!agg.branches.includes(b)) agg.branches.push(b);
  }

  for (const s of sessions) {
    if (s.cwd) bump(s.cwd, s, "cwd");
    for (const p of s.touchedRepos) bump(p, s, "cross");
  }

  return Array.from(byPath.values())
    .map((e) => e.agg)
    .sort((a, b) => (b.lastEndTs ?? "").localeCompare(a.lastEndTs ?? ""));
}
