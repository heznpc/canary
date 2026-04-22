import type {
  AnthropicUsage,
  DashboardData,
  ProjectHealth,
} from "@/lib/types";

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
