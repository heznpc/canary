import type { ProjectHealth, DashboardData } from "../types";
import type { ProjectConfig } from "../projects";
import { projects } from "../projects";
import { getGitStatus, getDependencyHealth } from "./github";
import { analyzeStack } from "./stack";
import { checkDeployStatus } from "./deploy";
import { gradeProject } from "./grader";

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

export async function scanProject(project: ProjectConfig): Promise<ProjectHealth> {
  const [git, dependencies, stack, deploy] = await Promise.all([
    project.repo
      ? withTimeout(getGitStatus(project.repo), 8000, null)
      : Promise.resolve(null),
    project.repo
      ? withTimeout(getDependencyHealth(project.repo), 8000, null)
      : Promise.resolve(null),
    withTimeout(analyzeStack(project.stack, project.repo), 8000, []),
    withTimeout(checkDeployStatus(project), 8000, {
      target: project.deployTarget,
      status: "unknown" as const,
      lastChecked: new Date().toISOString(),
    }),
  ]);

  const partial = { project, git, dependencies, stack, deploy, scannedAt: new Date().toISOString() };
  const { grade, recommendation, reasons } = gradeProject(partial);

  return { ...partial, grade, recommendation, reasons };
}

export async function scanAll(): Promise<DashboardData> {
  // Scan in batches of 4 to avoid overwhelming APIs
  const results: ProjectHealth[] = [];
  const batchSize = 4;

  for (let i = 0; i < projects.length; i += batchSize) {
    const batch = projects.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(scanProject));
    results.push(...batchResults);
  }

  const summary = {
    total: results.length,
    healthy: results.filter((r) => r.grade === "A" || r.grade === "B").length,
    needsUpdate: results.filter((r) => r.grade === "C" || r.grade === "D").length,
    critical: results.filter((r) => r.grade === "F").length,
    archived: results.filter((r) => r.project.tag === "archived").length,
  };

  return {
    projects: results,
    summary,
    lastScan: new Date().toISOString(),
  };
}
