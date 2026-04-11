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
import { execSync } from "child_process";

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

// Pattern matching for nested agent-era files (e.g. packages/foo/AGENTS.md)
const AGENT_ERA_PATTERNS = [
  /^\.cursor\//,
  /agents\.md$/i,
  /claude\.md$/i,
  /copilot-instructions/i,
];

// File type classification for reporting
type FileCategory = "agents-md" | "claude-md" | "cursor" | "copilot" | "other-agent";
function classifyAgentFile(path: string): FileCategory {
  const lower = path.toLowerCase();
  if (lower.endsWith("agents.md")) return "agents-md";
  if (lower.endsWith("claude.md")) return "claude-md";
  if (lower.includes(".cursor") || lower.endsWith(".cursorrules")) return "cursor";
  if (lower.includes("copilot-instructions")) return "copilot";
  return "other-agent";
}

const MIN_COMMITS_THRESHOLD = 5;

// --- Reference repos: explicitly tagged by subgroup ---
const REFERENCE_REPOS: { repo: string; subgroup: "ai-adjacent" | "traditional" }[] = [
  // AI-adjacent: projects in the AI/LLM ecosystem
  { repo: "vercel/ai", subgroup: "ai-adjacent" },
  { repo: "langchain-ai/langchain", subgroup: "ai-adjacent" },
  { repo: "anthropics/anthropic-cookbook", subgroup: "ai-adjacent" },
  { repo: "cohere-ai/cohere-toolkit", subgroup: "ai-adjacent" },
  { repo: "stackblitz/bolt.new", subgroup: "ai-adjacent" },
  // Traditional: JS/TS ecosystem
  { repo: "facebook/react", subgroup: "traditional" },
  { repo: "vercel/next.js", subgroup: "traditional" },
  { repo: "microsoft/typescript", subgroup: "traditional" },
  { repo: "nodejs/node", subgroup: "traditional" },
  { repo: "tailwindlabs/tailwindcss", subgroup: "traditional" },
  { repo: "shadcn-ui/ui", subgroup: "traditional" },
  { repo: "sveltejs/svelte", subgroup: "traditional" },
  { repo: "remix-run/remix", subgroup: "traditional" },
  { repo: "vitejs/vite", subgroup: "traditional" },
  { repo: "denoland/deno", subgroup: "traditional" },
  // Traditional: Systems / Go / Rust / C
  { repo: "torvalds/linux", subgroup: "traditional" },
  { repo: "kubernetes/kubernetes", subgroup: "traditional" },
  { repo: "golang/go", subgroup: "traditional" },
  { repo: "rust-lang/rust", subgroup: "traditional" },
  { repo: "docker/cli", subgroup: "traditional" },
  { repo: "prometheus/prometheus", subgroup: "traditional" },
  // Traditional: Python / Java
  { repo: "python/cpython", subgroup: "traditional" },
  { repo: "django/django", subgroup: "traditional" },
  { repo: "pallets/flask", subgroup: "traditional" },
  { repo: "spring-projects/spring-boot", subgroup: "traditional" },
  { repo: "apache/kafka", subgroup: "traditional" },
];

// --- Types ---
interface CAMResult {
  repo: string;
  group: "user" | "reference";
  subgroup?: "ai-adjacent" | "traditional";
  defaultBranch: string;
  totalCommits90d: number;
  agentEraFiles: string[];
  fileBreakdown: Record<FileCategory, string[]>;
  contextCommits90d: number;
  cam: number;
  camPercent: string;
  excluded: boolean; // true if below MIN_COMMITS_THRESHOLD
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

async function computeCAM(
  repo: string,
  group: "user" | "reference",
  subgroup?: "ai-adjacent" | "traditional",
): Promise<CAMResult | null> {
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

  const excluded = totalCommits < MIN_COMMITS_THRESHOLD;

  let contextCommits = 0;
  if (agentEraFiles.length > 0 && totalCommits > 0) {
    const shas = await getContextCommitSHAs(owner, name, agentEraFiles);
    contextCommits = shas.size;
  }

  const cam = totalCommits > 0 ? contextCommits / totalCommits : 0;

  // Classify files by type
  const fileBreakdown: Record<FileCategory, string[]> = {
    "agents-md": [], "claude-md": [], "cursor": [], "copilot": [], "other-agent": [],
  };
  for (const f of agentEraFiles) {
    fileBreakdown[classifyAgentFile(f)].push(f);
  }

  const tag = excluded ? " [EXCLUDED <5 commits]" : "";
  console.log(
    ` ${agentEraFiles.length} files, ${contextCommits}/${totalCommits} commits, CAM=${(cam * 100).toFixed(1)}%${tag}`,
  );

  return {
    repo, group, subgroup,
    defaultBranch: branch,
    totalCommits90d: totalCommits,
    agentEraFiles, fileBreakdown,
    contextCommits90d: contextCommits,
    cam, camPercent: (cam * 100).toFixed(1) + "%",
    excluded,
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
  console.log("\n--- Reference repos (AI-adjacent) ---");
  const refResults: CAMResult[] = [];
  for (const { repo, subgroup } of REFERENCE_REPOS.filter((r) => r.subgroup === "ai-adjacent")) {
    const r = await computeCAM(repo, "reference", subgroup);
    if (r) refResults.push(r);
  }
  console.log("\n--- Reference repos (Traditional) ---");
  for (const { repo, subgroup } of REFERENCE_REPOS.filter((r) => r.subgroup === "traditional")) {
    const r = await computeCAM(repo, "reference", subgroup);
    if (r) refResults.push(r);
  }

  // 3. Helpers
  const mean = (arr: number[]) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);
  const median = (arr: number[]) => {
    const s = [...arr].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length === 0 ? 0 : s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  };

  const all = [...userResults, ...refResults];
  const included = all.filter((r) => !r.excluded);
  const excluded = all.filter((r) => r.excluded);

  // 4. Main table (included only)
  console.log("\n\n========================================");
  console.log("    CAM RESULTS (≥5 commits only)");
  console.log("========================================\n");

  const header = [
    "Repo".padEnd(40), "Subgroup".padEnd(14),
    "Total".padStart(6), "Ctx".padStart(5), "CAM".padStart(7),
    "Agent-era files",
  ].join(" | ");
  console.log(header);
  console.log("-".repeat(120));

  for (const r of included.sort((a, b) => b.cam - a.cam)) {
    const sg = r.subgroup || r.group;
    console.log([
      r.repo.padEnd(40), sg.padEnd(14),
      String(r.totalCommits90d).padStart(6), String(r.contextCommits90d).padStart(5),
      r.camPercent.padStart(7),
      r.agentEraFiles.join(", ") || "(none)",
    ].join(" | "));
  }

  if (excluded.length > 0) {
    console.log(`\nExcluded (< ${MIN_COMMITS_THRESHOLD} commits): ${excluded.map((r) => r.repo).join(", ")}`);
  }

  // 5. File type breakdown
  console.log("\n--- File Type Breakdown (across all repos) ---");
  const allCategories: FileCategory[] = ["agents-md", "claude-md", "cursor", "copilot", "other-agent"];
  for (const cat of allCategories) {
    const repos = included.filter((r) => r.fileBreakdown[cat].length > 0);
    if (repos.length > 0) {
      console.log(`  ${cat}: ${repos.length} repos — ${repos.map((r) => `${r.repo}(${r.fileBreakdown[cat].join(",")})` ).join(", ")}`);
    }
  }

  // 6. Summary by subgroup
  const groups = [
    { label: "User (≥5 commits)", data: included.filter((r) => r.group === "user") },
    { label: "Ref: AI-adjacent",  data: included.filter((r) => r.subgroup === "ai-adjacent") },
    { label: "Ref: Traditional",  data: included.filter((r) => r.subgroup === "traditional") },
    { label: "Ref: All",          data: included.filter((r) => r.group === "reference") },
  ];

  console.log("\n--- Summary by Subgroup ---");
  console.log(
    ["Group".padEnd(22), "n".padStart(3), "w/ files".padStart(9),
     "mean CAM".padStart(10), "median".padStart(8)].join(" | "),
  );
  console.log("-".repeat(60));
  for (const g of groups) {
    const cams = g.data.map((r) => r.cam);
    const withFiles = g.data.filter((r) => r.agentEraFiles.length > 0).length;
    console.log([
      g.label.padEnd(22), String(g.data.length).padStart(3),
      `${withFiles}/${g.data.length}`.padStart(9),
      ((mean(cams) * 100).toFixed(1) + "%").padStart(10),
      ((median(cams) * 100).toFixed(1) + "%").padStart(8),
    ].join(" | "));
  }

  // 7. Save raw JSON
  const outputPath = new URL("../paper/cam-results.json", import.meta.url).pathname;
  await (await import("fs/promises")).writeFile(
    outputPath,
    JSON.stringify({
      timestamp: new Date().toISOString(),
      window: "90d",
      minCommitsThreshold: MIN_COMMITS_THRESHOLD,
      userResults, refResults,
      includedCount: included.length,
      excludedCount: excluded.length,
    }, null, 2),
  );
  console.log(`\nRaw data saved to ${outputPath}`);
}

main().catch(console.error);
