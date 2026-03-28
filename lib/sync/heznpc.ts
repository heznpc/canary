import type { DashboardData, ProjectHealth } from "../types";

interface HeznpcProject {
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

export function generateProjectsJson(dashboardData: DashboardData): string {
  const projects: HeznpcProject[] = dashboardData.projects.map((p) => ({
    id: p.project.id,
    name: p.project.name,
    description: p.project.description,
    repo: p.project.repo ?? "",
    category: p.project.category || "tools",
    tier: determineTier(p),
    icon: null,
    iconEmoji: getDefaultEmoji(p.project.category),
    tags: generateTags(p),
    url: p.project.repo
      ? `https://github.com/${p.project.repo}`
      : "",
    status: p.project.tag === "archived" ? "archived" : "active",
    version: undefined,
    grade: p.grade,
  }));

  return JSON.stringify(
    { meta: getDefaultMeta(), projects, starters: getStarters() },
    null,
    2,
  );
}

function determineTier(p: ProjectHealth): number {
  const flagships = ["airmcp", "trashmonster", "z-gap"];
  if (flagships.includes(p.project.id)) return 1;
  if (p.project.tag === "archived" || p.project.tag === "prototype") return 3;
  return 2;
}

function getDefaultEmoji(category: string): string {
  const map: Record<string, string> = {
    foundation: "\u{1f527}",
    products: "\u{1f4f1}",
    tools: "\u{1f6e0}\ufe0f",
    research: "\u{1f4c4}",
    app: "\u{1f4bb}",
    paper: "\u{1f4dd}",
    mcp: "\u{1f916}",
    infra: "\u{2699}\ufe0f",
  };
  return map[category] || "\u{1f4e6}";
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

function getDefaultMeta() {
  return {
    name: "heznpc",
    tagline: "Building the ecosystem AI lives in",
    bio: "Open-source infrastructure, products, tools, and research for the AI era.",
    thesis: "The AI era won't be won by models alone \u2014 it'll be won by ecosystems.",
    github: "https://github.com/heznpc",
    contact: "https://github.com/heznpc",
  };
}

function getStarters() {
  return [
    { name: "docker-deploy-starter", deployTo: "Any VPS", repo: "heznpc/docker-deploy-starter" },
    { name: "browser-extension-starter", deployTo: "Chrome + AMO", repo: "heznpc/browser-extension-starter" },
    { name: "discord-bot-starter", deployTo: "Railway / Fly.io", repo: "heznpc/discord-bot-starter" },
    { name: "telegram-bot-starter", deployTo: "Railway / Fly.io", repo: "heznpc/telegram-bot-starter" },
    { name: "react-native-starter", deployTo: "App / Play Store", repo: "heznpc/react-native-starter" },
    { name: "electron-app-starter", deployTo: "Cross-platform", repo: "heznpc/electron-app-starter" },
    { name: "vscode-extension-starter", deployTo: "VS Marketplace", repo: "heznpc/vscode-extension-starter" },
    { name: "npm-package-starter", deployTo: "npm registry", repo: "heznpc/npm-package-starter" },
    { name: "mcp-server-starter", deployTo: "npm registry", repo: "heznpc/mcp-server-starter" },
    { name: "python-mcp-server-starter", deployTo: "PyPI", repo: "heznpc/python-mcp-server-starter" },
    { name: "cloudflare-pages-starter", deployTo: "Cloudflare", repo: "heznpc/cloudflare-pages-starter" },
  ];
}
