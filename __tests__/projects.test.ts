import { describe, it, expect } from "vitest";
import { projects } from "../lib/projects";
import type { ProjectConfig, ProjectTag, DeployTarget, StackType } from "../lib/projects";

const validTags: ProjectTag[] = ["active", "maintenance", "archived", "prototype", "research"];
const validDeployTargets: DeployTarget[] = [
  "vercel", "npm", "chrome-store", "github-pages", "zenodo", "docker", "mobile", "none",
];
const validCategories: ProjectConfig["category"][] = ["app", "paper", "mcp", "infra"];

describe("projects", () => {
  it("is a non-empty array", () => {
    expect(Array.isArray(projects)).toBe(true);
    expect(projects.length).toBeGreaterThan(0);
  });

  it("every project has a unique id", () => {
    const ids = projects.map((p) => p.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it("every project has required string fields", () => {
    for (const project of projects) {
      expect(typeof project.id).toBe("string");
      expect(project.id.length).toBeGreaterThan(0);
      expect(typeof project.name).toBe("string");
      expect(project.name.length).toBeGreaterThan(0);
      expect(typeof project.description).toBe("string");
      expect(project.description.length).toBeGreaterThan(0);
    }
  });

  it("every project has a valid tag", () => {
    for (const project of projects) {
      expect(validTags).toContain(project.tag);
    }
  });

  it("every project has a valid deployTarget", () => {
    for (const project of projects) {
      expect(validDeployTargets).toContain(project.deployTarget);
    }
  });

  it("every project has a valid category", () => {
    for (const project of projects) {
      expect(validCategories).toContain(project.category);
    }
  });

  it("every project has a stack array", () => {
    for (const project of projects) {
      expect(Array.isArray(project.stack)).toBe(true);
    }
  });

  it("projects with a repo field have a valid owner/repo format", () => {
    const withRepo = projects.filter((p) => p.repo);
    expect(withRepo.length).toBeGreaterThan(0);
    for (const project of withRepo) {
      const parts = project.repo!.split("/");
      expect(parts).toHaveLength(2);
      expect(parts[0].length).toBeGreaterThan(0);
      expect(parts[1].length).toBeGreaterThan(0);
    }
  });

  it("projects with deployUrl have a URL-like string", () => {
    const withUrl = projects.filter((p) => p.deployUrl);
    for (const project of withUrl) {
      expect(project.deployUrl).toMatch(/^https?:\/\//);
    }
  });

  it("paper projects have keywords and researchArea", () => {
    const papers = projects.filter((p) => p.category === "paper");
    expect(papers.length).toBeGreaterThan(0);
    for (const paper of papers) {
      expect(Array.isArray(paper.keywords)).toBe(true);
      expect(paper.keywords!.length).toBeGreaterThan(0);
      expect(typeof paper.researchArea).toBe("string");
      expect(paper.researchArea!.length).toBeGreaterThan(0);
    }
  });

  it("contains specific known projects", () => {
    const ids = projects.map((p) => p.id);
    expect(ids).toContain("aegis");
    expect(ids).toContain("airmcp");
    expect(ids).toContain("ploidy");
  });

  it("mcp projects exist and have valid config", () => {
    const mcps = projects.filter((p) => p.category === "mcp");
    expect(mcps.length).toBeGreaterThan(0);
    for (const mcp of mcps) {
      expect(typeof mcp.id).toBe("string");
      expect(typeof mcp.name).toBe("string");
    }
  });
});
