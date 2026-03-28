import type { ProjectConfig } from "./projects";

export interface GitStatus {
  branch: string;
  aheadBy: number;
  behindBy: number;
  uncommittedCount: number;
  lastCommitDate: string | null;
  lastCommitMessage: string | null;
}

export interface DependencyInfo {
  name: string;
  current: string;
  latest: string;
  type: "major" | "minor" | "patch" | "up-to-date";
  githubRepo?: string;
  isKey?: boolean;
}

export interface DependencyHealth {
  total: number;
  outdatedMajor: number;
  outdatedMinor: number;
  outdatedPatch: number;
  vulnerabilities: number;
  deps: DependencyInfo[];
  packageManager:
    | "pnpm" | "npm" | "yarn"
    | "pip" | "uv" | "poetry"
    | "flutter"
    | "gradle" | "maven"
    | "unknown";
}

export interface UpdateAction {
  name: string;
  current: string;
  latest: string;
  severity: "major" | "minor" | "patch";
  command: string;
  githubRepo?: string;
  changelogUrl?: string;
}

export interface ReleaseHighlight {
  version: string;
  date: string;
  url: string;
  breaking: string[];
  highlights: string[];
}

export interface ReleaseNoteSummary {
  packageName: string;
  from: string;
  to: string;
  releases: ReleaseHighlight[];
  migrationGuideUrl?: string;
}

export interface VibeCodingIntel {
  hasAgentsMd: boolean;
  hasClaudeMd: boolean;
  gotchas: string[];
  tips: string[];
}

export interface RecentPaper {
  title: string;
  authors: string;
  year: number;
  venue?: string;
  citationCount: number;
  url: string;
  tldr?: string;
}

export interface ResearchIntel {
  recentPapers: RecentPaper[];
  trendingKeywords: string[];
  fieldActivity: "hot" | "active" | "stable" | "quiet";
  suggestion: string;
  lastChecked: string;
}

export interface StackVersion {
  name: string;
  current: string | null;
  latest: string | null;
  eol: boolean;
  releasesBehind: number;
}

export interface DeployStatus {
  target: string;
  status: "up" | "down" | "unknown" | "not-deployed";
  url?: string;
  version?: string;
  lastChecked: string;
}

export type HealthGrade = "A" | "B" | "C" | "D" | "F";
export type Recommendation = "keep" | "update" | "upgrade" | "rewrite" | "archive";

/* ── Doc Freshness ── */

export interface DocMismatch {
  file: string;
  field: string;
  expected: string;
  actual: string;
  severity: "error" | "warning";
}

export interface DocFreshness {
  readmeVersionMatch: boolean;
  changelogUpToDate: boolean;
  todoStaleness: number;
  agentsMdExists: boolean;
  claudeMdExists: boolean;
  mismatches: DocMismatch[];
  lastChecked: string;
}

export interface ProjectHealth {
  project: ProjectConfig;
  git: GitStatus | null;
  dependencies: DependencyHealth | null;
  stack: StackVersion[];
  deploy: DeployStatus;
  updateActions: UpdateAction[];
  vibeCoding: VibeCodingIntel;
  research: ResearchIntel | null;
  docFreshness: DocFreshness | null;
  grade: HealthGrade;
  recommendation: Recommendation;
  reasons: string[];
  scannedAt: string;
}

export interface DashboardData {
  projects: ProjectHealth[];
  summary: {
    total: number;
    healthy: number;
    needsUpdate: number;
    critical: number;
    archived: number;
  };
  lastScan: string;
}
