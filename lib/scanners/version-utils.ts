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
 *
 * IPv6 entries are stored WITHOUT brackets here; the lookup helper
 * `isForbiddenHost` strips brackets from `URL.hostname` before matching
 * (otherwise `https://[::1]/` parses to hostname `[::1]` and bypasses the
 * literal `::1` entry — that bug was the 2026-05-29 review's finding 3).
 */
const FORBIDDEN_LITERAL_HOSTS: ReadonlySet<string> = new Set([
  "localhost",
  "0", // resolves to 0.0.0.0 on Linux
  "0.0.0.0",
  "127.0.0.1",
  "::",
  "::1",
  // AWS / GCP / Azure instance metadata service (`IMDSv1` style address).
  "169.254.169.254",
  // GCP / DigitalOcean alias.
  "metadata.google.internal",
  // Alibaba Cloud ECS metadata service.
  "100.100.100.200",
  // Oracle Cloud Infrastructure metadata service.
  "192.0.0.192",
  // Azure IMDS hostname (the IP 169.254.169.254 is already covered, but the
  // explicit form is also documented in their SDKs).
  "metadata.azure.com",
]);

function stripIPv6Brackets(hostname: string): string {
  if (hostname.startsWith("[") && hostname.endsWith("]")) {
    return hostname.slice(1, -1);
  }
  return hostname;
}

function isInIPv4PrivateRange(host: string): boolean {
  // Accept dotted-quad only; URL.hostname for a numeric host like
  // "https://0/" returns "0" (not 0.0.0.0), which the LITERAL set covers.
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  if (a > 255 || b > 255 || Number(m[3]) > 255 || Number(m[4]) > 255) return false;
  // 10.0.0.0/8
  if (a === 10) return true;
  // 172.16.0.0/12
  if (a === 172 && b >= 16 && b <= 31) return true;
  // 192.168.0.0/16
  if (a === 192 && b === 168) return true;
  // 169.254.0.0/16 (link-local; covers cloud metadata + APIPA)
  if (a === 169 && b === 254) return true;
  // 127.0.0.0/8 (loopback range, broader than literal 127.0.0.1)
  if (a === 127) return true;
  // 0.0.0.0/8
  if (a === 0) return true;
  // 100.64.0.0/10 (CGNAT) — over-broad for canary's threat model, omitted.
  return false;
}

function isInIPv6PrivateRange(host: string): boolean {
  // host arrives without brackets here. Normalize to lowercase.
  const h = host.toLowerCase();
  // fc00::/7 — unique local addresses (RFC 4193)
  if (/^f[cd][0-9a-f]{2}:/.test(h)) return true;
  // fe80::/10 — link-local
  if (/^fe[89ab][0-9a-f]:/.test(h)) return true;
  // ::ffff:a.b.c.d (IPv4-mapped) — Node URL parses these as ::ffff:wxyz
  // hex form (e.g. ::ffff:7f00:1 for 127.0.0.1). Match both forms.
  if (/^::ffff:/.test(h)) {
    // Hex-form IPv4-mapped IPv6, e.g. ::ffff:7f00:1
    const hexMatch = h.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
    if (hexMatch) {
      const high = parseInt(hexMatch[1], 16);
      const low = parseInt(hexMatch[2], 16);
      const a = (high >> 8) & 0xff;
      const b = high & 0xff;
      const c = (low >> 8) & 0xff;
      const d = low & 0xff;
      return isInIPv4PrivateRange(`${a}.${b}.${c}.${d}`);
    }
    // Dotted-quad-tail form
    const dotMatch = h.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
    if (dotMatch) return isInIPv4PrivateRange(dotMatch[1]);
  }
  return false;
}

export function isForbiddenHost(hostname: string): boolean {
  const stripped = stripIPv6Brackets(hostname).toLowerCase();
  if (FORBIDDEN_LITERAL_HOSTS.has(stripped)) return true;
  if (isInIPv4PrivateRange(stripped)) return true;
  if (isInIPv6PrivateRange(stripped)) return true;
  return false;
}

export class DisallowedFetchError extends Error {
  constructor(public readonly reason: string, public readonly url: string) {
    super(`fetchWithTimeout: ${reason} (url=${url})`);
    this.name = "DisallowedFetchError";
  }
  // Default Error.toJSON omits non-enumerable `name`/`message`; structured
  // log sinks that JSON-serialize the error would otherwise drop the type
  // marker and the human-readable message, leaving only `reason`+`url`.
  toJSON() {
    return {
      name: this.name,
      message: this.message,
      reason: this.reason,
      url: this.url,
    };
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
  /**
   * Maximum number of HTTP 3xx redirects to follow. Each hop's destination
   * URL is re-validated against the same policy as the initial URL
   * (protocol, FORBIDDEN_HOSTS, ALLOWED_HOSTS when applicable). Default 5,
   * matching the Node/Chrome convention. Set to 0 to disable redirect
   * following entirely (the response object's `redirected` field will
   * still indicate the server's intent).
   */
  maxRedirects?: number;
}

export function fetchWithTimeout(url: string, opts: FetchOptions = {}, ms = 5000) {
  const { allowAnyHost, maxRedirects = 5, ...fetchOpts } = opts;
  return fetchWithRedirectChecking(url, fetchOpts, ms, allowAnyHost ?? false, maxRedirects);
}

async function fetchWithRedirectChecking(
  url: string,
  fetchOpts: RequestInit,
  ms: number,
  allowAnyHost: boolean,
  remainingRedirects: number,
): Promise<Response> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new DisallowedFetchError("invalid URL", url);
  }
  if (parsed.protocol !== "https:") {
    throw new DisallowedFetchError(`non-https protocol ${parsed.protocol}`, url);
  }
  if (isForbiddenHost(parsed.hostname)) {
    throw new DisallowedFetchError(`forbidden host (${parsed.hostname})`, url);
  }
  if (!allowAnyHost && !ALLOWED_HOSTS.has(parsed.hostname)) {
    throw new DisallowedFetchError(`host not in allow-list (${parsed.hostname})`, url);
  }

  const controller = new AbortController();
  // Honor a caller-supplied AbortSignal if present: aborting either the
  // caller's signal or the timeout should abort the underlying fetch.
  if (fetchOpts.signal) {
    if (fetchOpts.signal.aborted) controller.abort(fetchOpts.signal.reason);
    else fetchOpts.signal.addEventListener("abort", () => controller.abort(fetchOpts.signal!.reason));
  }
  const timer = setTimeout(() => controller.abort(new Error("fetch timeout")), ms);
  try {
    // Use `redirect: "manual"` so we can re-validate the redirect target's
    // host against the same policy. Pre-2026-05-29 the wrapper used the
    // default `redirect: "follow"`, which silently let any allow-listed
    // host 30x to an internal address — bypassing both ALLOWED_HOSTS and
    // FORBIDDEN_HOSTS on the redirect target. Review finding 4.
    const res = await fetch(url, { ...fetchOpts, redirect: "manual", signal: controller.signal });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      if (remainingRedirects <= 0) {
        throw new DisallowedFetchError(`too many redirects following ${url}`, url);
      }
      const location = res.headers.get("location")!;
      // Resolve relative redirects against the request URL.
      const nextUrl = new URL(location, url).toString();
      // Drain the redirect response body to free the connection.
      await res.arrayBuffer().catch(() => undefined);
      return fetchWithRedirectChecking(nextUrl, fetchOpts, ms, allowAnyHost, remainingRedirects - 1);
    }
    return res;
  } finally {
    clearTimeout(timer);
  }
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
