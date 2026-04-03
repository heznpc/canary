import type { CodeQuality } from "../types";
import { fetchWithTimeout, parseRepoSlug } from "./version-utils";
import { logger } from "../logger";

interface TreeEntry {
  path: string;
  type: "blob" | "tree";
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

function headers(): HeadersInit {
  const h: HeadersInit = { Accept: "application/vnd.github+json" };
  if (process.env.GITHUB_TOKEN) h.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  return h;
}

export async function checkCodeQuality(repo: string): Promise<CodeQuality | null> {
  const parsed = parseRepoSlug(repo);
  if (!parsed) return null;
  const { owner, name } = parsed;
  const h = headers();

  try {
    // Fetch repo info + root tree in parallel
    const [repoRes, treeRes] = await Promise.all([
      fetchWithTimeout(`https://api.github.com/repos/${owner}/${name}`, { headers: h }, 8000),
      // We need default_branch first for tree, but most repos use main/master
      // Fetch repo info first, then tree — do repo info first
      Promise.resolve(null), // placeholder
    ]);

    if (!repoRes.ok) {
      logger.warn(`code-quality: repo info ${repoRes.status} for ${repo}`);
      return null;
    }
    const repoData = await repoRes.json();
    const defaultBranch: string = repoData.default_branch ?? "main";

    // Now fetch root tree
    const rootTreeRes = await fetchWithTimeout(
      `https://api.github.com/repos/${owner}/${name}/git/trees/${defaultBranch}`,
      { headers: h },
      8000,
    );
    if (!rootTreeRes.ok) {
      logger.warn(`code-quality: tree ${rootTreeRes.status} for ${repo}`);
      return null;
    }
    const rootTree: { tree: TreeEntry[] } = await rootTreeRes.json();
    const rootNames = new Set(rootTree.tree.map((e) => e.path));

    // License
    const hasLicense = rootNames.has("LICENSE") || rootNames.has("LICENSE.md")
      || rootNames.has("LICENSE.txt") || !!repoData.license;

    // TypeScript
    const hasTypeCheck = rootNames.has("tsconfig.json");

    // Tests
    let hasTests = false;
    let testFramework: string | null = null;
    for (const cfg of TEST_CONFIGS) {
      if (rootNames.has(cfg)) {
        hasTests = true;
        testFramework = TEST_FRAMEWORK_MAP[cfg] ?? null;
        break;
      }
    }

    // Lint
    const hasLint = LINT_CONFIGS.some((cfg) => rootNames.has(cfg));

    // Contributing & Security
    const hasContributing = rootNames.has("CONTRIBUTING.md") || rootNames.has("CONTRIBUTING");
    const hasSecurityPolicy = rootNames.has("SECURITY.md") || rootNames.has("SECURITY");

    // CI — check .github/workflows
    let hasCI = false;
    const ciPlatforms: string[] = [];

    if (rootNames.has(".github")) {
      const wfRes = await fetchWithTimeout(
        `https://api.github.com/repos/${owner}/${name}/contents/.github/workflows`,
        { headers: h },
        8000,
      );
      if (wfRes.ok) {
        const workflows = await wfRes.json();
        if (Array.isArray(workflows) && workflows.length > 0) {
          hasCI = true;
          ciPlatforms.push("github-actions");
        }
      }
    }

    // Other CI platforms
    if (rootNames.has(".travis.yml")) { hasCI = true; ciPlatforms.push("travis"); }
    if (rootNames.has(".circleci")) { hasCI = true; ciPlatforms.push("circleci"); }
    if (rootNames.has("Jenkinsfile")) { hasCI = true; ciPlatforms.push("jenkins"); }
    if (rootNames.has(".gitlab-ci.yml")) { hasCI = true; ciPlatforms.push("gitlab-ci"); }

    // Quality sub-score (0-100)
    let score = 0;
    if (hasCI) score += 25;
    if (hasTests) score += 25;
    if (hasLint) score += 20;
    if (hasTypeCheck) score += 15;
    if (hasLicense) score += 10;
    if (hasSecurityPolicy) score += 5;

    return {
      hasCI, ciPlatforms, hasTests, testFramework,
      hasLint, hasTypeCheck, hasLicense,
      hasContributing, hasSecurityPolicy,
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
