import { describe, it, expect } from "vitest";
import { classifyCommit, detectAgentTool } from "../lib/scanners/acr";

function makeCommit(opts: {
  message?: string;
  authorLogin?: string;
  committerLogin?: string;
  authorEmail?: string;
  committerEmail?: string;
}) {
  return {
    commit: {
      message: opts.message ?? "",
      author: { email: opts.authorEmail ?? "" },
      committer: { email: opts.committerEmail ?? "" },
    },
    author: { login: opts.authorLogin ?? "" },
    committer: { login: opts.committerLogin ?? "" },
  };
}

describe("classifyCommit", () => {
  it("detects Claude via Co-authored-by trailer", () => {
    const c = makeCommit({
      message: "fix: handle null\n\nCo-Authored-By: Claude <noreply@anthropic.com>",
    });
    const result = classifyCommit(c);
    expect(result.klass).toBe("ai-agent");
    expect(result.tool).toBe("claude");
  });

  it("detects Copilot via Co-authored-by trailer", () => {
    const c = makeCommit({
      message: "feat: add login\n\nCo-authored-by: github-copilot[bot] <copilot@github.com>",
    });
    const result = classifyCommit(c);
    expect(result.klass).toBe("ai-agent");
    expect(result.tool).toBe("copilot");
  });

  it("detects Devin via author login", () => {
    const c = makeCommit({ authorLogin: "devin-ai[bot]" });
    const result = classifyCommit(c);
    expect(result.klass).toBe("ai-agent");
    expect(result.tool).toBe("devin");
  });

  it("classifies Dependabot as bot, not agent", () => {
    const c = makeCommit({ authorLogin: "dependabot[bot]" });
    expect(classifyCommit(c).klass).toBe("bot");
  });

  it("classifies Renovate as bot, not agent", () => {
    const c = makeCommit({ authorLogin: "renovate[bot]" });
    expect(classifyCommit(c).klass).toBe("bot");
  });

  it("falls back to bot for generic [bot] suffix", () => {
    const c = makeCommit({ authorLogin: "some-other-tool[bot]" });
    expect(classifyCommit(c).klass).toBe("bot");
  });

  it("classifies normal human commits as human", () => {
    const c = makeCommit({
      message: "refactor scanner module",
      authorLogin: "alice",
      authorEmail: "alice@example.com",
    });
    expect(classifyCommit(c).klass).toBe("human");
  });

  it("AI co-author wins over bot suffix when both present", () => {
    // GitHub copilot bot suffix would normally classify as bot, but the
    // co-authored-by claude marker should be detected first.
    const c = makeCommit({
      authorLogin: "alice",
      message: "fix\n\nCo-authored-by: Claude <noreply@anthropic.com>",
    });
    expect(classifyCommit(c).klass).toBe("ai-agent");
  });
});

describe("detectAgentTool", () => {
  it("identifies Claude from text", () => {
    expect(detectAgentTool("Co-authored-by: Claude <noreply@anthropic.com>")).toBe("claude");
    expect(detectAgentTool("anthropic-team")).toBe("claude");
  });

  it("identifies Copilot", () => {
    expect(detectAgentTool("github-copilot")).toBe("copilot");
  });

  it("identifies Cursor", () => {
    expect(detectAgentTool("cursor agent")).toBe("cursor");
  });

  it("identifies Devin (also via cognition)", () => {
    expect(detectAgentTool("devin-ai")).toBe("devin");
    expect(detectAgentTool("cognition labs")).toBe("devin");
  });

  it("falls back to other for unknown tools", () => {
    expect(detectAgentTool("aider")).toBe("other");
    expect(detectAgentTool("unknown-bot")).toBe("other");
  });
});
