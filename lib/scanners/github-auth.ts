import { execFileSync } from "node:child_process";

export type GitHubTokenSource = "env" | "gh" | "none";

export interface GitHubAuth {
  configured: boolean;
  source: GitHubTokenSource;
  token?: string;
}

let cachedGhToken: string | null | undefined;

function envToken(): string | null {
  const token = process.env.GITHUB_TOKEN?.trim();
  return token ? token : null;
}

function ghToken(): string | null {
  if (cachedGhToken !== undefined) return cachedGhToken;

  try {
    const token = execFileSync("gh", ["auth", "token"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 2_000,
    }).trim();
    cachedGhToken = token || null;
  } catch {
    cachedGhToken = null;
  }

  return cachedGhToken;
}

export function resolveGitHubAuth(): GitHubAuth {
  const fromEnv = envToken();
  if (fromEnv) {
    return { configured: true, source: "env", token: fromEnv };
  }

  const fromGh = ghToken();
  if (fromGh) {
    return { configured: true, source: "gh", token: fromGh };
  }

  return { configured: false, source: "none" };
}

export function resetGitHubAuthCacheForTests(): void {
  cachedGhToken = undefined;
}
