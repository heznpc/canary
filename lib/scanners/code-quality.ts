import type { CodeQuality } from "../types";
import { fetchWithTimeout, parseRepoSlug, githubHeaders } from "./version-utils";
import { logger } from "../logger";

interface TreeEntry {
  path: string;
  type: "blob" | "tree";
  sha: string;
}

const TEST_CONFIGS = [
  "vitest.config.ts", "vitest.config.js", "vitest.config.mts",
  "jest.config.ts", "jest.config.js", "jest.config.mjs",
  "pytest.ini", "conftest.py",
  "__tests__", "tests", "test",
];

const LINT_CONFIGS = [
  ".eslintrc.js", ".eslintrc.json", ".eslintrc.yml", ".eslintrc.yaml", ".eslintrc.cjs",
  "eslint.config.js", "eslint.config.mjs", "eslint.config.ts",
  ".prettierrc", ".prettierrc.json", ".prettierrc.js", ".prettierrc.yml",
  "prettier.config.js", "prettier.config.mjs",
  "biome.json", "biome.jsonc",
  ".flake8", "ruff.toml", ".ruff.toml",
];

const TEST_FRAMEWORK_MAP: Record<string, string> = {
  "vitest.config.ts": "vitest", "vitest.config.js": "vitest", "vitest.config.mts": "vitest",
  "jest.config.ts": "jest", "jest.config.js": "jest", "jest.config.mjs": "jest",
  "pytest.ini": "pytest", "conftest.py": "pytest",
};

export async function checkCodeQuality(repo: string): Promise<CodeQuality | null> {
  const parsed = parseRepoSlug(repo);
  if (!parsed) return null;
  const { owner, name } = parsed;
  const h = githubHeaders();

  try {
    const repoRes = await fetchWithTimeout(
      `https://api.github.com/repos/${owner}/${name}`, { headers: h }, 8000,
    );
    if (!repoRes.ok) {
      logger.warn(`code-quality: repo info ${repoRes.status} for ${repo}`);
      return null;
    }
    const repoData = await repoRes.json();
    const defaultBranch: string = repoData.default_branch ?? "main";

    // Recursive tree — one API call gives us all file paths
    const treeRes = await fetchWithTimeout(
      `https://api.github.com/repos/${owner}/${name}/git/trees/${defaultBranch}?recursive=1`,
      { headers: h }, 8000,
    );
    if (!treeRes.ok) {
      logger.warn(`code-quality: tree ${treeRes.status} for ${repo}`);
      return null;
    }
    const tree: { tree: TreeEntry[] } = await treeRes.json();
    const allPaths = new Set(tree.tree.map((e) => e.path));
    const rootNames = new Set(tree.tree.filter((e) => !e.path.includes("/")).map((e) => e.path));

    const hasLicense = rootNames.has("LICENSE") || rootNames.has("LICENSE.md")
      || rootNames.has("LICENSE.txt") || !!repoData.license;
    const hasTypeCheck = rootNames.has("tsconfig.json");

    let hasTests = false;
    let testFramework: string | null = null;
    for (const cfg of TEST_CONFIGS) {
      if (rootNames.has(cfg)) {
        hasTests = true;
        testFramework = TEST_FRAMEWORK_MAP[cfg] ?? null;
        break;
      }
    }

    const hasLint = LINT_CONFIGS.some((cfg) => rootNames.has(cfg));
    const hasContributing = rootNames.has("CONTRIBUTING.md") || rootNames.has("CONTRIBUTING");
    const hasSecurityPolicy = rootNames.has("SECURITY.md") || rootNames.has("SECURITY");

    // Dependency bot — check tree paths directly (no extra API calls)
    let hasDependencyBot = false;
    let dependencyBotName: string | null = null;
    if (rootNames.has("renovate.json") || rootNames.has(".renovaterc") || rootNames.has(".renovaterc.json")) {
      hasDependencyBot = true;
      dependencyBotName = "renovate";
    } else if (allPaths.has(".github/dependabot.yml") || allPaths.has(".github/dependabot.yaml")) {
      hasDependencyBot = true;
      dependencyBotName = "dependabot";
    }

    // CI — check via tree paths
    let hasCI = false;
    const ciPlatforms: string[] = [];
    if (tree.tree.some((e) => e.path.startsWith(".github/workflows/") && e.type === "blob")) {
      hasCI = true;
      ciPlatforms.push("github-actions");
    }
    if (rootNames.has(".travis.yml")) { hasCI = true; ciPlatforms.push("travis"); }
    if (rootNames.has(".circleci")) { hasCI = true; ciPlatforms.push("circleci"); }
    if (rootNames.has("Jenkinsfile")) { hasCI = true; ciPlatforms.push("jenkins"); }
    if (rootNames.has(".gitlab-ci.yml")) { hasCI = true; ciPlatforms.push("gitlab-ci"); }

    let score = 0;
    if (hasCI) score += 20;
    if (hasTests) score += 20;
    if (hasLint) score += 15;
    if (hasTypeCheck) score += 15;
    if (hasLicense) score += 10;
    if (hasDependencyBot) score += 10;
    if (hasSecurityPolicy) score += 5;
    if (hasContributing) score += 5;

    return {
      hasCI, ciPlatforms, hasTests, testFramework,
      hasLint, hasTypeCheck, hasLicense,
      hasContributing, hasSecurityPolicy,
      hasDependencyBot, dependencyBotName,
      score,
      lastChecked: new Date().toISOString(),
    };
  } catch (err) {
    logger.error("code-quality: scan failed", {
      repo, error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}
