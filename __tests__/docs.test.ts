import { describe, it, expect, vi, beforeEach } from "vitest";
import { extractVersionsFromText, extractNumberMetrics, checkDocFreshness } from "../lib/scanners/docs";
import type { ProjectConfig } from "../lib/projects";

describe("extractVersionsFromText", () => {
  it("extracts semver versions with v prefix", () => {
    const text = "This project is at v1.2.3 and compatible with v0.3.3";
    const versions = extractVersionsFromText(text);
    expect(versions).toContain("v1.2.3");
    expect(versions).toContain("v0.3.3");
  });

  it("extracts semver versions without v prefix", () => {
    const text = "Version 2.6.0 released, update from 2.5.1";
    const versions = extractVersionsFromText(text);
    expect(versions).toContain("2.6.0");
    expect(versions).toContain("2.5.1");
  });

  it("deduplicates repeated versions", () => {
    const text = "v1.0.0 is great, v1.0.0 is mentioned again";
    const versions = extractVersionsFromText(text);
    expect(versions.filter((v) => v === "v1.0.0")).toHaveLength(1);
  });

  it("returns empty array when no versions found", () => {
    const text = "No version numbers here at all";
    expect(extractVersionsFromText(text)).toEqual([]);
  });

  it("handles mixed prefixed and unprefixed versions", () => {
    const text = "Supports v3.0.0 and also 2.9.1";
    const versions = extractVersionsFromText(text);
    expect(versions).toHaveLength(2);
    expect(versions).toContain("v3.0.0");
    expect(versions).toContain("2.9.1");
  });
});

describe("extractNumberMetrics", () => {
  it("extracts tool counts from text", () => {
    const text = "AirMCP provides 262 tools for Apple ecosystem";
    const metrics = extractNumberMetrics(text);
    expect(metrics.get("tool")).toBe(262);
  });

  it("extracts multiple metric types", () => {
    const text = "Includes 25 modules and 750 tests across 5 projects";
    const metrics = extractNumberMetrics(text);
    expect(metrics.get("module")).toBe(25);
    expect(metrics.get("test")).toBe(750);
    expect(metrics.get("project")).toBe(5);
  });

  it("handles plus suffix (e.g. 100+ tools)", () => {
    const text = "Over 100+ tools available";
    const metrics = extractNumberMetrics(text);
    expect(metrics.get("tool")).toBe(100);
  });

  it("returns empty map when no metrics found", () => {
    const text = "Just a plain description with no numbers";
    const metrics = extractNumberMetrics(text);
    expect(metrics.size).toBe(0);
  });

  it("handles singular and plural forms", () => {
    const text = "1 tool and 3 modules";
    const metrics = extractNumberMetrics(text);
    expect(metrics.get("tool")).toBe(1);
    expect(metrics.get("module")).toBe(3);
  });
});

describe("checkDocFreshness", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const makeProject = (overrides: Partial<ProjectConfig> = {}): ProjectConfig => ({
    id: "test",
    name: "Test",
    description: "test project",
    repo: "heznpc/test-repo",
    tag: "active",
    stack: ["typescript"],
    deployTarget: "npm",
    category: "app",
    ...overrides,
  });

  it("returns default freshness when project has no repo", async () => {
    const result = await checkDocFreshness(makeProject({ repo: undefined }));
    expect(result.readmeVersionMatch).toBe(true);
    expect(result.changelogUpToDate).toBe(true);
    expect(result.todoStaleness).toBe(0);
    expect(result.agentsMdExists).toBe(false);
    expect(result.claudeMdExists).toBe(false);
    expect(result.mismatches).toEqual([]);
    expect(result.lastChecked).toBeTruthy();
  });

  it("returns correct structure with all fields", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      text: async () => "",
    }));

    const result = await checkDocFreshness(makeProject());
    expect(result).toHaveProperty("readmeVersionMatch");
    expect(result).toHaveProperty("changelogUpToDate");
    expect(result).toHaveProperty("todoStaleness");
    expect(result).toHaveProperty("agentsMdExists");
    expect(result).toHaveProperty("claudeMdExists");
    expect(result).toHaveProperty("mismatches");
    expect(result).toHaveProperty("lastChecked");
    expect(Array.isArray(result.mismatches)).toBe(true);
  });

  it("detects README version mismatch", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation((url: string) => {
      if (url.includes("README.md")) {
        return Promise.resolve({
          ok: true,
          text: async () => "# Test Project v1.0.0\nCurrently at v1.0.0",
        });
      }
      if (url.includes("package.json")) {
        return Promise.resolve({
          ok: true,
          text: async () => JSON.stringify({ version: "2.0.0" }),
        });
      }
      return Promise.resolve({ ok: false, text: async () => "" });
    }));

    const result = await checkDocFreshness(makeProject());
    expect(result.readmeVersionMatch).toBe(false);
    expect(result.mismatches.length).toBeGreaterThan(0);
    expect(result.mismatches[0].file).toBe("README.md");
    expect(result.mismatches[0].field).toBe("version");
    expect(result.mismatches[0].expected).toBe("2.0.0");
  });

  it("reports README as matching when version is current", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation((url: string) => {
      if (url.includes("README.md")) {
        return Promise.resolve({
          ok: true,
          text: async () => "# Test Project v2.0.0\nVersion 2.0.0",
        });
      }
      if (url.includes("package.json")) {
        return Promise.resolve({
          ok: true,
          text: async () => JSON.stringify({ version: "2.0.0" }),
        });
      }
      return Promise.resolve({ ok: false, text: async () => "" });
    }));

    const result = await checkDocFreshness(makeProject());
    expect(result.readmeVersionMatch).toBe(true);
    expect(result.mismatches.filter((m) => m.file === "README.md")).toHaveLength(0);
  });

  it("detects CHANGELOG not up to date with latest release", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation((url: string) => {
      if (url.includes("CHANGELOG.md")) {
        return Promise.resolve({
          ok: true,
          text: async () => "# Changelog\n\n## 1.0.0\n- Initial release",
        });
      }
      if (url.includes("releases/latest")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ tag_name: "v2.0.0", published_at: "2026-03-01T00:00:00Z" }),
        });
      }
      return Promise.resolve({ ok: false, text: async () => "" });
    }));

    const result = await checkDocFreshness(makeProject());
    expect(result.changelogUpToDate).toBe(false);
    expect(result.mismatches.some((m) => m.file === "CHANGELOG.md")).toBe(true);
  });

  it("counts TODO staleness from unchecked items", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation((url: string) => {
      if (url.includes("TODO.md")) {
        return Promise.resolve({
          ok: true,
          text: async () => [
            "# TODO",
            "- [ ] First task",
            "- [x] Done task",
            "- [ ] Second task",
            "- [ ] Third task",
          ].join("\n"),
        });
      }
      return Promise.resolve({ ok: false, text: async () => "" });
    }));

    const result = await checkDocFreshness(makeProject());
    expect(result.todoStaleness).toBe(3);
  });

  it("detects AGENTS.md and CLAUDE.md existence", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation((url: string) => {
      if (url.includes("AGENTS.md")) {
        return Promise.resolve({ ok: true, text: async () => "# Agents" });
      }
      if (url.includes("CLAUDE.md")) {
        return Promise.resolve({ ok: true, text: async () => "# Claude" });
      }
      return Promise.resolve({ ok: false, text: async () => "" });
    }));

    const result = await checkDocFreshness(makeProject());
    expect(result.agentsMdExists).toBe(true);
    expect(result.claudeMdExists).toBe(true);
  });

  it("handles fetch failures gracefully with partial results", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network error")));

    const result = await checkDocFreshness(makeProject());
    expect(result.readmeVersionMatch).toBe(true);
    expect(result.changelogUpToDate).toBe(true);
    expect(result.todoStaleness).toBe(0);
    expect(result.agentsMdExists).toBe(false);
    expect(result.claudeMdExists).toBe(false);
    expect(result.mismatches).toEqual([]);
  });
});
