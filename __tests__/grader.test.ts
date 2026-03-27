import { describe, it, expect } from "vitest";
import { gradeProject } from "../lib/scanners/grader";
import type { ProjectHealth } from "../lib/types";

type GraderInput = Omit<ProjectHealth, "grade" | "recommendation" | "reasons">;

function makeHealth(overrides: Partial<GraderInput> = {}): GraderInput {
  return {
    project: {
      id: "test",
      name: "Test",
      description: "test project",
      tag: "active",
      stack: ["nextjs"],
      deployTarget: "vercel",
      category: "app",
    },
    git: null,
    dependencies: null,
    stack: [],
    deploy: { target: "vercel", status: "unknown", lastChecked: new Date().toISOString() },
    updateActions: [],
    vibeCoding: { hasAgentsMd: false, hasClaudeMd: false, gotchas: [], tips: [] },
    research: null,
    scannedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("gradeProject", () => {
  it("returns grade A and 'keep' for a healthy project with no issues", () => {
    const result = gradeProject(makeHealth());
    expect(result.grade).toBe("A");
    expect(result.recommendation).toBe("keep");
    expect(result.reasons).toContain("양호 — 특별한 조치 불필요");
  });

  it("returns grade A with 'archive' recommendation for archived projects", () => {
    const result = gradeProject(
      makeHealth({
        project: {
          id: "old",
          name: "Old",
          description: "archived",
          tag: "archived",
          stack: [],
          deployTarget: "none",
          category: "app",
        },
      }),
    );
    expect(result.grade).toBe("A");
    expect(result.recommendation).toBe("archive");
  });

  it("penalizes projects with many uncommitted files", () => {
    const result = gradeProject(
      makeHealth({
        git: {
          branch: "main",
          aheadBy: 0,
          behindBy: 0,
          uncommittedCount: 10,
          lastCommitDate: new Date().toISOString(),
          lastCommitMessage: "latest",
        },
      }),
    );
    expect(result.grade).toBe("A"); // -10 => 90 => still A
    expect(result.reasons.some((r) => r.includes("미커밋"))).toBe(true);
  });

  it("penalizes outdated major dependencies heavily", () => {
    const result = gradeProject(
      makeHealth({
        dependencies: {
          total: 5,
          outdatedMajor: 3,
          outdatedMinor: 0,
          outdatedPatch: 0,
          vulnerabilities: 0,
          deps: [],
          packageManager: "npm",
        },
      }),
    );
    // 100 - 3*15 = 55 => grade D
    expect(result.grade).toBe("D");
    expect(result.recommendation).toBe("upgrade");
  });

  it("penalizes security vulnerabilities very heavily", () => {
    const result = gradeProject(
      makeHealth({
        dependencies: {
          total: 2,
          outdatedMajor: 0,
          outdatedMinor: 0,
          outdatedPatch: 0,
          vulnerabilities: 3,
          deps: [],
          packageManager: "pnpm",
        },
      }),
    );
    // 100 - 3*20 = 40 => grade D
    expect(result.grade).toBe("D");
    expect(result.recommendation).toBe("upgrade");
  });

  it("penalizes EOL stack versions", () => {
    const result = gradeProject(
      makeHealth({
        stack: [
          { name: "Node.js", current: "16", latest: "22", eol: true, releasesBehind: 6 },
        ],
      }),
    );
    // EOL: -25 (else-if means releasesBehind not double-counted) => 75 => grade B
    expect(result.grade).toBe("B");
  });

  it("penalizes a deploy that is down", () => {
    const result = gradeProject(
      makeHealth({
        deploy: { target: "vercel", status: "down", lastChecked: new Date().toISOString() },
      }),
    );
    // 100 - 30 = 70 => grade C (75 threshold for B)
    expect(result.grade).toBe("C");
    expect(result.reasons.some((r) => r.includes("다운"))).toBe(true);
  });

  it("applies maintenance mode leniency (+20 score)", () => {
    const health = makeHealth({
      project: {
        id: "maint",
        name: "Maint",
        description: "maintenance mode",
        tag: "maintenance",
        stack: ["react"],
        deployTarget: "none",
        category: "app",
      },
      dependencies: {
        total: 5,
        outdatedMajor: 2,
        outdatedMinor: 0,
        outdatedPatch: 0,
        vulnerabilities: 0,
        deps: [],
        packageManager: "npm",
      },
    });
    const result = gradeProject(health);
    // 100 - 2*15 = 70, +20 leniency = 90 => A
    expect(result.grade).toBe("A");
  });

  it("combines multiple penalties to produce grade F", () => {
    const result = gradeProject(
      makeHealth({
        dependencies: {
          total: 10,
          outdatedMajor: 2,
          outdatedMinor: 4,
          outdatedPatch: 0,
          vulnerabilities: 2,
          deps: [],
          packageManager: "npm",
        },
        deploy: { target: "vercel", status: "down", lastChecked: new Date().toISOString() },
        stack: [
          { name: "React", current: "16", latest: "19", eol: true, releasesBehind: 3 },
        ],
      }),
    );
    // -30(major) -5(minor>2) -40(vuln) -30(deploy) -25(EOL) -15(releasesBehind>=2) => score < 0 => clamped to 0 => F
    expect(result.grade).toBe("F");
    expect(result.recommendation).toBe("rewrite");
  });
});
