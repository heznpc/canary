import type { ProjectHealth, DashboardData } from "../types";
import type { ProjectConfig } from "../projects";
import { projects } from "../projects";
import { getGitStatus, getDependencyHealth, generateUpdateActions, type DepScanResult } from "./github";
import { analyzeStack, STACK_META } from "./stack";
import { checkDeployStatus } from "./deploy";
import { analyzeVibeCoding } from "./vibecoding";
import { analyzeResearch } from "./research";
import { gradeProject } from "./grader";

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([
    promise,
    new Promise<T>((resolve) => { timer = setTimeout(() => resolve(fallback), ms); }),
  ]).finally(() => clearTimeout(timer));
}

export async function scanProject(project: ProjectConfig): Promise<ProjectHealth> {
  const [git, depResult, deploy] = await Promise.all([
    project.repo
      ? withTimeout(getGitStatus(project.repo), 8000, null)
      : Promise.resolve(null),
    project.repo
      ? withTimeout<DepScanResult | null>(getDependencyHealth(project.repo), 15000, null)
      : Promise.resolve(null),
    withTimeout(checkDeployStatus(project), 8000, {
      target: project.deployTarget,
      status: "unknown" as const,
      lastChecked: new Date().toISOString(),
    }),
  ]);

  const dependencies = depResult?.health ?? null;
  const packageJson = depResult?.packageJson ?? null;

  // stack 분석은 packageJson 재사용 (중복 fetch 방지)
  const stack = await withTimeout(
    analyzeStack(project.stack, project.repo, packageJson),
    8000,
    [],
  );

  // STACK_META의 display name → StackType 역매핑으로 스택 버전 맵 구성
  const nameToType = new Map(
    project.stack.map((st) => [STACK_META[st]?.name, st] as const),
  );
  const stackVersions: Record<string, string> = {};
  for (const s of stack) {
    const st = nameToType.get(s.name);
    if (st && s.current) stackVersions[st] = s.current;
  }

  const updateActions = dependencies
    ? generateUpdateActions(dependencies)
    : [];

  const [vibeCoding, research] = await Promise.all([
    withTimeout(
      analyzeVibeCoding(project.repo, project.stack, stackVersions),
      8000,
      { hasAgentsMd: false, hasClaudeMd: false, gotchas: [], tips: [] },
    ),
    project.category === "paper"
      ? withTimeout(analyzeResearch(project), 10000, null)
      : Promise.resolve(null),
  ]);

  const partial = {
    project,
    git,
    dependencies,
    stack,
    deploy,
    updateActions,
    vibeCoding,
    research,
    scannedAt: new Date().toISOString(),
  };
  const { grade, recommendation, reasons } = gradeProject(partial);

  return { ...partial, grade, recommendation, reasons };
}

export async function scanAll(): Promise<DashboardData> {
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
