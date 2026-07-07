/**
 * Unified session index over the local Claude Code and Codex transcript
 * stores. Read-only by design: the scanner opens transcripts, never writes
 * near them; the index lives in process memory only.
 *
 * Incremental: per-file cache keyed by (mtime, size), so the first request
 * pays a full corpus pass and subsequent requests only re-parse files that
 * changed. This mirrors the mtime-validated cache pattern used by the
 * existing scanners.
 */
import { readdirSync, statSync } from "fs";
import { homedir } from "os";
import { join, resolve } from "path";

import { logger } from "../logger";
import { scanClaudeSession } from "./claude";
import { scanCodexSession } from "./codex";
import type {
  FileAccessAggregate,
  FileAccessEntry,
  SessionSource,
  SessionSummary,
} from "./types";

export function claudeProjectsRoot(): string {
  return process.env.CANARY_CLAUDE_DIR ?? join(homedir(), ".claude", "projects");
}

export function codexSessionsRoot(): string {
  return process.env.CANARY_CODEX_DIR ?? join(homedir(), ".codex", "sessions");
}

/**
 * The review surface exposes raw transcript content (private by nature).
 * It is enabled in local dev and must be opted into for production builds.
 */
export function sessionsEnabled(): boolean {
  if (process.env.CANARY_SESSIONS === "1") return true;
  if (process.env.CANARY_SESSIONS === "0") return false;
  return process.env.NODE_ENV !== "production";
}

function listJsonlFiles(root: string, recursive: boolean): string[] {
  const out: string[] = [];
  const walk = (dir: string, depth: number) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (recursive || depth === 0) walk(path, depth + 1);
      } else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
        out.push(path);
      }
    }
  };
  walk(root, 0);
  return out;
}

interface CachedFile {
  mtimeMs: number;
  size: number;
  summary: SessionSummary;
  fileAccess: FileAccessEntry[];
}

const fileCache = new Map<string, CachedFile>();

export interface SessionsIndex {
  sessions: SessionSummary[];
  fileAccessBySession: Map<string, FileAccessEntry[]>;
  scannedAt: string;
  durationMs: number;
  fileCount: number;
  parseErrorFiles: number;
}

let indexPromise: Promise<SessionsIndex> | null = null;
let indexBuiltAt = 0;

const INDEX_TTL_MS = 60_000;

async function buildIndex(): Promise<SessionsIndex> {
  const started = Date.now();
  const maxFiles = Number(process.env.CANARY_SESSIONS_MAX_FILES ?? "0") || Infinity;

  const targets: Array<{ path: string; source: SessionSource }> = [];
  // Claude: one project dir level, session files at its top level. Subagent
  // transcripts live in per-session subdirectories and are out of scope for v1.
  for (const path of listJsonlFiles(claudeProjectsRoot(), false)) {
    targets.push({ path, source: "claude" });
  }
  for (const path of listJsonlFiles(codexSessionsRoot(), true)) {
    targets.push({ path, source: "codex" });
  }

  const limited = targets.slice(0, maxFiles === Infinity ? targets.length : maxFiles);
  const sessions: SessionSummary[] = [];
  const fileAccessBySession = new Map<string, FileAccessEntry[]>();
  let parseErrorFiles = 0;
  let processed = 0;

  for (const { path, source } of limited) {
    let stat;
    try {
      stat = statSync(path);
    } catch {
      continue;
    }
    const cached = fileCache.get(path);
    if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) {
      sessions.push(cached.summary);
      fileAccessBySession.set(cached.summary.id, cached.fileAccess);
      continue;
    }
    try {
      const result =
        source === "claude" ? await scanClaudeSession(path) : await scanCodexSession(path);
      if (result.parseErrors > 0) parseErrorFiles += 1;
      fileCache.set(path, {
        mtimeMs: stat.mtimeMs,
        size: stat.size,
        summary: result.summary,
        fileAccess: result.fileAccess,
      });
      sessions.push(result.summary);
      fileAccessBySession.set(result.summary.id, result.fileAccess);
    } catch (err) {
      parseErrorFiles += 1;
      logger.warn("session scan failed", {
        path,
        error: err instanceof Error ? err.message : String(err),
      });
    }
    processed += 1;
    if (processed % 200 === 0) {
      logger.info("session scan progress", { processed, total: limited.length });
    }
  }

  sessions.sort((a, b) => (b.lastTs ?? "").localeCompare(a.lastTs ?? ""));
  return {
    sessions,
    fileAccessBySession,
    scannedAt: new Date().toISOString(),
    durationMs: Date.now() - started,
    fileCount: limited.length,
    parseErrorFiles,
  };
}

export function getSessionsIndex(forceRefresh = false): Promise<SessionsIndex> {
  const stale = Date.now() - indexBuiltAt > INDEX_TTL_MS;
  if (!indexPromise || forceRefresh || stale) {
    indexBuiltAt = Date.now();
    indexPromise = buildIndex();
  }
  return indexPromise;
}

/** Inverted view: path → aggregated access across all sessions. */
export async function getFileAccessAggregates(): Promise<FileAccessAggregate[]> {
  const index = await getSessionsIndex();
  const byPath = new Map<string, FileAccessAggregate & { sessionSet: Set<string> }>();
  for (const [sessionId, entries] of index.fileAccessBySession) {
    for (const entry of entries) {
      let agg = byPath.get(entry.path);
      if (!agg) {
        agg = {
          path: entry.path,
          flagged: entry.flagged,
          reads: 0,
          writes: 0,
          bash: 0,
          sessionIds: [],
          lastTs: null,
          sessionSet: new Set<string>(),
        };
        byPath.set(entry.path, agg);
      }
      if (entry.op === "read") agg.reads += 1;
      else if (entry.op === "write") agg.writes += 1;
      else agg.bash += 1;
      agg.sessionSet.add(sessionId);
      if (entry.ts && (!agg.lastTs || entry.ts > agg.lastTs)) agg.lastTs = entry.ts;
    }
  }
  return Array.from(byPath.values())
    .map(({ sessionSet, ...agg }) => ({ ...agg, sessionIds: Array.from(sessionSet) }))
    .sort(
      (a, b) =>
        Number(b.flagged) - Number(a.flagged) ||
        b.sessionIds.length - a.sessionIds.length ||
        b.writes + b.reads + b.bash - (a.writes + a.reads + a.bash),
    );
}

/**
 * Detail requests address transcripts by absolute path; only paths inside
 * the two known stores are served.
 */
export function isAllowedTranscriptPath(path: string): boolean {
  const resolved = resolve(path);
  return (
    (resolved.startsWith(resolve(claudeProjectsRoot()) + "/") ||
      resolved.startsWith(resolve(codexSessionsRoot()) + "/")) &&
    resolved.endsWith(".jsonl")
  );
}
