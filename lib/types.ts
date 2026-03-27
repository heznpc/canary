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
}

export interface DependencyHealth {
  total: number;
  outdatedMajor: number;
  outdatedMinor: number;
  outdatedPatch: number;
  vulnerabilities: number;
  deps: DependencyInfo[];
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

export interface ProjectHealth {
  project: ProjectConfig;
  git: GitStatus | null;
  dependencies: DependencyHealth | null;
  stack: StackVersion[];
  deploy: DeployStatus;
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
