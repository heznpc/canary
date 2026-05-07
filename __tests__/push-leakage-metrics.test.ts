import { describe, it, expect } from "vitest";
import {
  joinReposWithSessions,
  computePortfolio,
  fmtDuration,
} from "../experiments/src/push-leakage/metrics";
import type { RepoState } from "../experiments/src/push-leakage/repo-scan";
import type { RepoAggregate } from "../experiments/src/push-leakage/transcript-scan";

const NOW = new Date("2026-05-07T10:00:00Z");

function repo(path: string, overrides: Partial<RepoState> = {}): RepoState {
  return {
    path,
    gitDir: `${path}/.git`,
    branch: "main",
    upstream: "origin/main",
    ahead: 0,
    behind: 0,
    dirtyFiles: 0,
    hasRemote: true,
    remoteUrl: "https://example.com/x.git",
    lastCommitTs: "2026-05-01T00:00:00+00:00",
    oldestUnpushedTs: null,
    unpushedSubjects: [],
    isWorktree: false,
    scanError: null,
    ...overrides,
  };
}

function agg(repoPath: string, overrides: Partial<RepoAggregate> = {}): RepoAggregate {
  return {
    repoPath,
    sessionCount: 1,
    cwdSessionCount: 1,
    crossRepoSessionCount: 0,
    firstStartTs: "2026-04-15T00:00:00Z",
    lastEndTs: "2026-04-20T00:00:00Z",
    totalBash: 1,
    totalGit: 1,
    totalPush: 0,
    branches: ["main"],
    ...overrides,
  };
}

describe("joinReposWithSessions", () => {
  it("classifies a no-remote repo regardless of session activity", () => {
    const r = repo("/A", { hasRemote: false, remoteUrl: null });
    const a = agg("/A");
    const out = joinReposWithSessions([r], [a], NOW);
    expect(out[0].classification).toBe("no_remote");
    expect(out[0].apl_seconds).toBeNull();
    expect(out[0].mip_seconds).toBeNull();
  });

  it("classifies in_sync, behind_only correctly", () => {
    const inSync = joinReposWithSessions([repo("/sync")], [], NOW)[0];
    expect(inSync.classification).toBe("in_sync");
    const behind = joinReposWithSessions([repo("/b", { behind: 3 })], [], NOW)[0];
    expect(behind.classification).toBe("behind_only");
  });

  it("distinguishes ahead_cwd_session from ahead_cross_repo_only", () => {
    const aheadOnly = repo("/ahead", { ahead: 2, oldestUnpushedTs: "2026-04-25T00:00:00Z" });
    const cwdAgg = agg("/ahead", { cwdSessionCount: 1, crossRepoSessionCount: 0 });
    const crossAgg = agg("/ahead", { cwdSessionCount: 0, crossRepoSessionCount: 1 });
    const noAgg: RepoAggregate[] = [];
    expect(joinReposWithSessions([aheadOnly], [cwdAgg], NOW)[0].classification).toBe(
      "ahead_cwd_session",
    );
    expect(joinReposWithSessions([aheadOnly], [crossAgg], NOW)[0].classification).toBe(
      "ahead_cross_repo_only",
    );
    expect(joinReposWithSessions([aheadOnly], noAgg, NOW)[0].classification).toBe(
      "ahead_no_session",
    );
  });

  it("computes APL and MIP only when ahead > 0", () => {
    const r = repo("/ahead", {
      ahead: 1,
      oldestUnpushedTs: "2026-04-30T00:00:00Z",
    });
    const a = agg("/ahead", { lastEndTs: "2026-05-01T00:00:00Z" });
    const j = joinReposWithSessions([r], [a], NOW)[0];
    // MIP: 7d 10h, APL: 6d 10h (rounded)
    expect(j.mip_seconds).toBeGreaterThan(0);
    expect(j.apl_seconds).toBeGreaterThan(0);
    expect(j.apl_seconds).toBeLessThan(j.mip_seconds!);
  });
});

describe("computePortfolio", () => {
  it("computes plr_agent and plr_portfolio with the correct denominators", () => {
    const repos: RepoState[] = [
      // Two leaking, both agent-touched
      repo("/leak-1", { ahead: 1, oldestUnpushedTs: "2026-04-01T00:00:00Z" }),
      repo("/leak-2", { ahead: 1, oldestUnpushedTs: "2026-04-01T00:00:00Z" }),
      // One ahead but well within threshold (not leaking)
      repo("/fresh", { ahead: 1, oldestUnpushedTs: "2026-05-07T09:00:00Z" }),
      // One in-sync, agent-touched (read-only audit)
      repo("/audited"),
      // One in-sync, no session
      repo("/quiet"),
    ];
    const aggs: RepoAggregate[] = [
      agg("/leak-1"),
      agg("/leak-2"),
      agg("/fresh"),
      agg("/audited"),
      // /quiet: no aggregate
    ];
    const joined = joinReposWithSessions(repos, aggs, NOW);
    const p = computePortfolio(joined, 7);
    expect(p.totalReposScanned).toBe(5);
    expect(p.reposAhead).toBe(3);
    expect(p.reposLeaking).toBe(2);
    expect(p.reposAgentTouched).toBe(4);
    expect(p.reposAgentTouchedAndLeaking).toBe(2);
    // PLR_agent: 2 leaking ∩ agent-touched / 4 agent-touched = 0.5
    expect(p.plr_agent).toBeCloseTo(0.5);
    // PLR_portfolio: 2 leaking / 5 with-remote = 0.4
    expect(p.plr_portfolio).toBeCloseTo(0.4);
  });

  it("returns null percentiles when sample size is zero", () => {
    const p = computePortfolio([], 7);
    expect(p.apl.p50).toBeNull();
    expect(p.mip.p50).toBeNull();
    expect(p.plr_agent).toBe(0);
    expect(p.plr_portfolio).toBe(0);
  });

  it("breaks down agent-touched into cwd and cross-only", () => {
    const repos = [
      repo("/cwd", { ahead: 0 }),
      repo("/cross", { ahead: 0 }),
    ];
    const aggs: RepoAggregate[] = [
      agg("/cwd", { cwdSessionCount: 1, crossRepoSessionCount: 0 }),
      agg("/cross", { cwdSessionCount: 0, crossRepoSessionCount: 2 }),
    ];
    const p = computePortfolio(joinReposWithSessions(repos, aggs, NOW), 7);
    expect(p.reposAgentTouchedCwd).toBe(1);
    expect(p.reposAgentTouchedCrossRepoOnly).toBe(1);
  });
});

describe("fmtDuration", () => {
  it("renders nulls and units as expected", () => {
    expect(fmtDuration(null)).toBe("—");
    expect(fmtDuration(45 * 60)).toBe("45m");
    expect(fmtDuration(2 * 3600 + 5 * 60)).toBe("2h 5m");
    expect(fmtDuration(3 * 86400 + 7 * 3600)).toBe("3d 7h");
  });
});
