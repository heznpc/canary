import type { ReleaseNoteSummary } from "../types";
import { fetchWithTimeout, parseRepoSlug, githubHeaders } from "./version-utils";
import migrationGuidesData from "../data/migration-guides.json";

const MIGRATION_GUIDES = migrationGuidesData as Record<string, string>;

/**
 * npm registry → GitHub owner/repo 추출
 */
export async function resolveGitHubRepo(
  packageName: string
): Promise<string | null> {
  try {
    const res = await fetchWithTimeout(
      `https://registry.npmjs.org/${packageName}`
    );
    if (!res.ok) return null;

    const data = await res.json();
    const repoUrl: string | undefined =
      data.repository?.url ?? data.repository;
    if (!repoUrl) return null;

    // "git+https://github.com/vercel/next.js.git" → "vercel/next.js"
    const match = repoUrl.match(/github\.com[/:]([^/]+\/[^/.]+)/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

/**
 * 두 버전 사이의 GitHub Releases를 가져와서 breaking changes 추출
 */
export async function fetchReleaseNotes(
  githubRepo: string,
  fromVersion: string,
  toVersion: string,
  packageName: string
): Promise<ReleaseNoteSummary> {
  const result: ReleaseNoteSummary = {
    packageName,
    from: fromVersion,
    to: toVersion,
    releases: [],
  };

  try {
    const parsed = parseRepoSlug(githubRepo);
    if (!parsed) return { packageName, from: fromVersion, to: toVersion, releases: [] };
    const res = await fetchWithTimeout(
      `https://api.github.com/repos/${parsed.owner}/${parsed.name}/releases?per_page=30`,
      { headers: githubHeaders() }
    );
    if (!res.ok) return result;

    const releases: Array<{
      tag_name: string;
      published_at: string;
      html_url: string;
      body: string;
    }> = await res.json();

    const fromMajor = parseMajor(fromVersion);
    const toMajor = parseMajor(toVersion);

    for (const release of releases) {
      const tagVersion = release.tag_name.replace(/^v/, "");
      const relMajor = parseMajor(tagVersion);

      // 현재 버전보다 높고 최신 버전 이하인 릴리스만
      if (relMajor < fromMajor || relMajor > toMajor) continue;
      if (compareVersionTuple(tagVersion, fromVersion) <= 0) continue;

      const body = release.body ?? "";
      const breaking = extractBreakingChanges(body);
      const highlights = extractHighlights(body);

      // 메이저 릴리스이거나 breaking change가 있는 것만 포함
      const isMajorRelease = tagVersion.match(/^\d+\.0\.0/);
      if (breaking.length === 0 && highlights.length === 0 && !isMajorRelease)
        continue;

      result.releases.push({
        version: tagVersion,
        date: release.published_at?.split("T")[0] ?? "",
        url: release.html_url,
        breaking,
        highlights,
      });
    }

    // 마이그레이션 가이드 URL 추측
    result.migrationGuideUrl = guessMigrationGuideUrl(
      githubRepo,
      packageName,
      fromVersion,
      toVersion
    );

    // 최신순 정렬
    result.releases.sort(
      (a, b) => compareVersionTuple(b.version, a.version)
    );
  } catch {
    // 실패해도 빈 결과 반환
  }

  return result;
}

function parseMajor(version: string): number {
  return parseInt(version.split(".")[0], 10) || 0;
}

function compareVersionTuple(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0);
  }
  return 0;
}

function extractBreakingChanges(body: string): string[] {
  const results: string[] = [];
  const lines = body.split("\n");

  let inBreakingSection = false;
  for (const line of lines) {
    const lower = line.toLowerCase();
    if (
      lower.includes("breaking change") ||
      lower.includes("breaking:") ||
      lower.match(/^#{1,3}\s.*break/)
    ) {
      inBreakingSection = true;
      // 헤딩 자체가 내용이면 추가
      const content = line.replace(/^#{1,3}\s*/, "").replace(/\**/g, "").trim();
      if (
        content.length > 20 &&
        !content.toLowerCase().startsWith("breaking change")
      ) {
        results.push(content);
      }
      continue;
    }

    if (inBreakingSection) {
      if (line.match(/^#{1,3}\s/) && !line.toLowerCase().includes("break")) {
        inBreakingSection = false;
        continue;
      }
      const cleaned = line.replace(/^[-*]\s*/, "").trim();
      if (cleaned.length > 5) {
        results.push(cleaned);
      }
    }
  }

  return results.slice(0, 10);
}

function extractHighlights(body: string): string[] {
  const results: string[] = [];
  const lines = body.split("\n");

  for (const line of lines) {
    const lower = line.toLowerCase();
    if (
      lower.includes("highlight") ||
      lower.includes("what's new") ||
      lower.includes("feature")
    ) {
      continue; // 헤딩은 스킵
    }
    // 주요 기능 라인 ("### " 로 시작하는 서브헤딩)
    if (line.match(/^###\s/) && !line.toLowerCase().includes("fix")) {
      const content = line.replace(/^###\s*/, "").trim();
      if (content.length > 5) results.push(content);
    }
  }

  return results.slice(0, 5);
}

export function guessMigrationGuideUrl(
  githubRepo: string,
  packageName: string,
  fromVersion: string,
  toVersion: string
): string | undefined {
  const fromMajor = parseMajor(fromVersion);
  const toMajor = parseMajor(toVersion);

  // Only emit a guide URL when crossing a major version boundary.
  if (fromMajor === toMajor) return undefined;

  const template = MIGRATION_GUIDES[packageName];
  if (!template) return undefined;

  return template
    .replaceAll("{from}", String(fromMajor))
    .replaceAll("{to}", String(toMajor));
}
