/**
 * Unified session index over local AI transcript stores. Read-only by design:
 * the scanner opens transcripts, never writes
 * near them; the index lives in process memory only.
 *
 * Incremental: per-file cache keyed by (mtime, size), so the first request
 * pays a full corpus pass and subsequent requests only re-parse files that
 * changed. This mirrors the mtime-validated cache pattern used by the
 * existing scanners.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import { homedir } from "os";
import { delimiter, join, resolve } from "path";

import { logger } from "../logger";
import { parseClaudeDetail, scanClaudeSession } from "./claude";
import { parseCodexDetail, scanCodexSession } from "./codex";
import { parseGenericDetail, scanGenericSession } from "./generic";
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

export function codexArchivedSessionsRoot(): string {
  return process.env.CANARY_CODEX_ARCHIVE_DIR ?? join(homedir(), ".codex", "archived_sessions");
}

export function geminiRoot(): string {
  return process.env.CANARY_GEMINI_DIR ?? join(homedir(), ".gemini", "tmp");
}

export function claudeDesktopRoot(): string {
  return (
    process.env.CANARY_CLAUDE_DESKTOP_DIR ??
    join(homedir(), "Library", "Application Support", "Claude", "local-agent-mode-sessions")
  );
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

function expandHome(path: string): string {
  if (path === "~") return homedir();
  if (path.startsWith("~/")) return join(homedir(), path.slice(2));
  return path;
}

function splitEnvPaths(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(delimiter)
    .map((part) => part.trim())
    .filter(Boolean)
    .map(expandHome);
}

function latestConversationListFile(): string | null {
  const docs = join(homedir(), "Documents");
  let entries;
  try {
    entries = readdirSync(docs, { withFileTypes: true });
  } catch {
    return null;
  }
  const dirs = entries
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("ai-conversation-lists-"))
    .map((entry) => join(docs, entry.name))
    .sort()
    .reverse();
  for (const dir of dirs) {
    const list = join(dir, "list_ALL-ai-conversations.txt");
    if (existsSync(list)) return list;
  }
  return null;
}

function conversationListFiles(): string[] {
  const configured = splitEnvPaths(process.env.CANARY_SESSION_LIST_FILES);
  if (configured.length > 0) return configured;
  const latest = latestConversationListFile();
  return latest ? [latest] : [];
}

function readPathList(listPath: string): string[] {
  try {
    return readFileSync(listPath, "utf-8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"))
      .map(expandHome);
  } catch {
    return [];
  }
}

function inferSource(path: string): SessionSource {
  const resolved = resolve(path);
  if (resolved.includes("/Library/Application Support/Claude/local-agent-mode-sessions/")) {
    return "claude-desktop";
  }
  if (resolved.includes("/.gemini/")) return "gemini";
  if (resolved.includes("/.codex/sessions/") || resolved.includes("/.codex/archived_sessions/")) {
    return "codex";
  }
  if (resolved.includes("/.claude/projects/")) return "claude";
  return "generic";
}

function knownTranscriptRoots(): string[] {
  return [
    claudeProjectsRoot(),
    codexSessionsRoot(),
    codexArchivedSessionsRoot(),
    geminiRoot(),
    claudeDesktopRoot(),
    ...splitEnvPaths(process.env.CANARY_SESSION_EXTRA_DIRS),
  ].map((path) => resolve(path));
}

function listedTranscriptPaths(): Set<string> {
  const out = new Set<string>();
  for (const list of conversationListFiles()) {
    for (const path of readPathList(list)) {
      if (path.endsWith(".jsonl")) out.add(resolve(path));
    }
  }
  return out;
}

function addTarget(
  targets: Map<string, SessionSource>,
  path: string,
  source: SessionSource = inferSource(path),
): void {
  if (!path.endsWith(".jsonl")) return;
  targets.set(resolve(path), source);
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

  const targets = new Map<string, SessionSource>();
  // Claude Code stores top-level sessions under project dirs, and newer
  // conversation/subagent artifacts may live deeper. Keep the AISpool-era
  // coverage contract: ~/.claude/projects/**/*.jsonl.
  for (const path of listJsonlFiles(claudeProjectsRoot(), true)) {
    addTarget(targets, path, "claude");
  }
  for (const path of listJsonlFiles(codexSessionsRoot(), true)) {
    addTarget(targets, path, "codex");
  }
  for (const path of listJsonlFiles(codexArchivedSessionsRoot(), false)) {
    addTarget(targets, path, "codex");
  }
  for (const path of listJsonlFiles(geminiRoot(), true)) {
    addTarget(targets, path, "gemini");
  }
  for (const path of listJsonlFiles(claudeDesktopRoot(), true)) {
    addTarget(targets, path, "claude-desktop");
  }
  for (const root of splitEnvPaths(process.env.CANARY_SESSION_EXTRA_DIRS)) {
    for (const path of listJsonlFiles(root, true)) addTarget(targets, path);
  }
  for (const list of conversationListFiles()) {
    for (const path of readPathList(list)) addTarget(targets, path);
  }

  const allTargets = Array.from(targets.entries()).map(([path, source]) => ({ path, source }));
  const limited = allTargets.slice(0, maxFiles === Infinity ? allTargets.length : maxFiles);
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
      const result = await scanTranscript(path, source);
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
 * Detail requests address transcripts by absolute path; only allowed local
 * transcript roots or explicit path-list entries are served.
 */
export function isAllowedTranscriptPath(path: string): boolean {
  const resolved = resolve(path);
  return (
    (knownTranscriptRoots().some((root) => resolved.startsWith(root + "/")) ||
      listedTranscriptPaths().has(resolved)) &&
    resolved.endsWith(".jsonl")
  );
}

export function isCodexTranscriptPath(path: string): boolean {
  const resolved = resolve(path);
  return (
    resolved.startsWith(resolve(codexSessionsRoot()) + "/") ||
    resolved.startsWith(resolve(codexArchivedSessionsRoot()) + "/")
  );
}

export function sessionSourceForPath(path: string): SessionSource {
  const resolved = resolve(path);
  if (resolved.startsWith(resolve(claudeProjectsRoot()) + "/")) return "claude";
  if (isCodexTranscriptPath(resolved)) return "codex";
  if (resolved.startsWith(resolve(geminiRoot()) + "/")) return "gemini";
  if (resolved.startsWith(resolve(claudeDesktopRoot()) + "/")) return "claude-desktop";
  return inferSource(path);
}

async function scanTranscript(path: string, source: SessionSource) {
  if (source === "claude") return scanClaudeSession(path, "claude");
  if (source === "codex") return scanCodexSession(path);
  return scanGenericSession(path, source);
}

export async function parseSessionDetail(path: string) {
  const source = sessionSourceForPath(path);
  if (source === "claude") return parseClaudeDetail(path, "claude");
  if (source === "codex") return parseCodexDetail(path);
  return parseGenericDetail(path, source);
}
