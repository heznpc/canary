import { describe, it, expect } from "vitest";
import { classifyAgentFile } from "../lib/scanners/cam";

describe("classifyAgentFile", () => {
  it("classifies AGENTS.md at repo root", () => {
    expect(classifyAgentFile("AGENTS.md")).toBe("agents-md");
  });

  it("classifies AGENTS.md in nested package", () => {
    expect(classifyAgentFile("packages/foo/AGENTS.md")).toBe("agents-md");
  });

  it("classifies CLAUDE.md regardless of location", () => {
    expect(classifyAgentFile("CLAUDE.md")).toBe("claude-md");
    expect(classifyAgentFile("compiler/CLAUDE.md")).toBe("claude-md");
  });

  it("classifies copilot-instructions.md (root and .github)", () => {
    expect(classifyAgentFile("copilot-instructions.md")).toBe("copilot");
    expect(classifyAgentFile(".github/copilot-instructions.md")).toBe("copilot");
  });

  it("classifies cursor configuration files", () => {
    expect(classifyAgentFile(".cursorrules")).toBe("cursor");
    expect(classifyAgentFile(".cursor/rules/foo.md")).toBe("cursor");
  });

  it("falls back to other-agent for unknown agent files", () => {
    expect(classifyAgentFile(".clinerules")).toBe("other-agent");
    expect(classifyAgentFile(".windsurfrules")).toBe("other-agent");
  });

  it("is case-insensitive on the file extension", () => {
    expect(classifyAgentFile("agents.md")).toBe("agents-md");
    expect(classifyAgentFile("claude.MD")).toBe("claude-md");
  });
});
