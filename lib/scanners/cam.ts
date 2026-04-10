import type { ContextAttention, AgentFileCategory } from "../types";
import { fetchWithTimeout, githubHeaders, parseRepoSlug } from "./version-utils";
import { cacheGet, cacheSet } from "../cache";
import { logger } from "../logger";

/**
 * Context Attention Metric scanner.
 *
 * CAM = (commits touching at least one agent-era file) / (total commits)
 * over a rolling 90-day window. Operationalizes the §5.4 metric from the paper
 * for per-project monitoring.
 */

const WINDOW_DAYS = 90;
const CAM_TTL_MS = 60 * 60 * 1000; // 1h — expensive call, low churn
const MAX_PER_FILE_PAGES = 5; // safety cap on per-file commit pagination

const AGENT_ERA_EXACT = new Set([
  "AGENTS.md",
  "CLAUDE.md",
  ".cursorrules",
  ".cursor/rules",
  "copilot-instructions.md",
  ".github/copilot-instructions.md",
  ".clinerules",
  ".windsurfrules",
  ".roomodes",
]);

const AGENT_ERA_PATTERNS: RegExp[] = [
  /^\.cursor\//,
  /(^|\/)agents\.md$/i,
  /(^|\/)claude\.md$/i,
  /copilot-instructions/i,
];

function isAgentEraFile(path: string): boolean {
  if (AGENT_ERA_EXACT.has(path)) return true;
  return AGENT_ERA_PATTERNS.some((p) => p.test(path));
}

export function classifyAgentFile(path: string): AgentFileCategory {
  const lower = path.toLowerCase();
  if (lower.endsWith("agents.md")) return "agents-md";
  if (lower.endsWith("claude.md")) return "claude-md";
  if (lower.includes(".cursor") || lower.endsWith(".cursorrules")) return "cursor";
  if (lower.includes("copilot-instructions")) return "copilot";
  return "other-agent";
}

function emptyBreakdown(): Record<AgentFileCategory, string[]> {
  return {
    "agents-md": [],
    "claude-md": [],
    cursor: [],
    copilot: [],
    "other-agent": [],
  };
}

function getLinkLastPage(linkHeader: string | null): number | null {
  if (!linkHeader) return null;
  const match = linkHeader.match(/page=(\d+)>; rel="last"/);
  return match ? parseInt(match[1], 10) : null;
}

async function fetchDefaultBranch(owner: string, name: string): Promise<string | null> {
  const res = await fetchWithTimeout(
    `https://api.github.com/repos/${owner}/${name}`,
    { headers: githubHeaders() },
    8000,
  );
  if (!res.ok) return null;
  const data = await res.json();
  return data.default_branch ?? null;
}

async function fetchAgentEraFiles(
  owner: string,
  name: string,
  branch: string,
): Promise<string[]> {
  const res = await fetchWithTimeout(
    `https://api.github.com/repos/${owner}/${name}/git/trees/${branch}?recursive=1`,
    { headers: githubHeaders() },
    10000,
  );
  if (!res.ok) return [];
  const tree = await res.json();
  if (!tree.tree || !Array.isArray(tree.tree)) return [];
  const found: string[] = [];
  for (const entry of tree.tree) {
    if (entry.type !== "blob") continue;
    if (typeof entry.path === "string" && isAgentEraFile(entry.path)) {
      found.push(entry.path);
    }
  }
  return found;
}

async function fetchTotalCommits(
  owner: string,
  name: string,
  sinceISO: string,
): Promise<number> {
  // per_page=1 + Link header → cheap exact count
  const url = `https://api.github.com/repos/${owner}/${name}/commits?since=${encodeURIComponent(sinceISO)}&per_page=1`;
  const res = await fetchWithTimeout(url, { headers: githubHeaders() }, 8000);
  if (!res.ok) return 0;
  const lastPage = getLinkLastPage(res.headers.get("link"));
  if (lastPage !== null) return lastPage;
  // Fallback: 0 or 1 commits
  const data = await res.json();
  return Array.isArray(data) ? data.length : 0;
}

async function fetchContextCommitShas(
  owner: string,
  name: string,
  files: string[],
  sinceISO: string,
): Promise<Set<string>> {
  const shas = new Set<string>();
  for (const file of files) {
    let page = 1;
    let hasMore = true;
    while (hasMore && page <= MAX_PER_FILE_PAGES) {
      const url =
        `https://api.github.com/repos/${owner}/${name}/commits` +
        `?path=${encodeURIComponent(file)}&since=${encodeURIComponent(sinceISO)}&per_page=100&page=${page}`;
      const res = await fetchWithTimeout(url, { headers: githubHeaders() }, 10000);
      if (!res.ok) break;
      const commits = await res.json();
      if (!Array.isArray(commits) || commits.length === 0) break;
      for (const c of commits) {
        if (c?.sha) shas.add(c.sha);
      }
      hasMore = commits.length === 100;
      page++;
    }
  }
  return shas;
}

export async function checkContextAttention(
  repo: string,
): Promise<ContextAttention | null> {
  const parsed = parseRepoSlug(repo);
  if (!parsed) return null;
  const { owner, name } = parsed;

  const cacheKey = `cam:${owner}/${name}:${WINDOW_DAYS}d`;
  const cached = cacheGet<ContextAttention>(cacheKey);
  if (cached) return cached;

  try {
    const sinceISO = new Date(
      Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000,
    ).toISOString();

    const branch = await fetchDefaultBranch(owner, name);
    if (!branch) return null;

    const [agentEraFiles, totalCommits] = await Promise.all([
      fetchAgentEraFiles(owner, name, branch),
      fetchTotalCommits(owner, name, sinceISO),
    ]);

    let contextCommits = 0;
    if (agentEraFiles.length > 0 && totalCommits > 0) {
      const shas = await fetchContextCommitShas(owner, name, agentEraFiles, sinceISO);
      contextCommits = shas.size;
    }

    const cam = totalCommits > 0 ? contextCommits / totalCommits : 0;

    const fileBreakdown = emptyBreakdown();
    for (const f of agentEraFiles) {
      fileBreakdown[classifyAgentFile(f)].push(f);
    }

    const result: ContextAttention = {
      cam,
      totalCommits,
      contextCommits,
      agentEraFiles,
      fileBreakdown,
      windowDays: WINDOW_DAYS,
      lastChecked: new Date().toISOString(),
    };

    cacheSet(cacheKey, result, CAM_TTL_MS);
    return result;
  } catch (err) {
    logger.error("cam: scan failed", {
      repo,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}
