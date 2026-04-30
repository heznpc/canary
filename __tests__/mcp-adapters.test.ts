import { describe, it, expect } from "vitest";
import {
  buildScanProjectPayload,
  buildScanAllPayload,
  buildUsagePayload,
  buildUpdateActionsPayload,
} from "../mcp/adapters";
import type { ProjectHealth, DashboardData, AnthropicUsage, UpdateAction } from "../lib/types";

function makeHealth(overrides: Partial<ProjectHealth> = {}): ProjectHealth {
  return {
    project: {
      id: "test",
      name: "Test",
      description: "t",
      tag: "active",
      stack: ["nextjs"],
      deployTarget: "vercel",
      category: "app",
    },
    git: null,
    dependencies: {
      total: 10,
      outdatedMajor: 1,
      outdatedMinor: 2,
      outdatedPatch: 3,
      vulnerabilities: 0,
      deps: [],
      packageManager: "npm",
    },
    stack: [
      { name: "Next.js", current: "16", latest: "16", eol: false, releasesBehind: 0 },
    ],
    deploy: { target: "vercel", status: "up", lastChecked: "2026-04-22T00:00:00Z" },
    updateActions: [],
    vibeCoding: { hasAgentsMd: false, hasClaudeMd: false, gotchas: [], tips: [] },
    research: null,
    codeQuality: null,
    scorecard: null,
    activity: null,
    docFreshness: null,
    dataFreshness: null,
    contextAttention: null,
    agentAuthorship: null,
    metadatafication: null,
    scannedAt: "2026-04-22T00:00:00Z",
    grade: "A",
    recommendation: "keep",
    reasons: ["looks good"],
    ...overrides,
  };
}

describe("buildScanProjectPayload", () => {
  it("includes grade, recommendation, reasons", () => {
    const payload = buildScanProjectPayload(makeHealth());
    expect(payload.grade).toBe("A");
    expect(payload.recommendation).toBe("keep");
    expect(payload.reasons).toEqual(["looks good"]);
  });

  it("flattens dependencies but strips raw deps array", () => {
    const payload = buildScanProjectPayload(makeHealth());
    expect(payload.dependencies?.total).toBe(10);
    expect(payload.dependencies).not.toHaveProperty("deps");
  });

  it("preserves null vulnerabilities (OSV scan failed)", () => {
    const h = makeHealth({
      dependencies: {
        total: 5, outdatedMajor: 0, outdatedMinor: 0, outdatedPatch: 0,
        vulnerabilities: null, deps: [], packageManager: "npm",
      },
    });
    expect(buildScanProjectPayload(h).dependencies?.vulnerabilities).toBeNull();
  });

  it("handles null dependencies", () => {
    const payload = buildScanProjectPayload(makeHealth({ dependencies: null }));
    expect(payload.dependencies).toBeNull();
  });

  it("extracts cam/acr/phase from nested scanner fields", () => {
    const payload = buildScanProjectPayload(
      makeHealth({
        contextAttention: {
          cam: 0.25,
          totalCommits: 100,
          contextCommits: 25,
          agentEraFiles: [],
          fileBreakdown: { "agents-md": [], "claude-md": [], cursor: [], copilot: [], "other-agent": [] },
          windowDays: 90,
          lastChecked: "2026-04-22T00:00:00Z",
        },
        agentAuthorship: {
          acr: 0.1, totalCommits: 100, agentCommits: 10, botCommits: 5,
          toolBreakdown: { claude: 10, copilot: 0, cursor: 0, devin: 0, other: 0 },
          dominantTool: "claude", sampled: false, windowDays: 90,
          lastChecked: "2026-04-22T00:00:00Z",
        },
        metadatafication: {
          phase: "assisted-tool",
          rationale: "test",
          progressScore: 50,
        },
      }),
    );
    expect(payload.cam).toBe(0.25);
    expect(payload.acr).toBe(0.1);
    expect(payload.metadataficationPhase).toBe("assisted-tool");
  });
});

describe("buildScanAllPayload", () => {
  it("wraps dashboard data with summary + per-project payloads", () => {
    const data: DashboardData = {
      projects: [makeHealth({ project: { ...makeHealth().project, id: "a" } }), makeHealth({ project: { ...makeHealth().project, id: "b" } })],
      summary: { total: 2, healthy: 2, needsUpdate: 0, critical: 0, archived: 0 },
      lastScan: "2026-04-22T00:00:00Z",
    };
    const payload = buildScanAllPayload(data);
    expect(payload.projects).toHaveLength(2);
    expect(payload.projects[0].id).toBe("a");
    expect(payload.summary.total).toBe(2);
  });
});

describe("buildUpdateActionsPayload", () => {
  const baseProject = makeHealth().project;

  function makeAction(overrides: Partial<UpdateAction> = {}): UpdateAction {
    return {
      name: "foo",
      current: "1.0.0",
      latest: "2.0.0",
      severity: "major",
      command: "npm install foo@2.0.0",
      ...overrides,
    };
  }

  it("bucket-counts actions by severity", () => {
    const payload = buildUpdateActionsPayload({
      project: baseProject,
      packageManager: "npm",
      actions: [
        makeAction({ name: "a", severity: "major" }),
        makeAction({ name: "b", severity: "major" }),
        makeAction({ name: "c", severity: "minor" }),
        makeAction({ name: "d", severity: "patch" }),
      ],
    });
    expect(payload.counts).toEqual({ major: 2, minor: 1, patch: 1 });
    expect(payload.actions).toHaveLength(4);
  });

  it("surfaces repo + package manager for the LLM to craft PR descriptions", () => {
    const payload = buildUpdateActionsPayload({
      project: { ...baseProject, repo: "owner/name" },
      packageManager: "pnpm",
      actions: [makeAction()],
    });
    expect(payload.repo).toBe("owner/name");
    expect(payload.packageManager).toBe("pnpm");
  });

  it("returns zero counts and empty actions when nothing is outdated", () => {
    const payload = buildUpdateActionsPayload({
      project: baseProject,
      packageManager: "npm",
      actions: [],
    });
    expect(payload.counts).toEqual({ major: 0, minor: 0, patch: 0 });
    expect(payload.actions).toEqual([]);
  });

  it("reports null package manager when caller cannot determine one", () => {
    const payload = buildUpdateActionsPayload({
      project: baseProject,
      packageManager: null,
      actions: [],
    });
    expect(payload.packageManager).toBeNull();
  });

  it("preserves changelog URL and command verbatim", () => {
    const payload = buildUpdateActionsPayload({
      project: baseProject,
      packageManager: "npm",
      actions: [
        makeAction({
          name: "next",
          command: "npm install next@16.2.0",
          changelogUrl: "https://github.com/vercel/next.js/releases",
        }),
      ],
    });
    expect(payload.actions[0].command).toBe("npm install next@16.2.0");
    expect(payload.actions[0].changelogUrl).toBe("https://github.com/vercel/next.js/releases");
  });
});

describe("buildUsagePayload", () => {
  it("preserves totals and per-model breakdown", () => {
    const usage: AnthropicUsage = {
      startingAt: "2026-04-15T00:00:00Z",
      endingAt: "2026-04-22T00:00:00Z",
      totalInputTokens: 100,
      totalOutputTokens: 50,
      totalCacheReadTokens: 10,
      totalCacheCreateTokens: 5,
      totalEstimatedUsd: 1.23,
      byModel: [
        {
          model: "claude-opus-4-7",
          inputTokens: 100, outputTokens: 50,
          cacheReadTokens: 10, cacheCreateTokens: 5,
          estimatedUsd: 1.23,
        },
      ],
      lastChecked: "2026-04-22T00:00:00Z",
    };
    const payload = buildUsagePayload(usage);
    expect(payload.totalEstimatedUsd).toBe(1.23);
    expect(payload.byModel).toHaveLength(1);
    expect(payload).not.toHaveProperty("lastChecked");
  });
});
