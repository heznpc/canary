import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { checkRecentIssues } from "../lib/scanners/recent-issues";

interface RawIssue {
  number: number;
  title: string;
  html_url: string;
  state: string;
  created_at: string;
  comments: number;
  user: { login: string; type?: string } | null;
  labels: Array<string | { name: string }>;
  pull_request?: unknown;
}

const mkIssue = (over: Partial<RawIssue> = {}): RawIssue => ({
  number: 1,
  title: "Default",
  html_url: "https://github.com/x/y/issues/1",
  state: "open",
  created_at: "2026-05-07T00:00:00Z",
  comments: 0,
  user: { login: "alice", type: "User" },
  labels: [],
  ...over,
});

let originalFetch: typeof globalThis.fetch;

function stubFetchJson(payload: unknown, init: { ok?: boolean; status?: number } = {}) {
  globalThis.fetch = vi.fn(async () =>
    new Response(JSON.stringify(payload), {
      status: init.status ?? 200,
      headers: { "Content-Type": "application/json" },
    }),
  ) as typeof globalThis.fetch;
}

beforeEach(() => {
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  delete process.env.CANARY_SELF_LOGIN;
});

describe("checkRecentIssues", () => {
  it("returns null for an unparseable repo string", async () => {
    const out = await checkRecentIssues("not-a-slug");
    expect(out).toBeNull();
  });

  it("filters out pull requests, self-authored issues, and bot accounts", async () => {
    const issues: RawIssue[] = [
      mkIssue({ number: 1, user: { login: "alice" } }),
      mkIssue({
        number: 2,
        user: { login: "heznpc" }, // owner, should be self-authored
        title: "self-auth",
      }),
      mkIssue({
        number: 3,
        user: { login: "dependabot[bot]", type: "Bot" },
        title: "bot",
      }),
      mkIssue({
        number: 4,
        title: "this is a PR",
        pull_request: { url: "https://api.github.com/x/y/pulls/4" },
        user: { login: "carol" },
      }),
      mkIssue({
        number: 5,
        user: { login: "bob" },
        title: "external #2",
        comments: 3,
        labels: [{ name: "bug" }, "good first issue"],
      }),
    ];
    stubFetchJson(issues);

    const out = await checkRecentIssues("heznpc/foo");
    expect(out).not.toBeNull();
    expect(out!.external.map((e) => e.number)).toEqual([1, 5]);
    expect(out!.selfAuthored).toBe(2); // heznpc-authored + bot
    expect(out!.totalInWindow).toBe(4); // total minus the PR
    expect(out!.external.find((e) => e.number === 5)?.labels).toEqual([
      "bug",
      "good first issue",
    ]);
  });

  it("respects CANARY_SELF_LOGIN env override over the repo owner", async () => {
    process.env.CANARY_SELF_LOGIN = "alice";
    const issues: RawIssue[] = [
      mkIssue({ number: 1, user: { login: "alice" } }), // now self
      mkIssue({ number: 2, user: { login: "heznpc" } }), // now external
    ];
    stubFetchJson(issues);

    const out = await checkRecentIssues("heznpc/foo");
    expect(out).not.toBeNull();
    expect(out!.external.map((e) => e.number)).toEqual([2]);
    expect(out!.selfAuthored).toBe(1);
  });

  it("returns null when GitHub responds with non-OK status", async () => {
    stubFetchJson({}, { status: 404 });
    const out = await checkRecentIssues("heznpc/missing");
    expect(out).toBeNull();
  });

  it("normalises label objects and bare-string labels uniformly", async () => {
    const issues: RawIssue[] = [
      mkIssue({
        number: 7,
        user: { login: "ext" },
        labels: ["bare-label", { name: "object-label" }, { name: "" }],
      }),
    ];
    stubFetchJson(issues);

    const out = await checkRecentIssues("heznpc/foo");
    expect(out).not.toBeNull();
    expect(out!.external[0].labels).toEqual(["bare-label", "object-label"]);
  });
});
