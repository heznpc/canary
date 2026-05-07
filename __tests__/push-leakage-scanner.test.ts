import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

// The scanner anchors paths to process.cwd() at module load time, so we have
// to chdir into a fixture before importing it.
let tmp: string;
let originalCwd: string;

function makeSnapshot(): unknown {
  return {
    schemaVersion: 1,
    generatedAt: "2026-05-07T10:00:00Z",
    portfolio: {
      generatedAt: "2026-05-07T10:00:00Z",
      totalReposScanned: 3,
      reposWithRemote: 3,
      reposAhead: 1,
      reposAheadOrDirty: 2,
      reposAgentTouched: 2,
      reposAgentTouchedCwd: 1,
      reposAgentTouchedCrossRepoOnly: 1,
      reposLeaking: 1,
      reposAgentTouchedAndLeaking: 1,
      thresholdDays: 7,
      plr_agent: 0.5,
      plr_portfolio: 0.333,
      apl: { p50: 1000, p90: 1000, max: 1000, n: 1 },
      mip: { p50: 86400 * 10, p90: 86400 * 10, max: 86400 * 10, n: 1 },
      ucp: { p50: null, p90: null, max: null, n: 0 },
      reposDirty: 0,
    },
    repos: [
      {
        repoPath: "/x/leaking",
        ahead: 1,
        behind: 0,
        dirtyFiles: 0,
        sessionCount: 1,
        cwdSessionCount: 1,
        crossRepoSessionCount: 0,
        mip_seconds: 86400 * 10,
        apl_seconds: 1000,
        ucp_seconds: null,
        oldestUnpushedTs: "2026-04-27T10:00:00Z",
        oldestDirtyMtime: null,
        unpushedSubjects: [],
        dirtyFilePaths: [],
        lastCommitTs: "2026-04-27T10:00:00Z",
        lastSessionEndTs: "2026-05-07T09:43:00Z",
        totalGitCommands: 5,
        totalPushCommands: 0,
        classification: "ahead_cwd_session",
        isWorktree: false,
        branch: "main",
        hasRemote: true,
        remoteUrl: "https://example.com/leaking.git",
      },
    ],
  };
}

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "canary-pl-scanner-"));
  mkdirSync(join(tmp, "experiments", "results"), { recursive: true });
  mkdirSync(join(tmp, "experiments", "results", "raw"), { recursive: true });
  originalCwd = process.cwd();
  process.chdir(tmp);
  // The scanner module captures cwd at module-evaluation time, so reset modules
  // before each test that re-imports it.
  vi.resetModules();
});

afterEach(() => {
  process.chdir(originalCwd);
  rmSync(tmp, { recursive: true, force: true });
});

describe("getLatestPushLeakageSnapshot", () => {
  it("returns null when no snapshot files exist", async () => {
    const mod = await import("../lib/scanners/push-leakage");
    expect(mod.getLatestPushLeakageSnapshot()).toBeNull();
  });

  it("prefers the raw detail snapshot over the public one", async () => {
    const raw = makeSnapshot() as { generatedAt: string };
    raw.generatedAt = "2026-05-07T10:00:00Z";
    writeFileSync(
      join(tmp, "experiments", "results", "raw", "push-leakage-2026-05-07-detail.json"),
      JSON.stringify(raw),
    );
    const pub = makeSnapshot() as { generatedAt: string };
    pub.generatedAt = "2026-05-06T10:00:00Z";
    writeFileSync(
      join(tmp, "experiments", "results", "push-leakage-2026-05-06.json"),
      JSON.stringify(pub),
    );
    const mod = await import("../lib/scanners/push-leakage");
    const out = mod.getLatestPushLeakageSnapshot();
    expect(out).not.toBeNull();
    expect(out!.source).toBe("raw");
    expect(out!.generatedAt).toBe("2026-05-07T10:00:00Z");
  });

  it("falls back to public snapshot when raw is absent", async () => {
    const pub = makeSnapshot();
    writeFileSync(
      join(tmp, "experiments", "results", "push-leakage-2026-05-07.json"),
      JSON.stringify(pub),
    );
    const mod = await import("../lib/scanners/push-leakage");
    const out = mod.getLatestPushLeakageSnapshot();
    expect(out).not.toBeNull();
    expect(out!.source).toBe("public");
  });

  it("skips post-intervention snapshots so the panel reflects steady state", async () => {
    const intervention = makeSnapshot() as { generatedAt: string };
    intervention.generatedAt = "2026-05-07T11:00:00Z";
    writeFileSync(
      join(
        tmp,
        "experiments",
        "results",
        "raw",
        "push-leakage-2026-05-07-post-intervention-detail.json",
      ),
      JSON.stringify(intervention),
    );
    const baseline = makeSnapshot() as { generatedAt: string };
    baseline.generatedAt = "2026-05-07T10:00:00Z";
    writeFileSync(
      join(tmp, "experiments", "results", "raw", "push-leakage-2026-05-07-detail.json"),
      JSON.stringify(baseline),
    );
    const mod = await import("../lib/scanners/push-leakage");
    const out = mod.getLatestPushLeakageSnapshot();
    expect(out).not.toBeNull();
    // Picks the steady-state baseline snapshot, not the post-intervention one
    expect(out!.generatedAt).toBe("2026-05-07T10:00:00Z");
  });

  it("returns topLeaking sorted by mip_seconds desc and capped at 10", async () => {
    const snap = makeSnapshot() as { repos: Array<{ ahead: number; mip_seconds: number; repoPath: string }> };
    // Replace the single repo with 12 leaking ones at descending mtime
    snap.repos = Array.from({ length: 12 }, (_, i) => ({
      ahead: 1,
      behind: 0,
      dirtyFiles: 0,
      sessionCount: 0,
      cwdSessionCount: 0,
      crossRepoSessionCount: 0,
      mip_seconds: 100_000 - i * 1000,
      apl_seconds: null,
      ucp_seconds: null,
      oldestUnpushedTs: "2026-04-01T00:00:00Z",
      oldestDirtyMtime: null,
      unpushedSubjects: [],
      dirtyFilePaths: [],
      lastCommitTs: "2026-04-01T00:00:00Z",
      lastSessionEndTs: null,
      totalGitCommands: 0,
      totalPushCommands: 0,
      classification: "ahead_no_session",
      isWorktree: false,
      branch: "main",
      hasRemote: true,
      remoteUrl: null,
      repoPath: `/x/r${i}`,
    }));
    writeFileSync(
      join(tmp, "experiments", "results", "raw", "push-leakage-2026-05-07-detail.json"),
      JSON.stringify(snap),
    );
    const mod = await import("../lib/scanners/push-leakage");
    const out = mod.getLatestPushLeakageSnapshot();
    expect(out).not.toBeNull();
    expect(out!.topLeaking.length).toBe(10);
    // Highest mip_seconds first
    expect(out!.topLeaking[0].mip_seconds).toBe(100_000);
    expect(out!.topLeaking[9].mip_seconds).toBe(91_000);
  });

  it("returns null when files exist but JSON is malformed", async () => {
    writeFileSync(
      join(tmp, "experiments", "results", "raw", "push-leakage-2026-05-07-detail.json"),
      "{not valid",
    );
    writeFileSync(
      join(tmp, "experiments", "results", "push-leakage-2026-05-07.json"),
      "also not valid",
    );
    const mod = await import("../lib/scanners/push-leakage");
    expect(mod.getLatestPushLeakageSnapshot()).toBeNull();
  });
});
