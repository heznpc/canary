/**
 * Context Attention Metric (CAM) Experiment
 *
 * Computes CAM = |commits touching agent-era files| / |total commits| (90-day window)
 * for a user's repos + reference OSS repos.
 *
 * Usage: npx tsx scripts/cam-experiment.ts [username]
 */

import { readFileSync } from "fs";
import { resolve } from "path";

// Load token: env var → .env.local → gh auth token
if (!process.env.GITHUB_TOKEN) {
  try {
    const envPath = resolve(new URL("../.env.local", import.meta.url).pathname);
    const envContent = readFileSync(envPath, "utf-8");
    for (const line of envContent.split("\n")) {
      const match = line.match(/^(\w+)=(.+)$/);
      if (match && match[2].trim()) process.env[match[1]] = match[2].trim();
    }
  } catch { /* ignore */ }
}
if (!process.env.GITHUB_TOKEN) {
  try {
    const { execSync } = require("child_process") as typeof import("child_process");
    const token = execSync("gh auth token", { encoding: "utf-8" }).trim();
    if (token) process.env.GITHUB_TOKEN = token;
  } catch { /* ignore */ }
}

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
if (!GITHUB_TOKEN) {
  console.error("GITHUB_TOKEN required. Set via env, .env.local, or `gh auth login`.");
  process.exit(1);
}

const headers: HeadersInit = {
  Accept: "application/vnd.github+json",
  Authorization: `Bearer ${GITHUB_TOKEN}`,
};

const NINETY_DAYS_AGO = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

// --- Agent-era file patterns ---
const AGENT_ERA_FILES = [
  "AGENTS.md",
  "CLAUDE.md",
  ".cursorrules",
  ".cursor/rules",
  "copilot-instructions.md",
  ".github/copilot-instructions.md",
  ".clinerules",
  ".windsurfrules",
  ".roomodes",
];

// Also track broader context files (specs, ADRs) by pattern
const AGENT_ERA_PATTERNS = [
  /^\.cursor\//,
  /^specs?\//i,
  /^adr\//i,
  /agents\.md$/i,
  /claude\.md$/i,
  /copilot-instructions/i,
];

// --- Reference repos (mix of agent-adopting and traditional) ---
const REFERENCE_REPOS = [
  // Known agent adoption
  "vercel/ai",
  "langchain-ai/langchain",
  "anthropics/anthropic-cookbook",
  "cohere-ai/cohere-toolkit",
  "stackblitz/bolt.new",
  // Major OSS (likely no agent-era files)
  "facebook/react",
  "vercel/next.js",
  "microsoft/typescript",
  "nodejs/node",
  "tailwindlabs/tailwindcss",
  // Mid-size, diverse
  "shadcn-ui/ui",
  "t3-oss/create-t3-app",
  "astro-build/astro",
  "sveltejs/svelte",
  "remix-run/remix",
];

// --- Types ---
interface CAMResult {
  repo: string;
  group: "user" | "reference";
  defaultBranch: string;
  totalCommits90d: number;
  agentEraFiles: string[];
  contextCommits90d: number;
  cam: number;
  camPercent: string;
}

// --- API helpers ---
async function apiFetch(url: string): Promise<Response> {
  const res = await fetch(url, { headers });
  if (res.status === 403 || res.status === 429) {
    const reset = res.headers.get("x-ratelimit-reset");
    const waitSec = reset ? Math.max(0, parseInt(reset) - Math.floor(Date.now() / 1000)) : 60;
    console.warn(`  Rate limited. Waiting ${waitSec}s...`);
    await new Promise((r) => setTimeout(r, waitSec * 1000 + 1000));
    return fetch(url, { headers });
  }
  return res;
}

function getLinkCount(res: Response): number | null {
  const link = res.headers.get("link");
  if (!link) return null;
  const match = link.match(/page=(\d+)>; rel="last"/);
  return match ? parseInt(match[1]) : null;
}

// --- Core functions ---

async function getDefaultBranch(owner: string, name: string): Promise<string | null> {
  const res = await apiFetch(`https://api.github.com/repos/${owner}/${name}`);
  if (!res.ok) return null;
  const data = await res.json();
  return data.default_branch;
}

async function getAgentEraFiles(owner: string, name: string, branch: string): Promise<string[]> {
  const res = await apiFetch(
    `https://api.github.com/repos/${owner}/${name}/git/trees/${branch}?recursive=1`,
  );
  if (!res.ok) return [];
  const tree = await res.json();
  if (!tree.tree) return [];

  const found: string[] = [];
  for (const entry of tree.tree) {
    if (entry.type !== "blob") continue;
    // Check exact matches
    if (AGENT_ERA_FILES.includes(entry.path)) {
      found.push(entry.path);
      continue;
    }
    // Check patterns
    if (AGENT_ERA_PATTERNS.some((p) => p.test(entry.path))) {
      found.push(entry.path);
    }
  }
  return found;
}

async function countCommits90d(owner: string, name: string): Promise<number> {
  // Use per_page=1 + link header to get total count efficiently
  const url = `https://api.github.com/repos/${owner}/${name}/commits?since=${NINETY_DAYS_AGO}&per_page=1`;
  const res = await apiFetch(url);
  if (!res.ok) return 0;

  const lastPage = getLinkCount(res);
  if (lastPage !== null) return lastPage;

  // If no link header, there's 0 or 1 commits
  const data = await res.json();
  return Array.isArray(data) ? data.length : 0;
}

async function getContextCommitSHAs(
  owner: string,
  name: string,
  files: string[],
): Promise<Set<string>> {
  const shas = new Set<string>();

  for (const file of files) {
    let page = 1;
    let hasMore = true;
    while (hasMore && page <= 5) {
      const url =
        `https://api.github.com/repos/${owner}/${name}/commits` +
        `?path=${encodeURIComponent(file)}&since=${NINETY_DAYS_AGO}&per_page=100&page=${page}`;
      const res = await apiFetch(url);
      if (!res.ok) break;
      const commits = await res.json();
      if (!Array.isArray(commits) || commits.length === 0) break;
      for (const c of commits) shas.add(c.sha);
      hasMore = commits.length === 100;
      page++;
    }
  }

  return shas;
}

async function computeCAM(repo: string, group: "user" | "reference"): Promise<CAMResult | null> {
  const parts = repo.split("/");
  if (parts.length !== 2) return null;
  const [owner, name] = parts;

  process.stdout.write(`  ${repo} ...`);

  const branch = await getDefaultBranch(owner, name);
  if (!branch) {
    console.log(" SKIP (not found)");
    return null;
  }

  const [agentEraFiles, totalCommits] = await Promise.all([
    getAgentEraFiles(owner, name, branch),
    countCommits90d(owner, name),
  ]);

  let contextCommits = 0;
  if (agentEraFiles.length > 0 && totalCommits > 0) {
    const shas = await getContextCommitSHAs(owner, name, agentEraFiles);
    contextCommits = shas.size;
  }

  const cam = totalCommits > 0 ? contextCommits / totalCommits : 0;

  console.log(
    ` ${agentEraFiles.length} agent-era files, ${contextCommits}/${totalCommits} commits, CAM=${(cam * 100).toFixed(1)}%`,
  );

  return {
    repo,
    group,
    defaultBranch: branch,
    totalCommits90d: totalCommits,
    agentEraFiles,
    contextCommits90d: contextCommits,
    cam,
    camPercent: (cam * 100).toFixed(1) + "%",
  };
}

async function getUserRepos(username: string): Promise<string[]> {
  const repos: string[] = [];
  let page = 1;
  while (page <= 5) {
    const res = await apiFetch(
      `https://api.github.com/users/${username}/repos?per_page=100&sort=updated&page=${page}`,
    );
    if (!res.ok) break;
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) break;
    for (const r of data) {
      if (!r.fork && !r.archived) repos.push(r.full_name);
    }
    page++;
  }
  return repos;
}

// --- Main ---
async function main() {
  const username = process.argv[2] || "heznpc";

  console.log(`\n=== CAM Experiment ===`);
  console.log(`Window: last 90 days (since ${NINETY_DAYS_AGO.slice(0, 10)})`);
  console.log(`Agent-era files: ${AGENT_ERA_FILES.join(", ")}\n`);

  // 1. User repos
  console.log(`Fetching repos for ${username}...`);
  const userRepos = await getUserRepos(username);
  console.log(`Found ${userRepos.length} repos\n`);

  console.log("--- User repos ---");
  const userResults: CAMResult[] = [];
  for (const repo of userRepos) {
    const r = await computeCAM(repo, "user");
    if (r) userResults.push(r);
  }

  // 2. Reference repos
  console.log("\n--- Reference repos ---");
  const refResults: CAMResult[] = [];
  for (const repo of REFERENCE_REPOS) {
    const r = await computeCAM(repo, "reference");
    if (r) refResults.push(r);
  }

  // 3. Output
  const all = [...userResults, ...refResults].sort((a, b) => b.cam - a.cam);

  console.log("\n\n========================================");
  console.log("           CAM RESULTS TABLE");
  console.log("========================================\n");

  const header = [
    "Repo".padEnd(40),
    "Group".padEnd(10),
    "Total".padStart(6),
    "Ctx".padStart(5),
    "CAM".padStart(7),
    "Agent-era files",
  ].join(" | ");
  console.log(header);
  console.log("-".repeat(header.length));

  for (const r of all) {
    console.log(
      [
        r.repo.padEnd(40),
        r.group.padEnd(10),
        String(r.totalCommits90d).padStart(6),
        String(r.contextCommits90d).padStart(5),
        r.camPercent.padStart(7),
        r.agentEraFiles.join(", ") || "(none)",
      ].join(" | "),
    );
  }

  // 4. Summary statistics
  const userCAMs = userResults.filter((r) => r.totalCommits90d > 0).map((r) => r.cam);
  const refCAMs = refResults.filter((r) => r.totalCommits90d > 0).map((r) => r.cam);
  const mean = (arr: number[]) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);
  const median = (arr: number[]) => {
    const s = [...arr].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  };

  console.log("\n--- Summary ---");
  console.log(
    `User repos (n=${userCAMs.length}):  mean CAM = ${(mean(userCAMs) * 100).toFixed(1)}%,  median = ${(median(userCAMs) * 100).toFixed(1)}%`,
  );
  console.log(
    `Ref repos  (n=${refCAMs.length}):  mean CAM = ${(mean(refCAMs) * 100).toFixed(1)}%,  median = ${(median(refCAMs) * 100).toFixed(1)}%`,
  );

  const userWithAgent = userResults.filter((r) => r.agentEraFiles.length > 0).length;
  const refWithAgent = refResults.filter((r) => r.agentEraFiles.length > 0).length;
  console.log(
    `\nRepos with agent-era files: user ${userWithAgent}/${userResults.length}, ref ${refWithAgent}/${refResults.length}`,
  );

  // 5. Save raw JSON
  const outputPath = new URL("../paper/cam-results.json", import.meta.url).pathname;
  const Bun = globalThis as any;
  await (await import("fs/promises")).writeFile(
    outputPath,
    JSON.stringify({ timestamp: new Date().toISOString(), window: "90d", userResults, refResults }, null, 2),
  );
  console.log(`\nRaw data saved to ${outputPath}`);
}

main().catch(console.error);
