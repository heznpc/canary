import { Octokit } from "octokit";
import type { GitStatus, DependencyInfo, DependencyHealth } from "../types";

function getOctokit() {
  return new Octokit({ auth: process.env.GITHUB_TOKEN || undefined });
}

function fetchWithTimeout(url: string, ms = 5000) {
  return Promise.race([
    fetch(url),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms)),
  ]);
}

export async function getGitStatus(repo: string): Promise<GitStatus | null> {
  try {
    const octokit = getOctokit();
    const [owner, name] = repo.split("/");

    const { data: repoData } = await octokit.rest.repos.get({ owner, repo: name });
    const defaultBranch = repoData.default_branch;

    const { data: commits } = await octokit.rest.repos.listCommits({
      owner,
      repo: name,
      sha: defaultBranch,
      per_page: 1,
    });

    const lastCommit = commits[0];

    return {
      branch: defaultBranch,
      aheadBy: 0,
      behindBy: 0,
      uncommittedCount: 0,
      lastCommitDate: lastCommit?.commit.committer?.date ?? null,
      lastCommitMessage: lastCommit?.commit.message ?? null,
    };
  } catch {
    return null;
  }
}

export async function getDependencyHealth(repo: string): Promise<DependencyHealth | null> {
  try {
    const [owner, name] = repo.split("/");

    // Fetch package.json from raw GitHub (faster, no auth needed for public repos)
    const res = await fetchWithTimeout(
      `https://raw.githubusercontent.com/${owner}/${name}/HEAD/package.json`
    );
    if (!res.ok) return null;

    const packageJson = await res.json();
    const allDeps: Record<string, string> = {
      ...packageJson.dependencies,
      ...packageJson.devDependencies,
    };

    const deps: DependencyInfo[] = [];
    let outdatedMajor = 0;
    let outdatedMinor = 0;
    let outdatedPatch = 0;

    const keyDeps = Object.entries(allDeps).filter(([name]) => isKeyDependency(name));

    await Promise.all(
      keyDeps.map(async ([depName, currentVersion]) => {
        const info = await checkNpmVersion(depName, currentVersion);
        if (info) {
          deps.push(info);
          if (info.type === "major") outdatedMajor++;
          else if (info.type === "minor") outdatedMinor++;
          else if (info.type === "patch") outdatedPatch++;
        }
      })
    );

    return { total: Object.keys(allDeps).length, outdatedMajor, outdatedMinor, outdatedPatch, vulnerabilities: 0, deps };
  } catch {
    return null;
  }
}

function isKeyDependency(name: string): boolean {
  const keyPatterns = [
    "next", "react", "react-dom", "vue", "nuxt", "svelte",
    "typescript", "tailwindcss", "@angular/core",
    "express", "fastify", "hono",
    "prisma", "@prisma/client",
  ];
  return keyPatterns.includes(name);
}

async function checkNpmVersion(packageName: string, currentSpec: string): Promise<DependencyInfo | null> {
  try {
    const res = await fetchWithTimeout(`https://registry.npmjs.org/${packageName}/latest`);
    if (!res.ok) return null;

    const data = await res.json();
    const latest = data.version as string;
    const current = currentSpec.replace(/^[\^~>=<]*/g, "");

    return { name: packageName, current, latest, type: compareVersions(current, latest) };
  } catch {
    return null;
  }
}

function compareVersions(current: string, latest: string): DependencyInfo["type"] {
  const [curMajor, curMinor, curPatch] = current.split(".").map(Number);
  const [latMajor, latMinor, latPatch] = latest.split(".").map(Number);

  if (curMajor < latMajor) return "major";
  if (curMinor < latMinor) return "minor";
  if (curPatch < latPatch) return "patch";
  return "up-to-date";
}
