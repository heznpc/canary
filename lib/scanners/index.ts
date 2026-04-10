import type { ProjectHealth, DashboardData } from "../types";
import type { ProjectConfig } from "../projects";
import { projects } from "../projects";
import { getGitStatus, getDependencyHealth, generateUpdateActions, type DepScanResult } from "./github";
import { analyzeStack, STACK_META } from "./stack";
import { checkDeployStatus } from "./deploy";
import { analyzeVibeCoding } from "./vibecoding";
import { analyzeResearch } from "./research";
import { checkDocFreshness } from "./docs";
import { checkDataFreshness } from "./data-freshness";
import { checkCodeQuality } from "./code-quality";
import { checkScorecard } from "./scorecard";
import { checkActivity } from "./activity";
import { checkContextAttention } from "./cam";
import { checkAgentAuthorship } from "./acr";
import { classifyMetadatafication } from "./metadatafication";
import { gradeProject } from "./grader";
import { logger } from "../logger";

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([
    promise,
    new Promise<T>((resolve) => { timer = setTimeout(() => resolve(fallback), ms); }),
  ]).finally(() => clearTimeout(timer));
}

export async function scanProject(project: ProjectConfig, requestId?: string): Promise<ProjectHealth> {
  const ctx = requestId ? { requestId, project: project.id } : { project: project.id };
  logger.info(`Scanning project: ${project.id}`, ctx);

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

  const [
    vibeCoding,
    research,
    docFreshness,
    dataFreshness,
    codeQuality,
    scorecard,
    activity,
    contextAttention,
    agentAuthorship,
  ] = await Promise.all([
    withTimeout(
      analyzeVibeCoding(project.repo, project.stack, stackVersions),
      8000,
      { hasAgentsMd: false, hasClaudeMd: false, gotchas: [], tips: [] },
    ),
    project.category === "paper"
      ? withTimeout(analyzeResearch(project), 10000, null)
      : Promise.resolve(null),
    project.repo
      ? withTimeout(checkDocFreshness(project), 8000, null)
      : Promise.resolve(null),
    project.repo && project.dataFreshness
      ? withTimeout(checkDataFreshness(project.repo, project.dataFreshness), 8000, null)
      : Promise.resolve(null),
    project.repo
      ? withTimeout(checkCodeQuality(project.repo), 10000, null)
      : Promise.resolve(null),
    project.repo
      ? withTimeout(checkScorecard(project.repo), 12000, null)
      : Promise.resolve(null),
    project.repo
      ? withTimeout(checkActivity(project.repo), 10000, null)
      : Promise.resolve(null),
    project.repo
      ? withTimeout(checkContextAttention(project.repo), 15000, null)
      : Promise.resolve(null),
    project.repo
      ? withTimeout(checkAgentAuthorship(project.repo), 15000, null)
      : Promise.resolve(null),
  ]);

  const metadatafication = classifyMetadatafication(contextAttention, agentAuthorship);

  const partial = {
    project,
    git,
    dependencies,
    stack,
    deploy,
    updateActions,
    vibeCoding,
    research,
    codeQuality,
    scorecard,
    activity,
    docFreshness,
    dataFreshness,
    contextAttention,
    agentAuthorship,
    metadatafication,
    scannedAt: new Date().toISOString(),
  };
  const { grade, recommendation, reasons } = gradeProject(partial);

  logger.info(`Scan complete for ${project.id}: grade=${grade}`, ctx);

  return { ...partial, grade, recommendation, reasons };
}

export async function scanAll(requestId?: string): Promise<DashboardData> {
  const ctx = requestId ? { requestId } : {};
  logger.info("Starting full scan", { ...ctx, projectCount: projects.length });

  const results: ProjectHealth[] = [];
  const batchSize = 4;

  for (let i = 0; i < projects.length; i += batchSize) {
    const batch = projects.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map((p) => scanProject(p, requestId)));
    results.push(...batchResults);
  }

  let healthy = 0, needsUpdate = 0, critical = 0, archived = 0;
  for (const r of results) {
    if (r.grade === "A" || r.grade === "B") healthy++;
    else if (r.grade === "C" || r.grade === "D") needsUpdate++;
    else if (r.grade === "F") critical++;
    if (r.project.tag === "archived") archived++;
  }
  const summary = { total: results.length, healthy, needsUpdate, critical, archived };

  logger.info("Full scan complete", { ...ctx, summary });

  return {
    projects: results,
    summary,
    lastScan: new Date().toISOString(),
  };
}
