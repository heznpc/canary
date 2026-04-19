/**
 * Multi-window Temporal CAM Experiment
 *
 * Computes CAM across multiple time windows (30d, 60d, 90d, 180d, 365d)
 * to reveal temporal trends in agent-era file activity without waiting
 * for quarterly longitudinal data.
 *
 * Usage: npx tsx scripts/cam-temporal.ts [username]
 */

import { readFileSync } from "fs";
import { writeFile } from "fs/promises";
import { resolve } from "path";
import { execSync } from "child_process";

// --- Token loading (same as cam-experiment.ts) ---
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

// --- Windows ---
const WINDOWS = [30, 60, 90, 180, 365] as const;
type WindowDays = (typeof WINDOWS)[number];

function sinceDate(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

// --- Agent-era file patterns (identical to cam-experiment.ts) ---
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

const MIN_COMMITS_THRESHOLD = 5;

// --- Reference repos (same as cam-experiment.ts) ---
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
interface WindowResult {
  window: WindowDays;
  totalCommits: number;
  contextCommits: number;
  cam: number;
  camPercent: string;
  excluded: boolean;
}

interface RepoTemporalResult {
  repo: string;
  group: "user" | "reference";
  subgroup?: "ai-adjacent" | "traditional";
  defaultBranch: string;
  agentEraFiles: string[];
  windows: WindowResult[];
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
    if (AGENT_ERA_FILES.includes(entry.path)) { found.push(entry.path); continue; }
    if (AGENT_ERA_PATTERNS.some((p) => p.test(entry.path))) { found.push(entry.path); }
  }
  return found;
}

async function countCommitsSince(owner: string, name: string, since: string): Promise<number> {
  const url = `https://api.github.com/repos/${owner}/${name}/commits?since=${since}&per_page=1`;
  const res = await apiFetch(url);
  if (!res.ok) return 0;
  const lastPage = getLinkCount(res);
  if (lastPage !== null) return lastPage;
  const data = await res.json();
  return Array.isArray(data) ? data.length : 0;
}

async function getContextCommitSHAs(
  owner: string, name: string, files: string[], since: string,
): Promise<Set<string>> {
  const shas = new Set<string>();
  for (const file of files) {
    let page = 1;
    let hasMore = true;
    while (hasMore && page <= 10) {
      const url =
        `https://api.github.com/repos/${owner}/${name}/commits` +
        `?path=${encodeURIComponent(file)}&since=${since}&per_page=100&page=${page}`;
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

async function computeTemporalCAM(
  repo: string,
  group: "user" | "reference",
  subgroup?: "ai-adjacent" | "traditional",
): Promise<RepoTemporalResult | null> {
  const parts = repo.split("/");
  if (parts.length !== 2) return null;
  const [owner, name] = parts;

  process.stdout.write(`  ${repo} ...`);

  const branch = await getDefaultBranch(owner, name);
  if (!branch) { console.log(" SKIP (not found)"); return null; }

  const agentEraFiles = await getAgentEraFiles(owner, name, branch);

  const windows: WindowResult[] = [];

  for (const days of WINDOWS) {
    const since = sinceDate(days);
    const totalCommits = await countCommitsSince(owner, name, since);
    const excluded = totalCommits < MIN_COMMITS_THRESHOLD;

    let contextCommits = 0;
    if (agentEraFiles.length > 0 && totalCommits > 0) {
      const shas = await getContextCommitSHAs(owner, name, agentEraFiles, since);
      contextCommits = shas.size;
    }

    const cam = totalCommits > 0 ? contextCommits / totalCommits : 0;
    windows.push({
      window: days,
      totalCommits,
      contextCommits,
      cam,
      camPercent: (cam * 100).toFixed(1) + "%",
      excluded,
    });
  }

  const summary = windows.map((w) => `${w.window}d=${w.camPercent}`).join(", ");
  console.log(` [${agentEraFiles.length} files] ${summary}`);

  return { repo, group, subgroup, defaultBranch: branch, agentEraFiles, windows };
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

  console.log(`\n=== Temporal CAM Experiment ===`);
  console.log(`Windows: ${WINDOWS.join("d, ")}d`);
  console.log(`Agent-era files: ${AGENT_ERA_FILES.join(", ")}\n`);

  // 1. User repos
  console.log(`Fetching repos for ${username}...`);
  const userRepos = await getUserRepos(username);
  console.log(`Found ${userRepos.length} repos\n`);

  console.log("--- User repos ---");
  const userResults: RepoTemporalResult[] = [];
  for (const repo of userRepos) {
    const r = await computeTemporalCAM(repo, "user");
    if (r) userResults.push(r);
  }

  // 2. Reference repos
  console.log("\n--- Reference repos (AI-adjacent) ---");
  const refResults: RepoTemporalResult[] = [];
  for (const { repo, subgroup } of REFERENCE_REPOS.filter((r) => r.subgroup === "ai-adjacent")) {
    const r = await computeTemporalCAM(repo, "reference", subgroup);
    if (r) refResults.push(r);
  }
  console.log("\n--- Reference repos (Traditional) ---");
  for (const { repo, subgroup } of REFERENCE_REPOS.filter((r) => r.subgroup === "traditional")) {
    const r = await computeTemporalCAM(repo, "reference", subgroup);
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

  // 4. Summary table by window × subgroup
  console.log("\n\n========================================");
  console.log("    TEMPORAL CAM RESULTS");
  console.log("========================================\n");

  const subgroups = [
    { label: "User", filter: (r: RepoTemporalResult) => r.group === "user" },
    { label: "AI-adjacent", filter: (r: RepoTemporalResult) => r.subgroup === "ai-adjacent" },
    { label: "Traditional", filter: (r: RepoTemporalResult) => r.subgroup === "traditional" },
    { label: "All Reference", filter: (r: RepoTemporalResult) => r.group === "reference" },
  ];

  // Header
  const windowHeaders = WINDOWS.map((w) => `${w}d`.padStart(8)).join(" | ");
  console.log(`${"Subgroup".padEnd(16)} | Metric   | ${windowHeaders}`);
  console.log("-".repeat(90));

  for (const sg of subgroups) {
    const repos = all.filter(sg.filter);

    for (const metric of ["n (≥5)", "mean CAM", "median"] as const) {
      const values = WINDOWS.map((days) => {
        const windowData = repos
          .map((r) => r.windows.find((w) => w.window === days)!)
          .filter((w) => !w.excluded);

        if (metric === "n (≥5)") return String(windowData.length).padStart(8);
        const cams = windowData.map((w) => w.cam);
        if (metric === "mean CAM") return ((mean(cams) * 100).toFixed(1) + "%").padStart(8);
        return ((median(cams) * 100).toFixed(1) + "%").padStart(8);
      }).join(" | ");

      const label = metric === "n (≥5)" ? sg.label : "";
      console.log(`${label.padEnd(16)} | ${metric.padEnd(8)} | ${values}`);
    }
    console.log("-".repeat(90));
  }

  // 5. Per-repo detail table (90d reference + all windows for repos with agent files)
  console.log("\n--- Per-repo Temporal CAM (repos with agent-era files) ---\n");

  const reposWithFiles = all.filter((r) => r.agentEraFiles.length > 0);
  console.log(`${"Repo".padEnd(40)} | ${WINDOWS.map((w) => `${w}d`.padStart(7)).join(" | ")}`);
  console.log("-".repeat(90));

  for (const r of reposWithFiles.sort((a, b) => {
    const a90 = a.windows.find((w) => w.window === 90)?.cam ?? 0;
    const b90 = b.windows.find((w) => w.window === 90)?.cam ?? 0;
    return b90 - a90;
  })) {
    const vals = WINDOWS.map((days) => {
      const w = r.windows.find((w) => w.window === days)!;
      return w.excluded ? "  (exc)".padStart(7) : w.camPercent.padStart(7);
    }).join(" | ");
    console.log(`${r.repo.padEnd(40)} | ${vals}`);
  }

  // 6. Trend indicator
  console.log("\n--- Trend Direction (30d vs 365d CAM) ---\n");
  for (const r of reposWithFiles) {
    const w30 = r.windows.find((w) => w.window === 30);
    const w365 = r.windows.find((w) => w.window === 365);
    if (!w30 || !w365 || w30.excluded || w365.excluded) continue;
    const delta = w30.cam - w365.cam;
    const arrow = delta > 0.005 ? "↑" : delta < -0.005 ? "↓" : "→";
    console.log(`  ${arrow} ${r.repo}: 30d=${w30.camPercent}, 365d=${w365.camPercent} (Δ=${(delta * 100).toFixed(1)}pp)`);
  }

  // 7. Save
  const outputPath = new URL("../results/cam-temporal-results.json", import.meta.url).pathname;
  await writeFile(
    outputPath,
    JSON.stringify({
      timestamp: new Date().toISOString(),
      windows: [...WINDOWS],
      minCommitsThreshold: MIN_COMMITS_THRESHOLD,
      userResults,
      refResults,
    }, null, 2),
  );
  console.log(`\nRaw data saved to ${outputPath}`);
}

main().catch(console.error);
