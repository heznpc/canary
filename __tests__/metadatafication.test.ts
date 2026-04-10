import { describe, it, expect } from "vitest";
import { classifyMetadatafication } from "../lib/scanners/metadatafication";
import type { ContextAttention, AgentAuthorship, AgentFileCategory } from "../lib/types";

function emptyBreakdown(): Record<AgentFileCategory, string[]> {
  return { "agents-md": [], "claude-md": [], cursor: [], copilot: [], "other-agent": [] };
}

function makeCAM(overrides: Partial<ContextAttention> = {}): ContextAttention {
  return {
    cam: 0,
    totalCommits: 0,
    contextCommits: 0,
    agentEraFiles: [],
    fileBreakdown: emptyBreakdown(),
    windowDays: 90,
    lastChecked: new Date().toISOString(),
    ...overrides,
  };
}

function makeACR(overrides: Partial<AgentAuthorship> = {}): AgentAuthorship {
  return {
    acr: 0,
    totalCommits: 0,
    agentCommits: 0,
    botCommits: 0,
    toolBreakdown: { claude: 0, copilot: 0, cursor: 0, devin: 0, other: 0 },
    dominantTool: null,
    sampled: false,
    windowDays: 90,
    lastChecked: new Date().toISOString(),
    ...overrides,
  };
}

describe("classifyMetadatafication", () => {
  it("returns null when both inputs are null", () => {
    expect(classifyMetadatafication(null, null)).toBeNull();
  });

  it("Phase 1 (active-tool): no agent files, no AI commits", () => {
    const cam = makeCAM({ totalCommits: 50 });
    const acr = makeACR({ totalCommits: 50 });
    const result = classifyMetadatafication(cam, acr);
    expect(result?.phase).toBe("active-tool");
    expect(result?.progressScore).toBe(0);
  });

  it("Phase 2 (assisted-tool): agent files present, low CAM", () => {
    const cam = makeCAM({
      totalCommits: 100,
      contextCommits: 1,
      cam: 0.01,
      agentEraFiles: ["AGENTS.md"],
      fileBreakdown: { ...emptyBreakdown(), "agents-md": ["AGENTS.md"] },
    });
    const acr = makeACR({ totalCommits: 100 });
    const result = classifyMetadatafication(cam, acr);
    expect(result?.phase).toBe("assisted-tool");
    expect(result?.progressScore).toBeGreaterThan(0);
    expect(result?.progressScore).toBeLessThan(35);
  });

  it("Phase 3 (infrastructure-metadata): high CAM triggers refinement", () => {
    const cam = makeCAM({
      totalCommits: 100,
      contextCommits: 4,
      cam: 0.04,
      agentEraFiles: ["AGENTS.md", "CLAUDE.md"],
    });
    const acr = makeACR({ totalCommits: 100 });
    const result = classifyMetadatafication(cam, acr);
    expect(result?.phase).toBe("infrastructure-metadata");
    expect(result?.progressScore).toBeGreaterThanOrEqual(35);
  });

  it("Phase 3 (infrastructure-metadata): high ACR triggers refinement even at low CAM", () => {
    const cam = makeCAM({ totalCommits: 100, cam: 0.005 });
    const acr = makeACR({ totalCommits: 100, agentCommits: 30, acr: 0.30 });
    const result = classifyMetadatafication(cam, acr);
    expect(result?.phase).toBe("infrastructure-metadata");
  });

  it("includes CAM% in rationale string for Phase 3 by CAM", () => {
    const cam = makeCAM({ totalCommits: 100, contextCommits: 5, cam: 0.05 });
    const result = classifyMetadatafication(cam, null);
    expect(result?.rationale).toContain("CAM");
    expect(result?.rationale).toContain("5");
  });

  it("includes ACR% in rationale string for Phase 3 by ACR", () => {
    const acr = makeACR({ totalCommits: 100, agentCommits: 10, acr: 0.10 });
    const result = classifyMetadatafication(null, acr);
    expect(result?.rationale).toContain("ACR");
    expect(result?.rationale).toContain("10");
  });

  it("Phase 2 with bot commits but no AI agent commits", () => {
    // Bot-only activity should not trigger AI markers, only file presence
    const cam = makeCAM({
      totalCommits: 100,
      agentEraFiles: ["CLAUDE.md"],
      fileBreakdown: { ...emptyBreakdown(), "claude-md": ["CLAUDE.md"] },
    });
    const acr = makeACR({ totalCommits: 100, botCommits: 20 });
    const result = classifyMetadatafication(cam, acr);
    expect(result?.phase).toBe("assisted-tool");
  });

  it("progressScore stays in 0-100 range", () => {
    const cam = makeCAM({ totalCommits: 100, cam: 0.50 });
    const acr = makeACR({ totalCommits: 100, acr: 0.80 });
    const result = classifyMetadatafication(cam, acr);
    expect(result?.progressScore).toBeGreaterThanOrEqual(0);
    expect(result?.progressScore).toBeLessThanOrEqual(100);
  });
});
