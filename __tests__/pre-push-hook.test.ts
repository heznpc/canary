import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";
import { spawnSync } from "child_process";

/**
 * Smoke tests for the pre-push hook script. We can't fully exercise git's
 * actual pre-push invocation here, but we can drive the script with a
 * controlled CANARY_HOME and a fixture snapshot to verify:
 *   - it finds and parses the snapshot,
 *   - it picks the latest non-post-intervention file,
 *   - it filters the current repo out of the leaking list,
 *   - it exits 0 and prints to stderr (so it never blocks push).
 */

const HOOK_SCRIPT = resolve("scripts/canary-pre-push.mjs");

let tmp: string;
let resultsDir: string;
let repoDir: string;

function makeSnapshot(name: string, repos: object[]) {
  writeFileSync(
    join(resultsDir, name),
    JSON.stringify({
      generatedAt: new Date().toISOString(),
      repos,
    }),
  );
}

function runHook(cwd: string, extraEnv: Record<string, string | undefined> = {}) {
  const r = spawnSync(process.execPath, [HOOK_SCRIPT], {
    cwd,
    env: { ...process.env, CANARY_HOME: tmp, ...extraEnv } as NodeJS.ProcessEnv,
    encoding: "utf-8",
  });
  return {
    code: r.status ?? -1,
    stdout: r.stdout ?? "",
    stderr: r.stderr ?? "",
  };
}

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "canary-prepush-"));
  resultsDir = join(tmp, "experiments", "results");
  mkdirSync(resultsDir, { recursive: true });
  mkdirSync(join(resultsDir, "raw"), { recursive: true });
  repoDir = mkdtempSync(join(tmpdir(), "canary-prepush-repo-"));
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
  rmSync(repoDir, { recursive: true, force: true });
});

describe("canary-pre-push.mjs", () => {
  it("prints clean message when no other repos leak", () => {
    makeSnapshot("push-leakage-2026-05-11.json", [
      { repoPath: "/x/some-other-repo", ahead: 0, mip_seconds: null },
    ]);
    const r = runHook(repoDir);
    expect(r.code).toBe(0);
    expect(r.stderr).toMatch(/portfolio clean|0 other repos leaking/i);
  });

  it("lists top leaking repos when present, exit 0 (never blocks)", () => {
    makeSnapshot("push-leakage-2026-05-11.json", [
      { repoPath: "/x/foo", ahead: 2, mip_seconds: 100_000 },
      { repoPath: "/x/bar", ahead: 1, mip_seconds: 200_000 },
      { repoPath: "/x/baz", ahead: 1, mip_seconds: 50_000 },
    ]);
    const r = runHook(repoDir);
    expect(r.code).toBe(0);
    expect(r.stderr).toMatch(/3 other repos leaking/);
    // bar has highest MIP → first
    expect(r.stderr.indexOf("bar")).toBeLessThan(r.stderr.indexOf("foo"));
    expect(r.stderr).toMatch(/foo/);
    expect(r.stderr).toMatch(/baz/);
  });

  it("excludes the current repo from the leaking list (matched by basename)", () => {
    // repo cwd basename is e.g. "canary-prepush-repo-XXXXXX". We can't easily
    // control that, so we make a snapshot entry whose basename equals the cwd
    // basename and verify it is filtered out.
    const me = repoDir.split("/").pop()!;
    makeSnapshot("push-leakage-2026-05-11.json", [
      { repoPath: `/x/${me}`, ahead: 5, mip_seconds: 500_000 },
      { repoPath: "/x/other", ahead: 1, mip_seconds: 100_000 },
    ]);
    const r = runHook(repoDir);
    expect(r.code).toBe(0);
    expect(r.stderr).not.toMatch(new RegExp(me));
    expect(r.stderr).toMatch(/1 other repo leaking|other/);
  });

  it("prefers raw detail snapshot over public when both exist", () => {
    writeFileSync(
      join(resultsDir, "push-leakage-2026-05-10.json"),
      JSON.stringify({ generatedAt: "2026-05-10T00:00:00Z", repos: [{ repoPath: "/x/public", ahead: 1, mip_seconds: 86400 }] }),
    );
    writeFileSync(
      join(resultsDir, "raw", "push-leakage-2026-05-11-detail.json"),
      JSON.stringify({ generatedAt: "2026-05-11T00:00:00Z", repos: [{ repoPath: "/x/raw", ahead: 1, mip_seconds: 86400 }] }),
    );
    const r = runHook(repoDir);
    expect(r.code).toBe(0);
    expect(r.stderr).toMatch(/raw/);
    expect(r.stderr).not.toMatch(/public/);
  });

  it("skips post-intervention snapshots", () => {
    writeFileSync(
      join(resultsDir, "push-leakage-2026-05-11-post-intervention.json"),
      JSON.stringify({ generatedAt: "2026-05-11T00:00:00Z", repos: [{ repoPath: "/x/post", ahead: 1, mip_seconds: 86400 }] }),
    );
    writeFileSync(
      join(resultsDir, "push-leakage-2026-05-10.json"),
      JSON.stringify({ generatedAt: "2026-05-10T00:00:00Z", repos: [{ repoPath: "/x/steady", ahead: 1, mip_seconds: 86400 }] }),
    );
    const r = runHook(repoDir);
    expect(r.code).toBe(0);
    expect(r.stderr).not.toMatch(/\/post/);
    expect(r.stderr).toMatch(/steady/);
  });

  it("exits 0 with a friendly warning when no snapshot is available", () => {
    // resultsDir exists but is empty
    const r = runHook(repoDir);
    expect(r.code).toBe(0);
    expect(r.stderr).toMatch(/no push-leakage snapshot/);
  });

  it("exits 0 with friendly warning when CANARY_HOME is unset and default path missing", () => {
    const r = spawnSync(process.execPath, [HOOK_SCRIPT], {
      cwd: repoDir,
      env: {
        PATH: process.env.PATH ?? "",
        HOME: "/tmp/canary-test-nonexistent-home",
        NODE_ENV: process.env.NODE_ENV ?? "test",
        // CANARY_HOME deliberately omitted
      },
      encoding: "utf-8",
    });
    expect(r.status).toBe(0);
    expect(r.stderr).toMatch(/skipping/);
  });
});
