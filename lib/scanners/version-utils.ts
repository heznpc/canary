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

/**
 * Allow-list of upstream hosts that canary's scanners are permitted to
 * contact. Defense-in-depth against SSRF: even though every call site
 * constructs URLs from validated inputs (regex-checked package names,
 * regex-checked owner/repo slugs) and uses hardcoded host strings, an
 * explicit gate makes the safety property obvious to static analyzers
 * (CodeQL flagged the previous unguarded fetch in 2026-05-21 audit) and
 * fails closed if a future scanner adds a host without adding it here.
 *
 * To add a host, append it below and add a matching unit test in
 * `__tests__/version-utils.test.ts`. Keep the list short — every entry is
 * a piece of attack surface this codebase accepts.
 */
export const ALLOWED_HOSTS: ReadonlySet<string> = new Set([
  // GitHub
  "api.github.com",
  "raw.githubusercontent.com",
  // Package registries
  "registry.npmjs.org",
  "pypi.org",
  "pub.dev",
  "central.sonatype.com",
  "search.maven.org",
  // Vulnerability + scorecard
  "api.osv.dev",
  "api.securityscorecards.dev",
  // Stack metadata
  "endoflife.date",
  // Research
  "api.semanticscholar.org",
  // Deploy verification
  "doi.org",
  "chromewebstore.google.com",
  // Anthropic admin
  "api.anthropic.com",
]);

/**
 * Hosts that must be rejected regardless of `allowAnyHost`: cloud-metadata
 * service IPs and loopback addresses. Every call that lets a user-controlled
 * URL through (e.g. deploy-URL liveness probes) still has these blocked.
 */
const FORBIDDEN_HOSTS: ReadonlySet<string> = new Set([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "::1",
  "169.254.169.254", // AWS/GCP/Azure instance metadata endpoint
  "metadata.google.internal",
]);

export class DisallowedFetchError extends Error {
  constructor(public readonly reason: string, public readonly url: string) {
    super(`fetchWithTimeout: ${reason} (url=${url})`);
    this.name = "DisallowedFetchError";
  }
}

export interface FetchOptions extends RequestInit {
  /**
   * Opt-in escape hatch for callers that legitimately fetch user-supplied
   * arbitrary URLs (deploy-URL liveness probes, etc.). Still enforces
   * https-only and the FORBIDDEN_HOSTS deny-list — only the ALLOWED_HOSTS
   * check is bypassed. Default false.
   */
  allowAnyHost?: boolean;
}

export function fetchWithTimeout(url: string, opts: FetchOptions = {}, ms = 5000) {
  const { allowAnyHost, ...fetchOpts } = opts;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return Promise.reject(new DisallowedFetchError("invalid URL", url));
  }
  if (parsed.protocol !== "https:") {
    return Promise.reject(
      new DisallowedFetchError(`non-https protocol ${parsed.protocol}`, url),
    );
  }
  if (FORBIDDEN_HOSTS.has(parsed.hostname)) {
    return Promise.reject(
      new DisallowedFetchError(`forbidden host (${parsed.hostname})`, url),
    );
  }
  if (!allowAnyHost && !ALLOWED_HOSTS.has(parsed.hostname)) {
    return Promise.reject(
      new DisallowedFetchError(`host not in allow-list (${parsed.hostname})`, url),
    );
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return fetch(url, { ...fetchOpts, signal: controller.signal }).finally(() => clearTimeout(timer));
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
