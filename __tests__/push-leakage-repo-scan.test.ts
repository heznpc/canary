import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { execSync } from "child_process";
import { tmpdir } from "os";
import { join } from "path";
import { findGitDirs, inspectRepo, scanRepos } from "../experiments/src/push-leakage/repo-scan";

let root: string;

function git(cwd: string, args: string): void {
  execSync(`git ${args}`, { cwd, stdio: "ignore" });
}

function makeRepo(path: string, opts: { withRemote?: boolean; commits?: string[] } = {}): void {
  mkdirSync(path, { recursive: true });
  git(path, "init -b main -q");
  // deterministic identity for this fixture
  git(path, "config user.email canary-test@example.com");
  git(path, "config user.name canary-test");
  git(path, "config commit.gpgsign false");
  for (const msg of opts.commits ?? ["initial"]) {
    writeFileSync(join(path, `f-${msg.replace(/\s+/g, "-")}`), msg);
    git(path, `add -A`);
    git(path, `commit -q -m "${msg}"`);
  }
  if (opts.withRemote) {
    const remote = `${path}.remote.git`;
    execSync(`git init --bare -q "${remote}"`);
    git(path, `remote add origin "${remote}"`);
    git(path, `push -u origin main -q`);
  }
}

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "canary-repo-scan-"));
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("findGitDirs", () => {
  it("locates a single repo and skips node_modules", () => {
    const r = join(root, "find-basic");
    mkdirSync(r, { recursive: true });
    makeRepo(join(r, "real-repo"));
    // A directory that should be skipped
    mkdirSync(join(r, "real-repo", "node_modules", "fake-pkg"), { recursive: true });
    mkdirSync(join(r, "real-repo", "node_modules", "fake-pkg", ".git"), { recursive: true });
    const found = findGitDirs([r]);
    expect(found.map((f) => f.repo).sort()).toEqual([join(r, "real-repo")]);
    expect(found[0].isWorktree).toBe(false);
  });

  it("does not recurse into a found repo", () => {
    const r = join(root, "no-recurse");
    mkdirSync(r, { recursive: true });
    makeRepo(join(r, "outer"));
    // Nested git dir (e.g. submodule) should not surface as separate repo
    // because findGitDirs returns once .git is hit.
    mkdirSync(join(r, "outer", "vendor", "inner", ".git"), { recursive: true });
    const found = findGitDirs([r]);
    expect(found.length).toBe(1);
    expect(found[0].repo).toBe(join(r, "outer"));
  });
});

describe("inspectRepo", () => {
  it("captures branch, dirty file count, and remote=false when no origin", () => {
    const repo = join(root, "no-remote");
    makeRepo(repo);
    writeFileSync(join(repo, "dirty.txt"), "uncommitted");
    const state = inspectRepo(repo, join(repo, ".git"), false);
    expect(state.branch).toBe("main");
    expect(state.hasRemote).toBe(false);
    expect(state.dirtyFiles).toBe(1);
    expect(state.ahead).toBe(0);
    expect(state.behind).toBe(0);
    expect(state.oldestUnpushedTs).toBeNull();
  });

  it("computes ahead and oldest unpushed commit when local is ahead of upstream", () => {
    const repo = join(root, "ahead");
    makeRepo(repo, { withRemote: true, commits: ["base"] });
    // After the bare-remote push, add two new commits locally so we are ahead.
    writeFileSync(join(repo, "a.txt"), "1");
    git(repo, "add -A");
    git(repo, 'commit -q -m "add a"');
    writeFileSync(join(repo, "b.txt"), "1");
    git(repo, "add -A");
    git(repo, 'commit -q -m "add b"');
    const state = inspectRepo(repo, join(repo, ".git"), false);
    expect(state.hasRemote).toBe(true);
    expect(state.ahead).toBe(2);
    expect(state.behind).toBe(0);
    expect(state.unpushedSubjects).toEqual(["add b", "add a"]); // newest first
    expect(state.oldestUnpushedTs).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("classifies in-sync repos with hasRemote=true and ahead=0", () => {
    const repo = join(root, "in-sync");
    makeRepo(repo, { withRemote: true });
    const state = inspectRepo(repo, join(repo, ".git"), false);
    expect(state.hasRemote).toBe(true);
    expect(state.ahead).toBe(0);
    expect(state.behind).toBe(0);
    expect(state.dirtyFiles).toBe(0);
  });
});

describe("scanRepos", () => {
  it("returns one RepoState per repo across multiple roots", () => {
    const r1 = join(root, "scan-r1");
    const r2 = join(root, "scan-r2");
    mkdirSync(r1, { recursive: true });
    mkdirSync(r2, { recursive: true });
    makeRepo(join(r1, "alpha"));
    makeRepo(join(r2, "beta"));
    const states = scanRepos([r1, r2]);
    expect(states.map((s) => s.path).sort()).toEqual(
      [join(r1, "alpha"), join(r2, "beta")].sort(),
    );
  });
});
