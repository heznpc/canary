import type {
  AnthropicUsage,
  DashboardData,
  DependencyHealth,
  ProjectHealth,
  UpdateAction,
} from "@/lib/types";
import type { ProjectConfig } from "@/lib/projects";

/**
 * MCP transport DTOs. These mirror the dashboard types but intentionally
 * exclude internal fields that are verbose or irrelevant for an LLM tool
 * caller (e.g. full dep arrays), keeping token usage low. If a consumer needs
 * the raw data, they can always call the HTTP API directly.
 */

export interface ScanProjectPayload {
  id: string;
  name: string;
  grade: ProjectHealth["grade"];
  recommendation: ProjectHealth["recommendation"];
  reasons: string[];
  dependencies: {
    total: number;
    outdatedMajor: number;
    outdatedMinor: number;
    outdatedPatch: number;
    vulnerabilities: number | null;
    packageManager: string;
  } | null;
  stack: { name: string; current: string | null; latest: string | null; eol: boolean }[];
  deployStatus: string;
  activity: {
    commitsLast4Weeks: number;
    openPRs: number;
    openIssues: number;
    contributors: number;
  } | null;
  cam: number | null;
  acr: number | null;
  metadataficationPhase: string | null;
  scannedAt: string;
}

export function buildScanProjectPayload(h: ProjectHealth): ScanProjectPayload {
  return {
    id: h.project.id,
    name: h.project.name,
    grade: h.grade,
    recommendation: h.recommendation,
    reasons: h.reasons,
    dependencies: h.dependencies
      ? {
          total: h.dependencies.total,
          outdatedMajor: h.dependencies.outdatedMajor,
          outdatedMinor: h.dependencies.outdatedMinor,
          outdatedPatch: h.dependencies.outdatedPatch,
          vulnerabilities: h.dependencies.vulnerabilities,
          packageManager: h.dependencies.packageManager,
        }
      : null,
    stack: h.stack.map((s) => ({
      name: s.name,
      current: s.current,
      latest: s.latest,
      eol: s.eol,
    })),
    deployStatus: h.deploy.status,
    activity: h.activity
      ? {
          commitsLast4Weeks: h.activity.commitsLast4Weeks,
          openPRs: h.activity.openPRs,
          openIssues: h.activity.openIssues,
          contributors: h.activity.contributors,
        }
      : null,
    cam: h.contextAttention?.cam ?? null,
    acr: h.agentAuthorship?.acr ?? null,
    metadataficationPhase: h.metadatafication?.phase ?? null,
    scannedAt: h.scannedAt,
  };
}

export interface ScanAllPayload {
  summary: DashboardData["summary"];
  lastScan: string;
  projects: ScanProjectPayload[];
}

export function buildScanAllPayload(d: DashboardData): ScanAllPayload {
  return {
    summary: d.summary,
    lastScan: d.lastScan,
    projects: d.projects.map(buildScanProjectPayload),
  };
}

export interface UsagePayload {
  startingAt: string;
  endingAt: string;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheReadTokens: number;
  totalCacheCreateTokens: number;
  totalEstimatedUsd: number;
  byModel: {
    model: string;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheCreateTokens: number;
    estimatedUsd: number;
  }[];
}

export interface UpdateActionsPayload {
  projectId: string;
  projectName: string;
  repo?: string;
  packageManager: string | null;
  counts: { major: number; minor: number; patch: number };
  actions: {
    name: string;
    current: string;
    latest: string;
    severity: UpdateAction["severity"];
    command: string;
    changelogUrl?: string;
  }[];
}

/**
 * Decoupled from `ProjectHealth` so the MCP `list_update_actions` tool can
 * skip the rest of the scan pipeline (CAM, ACR, scorecard, …) and only run
 * the dependency portion. About 10× cheaper on a cold call.
 */
export function buildUpdateActionsPayload(args: {
  project: ProjectConfig;
  packageManager: DependencyHealth["packageManager"] | null;
  actions: UpdateAction[];
}): UpdateActionsPayload {
  const counts = { major: 0, minor: 0, patch: 0 };
  for (const a of args.actions) counts[a.severity]++;
  return {
    projectId: args.project.id,
    projectName: args.project.name,
    repo: args.project.repo,
    packageManager: args.packageManager,
    counts,
    actions: args.actions.map((a) => ({
      name: a.name,
      current: a.current,
      latest: a.latest,
      severity: a.severity,
      command: a.command,
      changelogUrl: a.changelogUrl,
    })),
  };
}

export function buildUsagePayload(u: AnthropicUsage): UsagePayload {
  return {
    startingAt: u.startingAt,
    endingAt: u.endingAt,
    totalInputTokens: u.totalInputTokens,
    totalOutputTokens: u.totalOutputTokens,
    totalCacheReadTokens: u.totalCacheReadTokens,
    totalCacheCreateTokens: u.totalCacheCreateTokens,
    totalEstimatedUsd: u.totalEstimatedUsd,
    byModel: u.byModel,
  };
}
