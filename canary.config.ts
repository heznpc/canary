import type { ProjectConfig } from "./lib/projects";
import type { SyncConfig } from "./lib/sync/types";

/**
 * Define your projects here.
 * Each project will be scanned and graded by Canary.
 *
 * See lib/projects.ts for the full ProjectConfig type definition.
 *
 * The default entry below is Canary scanning itself — eat your own dogfood.
 * Replace or extend with your own projects as needed.
 */
const projects: ProjectConfig[] = [
  {
    id: "canary",
    name: "Canary",
    description: "Project health dashboard + metadatafication research platform",
    repo: "heznpc/canary",
    tag: "active",
    stack: ["nextjs", "react", "typescript", "node"],
    deployTarget: "github-pages",
    deployUrl: "https://heznpc.github.io/canary",
    category: "app",
  },
  {
    id: "airmcp",
    name: "AirMCP",
    description: "MCP server bringing macOS-native tools (Calendar, Reminders, Notes, Shortcuts, Health) to Claude Desktop and CLI",
    repo: "heznpc/AirMCP",
    tag: "active",
    stack: ["typescript", "node"],
    deployTarget: "none",
    category: "mcp",
  },
  {
    id: "ploidy",
    name: "Ploidy",
    description: "Asymmetric-renewal session-composition protocol — accumulation–renewal dilemma operationalized at the LLM context-window level",
    repo: "heznpc/ploidy-research",
    tag: "research",
    stack: ["python", "latex"],
    deployTarget: "none",
    category: "paper",
    keywords: ["session-composition", "asymmetric-renewal", "context-window"],
    researchArea: "AI / LLM systems",
  },
];

export default projects;

/**
 * Optional sync export config — used by `/api/sync` to render a portfolio JSON
 * for downstream sites. Leave `undefined` to disable. The fields below are
 * intentionally generic so the same exporter can serve any user.
 */
export const syncConfig: SyncConfig | undefined = undefined;
