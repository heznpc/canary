import type { StackVersion } from "../types";
import type { StackType } from "../projects";

interface StackMeta {
  name: string;
  latestVersion: string;
  eolVersions: string[]; // Major versions that are EOL
  registryPackage?: string; // npm package name to check
}

const STACK_META: Record<string, StackMeta> = {
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

export async function analyzeStack(
  stackTypes: StackType[],
  repo?: string
): Promise<StackVersion[]> {
  const results: StackVersion[] = [];

  for (const type of stackTypes) {
    const meta = STACK_META[type];
    if (!meta) continue;

    let currentVersion: string | null = null;

    // Try to detect current version from npm registry if repo has package.json
    if (meta.registryPackage && repo) {
      currentVersion = await detectVersionFromRepo(repo, meta.registryPackage);
    }

    const isEol =
      currentVersion !== null &&
      meta.eolVersions.some((eol) => currentVersion!.startsWith(eol));

    const releasesBehind = currentVersion
      ? estimateReleasesBehind(currentVersion, meta.latestVersion)
      : 0;

    results.push({
      name: meta.name,
      current: currentVersion,
      latest: meta.latestVersion,
      eol: isEol,
      releasesBehind,
    });
  }

  return results;
}

function fetchWithTimeout(url: string, ms = 5000) {
  return Promise.race([
    fetch(url),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms)),
  ]);
}

async function detectVersionFromRepo(
  repo: string,
  packageName: string
): Promise<string | null> {
  try {
    const [owner, name] = repo.split("/");
    const res = await fetchWithTimeout(
      `https://raw.githubusercontent.com/${owner}/${name}/HEAD/package.json`
    );
    if (!res.ok) return null;

    const pkg = await res.json();
    const version =
      pkg.dependencies?.[packageName] || pkg.devDependencies?.[packageName];
    if (!version) return null;

    return version.replace(/^[\^~>=<]*/g, "");
  } catch {
    return null;
  }
}

function estimateReleasesBehind(current: string, latest: string): number {
  const curMajor = parseInt(current.split(".")[0], 10);
  const latMajor = parseInt(latest.split(".")[0], 10);

  if (isNaN(curMajor) || isNaN(latMajor)) return 0;
  return Math.max(0, latMajor - curMajor);
}
