import type { ProjectConfig } from "./lib/projects";
import type { SyncConfig } from "./lib/sync/types";

/**
 * Define your projects here.
 * Each project will be scanned and graded by Canary.
 *
 * See lib/projects.ts for the full ProjectConfig type definition.
 *
 * The default entries below are the author's own portfolio (canary, AirMCP,
 * ploidy-research). For your own use, replace these with the repos you want
 * monitored. Minimum field set is `id`, `name`, `description`, `repo`,
 * `tag`, `stack`, `deployTarget`, `category`. Paper-category projects also
 * need `keywords` and `researchArea` (validated by __tests__/projects.test.ts).
 *
 * Tips:
 *   - GITHUB_TOKEN env var is effectively required for portfolios with
 *     more than ~3 projects (60 req/h unauthenticated GitHub API limit).
 *   - For push-leakage measurements, set CANARY_SELF_LOGIN if your local
 *     git author email differs from the repo owner; otherwise the scanner
 *     auto-derives the self-login from each repo's owner.
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
