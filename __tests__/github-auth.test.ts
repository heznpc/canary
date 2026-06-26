import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const { execFileSyncMock } = vi.hoisted(() => ({
  execFileSyncMock: vi.fn(),
}));

vi.mock("node:child_process", () => ({
  execFileSync: execFileSyncMock,
}));

const originalToken = process.env.GITHUB_TOKEN;

async function loadAuthModule() {
  const mod = await import("../lib/scanners/github-auth");
  mod.resetGitHubAuthCacheForTests();
  return mod;
}

describe("resolveGitHubAuth", () => {
  beforeEach(() => {
    vi.resetModules();
    execFileSyncMock.mockReset();
    delete process.env.GITHUB_TOKEN;
  });

  afterEach(() => {
    if (originalToken === undefined) {
      delete process.env.GITHUB_TOKEN;
    } else {
      process.env.GITHUB_TOKEN = originalToken;
    }
  });

  it("prefers GITHUB_TOKEN without invoking gh", async () => {
    process.env.GITHUB_TOKEN = " env-token ";
    const { resolveGitHubAuth } = await loadAuthModule();

    expect(resolveGitHubAuth()).toEqual({
      configured: true,
      source: "env",
      token: "env-token",
    });
    expect(execFileSyncMock).not.toHaveBeenCalled();
  });

  it("falls back to `gh auth token` when the env token is absent", async () => {
    execFileSyncMock.mockReturnValue("cli-token\n");
    const { resolveGitHubAuth } = await loadAuthModule();

    expect(resolveGitHubAuth()).toEqual({
      configured: true,
      source: "gh",
      token: "cli-token",
    });
    expect(execFileSyncMock).toHaveBeenCalledWith("gh", ["auth", "token"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 2_000,
    });
  });

  it("reports unauthenticated when both env and gh fallback are unavailable", async () => {
    execFileSyncMock.mockImplementation(() => {
      throw new Error("not logged in");
    });
    const { resolveGitHubAuth } = await loadAuthModule();

    expect(resolveGitHubAuth()).toEqual({
      configured: false,
      source: "none",
    });
  });

  it("does not re-run gh after a successful fallback lookup", async () => {
    execFileSyncMock.mockReturnValue("cli-token\n");
    const { resolveGitHubAuth } = await loadAuthModule();

    expect(resolveGitHubAuth().source).toBe("gh");
    expect(resolveGitHubAuth().source).toBe("gh");
    expect(execFileSyncMock).toHaveBeenCalledTimes(1);
  });
});

describe("githubHeaders", () => {
  beforeEach(() => {
    vi.resetModules();
    execFileSyncMock.mockReset();
    delete process.env.GITHUB_TOKEN;
  });

  afterEach(() => {
    if (originalToken === undefined) {
      delete process.env.GITHUB_TOKEN;
    } else {
      process.env.GITHUB_TOKEN = originalToken;
    }
  });

  it("adds Authorization from the gh fallback", async () => {
    execFileSyncMock.mockReturnValue("cli-token\n");
    const { resetGitHubAuthCacheForTests } = await import("../lib/scanners/github-auth");
    resetGitHubAuthCacheForTests();
    const { githubHeaders } = await import("../lib/scanners/version-utils");

    expect(githubHeaders()).toEqual({
      Accept: "application/vnd.github+json",
      Authorization: "Bearer cli-token",
    });
  });
});
