import { Octokit } from "octokit";
import type { GitStatus, DependencyInfo, DependencyHealth, UpdateAction } from "../types";
import { compareVersions, batchCheckDeps, fetchWithTimeout, parseRepoSlug } from "./version-utils";
import { parsePythonManifest, checkPypiVersion } from "./deps-python";
import { parsePubspecYaml, checkPubVersion } from "./deps-flutter";
import { parseGradle, parsePomXml, checkMavenVersion } from "./deps-jvm";
import {
  buildVulnQueries,
  countVulnerabilities,
  extractConcreteVersion,
  type VulnQuery,
} from "./vulnerabilities";
import { logger } from "../logger";
import { runGuarded } from "./shared-breaker";
import { resolveGitHubAuth } from "./github-auth";

let _tokenWarned = false;
let _ghFallbackLogged = false;

function getOctokit() {
  const auth = resolveGitHubAuth();
  if (!auth.configured && !_tokenWarned) {
    _tokenWarned = true;
    logger.warn("No GitHub token found in GITHUB_TOKEN or `gh auth token` — GitHub API requests will be unauthenticated and heavily rate-limited.", { source: "canary" });
  }
  if (auth.source === "gh" && !_ghFallbackLogged) {
    _ghFallbackLogged = true;
    logger.info("Using GitHub token from `gh auth token` fallback.", { source: "canary" });
  }
  return new Octokit({ auth: auth.token });
}

function hasNumericStatus(err: unknown): err is { status: number } {
  return (
    typeof err === "object" &&
    err !== null &&
    "status" in err &&
    typeof err.status === "number"
  );
}

async function withRetry<T>(fn: () => Promise<T>, maxAttempts = 3): Promise<T> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      if (
        hasNumericStatus(err) &&
        err.status === 429 &&
        attempt < maxAttempts - 1
      ) {
        const delay = 1000 * 2 ** attempt;
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }
  throw new Error("withRetry: unreachable");
}

export async function getGitStatus(repo: string): Promise<GitStatus | null> {
  const parsed = parseRepoSlug(repo);
  if (!parsed) return null;

  return runGuarded("github-status", repo, async () => {
    const { owner, name } = parsed;
    const octokit = getOctokit();

    const { data: repoData } = await withRetry(() =>
      octokit.rest.repos.get({ owner, repo: name }),
    );
    const defaultBranch = repoData.default_branch;

    const { data: commits } = await withRetry(() =>
      octokit.rest.repos.listCommits({
        owner,
        repo: name,
        sha: defaultBranch,
        per_page: 1,
      }),
    );

    const lastCommit = commits[0];

    return {
      branch: defaultBranch,
      lastCommitDate: lastCommit?.commit.committer?.date ?? null,
      lastCommitMessage: lastCommit?.commit.message ?? null,
    };
  });
}

export interface DepScanResult {
  health: DependencyHealth;
  packageJson?: Record<string, unknown>;
}

export async function getDependencyHealth(repo: string): Promise<DepScanResult | null> {
  const parsed = parseRepoSlug(repo);
  if (!parsed) return null;

  return runGuarded("github-deps", repo, async () => {
    const { owner, name } = parsed;
    const rawUrl = (file: string) =>
      `https://raw.githubusercontent.com/${owner}/${name}/HEAD/${file}`;

    const manifests = [
      { file: "package.json", ecosystem: "node" as const, needBody: true },
      { file: "pubspec.yaml", ecosystem: "flutter" as const, needBody: true },
      { file: "pyproject.toml", ecosystem: "python" as const, needBody: true },
      { file: "requirements.txt", ecosystem: "python" as const, needBody: true },
      { file: "build.gradle", ecosystem: "gradle" as const, needBody: true },
      { file: "build.gradle.kts", ecosystem: "gradle" as const, needBody: true },
      { file: "pom.xml", ecosystem: "maven" as const, needBody: true },
      { file: "pnpm-lock.yaml", ecosystem: "node" as const, needBody: false },
      { file: "yarn.lock", ecosystem: "node" as const, needBody: false },
      { file: "package-lock.json", ecosystem: "node" as const, needBody: true },
    ];

    const checks = await Promise.all(
      manifests.map(async ({ file, ecosystem, needBody }) => {
        try {
          const res = await fetchWithTimeout(rawUrl(file), {}, 3000);
          if (!res.ok) return null;
          const content = needBody ? await res.text() : "";
          return { file, ecosystem, content, needBody };
        } catch {
          return null;
        }
      }),
    );

    const found = checks.filter(
      (c): c is NonNullable<typeof c> => c !== null,
    );
    if (found.length === 0) return null;

    const nodeManifest = found.find((f) => f.file === "package.json");
    if (nodeManifest) {
      const lockFiles = found.filter((f) => f.ecosystem === "node" && f.file !== "package.json");
      const pm = detectPackageManagerFromLocks(lockFiles.map((f) => f.file));
      const packageJson = JSON.parse(nodeManifest.content) as Record<string, unknown>;
      const packageLock = lockFiles.find((f) => f.file === "package-lock.json")?.content;
      const health = await scanNodeDeps(packageJson, pm, packageLock);
      return { health, packageJson };
    }

    const flutterManifest = found.find((f) => f.ecosystem === "flutter");
    if (flutterManifest) {
      const health = await scanFlutterDeps(flutterManifest.content);
      return health ? { health } : null;
    }

    const pythonManifest = found.find((f) => f.ecosystem === "python");
    if (pythonManifest) {
      const health = await scanPythonDeps(pythonManifest.content, pythonManifest.file);
      return health ? { health } : null;
    }

    const gradleManifest = found.find((f) => f.ecosystem === "gradle");
    if (gradleManifest) {
      const health = await scanJvmDeps(gradleManifest.content, "gradle");
      return health ? { health } : null;
    }

    const mavenManifest = found.find((f) => f.ecosystem === "maven");
    if (mavenManifest) {
      const health = await scanJvmDeps(mavenManifest.content, "maven");
      return health ? { health } : null;
    }

    return null;
  });
}

async function scanNodeDeps(
  packageJson: Record<string, unknown>,
  packageManager: DependencyHealth["packageManager"],
  packageLockContent?: string,
): Promise<DependencyHealth> {
  const allDeps: Record<string, string> = {
    ...(packageJson.dependencies as Record<string, string> | undefined),
    ...(packageJson.devDependencies as Record<string, string> | undefined),
  };

  const entries = Object.entries(allDeps);
  const [result, vulnerabilities] = await Promise.all([
    batchCheckDeps(entries, ([depName, currentVersion]) => {
      const isKey = isKeyDependency(depName);
      return checkNpmVersion(depName, currentVersion, isKey);
    }),
    countVulnerabilities(buildVulnQueries(allDeps, "npm", packageLockContent)),
  ]);

  return { ...result, vulnerabilities, packageManager };
}

async function scanPythonDeps(
  content: string,
  filename: string,
): Promise<DependencyHealth | null> {
  const parsed = parsePythonManifest(content, filename);
  if (!parsed) return null;

  const entries = Object.entries(parsed.deps);
  const [result, vulnerabilities] = await Promise.all([
    batchCheckDeps(entries, ([name, ver]) =>
      checkPypiVersion(name, ver, boundFetch),
    ),
    countVulnerabilities(buildVulnQueries(parsed.deps, "PyPI")),
  ]);

  return { ...result, vulnerabilities, packageManager: parsed.packageManager };
}

async function scanFlutterDeps(
  content: string,
): Promise<DependencyHealth | null> {
  const parsed = parsePubspecYaml(content);
  if (!parsed) return null;

  const entries = Object.entries(parsed);
  const [result, vulnerabilities] = await Promise.all([
    batchCheckDeps(entries, ([name, ver]) =>
      checkPubVersion(name, ver, boundFetch),
    ),
    countVulnerabilities(buildVulnQueries(parsed, "Pub")),
  ]);

  return { ...result, vulnerabilities, packageManager: "flutter" };
}

async function scanJvmDeps(
  content: string,
  type: "gradle" | "maven",
): Promise<DependencyHealth | null> {
  const jvmDeps =
    type === "gradle" ? parseGradle(content) : parsePomXml(content);
  if (jvmDeps.length === 0) return null;

  const vulnQueries: VulnQuery[] = [];
  for (const d of jvmDeps) {
    const v = extractConcreteVersion(d.version);
    if (v) {
      vulnQueries.push({ name: `${d.group}:${d.artifact}`, version: v, ecosystem: "Maven" });
    }
  }

  const [result, vulnerabilities] = await Promise.all([
    batchCheckDeps(jvmDeps, (d) => checkMavenVersion(d, boundFetch), 6),
    countVulnerabilities(vulnQueries),
  ]);

  return { ...result, vulnerabilities, packageManager: type };
}

function boundFetch(url: string): Promise<Response> {
  return fetchWithTimeout(url, {}, 5000);
}

export function generateUpdateActions(
  deps: DependencyHealth
): UpdateAction[] {
  const actions: UpdateAction[] = [];
  const pm = deps.packageManager === "unknown" ? "npm" : deps.packageManager;

  type OutdatedSeverity = "major" | "minor" | "patch";
  const outdated = deps.deps.filter(
    (d): d is DependencyInfo & { type: OutdatedSeverity } => d.type !== "up-to-date",
  );

  for (const dep of outdated) {
    const command = generateCommand(pm, dep);
    actions.push({
      name: dep.name,
      current: dep.current,
      latest: dep.latest,
      severity: dep.type,
      command,
      githubRepo: dep.githubRepo,
      changelogUrl: dep.githubRepo
        ? `https://github.com/${dep.githubRepo}/releases`
        : registryUrl(pm, dep.name),
    });
  }

  return actions;
}

function registryUrl(pm: DependencyHealth["packageManager"], name: string): string {
  switch (pm) {
    case "pip": case "uv": case "poetry":
      return `https://pypi.org/project/${name}/`;
    case "flutter":
      return `https://pub.dev/packages/${name}/changelog`;
    case "gradle": case "maven": {
      const [g, a] = name.split(":");
      return `https://central.sonatype.com/artifact/${g}/${a}`;
    }
    default:
      return `https://www.npmjs.com/package/${name}?activeTab=versions`;
  }
}

function detectPackageManagerFromLocks(
  lockFiles: string[],
): DependencyHealth["packageManager"] {
  for (const file of lockFiles) {
    if (file === "pnpm-lock.yaml") return "pnpm";
    if (file === "yarn.lock") return "yarn";
    if (file === "package-lock.json") return "npm";
  }
  return "unknown";
}

function isKeyDependency(name: string): boolean {
  const keyPatterns = [
    "next", "react", "react-dom", "vue", "nuxt", "svelte",
    "typescript", "tailwindcss", "@angular/core",
    "express", "fastify", "hono",
    "prisma", "@prisma/client",
    "@supabase/supabase-js", "firebase",
    "zod", "drizzle-orm", "@trpc/server",
  ];
  return keyPatterns.includes(name);
}

async function checkNpmVersion(
  packageName: string,
  currentSpec: string,
  isKey: boolean
): Promise<DependencyInfo | null> {
  try {
    const res = await fetchWithTimeout(`https://registry.npmjs.org/${packageName}/latest`);
    if (!res.ok) return null;

    const data = await res.json();
    const latest = data.version as string;
    const current = currentSpec.replace(/^[\^~>=<]*/g, "");
    const type = compareVersions(current, latest);

    // up-to-date이고 key dep이 아니면 스킵
    if (type === "up-to-date" && !isKey) return null;

    // key dep이면 GitHub repo도 추출
    let githubRepo: string | undefined;
    if (isKey && type !== "up-to-date") {
      const repoUrl: string | undefined =
        data.repository?.url ?? data.repository;
      if (repoUrl) {
        const match = repoUrl.match(/github\.com[/:]([^/]+\/[^/.]+)/);
        if (match) githubRepo = match[1];
      }
    }

    return { name: packageName, current, latest, type, githubRepo, isKey };
  } catch {
    return null;
  }
}

function generateCommand(
  pm: DependencyHealth["packageManager"],
  dep: DependencyInfo,
): string {
  const isMajor = dep.type === "major";

  switch (pm) {
    // ── Node ──
    case "pnpm":
      return isMajor
        ? `pnpm add ${dep.name}@${dep.latest}`
        : `pnpm update ${dep.name}`;
    case "yarn":
      return isMajor
        ? `yarn add ${dep.name}@${dep.latest}`
        : `yarn upgrade ${dep.name}`;
    case "npm":
      return isMajor
        ? `npm install ${dep.name}@${dep.latest}`
        : `npm update ${dep.name}`;

    // ── Python ──
    case "uv":
      return isMajor
        ? `uv add "${dep.name}>=${dep.latest}"`
        : `uv lock --upgrade-package ${dep.name}`;
    case "poetry":
      return isMajor
        ? `poetry add ${dep.name}@${dep.latest}`
        : `poetry update ${dep.name}`;
    case "pip":
      return `pip install --upgrade ${dep.name}==${dep.latest}`;

    // ── Flutter ──
    case "flutter":
      return isMajor
        ? `# pubspec.yaml에서 ${dep.name}: ^${dep.latest} 로 수정 후\nflutter pub get`
        : `flutter pub upgrade ${dep.name}`;

    // ── JVM ──
    case "gradle":
      return `# build.gradle에서 ${dep.name} 버전을 ${dep.latest}로 수정`;
    case "maven":
      return `# pom.xml에서 ${dep.name} 버전을 ${dep.latest}로 수정`;

    default:
      return `# ${dep.name}을 ${dep.latest}로 업데이트`;
  }
}
