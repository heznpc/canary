/**
 * Multi-repo git state scanner.
 *
 * Walks one or more roots, finds git repos (excluding nested worktrees and
 * node_modules), and emits per-repo state needed for leakage metrics:
 * ahead/behind/dirty, oldest unpushed commit timestamp, last commit timestamp.
 *
 * Worktree handling: a repo's `.git` may be a directory (main checkout) or
 * a file (linked worktree). We treat each as its own scan target — downstream
 * metrics may want to fold worktrees into their parent.
 */

import { execSync } from "child_process";
import { readdirSync, statSync } from "fs";
import { join } from "path";

export interface RepoState {
  path: string;
  gitDir: string; // .git path (may be file for worktrees)
  branch: string | null;
  upstream: string | null;
  ahead: number;
  behind: number;
  dirtyFiles: number;
  hasRemote: boolean;
  remoteUrl: string | null;
  lastCommitTs: string | null;
  /** Oldest unpushed commit timestamp (ISO). Null if not ahead. */
  oldestUnpushedTs: string | null;
  /** Subject lines of unpushed commits, newest first. */
  unpushedSubjects: string[];
  /**
   * Oldest mtime among dirty files (ISO). Null if no dirty files. Used to
   * compute UCP (Uncommitted-Period) — the working-tree → commit gap one
   * layer deeper than push-leakage. Noise floor is higher than push-leakage:
   * untracked files that are not gitignored (build artifacts, editor swap
   * files) can dominate the metric. Treat as a lower-bound signal.
   */
  oldestDirtyMtime: string | null;
  /** Relative paths of dirty files (porcelain output). Goes into detail snapshot only. */
  dirtyFilePaths: string[];
  /** True if the .git is a file (linked worktree). */
  isWorktree: boolean;
  scanError: string | null;
}

const SKIP_DIRS = new Set([
  "node_modules", ".next", "dist", "build", ".cache", "coverage",
  "Pods", "DerivedData", ".venv", "venv", "__pycache__", ".pytest_cache",
]);

export function findGitDirs(roots: string[], maxDepth = 6): Array<{ repo: string; gitDir: string; isWorktree: boolean }> {
  const results: Array<{ repo: string; gitDir: string; isWorktree: boolean }> = [];
  const seen = new Set<string>();

  function walk(dir: string, depth: number): void {
    if (depth > maxDepth) return;
    let entries: string[] = [];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    if (entries.includes(".git")) {
      const gitPath = join(dir, ".git");
      let isWorktree = false;
      try {
        const st = statSync(gitPath);
        isWorktree = st.isFile();
      } catch {
        return;
      }
      const key = dir;
      if (!seen.has(key)) {
        seen.add(key);
        results.push({ repo: dir, gitDir: gitPath, isWorktree });
      }
      // Don't descend further once we found a repo (we already capture worktrees
      // separately if they're under .claude/worktrees).
      return;
    }
    for (const e of entries) {
      if (e.startsWith(".") && e !== ".claude") continue;
      if (SKIP_DIRS.has(e)) continue;
      const full = join(dir, e);
      try {
        const st = statSync(full);
        if (st.isDirectory()) walk(full, depth + 1);
      } catch {
        /* ignore */
      }
    }
  }

  for (const r of roots) walk(r, 0);
  return results;
}

function gitOut(cwd: string, args: string[]): string {
  return execSync(`git ${args.join(" ")}`, {
    cwd,
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
}

export function inspectRepo(repo: string, gitDir: string, isWorktree: boolean): RepoState {
  const base: RepoState = {
    path: repo,
    gitDir,
    branch: null,
    upstream: null,
    ahead: 0,
    behind: 0,
    dirtyFiles: 0,
    hasRemote: false,
    remoteUrl: null,
    lastCommitTs: null,
    oldestUnpushedTs: null,
    unpushedSubjects: [],
    oldestDirtyMtime: null,
    dirtyFilePaths: [],
    isWorktree,
    scanError: null,
  };

  try {
    base.branch = gitOut(repo, ["symbolic-ref", "--short", "HEAD"]) || null;
  } catch {
    base.branch = null; // detached HEAD
  }

  try {
    const remoteUrl = gitOut(repo, ["remote", "get-url", "origin"]);
    if (remoteUrl) {
      base.remoteUrl = remoteUrl;
      base.hasRemote = true;
    }
  } catch {
    /* no remote */
  }

  try {
    const status = gitOut(repo, ["status", "--porcelain"]);
    if (status) {
      const lines = status.split("\n").filter(Boolean);
      base.dirtyFiles = lines.length;
      let oldestMs: number | null = null;
      const paths: string[] = [];
      for (const line of lines) {
        // Porcelain v1 format: 'XY path'. Three-char prefix on each line.
        // Renames look like 'R  oldname -> newname' — take the new name.
        const tail = line.length >= 3 ? line.slice(3) : line;
        const realPath = tail.includes(" -> ")
          ? tail.split(" -> ")[1].trim()
          : tail.trim();
        if (!realPath) continue;
        paths.push(realPath);
        try {
          const st = statSync(join(repo, realPath));
          if (oldestMs === null || st.mtimeMs < oldestMs) oldestMs = st.mtimeMs;
        } catch {
          // file may have been deleted (porcelain shows ' D' / 'D ');
          // skip silently — its absence is its own signal.
        }
      }
      if (oldestMs !== null) base.oldestDirtyMtime = new Date(oldestMs).toISOString();
      base.dirtyFilePaths = paths;
    }
  } catch (e) {
    base.scanError = `status: ${(e as Error).message}`;
  }

  try {
    base.lastCommitTs = gitOut(repo, ["log", "-1", "--format=%cI"]) || null;
  } catch {
    /* no commits */
  }

  if (base.hasRemote && base.branch) {
    try {
      const upstream = gitOut(repo, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]);
      if (upstream && !upstream.includes("@{u}")) base.upstream = upstream;
    } catch {
      /* no upstream */
    }

    if (base.upstream) {
      try {
        const counts = gitOut(repo, ["rev-list", "--left-right", "--count", "HEAD...@{u}"]);
        const [ahead, behind] = counts.split(/\s+/).map((x) => parseInt(x, 10) || 0);
        base.ahead = ahead;
        base.behind = behind;
      } catch (e) {
        base.scanError = `rev-list: ${(e as Error).message}`;
      }

      if (base.ahead > 0) {
        try {
          const subjects = gitOut(repo, ["log", "@{u}..HEAD", "--format=%cI%x09%s"]);
          if (subjects) {
            const lines = subjects.split("\n").filter(Boolean);
            const tsAndSubj = lines.map((l) => {
              const [ts, ...rest] = l.split("\t");
              return { ts, subj: rest.join("\t") };
            });
            base.oldestUnpushedTs = tsAndSubj[tsAndSubj.length - 1]?.ts ?? null;
            base.unpushedSubjects = tsAndSubj.map((x) => x.subj);
          }
        } catch (e) {
          base.scanError = `unpushed-log: ${(e as Error).message}`;
        }
      }
    }
  }

  return base;
}

export function scanRepos(roots: string[], maxDepth = 6): RepoState[] {
  const found = findGitDirs(roots, maxDepth);
  const out: RepoState[] = [];
  for (const { repo, gitDir, isWorktree } of found) {
    out.push(inspectRepo(repo, gitDir, isWorktree));
  }
  return out;
}
