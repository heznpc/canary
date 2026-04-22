/**
 * Agent-Era File Adoption Timeline
 *
 * For each agent-era file in each reference repo, finds the date of the
 * first commit that introduced it. Produces a cumulative adoption curve
 * and file-type breakdown over time.
 *
 * Usage: npx tsx scripts/adoption-timeline.ts
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
  console.error("GITHUB_TOKEN required.");
  process.exit(1);
}

const headers: HeadersInit = {
  Accept: "application/vnd.github+json",
  Authorization: `Bearer ${GITHUB_TOKEN}`,
};

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

type FileType = "AGENTS.md" | "CLAUDE.md" | "cursor" | "copilot" | "other";
function classifyFile(path: string): FileType {
  const lower = path.toLowerCase();
  if (lower.endsWith("agents.md")) return "AGENTS.md";
  if (lower.endsWith("claude.md")) return "CLAUDE.md";
  if (lower.includes(".cursor") || lower.endsWith(".cursorrules")) return "cursor";
  if (lower.includes("copilot-instructions")) return "copilot";
  return "other";
}

// --- Reference repos ---
const REPOS: { repo: string; subgroup: "ai-adjacent" | "traditional" }[] = [
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
interface FileAdoption {
  repo: string;
  subgroup: string;
  filePath: string;
  fileType: FileType;
  firstCommitDate: string;
  firstCommitSha: string;
  firstCommitMessage: string;
}

// --- API ---
let apiCallCount = 0;

async function apiFetch(url: string): Promise<Response> {
  apiCallCount++;
  const res = await fetch(url, { headers });
  if (res.status === 403 || res.status === 429) {
    const reset = res.headers.get("x-ratelimit-reset");
    const waitSec = reset ? Math.max(0, parseInt(reset) - Math.floor(Date.now() / 1000)) : 60;
    console.warn(`  Rate limited. Waiting ${waitSec}s...`);
    await new Promise((r) => setTimeout(r, waitSec * 1000 + 1000));
    apiCallCount++;
    return fetch(url, { headers });
  }
  return res;
}

async function getDefaultBranch(owner: string, name: string): Promise<string | null> {
  const res = await apiFetch(`https://api.github.com/repos/${owner}/${name}`);
  if (!res.ok) return null;
  return (await res.json()).default_branch;
}

async function getAgentEraFiles(owner: string, name: string, branch: string): Promise<string[]> {
  const res = await apiFetch(
    `https://api.github.com/repos/${owner}/${name}/git/trees/${branch}?recursive=1`,
  );
  if (!res.ok) return [];
  const tree = await res.json();
  if (!tree.tree) return [];
  interface TreeEntry { type: string; path: string }
  return (tree.tree as TreeEntry[])
    .filter((e) => e.type === "blob" && isAgentEraFile(e.path))
    .map((e) => e.path);
}

async function getFirstCommitForFile(
  owner: string, name: string, filePath: string,
): Promise<{ date: string; sha: string; message: string } | null> {
  // Strategy: fetch commits for this path with per_page=1, check Link header for last page,
  // then fetch the last page to get the oldest commit.
  const url = `https://api.github.com/repos/${owner}/${name}/commits?path=${encodeURIComponent(filePath)}&per_page=1`;
  const res = await apiFetch(url);
  if (!res.ok) return null;

  const linkHeader = res.headers.get("link");
  let lastPageUrl = url;

  if (linkHeader) {
    const lastMatch = linkHeader.match(/<([^>]+)>;\s*rel="last"/);
    if (lastMatch) {
      lastPageUrl = lastMatch[1];
    }
  }

  // Fetch the last page (oldest commit)
  const lastRes = lastPageUrl === url ? res : await apiFetch(lastPageUrl);
  if (!lastRes.ok) return null;

  const data = lastPageUrl === url ? await res.json() : await lastRes.json();
  if (!Array.isArray(data) || data.length === 0) return null;

  const oldest = data[data.length - 1];
  return {
    date: oldest.commit?.author?.date || oldest.commit?.committer?.date || "",
    sha: oldest.sha || "",
    message: (oldest.commit?.message || "").split("\n")[0].slice(0, 80),
  };
}

// --- Main ---
async function main() {
  console.log(`\n=== Agent-Era File Adoption Timeline ===\n`);

  const adoptions: FileAdoption[] = [];

  for (const { repo, subgroup } of REPOS) {
    const [owner, name] = repo.split("/");
    process.stdout.write(`  ${repo} ...`);

    const branch = await getDefaultBranch(owner, name);
    if (!branch) { console.log(" SKIP"); continue; }

    const files = await getAgentEraFiles(owner, name, branch);
    if (files.length === 0) { console.log(" (no agent files)"); continue; }

    for (const filePath of files) {
      const first = await getFirstCommitForFile(owner, name, filePath);
      if (!first) continue;

      adoptions.push({
        repo, subgroup, filePath,
        fileType: classifyFile(filePath),
        firstCommitDate: first.date,
        firstCommitSha: first.sha.slice(0, 7),
        firstCommitMessage: first.message,
      });
    }

    const dates = adoptions
      .filter((a) => a.repo === repo)
      .map((a) => a.firstCommitDate.slice(0, 10))
      .join(", ");
    console.log(` [${files.length} files] earliest: ${dates}`);
  }

  // Sort by date
  adoptions.sort((a, b) => a.firstCommitDate.localeCompare(b.firstCommitDate));

  // --- Timeline table ---
  console.log("\n\n========================================");
  console.log("    ADOPTION TIMELINE");
  console.log("========================================\n");

  console.log(
    ["Date".padEnd(12), "Repo".padEnd(40), "File".padEnd(30), "Type".padEnd(12), "First Commit"].join(" | "),
  );
  console.log("-".repeat(130));

  for (const a of adoptions) {
    console.log([
      a.firstCommitDate.slice(0, 10).padEnd(12),
      a.repo.padEnd(40),
      a.filePath.padEnd(30),
      a.fileType.padEnd(12),
      `${a.firstCommitSha} ${a.firstCommitMessage}`,
    ].join(" | "));
  }

  // --- Cumulative adoption by month ---
  console.log("\n--- Cumulative Repo Adoption by Month ---\n");

  // Track first adoption date per repo (earliest file)
  const repoFirstAdoption = new Map<string, string>();
  for (const a of adoptions) {
    const existing = repoFirstAdoption.get(a.repo);
    if (!existing || a.firstCommitDate < existing) {
      repoFirstAdoption.set(a.repo, a.firstCommitDate);
    }
  }

  // Group by month
  const monthlyAdoptions = new Map<string, string[]>();
  for (const [repo, date] of repoFirstAdoption) {
    const month = date.slice(0, 7);
    if (!monthlyAdoptions.has(month)) monthlyAdoptions.set(month, []);
    monthlyAdoptions.get(month)!.push(repo);
  }

  const sortedMonths = [...monthlyAdoptions.keys()].sort();
  let cumulative = 0;
  const totalRepos = REPOS.length;

  for (const month of sortedMonths) {
    const repos = monthlyAdoptions.get(month)!;
    cumulative += repos.length;
    const bar = "█".repeat(cumulative) + "░".repeat(totalRepos - cumulative);
    console.log(`  ${month}  ${bar} ${cumulative}/${totalRepos} (+${repos.length}: ${repos.join(", ")})`);
  }

  // --- File type adoption timeline ---
  console.log("\n--- File Type Spread ---\n");

  const fileTypes: FileType[] = ["AGENTS.md", "CLAUDE.md", "copilot", "cursor", "other"];
  for (const ft of fileTypes) {
    const ftAdoptions = adoptions.filter((a) => a.fileType === ft);
    if (ftAdoptions.length === 0) continue;

    const repos = [...new Set(ftAdoptions.map((a) => a.repo))];
    const earliest = ftAdoptions[0].firstCommitDate.slice(0, 10);
    const latest = ftAdoptions[ftAdoptions.length - 1].firstCommitDate.slice(0, 10);
    console.log(`  ${ft}: ${repos.length} repos (${earliest} → ${latest})`);
    for (const a of ftAdoptions) {
      console.log(`    ${a.firstCommitDate.slice(0, 10)} ${a.repo} (${a.filePath})`);
    }
  }

  // --- Traditional-only adoption rate ---
  console.log("\n--- Traditional OSS Adoption Rate ---\n");
  const traditionalRepos = REPOS.filter((r) => r.subgroup === "traditional").map((r) => r.repo);
  const traditionalAdopters = traditionalRepos.filter((r) => repoFirstAdoption.has(r));
  console.log(`  ${traditionalAdopters.length}/${traditionalRepos.length} traditional repos adopted agent-era files`);
  console.log(`  Non-adopters: ${traditionalRepos.filter((r) => !repoFirstAdoption.has(r)).join(", ")}`);

  // Save
  const outputPath = new URL("../results/adoption-timeline-results.json", import.meta.url).pathname;
  await writeFile(
    outputPath,
    JSON.stringify({
      timestamp: new Date().toISOString(),
      apiCallCount,
      adoptions,
      repoFirstAdoption: Object.fromEntries(repoFirstAdoption),
      monthlyAdoptions: Object.fromEntries(
        [...monthlyAdoptions.entries()].map(([k, v]) => [k, v]),
      ),
    }, null, 2),
  );
  console.log(`\nRaw data saved to ${outputPath}`);
  console.log(`Total API calls: ${apiCallCount}`);
}

main().catch(console.error);
