import type { DocFreshness, DocMismatch } from "../types";
import type { ProjectConfig } from "../projects";
import { fetchWithTimeout, githubHeaders, parseRepoSlug } from "./version-utils";

const RAW_BASE = "https://raw.githubusercontent.com";

async function fetchRawFile(repo: string, file: string): Promise<string | null> {
  try {
    const parsed = parseRepoSlug(repo);
    if (!parsed) return null;
    const url = `${RAW_BASE}/${parsed.owner}/${parsed.name}/HEAD/${file}`;
    const res = await fetchWithTimeout(url, { headers: githubHeaders() }, 5000);
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

async function getLatestRelease(repo: string): Promise<{ tag: string; date: string } | null> {
  try {
    const parsed = parseRepoSlug(repo);
    if (!parsed) return null;
    const url = `https://api.github.com/repos/${parsed.owner}/${parsed.name}/releases/latest`;
    const res = await fetchWithTimeout(url, { headers: githubHeaders() }, 5000);
    if (!res.ok) return null;
    const data = await res.json();
    return { tag: data.tag_name, date: data.published_at };
  } catch {
    return null;
  }
}

export function extractVersionsFromText(text: string): string[] {
  const pattern = /v?\d+\.\d+\.\d+/g;
  return [...new Set(text.match(pattern) || [])];
}

export function extractNumberMetrics(text: string): Map<string, number> {
  const metrics = new Map<string, number>();
  const pattern = /(\d+)\+?\s+(tools?|modules?|tests?|languages?|projects?)/gi;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    metrics.set(match[2].toLowerCase().replace(/s$/, ""), parseInt(match[1]));
  }
  return metrics;
}

export async function checkDocFreshness(project: ProjectConfig): Promise<DocFreshness> {
  const mismatches: DocMismatch[] = [];
  const repo = project.repo;

  if (!repo) {
    return {
      readmeVersionMatch: true,
      changelogUpToDate: true,
      todoStaleness: 0,
      agentsMdExists: false,
      claudeMdExists: false,
      mismatches: [],
      lastChecked: new Date().toISOString(),
    };
  }

  // 1. Fetch key files in parallel
  const [readme, changelog, todo, agentsMd, claudeMd, packageJson] = await Promise.all([
    fetchRawFile(repo, "README.md"),
    fetchRawFile(repo, "CHANGELOG.md"),
    fetchRawFile(repo, "TODO.md"),
    fetchRawFile(repo, "AGENTS.md"),
    fetchRawFile(repo, "CLAUDE.md"),
    fetchRawFile(repo, "package.json"),
  ]);

  // 2. Get actual version from package.json
  let actualVersion: string | null = null;
  if (packageJson) {
    try {
      const pkg = JSON.parse(packageJson);
      actualVersion = pkg.version || null;
    } catch { /* ignore parse errors */ }
  }

  // 3. Check README version mentions
  let readmeVersionMatch = true;
  if (readme && actualVersion) {
    const readmeVersions = extractVersionsFromText(readme);
    const outdatedMentions = readmeVersions.filter((v) => {
      const clean = v.replace(/^v/, "");
      return clean !== actualVersion && clean.includes(".");
    });
    if (outdatedMentions.length > 0) {
      readmeVersionMatch = false;
      for (const v of outdatedMentions) {
        mismatches.push({
          file: "README.md",
          field: "version",
          expected: actualVersion,
          actual: v,
          severity: "warning",
        });
      }
    }
  }

  // 4. Check CHANGELOG freshness
  let changelogUpToDate = true;
  if (changelog) {
    const release = await getLatestRelease(repo);
    if (release) {
      const cleanTag = release.tag.replace(/^v/, "");
      if (!changelog.includes(cleanTag)) {
        changelogUpToDate = false;
        mismatches.push({
          file: "CHANGELOG.md",
          field: "latest_version",
          expected: cleanTag,
          actual: "not found in CHANGELOG",
          severity: "error",
        });
      }
    }
  } else {
    changelogUpToDate = true; // not applicable, not a mismatch
  }

  // 5. TODO staleness — count unchecked items (lines starting with - [ ])
  let todoStaleness = 0;
  if (todo) {
    const unchecked = (todo.match(/^- \[ \]/gm) || []).length;
    todoStaleness = unchecked;
  }

  return {
    readmeVersionMatch,
    changelogUpToDate,
    todoStaleness,
    agentsMdExists: agentsMd !== null,
    claudeMdExists: claudeMd !== null,
    mismatches,
    lastChecked: new Date().toISOString(),
  };
}
