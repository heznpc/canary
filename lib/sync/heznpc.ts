import type { DashboardData, ProjectHealth } from "../types";
import type { SyncConfig, SyncStarter } from "./types";

interface PortfolioProject {
  id: string;
  name: string;
  description: string;
  repo: string;
  category: string;
  tier: number;
  icon: string | null;
  iconEmoji: string;
  tags: string[];
  url: string;
  status: string;
  version?: string;
  grade?: string;
  venue?: string;
}

interface PortfolioPayload {
  meta: SyncConfig["meta"];
  projects: PortfolioProject[];
  starters: SyncStarter[];
}

const CATEGORY_EMOJI: Record<string, string> = {
  foundation: "\u{1f527}",
  products: "\u{1f4f1}",
  tools: "\u{1f6e0}\ufe0f",
  research: "\u{1f4c4}",
  app: "\u{1f4bb}",
  paper: "\u{1f4dd}",
  mcp: "\u{1f916}",
  infra: "\u{2699}\ufe0f",
};

const DEFAULT_EMOJI = "\u{1f4e6}";

/**
 * Render a portfolio JSON payload from a dashboard scan, using user-supplied
 * sync config (meta, flagship IDs, starters).
 */
export function generateProjectsJson(
  dashboardData: DashboardData,
  config: SyncConfig,
): string {
  const flagships = new Set(config.flagshipIds ?? []);

  const projects: PortfolioProject[] = dashboardData.projects.map((p) => ({
    id: p.project.id,
    name: p.project.name,
    description: p.project.description,
    repo: p.project.repo ?? "",
    category: p.project.category || "tools",
    tier: determineTier(p, flagships),
    icon: null,
    iconEmoji: CATEGORY_EMOJI[p.project.category] ?? DEFAULT_EMOJI,
    tags: generateTags(p),
    url: p.project.repo ? `https://github.com/${p.project.repo}` : "",
    status: p.project.tag === "archived" ? "archived" : "active",
    version: undefined,
    grade: p.grade,
  }));

  const payload: PortfolioPayload = {
    meta: config.meta,
    projects,
    starters: config.starters ?? [],
  };

  return JSON.stringify(payload, null, 2);
}

function determineTier(p: ProjectHealth, flagships: Set<string>): number {
  if (flagships.has(p.project.id)) return 1;
  if (p.project.tag === "archived" || p.project.tag === "prototype") return 3;
  return 2;
}

function generateTags(p: ProjectHealth): string[] {
  const tags: string[] = [];
  if (p.project.stack?.length) {
    tags.push(p.project.stack[0]);
  }
  if (p.project.npmPackage) {
    tags.push("npm");
  }
  return tags.slice(0, 3);
}
