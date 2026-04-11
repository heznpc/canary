import type { StackVersion } from "../types";
import type { StackType } from "../projects";
import { fetchWithTimeout, parseRepoSlug } from "./version-utils";
import { cacheGet, cacheSet } from "../cache";
import { logger } from "../logger";

interface StackMeta {
  name: string;
  latestVersion: string;
  eolVersions: string[]; // Major versions that are EOL
  registryPackage?: string; // npm package name to check
}

/** Static fallback used when endoflife.date is unreachable or unindexed. */
export const STACK_META: Record<string, StackMeta> = {
  nextjs: {
    name: "Next.js",
    latestVersion: "16",
    eolVersions: ["12", "13"],
    registryPackage: "next",
  },
  react: {
    name: "React",
    latestVersion: "19",
    eolVersions: ["16", "17"],
    registryPackage: "react",
  },
  flutter: {
    name: "Flutter",
    latestVersion: "3",
    eolVersions: ["1", "2"],
  },
  "spring-boot": {
    name: "Spring Boot",
    latestVersion: "3",
    eolVersions: ["2"],
  },
  python: {
    name: "Python",
    latestVersion: "3.13",
    eolVersions: ["3.8", "3.9"],
  },
  typescript: {
    name: "TypeScript",
    latestVersion: "5.8",
    eolVersions: ["4"],
    registryPackage: "typescript",
  },
  "chrome-extension": {
    name: "Chrome Extension (Manifest V3)",
    latestVersion: "V3",
    eolVersions: ["V2"],
  },
  node: {
    name: "Node.js",
    latestVersion: "22",
    eolVersions: ["16", "18"],
  },
  latex: {
    name: "LaTeX",
    latestVersion: "N/A",
    eolVersions: [],
  },
  "vanilla-js": {
    name: "Vanilla JS",
    latestVersion: "N/A",
    eolVersions: [],
  },
};

/**
 * endoflife.date product slugs for each stack we can dynamically resolve.
 * Stacks not in this map keep using the static fallback in STACK_META.
 */
const ENDOFLIFE_PRODUCT: Partial<Record<StackType, string>> = {
  nextjs: "nextjs",
  react: "react",
  python: "python",
  typescript: "typescript",
  node: "nodejs",
  "spring-boot": "springboot",
  flutter: "flutter",
};

interface EndOfLifeCycle {
  cycle: string;
  releaseDate?: string;
  eol?: string | boolean;
  latest?: string;
  lts?: boolean | string;
}

interface ResolvedMeta {
  latestVersion: string;
  eolVersions: string[];
}

const ENDOFLIFE_TTL_MS = 24 * 60 * 60 * 1000; // 1 day

export function isCycleEol(eol: string | boolean | undefined, now: number): boolean {
  if (eol === true) return true;
  if (!eol) return false;
  if (typeof eol === "string") {
    const t = Date.parse(eol);
    return Number.isFinite(t) && t < now;
  }
  return false;
}

async function fetchEndOfLifeMeta(product: string): Promise<ResolvedMeta | null> {
  const cacheKey = `endoflife:${product}`;
  const cached = cacheGet<ResolvedMeta>(cacheKey);
  if (cached) return cached;

  try {
    const res = await fetchWithTimeout(
      `https://endoflife.date/api/${product}.json`,
      {},
      8000,
    );
    if (!res.ok) return null;
    const cycles = (await res.json()) as EndOfLifeCycle[];
    if (!Array.isArray(cycles) || cycles.length === 0) return null;

    const now = Date.now();
    // The first cycle is the newest active major. Skip if it's already EOL
    // (rare — endoflife.date keeps unreleased futures at the top).
    const newest = cycles.find((c) => !isCycleEol(c.eol, now)) ?? cycles[0];
    const latestVersion = newest.cycle;

    const eolVersions = cycles
      .filter((c) => isCycleEol(c.eol, now))
      .map((c) => c.cycle);

    const result: ResolvedMeta = { latestVersion, eolVersions };
    cacheSet(cacheKey, result, ENDOFLIFE_TTL_MS);
    return result;
  } catch (err) {
    logger.warn("stack: endoflife.date fetch failed", {
      product,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

async function resolveMeta(type: StackType): Promise<StackMeta | null> {
  const fallback = STACK_META[type];
  if (!fallback) return null;

  const product = ENDOFLIFE_PRODUCT[type];
  if (!product) return fallback;

  const dynamic = await fetchEndOfLifeMeta(product);
  if (!dynamic) return fallback;

  // Trust the dynamic result when present, including an empty EOL list
  // (it means endoflife.date currently has no cycles flagged EOL).
  return {
    name: fallback.name,
    latestVersion: dynamic.latestVersion,
    eolVersions: dynamic.eolVersions,
    registryPackage: fallback.registryPackage,
  };
}

export async function analyzeStack(
  stackTypes: StackType[],
  repo?: string,
  packageJson?: Record<string, unknown> | null,
): Promise<StackVersion[]> {
  const results = await Promise.all(
    stackTypes.map((type) => analyzeOne(type, repo, packageJson)),
  );
  return results.filter((r): r is StackVersion => r !== null);
}

async function analyzeOne(
  type: StackType,
  repo: string | undefined,
  packageJson: Record<string, unknown> | null | undefined,
): Promise<StackVersion | null> {
  const meta = await resolveMeta(type);
  if (!meta) return null;

  let currentVersion: string | null = null;
  if (meta.registryPackage) {
    currentVersion = packageJson
      ? extractVersionFromPkg(packageJson, meta.registryPackage)
      : repo
        ? await detectVersionFromRepo(repo, meta.registryPackage)
        : null;
  }

  const isEol =
    currentVersion !== null &&
    meta.eolVersions.some((eol) => currentVersion!.startsWith(eol));

  const releasesBehind = currentVersion
    ? estimateReleasesBehind(currentVersion, meta.latestVersion)
    : 0;

  return {
    name: meta.name,
    current: currentVersion,
    latest: meta.latestVersion,
    eol: isEol,
    releasesBehind,
  };
}

export function extractVersionFromPkg(
  pkg: Record<string, unknown>,
  packageName: string,
): string | null {
  const deps = pkg.dependencies as Record<string, string> | undefined;
  const devDeps = pkg.devDependencies as Record<string, string> | undefined;
  const version = deps?.[packageName] ?? devDeps?.[packageName];
  if (!version) return null;
  return version.replace(/^[\^~>=<]*/g, "");
}

async function detectVersionFromRepo(
  repo: string,
  packageName: string
): Promise<string | null> {
  try {
    const parsed = parseRepoSlug(repo);
    if (!parsed) return null;
    const res = await fetchWithTimeout(
      `https://raw.githubusercontent.com/${parsed.owner}/${parsed.name}/HEAD/package.json`
    );
    if (!res.ok) return null;
    const pkg = (await res.json()) as Record<string, unknown>;
    return extractVersionFromPkg(pkg, packageName);
  } catch {
    return null;
  }
}

export function estimateReleasesBehind(current: string, latest: string): number {
  const curMajor = parseInt(current.split(".")[0], 10);
  const latMajor = parseInt(latest.split(".")[0], 10);

  if (isNaN(curMajor) || isNaN(latMajor)) return 0;
  return Math.max(0, latMajor - curMajor);
}
