/**
 * CAM-LOC: Diff Volume Context Attention Metric
 *
 * Measures attention by lines changed in agent-era files vs total lines changed,
 * providing a finer-grained proxy than commit count.
 *
 * CAM-LOC = Σ(additions + deletions in agent-era files) / Σ(additions + deletions total)
 *
 * Usage: npx tsx scripts/cam-loc.ts [username]
 *
 * Note: This is more API-intensive than CAM (fetches individual commit stats).
 * Uses 90-day window only to stay within rate limits.
 */

import { readFileSync } from "fs";
import { writeFile } from "fs/promises";
import { resolve } from "path";
import { execSync } from "child_process";

// --- Token loading ---
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
  "AGENTS.md", "CLAUDE.md", ".cursorrules", ".cursor/rules",
  "copilot-instructions.md", ".github/copilot-instructions.md",
  ".clinerules", ".windsurfrules", ".roomodes",
];
const AGENT_ERA_PATTERNS = [
  /^\.cursor\//,
  /agents\.md$/i,
  /claude\.md$/i,
  /copilot-instructions/i,
];

function isAgentEraFile(path: string): boolean {
  if (AGENT_ERA_FILES.includes(path)) return true;
  return AGENT_ERA_PATTERNS.some((p) => p.test(path));
}

const MIN_COMMITS_THRESHOLD = 5;
// For repos with very high commit volumes, cap the number of commits we fetch details for
const MAX_COMMITS_TO_FETCH = 200;

// --- Reference repos ---
const REFERENCE_REPOS: { repo: string; subgroup: "ai-adjacent" | "traditional" }[] = [
  { repo: "vercel/ai", subgroup: "ai-adjacent" },
  { repo: "langchain-ai/langchain", subgroup: "ai-adjacent" },
  { repo: "anthropics/anthropic-cookbook", subgroup: "ai-adjacent" },
  { repo: "cohere-ai/cohere-toolkit", subgroup: "ai-adjacent" },
  { repo: "stackblitz/bolt.new", subgroup: "ai-adjacent" },
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
  { repo: "torvalds/linux", subgroup: "traditional" },
  { repo: "kubernetes/kubernetes", subgroup: "traditional" },
  { repo: "golang/go", subgroup: "traditional" },
  { repo: "rust-lang/rust", subgroup: "traditional" },
  { repo: "docker/cli", subgroup: "traditional" },
  { repo: "prometheus/prometheus", subgroup: "traditional" },
  { repo: "python/cpython", subgroup: "traditional" },
  { repo: "django/django", subgroup: "traditional" },
  { repo: "pallets/flask", subgroup: "traditional" },
  { repo: "spring-projects/spring-boot", subgroup: "traditional" },
  { repo: "apache/kafka", subgroup: "traditional" },
];

// --- Types ---
interface CAMLocResult {
  repo: string;
  group: "user" | "reference";
  subgroup?: "ai-adjacent" | "traditional";
  totalCommits90d: number;
  commitsFetched: number;
  totalLinesChanged: number;
  agentLinesChanged: number;
  camLoc: number;
  camLocPercent: string;
  cam: number; // commit-based CAM for comparison
  camPercent: string;
  excluded: boolean;
  agentFileStats: Record<string, { additions: number; deletions: number }>;
}

// --- API helpers ---
let apiCallCount = 0;

async function apiFetch(url: string): Promise<Response> {
  apiCallCount++;
  const res = await fetch(url, { headers });
  if (res.status === 403 || res.status === 429) {
    const reset = res.headers.get("x-ratelimit-reset");
    const waitSec = reset ? Math.max(0, parseInt(reset) - Math.floor(Date.now() / 1000)) : 60;
    console.warn(`  Rate limited (${apiCallCount} calls). Waiting ${waitSec}s...`);
    await new Promise((r) => setTimeout(r, waitSec * 1000 + 1000));
    apiCallCount++;
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
  return (await res.json()).default_branch;
}

interface TreeBlob { type: string; path: string }

async function getAgentEraFiles(owner: string, name: string, branch: string): Promise<string[]> {
  const res = await apiFetch(
    `https://api.github.com/repos/${owner}/${name}/git/trees/${branch}?recursive=1`,
  );
  if (!res.ok) return [];
  const tree = await res.json();
  if (!tree.tree) return [];
  return (tree.tree as TreeBlob[])
    .filter((e) => e.type === "blob" && isAgentEraFile(e.path))
    .map((e) => e.path);
}

async function countCommits90d(owner: string, name: string): Promise<number> {
  const url = `https://api.github.com/repos/${owner}/${name}/commits?since=${NINETY_DAYS_AGO}&per_page=1`;
  const res = await apiFetch(url);
  if (!res.ok) return 0;
  const lastPage = getLinkCount(res);
  if (lastPage !== null) return lastPage;
  const data = await res.json();
  return Array.isArray(data) ? data.length : 0;
}

// Fetch commit SHAs (paginated, capped)
async function getCommitSHAs(
  owner: string, name: string, maxCommits: number,
): Promise<string[]> {
  const shas: string[] = [];
  let page = 1;
  const perPage = 100;
  while (shas.length < maxCommits) {
    const url =
      `https://api.github.com/repos/${owner}/${name}/commits` +
      `?since=${NINETY_DAYS_AGO}&per_page=${perPage}&page=${page}`;
    const res = await apiFetch(url);
    if (!res.ok) break;
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) break;
    for (const c of data) {
      shas.push(c.sha);
      if (shas.length >= maxCommits) break;
    }
    if (data.length < perPage) break;
    page++;
  }
  return shas;
}

// Fetch single commit's file-level stats
interface CommitFile { filename: string; additions?: number; deletions?: number }

async function getCommitStats(
  owner: string, name: string, sha: string,
): Promise<{ files: { filename: string; additions: number; deletions: number }[] } | null> {
  const url = `https://api.github.com/repos/${owner}/${name}/commits/${sha}`;
  const res = await apiFetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  if (!data.files) return null;
  return {
    files: (data.files as CommitFile[]).map((f) => ({
      filename: f.filename,
      additions: f.additions || 0,
      deletions: f.deletions || 0,
    })),
  };
}

async function computeCAMLoc(
  repo: string,
  group: "user" | "reference",
  subgroup?: "ai-adjacent" | "traditional",
): Promise<CAMLocResult | null> {
  const parts = repo.split("/");
  if (parts.length !== 2) return null;
  const [owner, name] = parts;

  process.stdout.write(`  ${repo} ...`);

  const branch = await getDefaultBranch(owner, name);
  if (!branch) { console.log(" SKIP"); return null; }

  const [agentFiles, totalCommits] = await Promise.all([
    getAgentEraFiles(owner, name, branch),
    countCommits90d(owner, name),
  ]);

  const excluded = totalCommits < MIN_COMMITS_THRESHOLD;
  if (excluded) {
    console.log(` [EXCLUDED <${MIN_COMMITS_THRESHOLD} commits]`);
    return {
      repo, group, subgroup,
      totalCommits90d: totalCommits, commitsFetched: 0,
      totalLinesChanged: 0, agentLinesChanged: 0,
      camLoc: 0, camLocPercent: "0.0%",
      cam: 0, camPercent: "0.0%",
      excluded: true, agentFileStats: {},
    };
  }

  // If no agent files, CAM-LOC = 0 but we still need total LOC for the denominator
  // Skip fetching individual commits for repos with 0 agent files to save API calls
  if (agentFiles.length === 0) {
    console.log(` [0 agent files] CAM-LOC=0.0%`);
    return {
      repo, group, subgroup,
      totalCommits90d: totalCommits, commitsFetched: 0,
      totalLinesChanged: 0, agentLinesChanged: 0,
      camLoc: 0, camLocPercent: "0.0%",
      cam: 0, camPercent: "0.0%",
      excluded: false, agentFileStats: {},
    };
  }

  // Fetch commit SHAs (capped)
  const shas = await getCommitSHAs(owner, name, MAX_COMMITS_TO_FETCH);

  let totalLines = 0;
  let agentLines = 0;
  let contextCommitCount = 0;
  const agentFileStats: Record<string, { additions: number; deletions: number }> = {};

  // Process commits in batches to manage rate limits
  const batchSize = 10;
  for (let i = 0; i < shas.length; i += batchSize) {
    const batch = shas.slice(i, i + batchSize);
    const results = await Promise.all(
      batch.map((sha) => getCommitStats(owner, name, sha)),
    );

    for (const commit of results) {
      if (!commit) continue;
      let commitTouchesAgent = false;
      for (const file of commit.files) {
        const linesChanged = file.additions + file.deletions;
        totalLines += linesChanged;
        if (isAgentEraFile(file.filename)) {
          agentLines += linesChanged;
          commitTouchesAgent = true;
          if (!agentFileStats[file.filename]) {
            agentFileStats[file.filename] = { additions: 0, deletions: 0 };
          }
          agentFileStats[file.filename].additions += file.additions;
          agentFileStats[file.filename].deletions += file.deletions;
        }
      }
      if (commitTouchesAgent) contextCommitCount++;
    }

    // Brief pause between batches to be polite to API
    if (i + batchSize < shas.length) {
      await new Promise((r) => setTimeout(r, 100));
    }
  }

  const camLoc = totalLines > 0 ? agentLines / totalLines : 0;
  const cam = shas.length > 0 ? contextCommitCount / shas.length : 0;

  console.log(
    ` [${agentFiles.length} files, ${shas.length} commits] ` +
    `LOC=${agentLines}/${totalLines} CAM-LOC=${(camLoc * 100).toFixed(2)}% ` +
    `CAM=${(cam * 100).toFixed(1)}%`,
  );

  return {
    repo, group, subgroup,
    totalCommits90d: totalCommits, commitsFetched: shas.length,
    totalLinesChanged: totalLines, agentLinesChanged: agentLines,
    camLoc, camLocPercent: (camLoc * 100).toFixed(2) + "%",
    cam, camPercent: (cam * 100).toFixed(1) + "%",
    excluded: false, agentFileStats,
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

  console.log(`\n=== CAM-LOC Experiment (Diff Volume) ===`);
  console.log(`Window: 90 days (since ${NINETY_DAYS_AGO.slice(0, 10)})`);
  console.log(`Max commits per repo: ${MAX_COMMITS_TO_FETCH}\n`);

  // 1. User repos
  console.log(`Fetching repos for ${username}...`);
  const userRepos = await getUserRepos(username);
  console.log(`Found ${userRepos.length} repos\n`);

  console.log("--- User repos ---");
  const userResults: CAMLocResult[] = [];
  for (const repo of userRepos) {
    const r = await computeCAMLoc(repo, "user");
    if (r) userResults.push(r);
  }

  // 2. Reference repos
  console.log("\n--- Reference repos (AI-adjacent) ---");
  const refResults: CAMLocResult[] = [];
  for (const { repo, subgroup } of REFERENCE_REPOS.filter((r) => r.subgroup === "ai-adjacent")) {
    const r = await computeCAMLoc(repo, "reference", subgroup);
    if (r) refResults.push(r);
  }
  console.log("\n--- Reference repos (Traditional) ---");
  for (const { repo, subgroup } of REFERENCE_REPOS.filter((r) => r.subgroup === "traditional")) {
    const r = await computeCAMLoc(repo, "reference", subgroup);
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

  // 4. Summary
  console.log("\n\n========================================");
  console.log("    CAM-LOC RESULTS (≥5 commits)");
  console.log("========================================\n");

  const groups = [
    { label: "User", data: included.filter((r) => r.group === "user") },
    { label: "AI-adjacent", data: included.filter((r) => r.subgroup === "ai-adjacent") },
    { label: "Traditional", data: included.filter((r) => r.subgroup === "traditional") },
    { label: "All Reference", data: included.filter((r) => r.group === "reference") },
  ];

  console.log(
    ["Group".padEnd(16), "n".padStart(3),
     "mean CAM".padStart(10), "mean CAM-LOC".padStart(14),
     "median CAM".padStart(12), "median LOC".padStart(12),
    ].join(" | "),
  );
  console.log("-".repeat(80));

  for (const g of groups) {
    const cams = g.data.map((r) => r.cam);
    const locs = g.data.map((r) => r.camLoc);
    console.log([
      g.label.padEnd(16), String(g.data.length).padStart(3),
      ((mean(cams) * 100).toFixed(1) + "%").padStart(10),
      ((mean(locs) * 100).toFixed(2) + "%").padStart(14),
      ((median(cams) * 100).toFixed(1) + "%").padStart(12),
      ((median(locs) * 100).toFixed(2) + "%").padStart(12),
    ].join(" | "));
  }

  // 5. Per-repo comparison (repos with agent files only)
  const withFiles = included.filter((r) => r.agentLinesChanged > 0 || r.cam > 0);
  if (withFiles.length > 0) {
    console.log("\n--- Per-repo CAM vs CAM-LOC (repos with agent activity) ---\n");
    console.log(
      ["Repo".padEnd(40), "CAM".padStart(7), "CAM-LOC".padStart(9),
       "Agent LOC".padStart(11), "Total LOC".padStart(11), "Ratio".padStart(7),
      ].join(" | "),
    );
    console.log("-".repeat(95));

    for (const r of withFiles.sort((a, b) => b.camLoc - a.camLoc)) {
      const ratio = r.cam > 0 ? (r.camLoc / r.cam).toFixed(2) : "N/A";
      console.log([
        r.repo.padEnd(40),
        r.camPercent.padStart(7),
        r.camLocPercent.padStart(9),
        String(r.agentLinesChanged).padStart(11),
        String(r.totalLinesChanged).padStart(11),
        ratio.padStart(7),
      ].join(" | "));
    }

    // 6. Per-file breakdown
    console.log("\n--- Agent-era File LOC Breakdown ---\n");
    for (const r of withFiles.filter((r) => Object.keys(r.agentFileStats).length > 0)) {
      console.log(`  ${r.repo}:`);
      for (const [file, stats] of Object.entries(r.agentFileStats)) {
        console.log(`    ${file}: +${stats.additions} -${stats.deletions} (${stats.additions + stats.deletions} LOC)`);
      }
    }
  }

  // 7. Save
  const outputPath = new URL("../paper/cam-loc-results.json", import.meta.url).pathname;
  await writeFile(
    outputPath,
    JSON.stringify({
      timestamp: new Date().toISOString(),
      window: "90d",
      maxCommitsPerRepo: MAX_COMMITS_TO_FETCH,
      minCommitsThreshold: MIN_COMMITS_THRESHOLD,
      apiCallCount,
      userResults,
      refResults,
    }, null, 2),
  );
  console.log(`\nRaw data saved to ${outputPath}`);
  console.log(`Total API calls: ${apiCallCount}`);
}

main().catch(console.error);
