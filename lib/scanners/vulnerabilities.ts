import { fetchWithTimeout } from "./version-utils";
import { cacheGet, cacheSet } from "../cache";
import { logger } from "../logger";

/**
 * Vulnerability scanner — queries OSV.dev for advisories affecting specific
 * (package, version) pairs across multiple ecosystems. OSV is free, requires
 * no auth, and accepts batched queries.
 */

export type OsvEcosystem = "npm" | "PyPI" | "Pub" | "Maven";

export interface VulnQuery {
  name: string;
  version: string;
  ecosystem: OsvEcosystem;
}

interface OsvVuln {
  id: string;
  summary?: string;
  severity?: { type: string; score: string }[];
}

interface OsvBatchResponse {
  results?: { vulns?: OsvVuln[] }[];
}

const OSV_URL = "https://api.osv.dev/v1/querybatch";
const OSV_BATCH_LIMIT = 100;
const OSV_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6h

/**
 * Strip range operators from a version spec, leaving only the concrete
 * version. Returns null when the spec is a wildcard, SCM URL, or otherwise
 * has no comparable version.
 *
 *   "^1.2.3"      → "1.2.3"
 *   ">=2.0.0"     → "2.0.0"
 *   "1.0.0-beta1" → "1.0.0-beta1"
 *   "*"           → null
 */
export function extractConcreteVersion(spec: string): string | null {
  if (!spec) return null;
  const cleaned = spec.replace(/^[\^~>=<!]+\s*/, "").trim();
  if (!/^[0-9]/.test(cleaned)) return null;
  const match = cleaned.match(/^([0-9][0-9a-zA-Z._+-]*)/);
  return match ? match[1] : null;
}

export function extractNpmLockVersions(packageLockContent: string): Record<string, string> {
  const versions: Record<string, string> = {};
  try {
    const lock = JSON.parse(packageLockContent) as {
      packages?: Record<string, { version?: unknown }>;
      dependencies?: Record<string, { version?: unknown }>;
    };

    for (const [pkgPath, pkg] of Object.entries(lock.packages ?? {})) {
      if (!pkgPath.startsWith("node_modules/") || typeof pkg.version !== "string") continue;
      versions[pkgPath.slice("node_modules/".length)] = pkg.version;
    }

    for (const [name, dep] of Object.entries(lock.dependencies ?? {})) {
      if (typeof dep.version === "string" && !versions[name]) versions[name] = dep.version;
    }
  } catch {
    return {};
  }
  return versions;
}

export function buildVulnQueries(
  declared: Record<string, string>,
  ecosystem: OsvEcosystem,
  packageLockContent?: string,
): VulnQuery[] {
  const lockedVersions =
    ecosystem === "npm" && packageLockContent ? extractNpmLockVersions(packageLockContent) : {};
  const out: VulnQuery[] = [];
  for (const [name, spec] of Object.entries(declared)) {
    const version = lockedVersions[name] ?? extractConcreteVersion(spec);
    if (version) out.push({ name, version, ecosystem });
  }
  return out;
}

/**
 * Returns the number of vulnerabilities in the batch, or `null` if the batch
 * could not be scanned (HTTP error, timeout, network failure). Callers must
 * distinguish "zero vulns" from "scan failed" — silently treating a failed
 * scan as zero hides real security issues.
 */
async function fetchBatch(slice: VulnQuery[]): Promise<number | null> {
  try {
    const res = await fetchWithTimeout(
      OSV_URL,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          queries: slice.map((q) => ({
            package: { name: q.name, ecosystem: q.ecosystem },
            version: q.version,
          })),
        }),
      },
      10_000,
    );
    if (!res.ok) {
      logger.warn(`vulnerabilities: OSV ${res.status}`, { batchSize: slice.length });
      return null;
    }
    const data = (await res.json()) as OsvBatchResponse;
    let count = 0;
    for (const r of data.results ?? []) {
      count += (r.vulns ?? []).length;
    }
    return count;
  } catch (err) {
    logger.warn("vulnerabilities: OSV batch failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

function cacheKey(queries: VulnQuery[]): string {
  // Order-insensitive key so different dep-orderings share cache entries.
  const sorted = [...queries]
    .map((q) => `${q.ecosystem}:${q.name}@${q.version}`)
    .sort();
  return `vuln:${sorted.join("|")}`;
}

/**
 * Query OSV for the total number of advisories across the given package
 * versions. Returns `null` if any batch failed — the result would be a lower
 * bound, and reporting it as a concrete number would silently understate risk.
 * Batches run in parallel and successful results are cached for 6 hours.
 */
export async function countVulnerabilities(
  queries: VulnQuery[],
): Promise<number | null> {
  if (queries.length === 0) return 0;

  const key = cacheKey(queries);
  const cached = cacheGet<number>(key);
  if (cached !== null) return cached;

  const slices: VulnQuery[][] = [];
  for (let i = 0; i < queries.length; i += OSV_BATCH_LIMIT) {
    slices.push(queries.slice(i, i + OSV_BATCH_LIMIT));
  }

  const counts = await Promise.all(slices.map(fetchBatch));
  let total = 0;
  for (const c of counts) {
    if (c === null) return null;
    total += c;
  }
  cacheSet(key, total, OSV_CACHE_TTL_MS);
  return total;
}
