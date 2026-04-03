import type { DependencyInfo, DependencyHealth } from "../types";

export function parseRepoSlug(repo: string): { owner: string; name: string } | null {
  const parts = repo.split("/");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  return { owner: parts[0], name: parts[1] };
}

export function githubHeaders(): HeadersInit {
  const h: HeadersInit = { Accept: "application/vnd.github+json" };
  if (process.env.GITHUB_TOKEN) h.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  return h;
}

export function fetchWithTimeout(url: string, opts: RequestInit = {}, ms = 5000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return fetch(url, { ...opts, signal: controller.signal }).finally(() => clearTimeout(timer));
}

/**
 * 두 semver 문자열을 비교하여 업데이트 심각도를 반환.
 * normalize가 true이면 비숫자 문자를 제거 후 비교 (JVM 버전 등).
 */
export function compareVersions(
  current: string,
  latest: string,
  normalize = false,
): DependencyInfo["type"] {
  const parse = (v: string) => {
    const cleaned = normalize ? v.replace(/[^0-9.]/g, "") : v;
    return cleaned.split(".").map((n) => parseInt(n, 10) || 0);
  };
  const [curMaj, curMin = 0, curPat = 0] = parse(current);
  const [latMaj, latMin = 0, latPat = 0] = parse(latest);

  if (curMaj !== latMaj) return curMaj < latMaj ? "major" : "up-to-date";
  if (curMin !== latMin) return curMin < latMin ? "minor" : "up-to-date";
  if (curPat < latPat) return "patch";
  return "up-to-date";
}

/**
 * 의존성 목록을 배치로 나눠 버전 체크 후 결과 집계.
 */
export async function batchCheckDeps<T>(
  entries: T[],
  checkFn: (entry: T) => Promise<DependencyInfo | null>,
  batchSize = 8,
): Promise<Pick<DependencyHealth, "deps" | "outdatedMajor" | "outdatedMinor" | "outdatedPatch"> & { total: number }> {
  const deps: DependencyInfo[] = [];
  let outdatedMajor = 0;
  let outdatedMinor = 0;
  let outdatedPatch = 0;

  for (let i = 0; i < entries.length; i += batchSize) {
    const batch = entries.slice(i, i + batchSize);
    const results = await Promise.all(batch.map(checkFn));

    for (const info of results) {
      if (!info) continue;
      deps.push(info);
      if (info.type === "major") outdatedMajor++;
      else if (info.type === "minor") outdatedMinor++;
      else if (info.type === "patch") outdatedPatch++;
    }
  }

  deps.sort((a, b) => {
    const order = { major: 0, minor: 1, patch: 2, "up-to-date": 3 };
    return order[a.type] - order[b.type];
  });

  return { total: entries.length, deps, outdatedMajor, outdatedMinor, outdatedPatch };
}
