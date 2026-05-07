import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  scanSessionFile,
  scanAllSessions,
  aggregateByRepo,
  type SessionRecord,
} from "../experiments/src/push-leakage/transcript-scan";

let tmp: string;
let projectsRoot: string;

function writeJsonl(path: string, lines: object[]): void {
  writeFileSync(path, lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
}

function userMsg(ts: string, opts: { content?: unknown; cwd?: string; gitBranch?: string } = {}) {
  return {
    type: "user",
    timestamp: ts,
    cwd: opts.cwd ?? "/Users/test/repo",
    gitBranch: opts.gitBranch ?? "main",
    sessionId: "sess",
    message: { role: "user", content: opts.content ?? "hello" },
  };
}

function assistantBash(ts: string, command: string, cwd = "/Users/test/repo", gitBranch = "main") {
  return {
    type: "assistant",
    timestamp: ts,
    cwd,
    gitBranch,
    sessionId: "sess",
    message: {
      role: "assistant",
      content: [
        { type: "tool_use", name: "Bash", input: { command } },
      ],
    },
  };
}

beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), "canary-leakage-"));
  projectsRoot = join(tmp, "projects");
  mkdirSync(projectsRoot, { recursive: true });
});

afterAll(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe("scanSessionFile", () => {
  it("extracts cwd, time bounds, and counts from a minimal session", () => {
    const proj = join(projectsRoot, "-Users-test-repo");
    mkdirSync(proj, { recursive: true });
    const path = join(proj, "s1.jsonl");
    writeJsonl(path, [
      userMsg("2026-05-01T10:00:00Z", { cwd: "/Users/test/repo" }),
      assistantBash("2026-05-01T10:01:00Z", "git status"),
      assistantBash("2026-05-01T10:02:00Z", "git push origin main"),
      userMsg("2026-05-01T10:03:00Z", { cwd: "/Users/test/repo" }),
    ]);
    const r = scanSessionFile(path);
    expect(r.cwd).toBe("/Users/test/repo");
    expect(r.startTs).toBe("2026-05-01T10:00:00Z");
    expect(r.endTs).toBe("2026-05-01T10:03:00Z");
    expect(r.gitBranches).toContain("main");
    expect(r.bashCount).toBe(2);
    expect(r.gitCommandCount).toBe(2);
    expect(r.pushCommandCount).toBe(1);
    expect(r.touchedRepos).toEqual([]);
  });

  it("ignores file-history-snapshot and last-prompt rows for time bounds", () => {
    const proj = join(projectsRoot, "-with-snapshots");
    mkdirSync(proj, { recursive: true });
    const path = join(proj, "s2.jsonl");
    writeJsonl(path, [
      { type: "file-history-snapshot", timestamp: "2025-01-01T00:00:00Z" },
      userMsg("2026-05-02T08:00:00Z", { cwd: "/Users/test/r" }),
      assistantBash("2026-05-02T08:30:00Z", "ls"),
      { type: "last-prompt", timestamp: null },
    ]);
    const r = scanSessionFile(path);
    expect(r.startTs).toBe("2026-05-02T08:00:00Z");
    expect(r.endTs).toBe("2026-05-02T08:30:00Z");
  });

  it("extracts touchedRepos from `cd <path> && git ...`", () => {
    const proj = join(projectsRoot, "-cross-repo");
    mkdirSync(proj, { recursive: true });
    const path = join(proj, "s3.jsonl");
    writeJsonl(path, [
      userMsg("2026-05-03T10:00:00Z", { cwd: "/Users/test/parent" }),
      assistantBash(
        "2026-05-03T10:01:00Z",
        "cd /Users/test/parent/sub-a && git status && git log --oneline | head",
        "/Users/test/parent",
      ),
      assistantBash(
        "2026-05-03T10:02:00Z",
        "cd /Users/test/parent/sub-b && git status",
        "/Users/test/parent",
      ),
    ]);
    const r = scanSessionFile(path);
    expect(r.cwd).toBe("/Users/test/parent");
    expect(new Set(r.touchedRepos)).toEqual(
      new Set(["/Users/test/parent/sub-a", "/Users/test/parent/sub-b"]),
    );
  });

  it("extracts touchedRepos from `git -C <path>` invocations", () => {
    const proj = join(projectsRoot, "-dash-c");
    mkdirSync(proj, { recursive: true });
    const path = join(proj, "s4.jsonl");
    writeJsonl(path, [
      userMsg("2026-05-04T10:00:00Z", { cwd: "/Users/test/parent" }),
      assistantBash(
        "2026-05-04T10:01:00Z",
        'git -C /Users/test/parent/x log --oneline && git -C "/Users/test/parent/y" status',
        "/Users/test/parent",
      ),
    ]);
    const r = scanSessionFile(path);
    expect(new Set(r.touchedRepos)).toEqual(
      new Set(["/Users/test/parent/x", "/Users/test/parent/y"]),
    );
  });

  it("ignores `cd <path>` when no git in the chain", () => {
    const proj = join(projectsRoot, "-cd-no-git");
    mkdirSync(proj, { recursive: true });
    const path = join(proj, "s5.jsonl");
    writeJsonl(path, [
      userMsg("2026-05-05T10:00:00Z", { cwd: "/Users/test/here" }),
      assistantBash("2026-05-05T10:01:00Z", "cd /Users/test/elsewhere && ls -la"),
    ]);
    const r = scanSessionFile(path);
    expect(r.touchedRepos).toEqual([]);
    // Non-git bash still counts toward bashCount
    expect(r.bashCount).toBe(1);
    expect(r.gitCommandCount).toBe(0);
  });

  it("does not double-count cwd as a touched-repo", () => {
    const proj = join(projectsRoot, "-self-touch");
    mkdirSync(proj, { recursive: true });
    const path = join(proj, "s6.jsonl");
    writeJsonl(path, [
      userMsg("2026-05-06T10:00:00Z", { cwd: "/Users/test/self" }),
      assistantBash("2026-05-06T10:01:00Z", "cd /Users/test/self && git status", "/Users/test/self"),
    ]);
    const r = scanSessionFile(path);
    // cwd path must not appear in touchedRepos (drop-self rule)
    expect(r.touchedRepos).not.toContain("/Users/test/self");
  });

  it("survives malformed lines and recovers", () => {
    const proj = join(projectsRoot, "-malformed");
    mkdirSync(proj, { recursive: true });
    const path = join(proj, "s7.jsonl");
    const file = [
      JSON.stringify(userMsg("2026-05-07T10:00:00Z")),
      "{not valid json",
      "",
      JSON.stringify(assistantBash("2026-05-07T10:01:00Z", "git status")),
    ].join("\n");
    writeFileSync(path, file);
    const r = scanSessionFile(path);
    expect(r.bashCount).toBe(1);
    expect(r.gitCommandCount).toBe(1);
  });
});

describe("scanAllSessions", () => {
  it("respects pathFilter on the encoded project directory name", () => {
    const proj1 = join(projectsRoot, "-Users-test-IncludeMe");
    const proj2 = join(projectsRoot, "-Users-test-SkipMe");
    mkdirSync(proj1, { recursive: true });
    mkdirSync(proj2, { recursive: true });
    writeJsonl(join(proj1, "a.jsonl"), [userMsg("2026-05-08T00:00:00Z", { cwd: "/Users/test/IncludeMe" })]);
    writeJsonl(join(proj2, "b.jsonl"), [userMsg("2026-05-08T00:00:00Z", { cwd: "/Users/test/SkipMe" })]);
    const all = scanAllSessions({ projectsRoot, pathFilter: "IncludeMe" });
    const cwds = all.map((s) => s.cwd);
    expect(cwds).toContain("/Users/test/IncludeMe");
    expect(cwds).not.toContain("/Users/test/SkipMe");
  });
});

describe("aggregateByRepo", () => {
  function s(cwd: string | null, end: string, touched: string[] = [], bash = 1, git = 1, push = 0): SessionRecord {
    return {
      sessionId: `${cwd ?? "_"}-${end}`,
      cwd,
      startTs: end,
      endTs: end,
      gitBranches: ["main"],
      bashCount: bash,
      gitCommandCount: git,
      pushCommandCount: push,
      touchedRepos: touched,
      source: "cli",
      jsonlPath: "/tmp/x.jsonl",
    };
  }

  it("counts cwd and cross-repo touches separately, dedupes session-level totals", () => {
    const sessions: SessionRecord[] = [
      // S1 cwd=/Paper, touches A and B
      s("/Paper", "2026-05-01T00:00:00Z", ["/Paper/A", "/Paper/B"], 2, 2, 0),
      // S2 cwd=/Paper/A directly
      s("/Paper/A", "2026-05-02T00:00:00Z", [], 1, 1, 1),
    ];
    const aggs = aggregateByRepo(sessions);
    const a = aggs.find((x) => x.repoPath === "/Paper/A");
    const b = aggs.find((x) => x.repoPath === "/Paper/B");
    const parent = aggs.find((x) => x.repoPath === "/Paper");
    expect(a).toBeDefined();
    expect(b).toBeDefined();
    expect(parent).toBeDefined();
    // /Paper/A: one cross-repo touch (S1) + one cwd touch (S2)
    expect(a!.cwdSessionCount).toBe(1);
    expect(a!.crossRepoSessionCount).toBe(1);
    expect(a!.sessionCount).toBe(2);
    // bash/git counts are summed once per (path, session) — 2 (S1) + 1 (S2) = 3 bashes
    expect(a!.totalBash).toBe(3);
    // /Paper/B: only cross-repo
    expect(b!.cwdSessionCount).toBe(0);
    expect(b!.crossRepoSessionCount).toBe(1);
    // Parent: cwd-only
    expect(parent!.cwdSessionCount).toBe(1);
    expect(parent!.crossRepoSessionCount).toBe(0);
  });

  it("sorts by lastEndTs descending", () => {
    const sessions: SessionRecord[] = [
      s("/old", "2026-04-01T00:00:00Z"),
      s("/new", "2026-05-01T00:00:00Z"),
      s("/mid", "2026-04-15T00:00:00Z"),
    ];
    const aggs = aggregateByRepo(sessions);
    expect(aggs.map((a) => a.repoPath)).toEqual(["/new", "/mid", "/old"]);
  });
});
