/**
 * Agent-push leakage metrics.
 *
 * Joins per-cwd Claude session aggregates (transcript-scan) with per-repo
 * git state (repo-scan) and computes the three RFC metrics.
 *
 * APL — Agent-Push Latency:
 *   For each agent-touched repo currently ahead of upstream, the time between
 *   the most recent Claude session that touched it and now. Captures
 *   "session ended without `git push` ever happening".
 *
 * MIP — Metadata-Invisibility Period:
 *   For each repo currently ahead, the time between the OLDEST unpushed
 *   commit's authored time and now. Direct measurement of how long the
 *   git-as-infrastructure layer has been opaque to the operator.
 *
 * PLR — Push Leakage Rate (portfolio-level):
 *   Fraction of agent-touched repos in MIP > threshold (default 7 days).
 */

import type { RepoAggregate } from "./transcript-scan.js";
import type { RepoState } from "./repo-scan.js";

export interface JoinedRepo {
  repoPath: string;
  isWorktree: boolean;
  branch: string | null;
  hasRemote: boolean;
  remoteUrl: string | null;
  ahead: number;
  behind: number;
  dirtyFiles: number;
  unpushedSubjects: string[];
  oldestUnpushedTs: string | null;
  oldestDirtyMtime: string | null;
  dirtyFilePaths: string[];
  lastCommitTs: string | null;
  // Session join
  sessionCount: number;
  cwdSessionCount: number;
  crossRepoSessionCount: number;
  lastSessionEndTs: string | null;
  totalGitCommands: number;
  totalPushCommands: number;
  // Computed
  apl_seconds: number | null; // null if not ahead OR no session matched
  mip_seconds: number | null; // null if not ahead
  /** Uncommitted-Period: now − oldestDirtyMtime. Null if dirtyFiles == 0. */
  ucp_seconds: number | null;
  classification:
    | "no_remote"
    | "in_sync"
    | "behind_only"
    | "ahead_cwd_session"
    | "ahead_cross_repo_only"
    | "ahead_no_session";
}

export interface PortfolioMetrics {
  generatedAt: string;
  totalReposScanned: number;
  reposWithRemote: number;
  reposAhead: number;
  reposAheadOrDirty: number;
  reposAgentTouched: number; // any kind of touch (cwd OR cross-repo)
  reposAgentTouchedCwd: number; // session cwd was this repo
  reposAgentTouchedCrossRepoOnly: number; // touched only via parent-cwd `cd`/`git -C`
  reposLeaking: number; // ahead AND in MIP > threshold (across whole portfolio)
  reposAgentTouchedAndLeaking: number; // intersection: agent-touched AND leaking
  thresholdDays: number;
  /** Leakage rate among agent-touched repos. Numerator is the intersection,
   *  denominator is reposAgentTouched. 0 if no agent-touched repos. */
  plr_agent: number;
  /** Leakage rate across all repos with remote. Useful for portfolio framing. */
  plr_portfolio: number;
  apl: { p50: number | null; p90: number | null; max: number | null; n: number };
  mip: { p50: number | null; p90: number | null; max: number | null; n: number };
  ucp: { p50: number | null; p90: number | null; max: number | null; n: number };
  reposDirty: number;
}

function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const idx = Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p));
  return sorted[idx];
}

function diffSeconds(later: string, earlier: string): number {
  return Math.round((new Date(later).getTime() - new Date(earlier).getTime()) / 1000);
}

export function joinReposWithSessions(
  repos: RepoState[],
  aggregates: RepoAggregate[],
  now: Date = new Date(),
): JoinedRepo[] {
  const byPath = new Map(aggregates.map((a) => [a.repoPath, a]));
  const nowIso = now.toISOString();
  const out: JoinedRepo[] = [];

  for (const r of repos) {
    const agg = byPath.get(r.path);
    let cls: JoinedRepo["classification"];
    if (!r.hasRemote) cls = "no_remote";
    else if (r.ahead === 0 && r.behind === 0 && r.dirtyFiles === 0) cls = "in_sync";
    else if (r.ahead === 0) cls = "behind_only";
    else if (agg && agg.cwdSessionCount > 0) cls = "ahead_cwd_session";
    else if (agg && agg.crossRepoSessionCount > 0) cls = "ahead_cross_repo_only";
    else cls = "ahead_no_session";

    let apl: number | null = null;
    let mip: number | null = null;
    if (r.ahead > 0) {
      if (r.oldestUnpushedTs) mip = diffSeconds(nowIso, r.oldestUnpushedTs);
      if (agg?.lastEndTs) apl = diffSeconds(nowIso, agg.lastEndTs);
    }
    let ucp: number | null = null;
    if (r.dirtyFiles > 0 && r.oldestDirtyMtime) {
      ucp = diffSeconds(nowIso, r.oldestDirtyMtime);
    }

    out.push({
      repoPath: r.path,
      isWorktree: r.isWorktree,
      branch: r.branch,
      hasRemote: r.hasRemote,
      remoteUrl: r.remoteUrl,
      ahead: r.ahead,
      behind: r.behind,
      dirtyFiles: r.dirtyFiles,
      unpushedSubjects: r.unpushedSubjects,
      oldestUnpushedTs: r.oldestUnpushedTs,
      oldestDirtyMtime: r.oldestDirtyMtime,
      dirtyFilePaths: r.dirtyFilePaths,
      lastCommitTs: r.lastCommitTs,
      sessionCount: agg?.sessionCount ?? 0,
      cwdSessionCount: agg?.cwdSessionCount ?? 0,
      crossRepoSessionCount: agg?.crossRepoSessionCount ?? 0,
      lastSessionEndTs: agg?.lastEndTs ?? null,
      totalGitCommands: agg?.totalGit ?? 0,
      totalPushCommands: agg?.totalPush ?? 0,
      apl_seconds: apl,
      mip_seconds: mip,
      ucp_seconds: ucp,
      classification: cls,
    });
  }
  return out;
}

export function computePortfolio(joined: JoinedRepo[], thresholdDays = 7): PortfolioMetrics {
  const thresholdSec = thresholdDays * 24 * 60 * 60;
  const reposWithRemote = joined.filter((j) => j.hasRemote).length;
  const reposAhead = joined.filter((j) => j.ahead > 0).length;
  const reposAheadOrDirty = joined.filter((j) => j.ahead > 0 || j.dirtyFiles > 0).length;
  const agentTouched = joined.filter((j) => j.sessionCount > 0).length;
  const agentTouchedCwd = joined.filter((j) => j.cwdSessionCount > 0).length;
  const agentTouchedCrossRepoOnly = joined.filter(
    (j) => j.cwdSessionCount === 0 && j.crossRepoSessionCount > 0,
  ).length;
  const isLeaking = (j: JoinedRepo) => (j.mip_seconds ?? 0) > thresholdSec;
  const leaking = joined.filter(isLeaking).length;
  const agentLeaking = joined.filter((j) => j.sessionCount > 0 && isLeaking(j)).length;

  const aplVals = joined
    .map((j) => j.apl_seconds)
    .filter((x): x is number => typeof x === "number")
    .sort((a, b) => a - b);
  const mipVals = joined
    .map((j) => j.mip_seconds)
    .filter((x): x is number => typeof x === "number")
    .sort((a, b) => a - b);
  const ucpVals = joined
    .map((j) => j.ucp_seconds)
    .filter((x): x is number => typeof x === "number")
    .sort((a, b) => a - b);
  const reposDirty = joined.filter((j) => j.dirtyFiles > 0).length;

  return {
    generatedAt: new Date().toISOString(),
    totalReposScanned: joined.length,
    reposWithRemote,
    reposAhead,
    reposAheadOrDirty,
    reposAgentTouched: agentTouched,
    reposAgentTouchedCwd: agentTouchedCwd,
    reposAgentTouchedCrossRepoOnly: agentTouchedCrossRepoOnly,
    reposLeaking: leaking,
    reposAgentTouchedAndLeaking: agentLeaking,
    thresholdDays,
    plr_agent: agentTouched > 0 ? agentLeaking / agentTouched : 0,
    plr_portfolio: reposWithRemote > 0 ? leaking / reposWithRemote : 0,
    apl: {
      p50: percentile(aplVals, 0.5),
      p90: percentile(aplVals, 0.9),
      max: aplVals[aplVals.length - 1] ?? null,
      n: aplVals.length,
    },
    mip: {
      p50: percentile(mipVals, 0.5),
      p90: percentile(mipVals, 0.9),
      max: mipVals[mipVals.length - 1] ?? null,
      n: mipVals.length,
    },
    ucp: {
      p50: percentile(ucpVals, 0.5),
      p90: percentile(ucpVals, 0.9),
      max: ucpVals[ucpVals.length - 1] ?? null,
      n: ucpVals.length,
    },
    reposDirty,
  };
}

export function fmtDuration(seconds: number | null): string {
  if (seconds === null) return "—";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  if (d > 0) return `${d}d ${h}h`;
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
