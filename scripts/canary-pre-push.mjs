#!/usr/bin/env node
/**
 * Canary pre-push hook.
 *
 * Run by git just before `git push` actually contacts the remote, this script
 * surfaces operator-machine signal that the operator wouldn't otherwise see at
 * push time: other repos in the portfolio that are currently leaking (ahead of
 * upstream beyond the staleness threshold) but aren't the repo being pushed.
 *
 * Why this is canary's niche: GitHub Agentic Workflows reacts to push events
 * after they've reached GitHub. Pre-push state — the moment of the actual
 * decision — is only observable on the operator's machine. canary already
 * captures the portfolio-wide leakage state in its snapshot files; this hook
 * surfaces that state at exactly the moment another push is about to ship,
 * without an extra prompt or dashboard visit.
 *
 * Behaviour:
 *   - Read the latest `experiments/results/push-leakage-<date>.json` snapshot
 *     (prefers detail/raw, falls back to public). Skips `post-intervention`.
 *   - Filter for repos currently ahead of upstream, excluding the repo this
 *     hook is running inside (so the push at hand isn't double-counted).
 *   - Print a concise one-line summary plus, if any, the top 3 leaking repo
 *     names and how stale each is.
 *   - Exit 0 always (informational; never blocks the push).
 *
 * The hook is intentionally read-only and side-effect-free apart from
 * stdout/stderr. It is safe to install in any of the operator's repos.
 *
 * Install with `npm run pl:install-hooks` from within the target repo; the
 * canary repo's `pl:install-hooks` script copies this file into the repo's
 * `.git/hooks/pre-push` and marks it executable.
 */

import { readFileSync, readdirSync, statSync } from "fs";
import { join, basename } from "path";
import { homedir } from "os";

// ── locate canary's experiments/results directory ──────────────────────────
//
// Two strategies:
//   1. CANARY_HOME env override (explicit user setting)
//   2. ~/IdeaProjects/Paper/canary (the author's canonical location;
//      also the most common path for installs done via npm run pl:install-hooks)
// If neither resolves, the hook prints a one-line warning and exits 0.
function findCanaryResultsDir() {
  const candidates = [];
  if (process.env.CANARY_HOME) candidates.push(process.env.CANARY_HOME);
  candidates.push(join(homedir(), "IdeaProjects", "Paper", "canary"));
  for (const c of candidates) {
    try {
      const r = join(c, "experiments", "results");
      const s = statSync(r);
      if (s.isDirectory()) return r;
    } catch {
      // try next candidate
    }
  }
  return null;
}

function pickLatestSnapshot(dir) {
  // Try raw detail first (richer data), fall back to public.
  const tryDir = (subdir, suffix) => {
    let full;
    try {
      full = subdir ? join(dir, subdir) : dir;
      const entries = readdirSync(full);
      const matches = entries
        .filter(
          (e) =>
            e.startsWith("push-leakage-") &&
            e.endsWith(suffix) &&
            !e.includes("post-intervention"),
        )
        .sort()
        .reverse();
      return matches.length > 0 ? join(full, matches[0]) : null;
    } catch {
      return null;
    }
  };
  return tryDir("raw", "-detail.json") ?? tryDir(null, ".json");
}

function fmtAge(seconds) {
  if (seconds === null || seconds === undefined) return "?";
  const d = Math.floor(seconds / 86400);
  if (d > 0) {
    const h = Math.floor((seconds % 86400) / 3600);
    return `${d}d${h ? ` ${h}h` : ""}`;
  }
  const h = Math.floor(seconds / 3600);
  if (h > 0) return `${h}h`;
  return `${Math.floor(seconds / 60)}m`;
}

function thisRepoSlug() {
  // The current repo's name — extracted from cwd basename.
  // This is approximate (a repo cloned under a different directory name will
  // not match canary's snapshot path), but the hook treats no-match as no-op
  // rather than failure, so the approximation is safe.
  return basename(process.cwd());
}

function main() {
  const resultsDir = findCanaryResultsDir();
  if (!resultsDir) {
    console.error("[canary pre-push] CANARY_HOME unset and ~/IdeaProjects/Paper/canary not found — skipping.");
    return;
  }
  const snapPath = pickLatestSnapshot(resultsDir);
  if (!snapPath) {
    console.error("[canary pre-push] no push-leakage snapshot found in", resultsDir);
    return;
  }
  let snap;
  try {
    snap = JSON.parse(readFileSync(snapPath, "utf-8"));
  } catch (e) {
    console.error("[canary pre-push] cannot parse snapshot:", e.message);
    return;
  }
  if (!Array.isArray(snap?.repos)) return;

  const me = thisRepoSlug();
  const leaking = snap.repos
    .filter((r) => r && r.ahead > 0)
    .filter((r) => {
      // Approximate: skip the repo we're inside. Snapshot uses basename so
      // we match by basename too.
      const slug = basename(r.repoPath ?? "").replace(/-[0-9a-f]{8}$/, "");
      return slug !== me;
    })
    .sort((a, b) => (b.mip_seconds ?? 0) - (a.mip_seconds ?? 0));

  const ageSec = Math.max(
    0,
    Math.floor((Date.now() - new Date(snap.generatedAt).getTime()) / 1000),
  );

  if (leaking.length === 0) {
    console.error(
      `[canary pre-push] portfolio clean (snapshot ${fmtAge(ageSec)} ago, 0 other repos leaking)`,
    );
    return;
  }

  const top = leaking.slice(0, 3);
  console.error(
    `[canary pre-push] ${leaking.length} other repo${leaking.length === 1 ? "" : "s"} leaking (snapshot ${fmtAge(ageSec)} ago):`,
  );
  for (const r of top) {
    const slug = (basename(r.repoPath ?? "")).replace(/-[0-9a-f]{8}$/, "");
    console.error(
      `  • ${slug.padEnd(28)} ahead=${r.ahead}, MIP=${fmtAge(r.mip_seconds)}`,
    );
  }
  if (leaking.length > top.length) {
    console.error(`  • … ${leaking.length - top.length} more (run \`npm run pl:scan\` for full list)`);
  }
  console.error("[canary pre-push] (informational; this push is not blocked)");
}

main();
