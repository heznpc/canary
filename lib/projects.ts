export type ProjectTag = "active" | "maintenance" | "archived" | "prototype" | "research";
export type DeployTarget = "vercel" | "npm" | "chrome-store" | "github-pages" | "zenodo" | "docker" | "mobile" | "none";
export type StackType = "nextjs" | "react" | "flutter" | "spring-boot" | "python" | "vanilla-js" | "latex" | "typescript" | "chrome-extension" | "node";

export type DataCycle = "weekly-wed" | "weekly-thu" | "biweekly-wed" | "monthly";

export interface DataFreshnessConfig {
  watchPath: string;        // GitHub path to monitor (e.g., "src/data/")
  expectedCycle: DataCycle;
  gracePeriodDays: number;  // days after expected update before flagging stale
}

export interface ProjectConfig {
  id: string;
  name: string;
  description: string;
  repo?: string; // GitHub owner/repo
  tag: ProjectTag;
  stack: StackType[];
  deployTarget: DeployTarget;
  deployUrl?: string;
  npmPackage?: string;
  category: "app" | "paper" | "mcp" | "infra";
  // 논문 프로젝트용
  keywords?: string[];
  researchArea?: string;
  // 데이터 갱신 주기 모니터링
  dataFreshness?: DataFreshnessConfig;
}

// Load projects from canary.config.ts at the project root
import config from "../canary.config";

export const projects: ProjectConfig[] = config;
