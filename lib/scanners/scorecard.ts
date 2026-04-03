import type { ScorecardResult, ScorecardCheck } from "../types";
import { fetchWithTimeout, parseRepoSlug } from "./version-utils";
import { logger } from "../logger";

interface ApiCheck {
  name: string;
  score: number;
  reason: string;
  details: string[] | null;
  documentation: { short: string; url: string };
}

interface ApiResponse {
  date: string;
  score: number;
  checks: ApiCheck[];
}

export async function checkScorecard(repo: string): Promise<ScorecardResult | null> {
  const parsed = parseRepoSlug(repo);
  if (!parsed) return null;
  const { owner, name } = parsed;

  try {
    const res = await fetchWithTimeout(
      `https://api.securityscorecards.dev/projects/github.com/${owner}/${name}`,
      { headers: { Accept: "application/json" } },
      10000,
    );

    if (res.status === 404) {
      // Repo not indexed by Scorecard — not an error
      logger.info(`scorecard: ${repo} not indexed`, { repo });
      return null;
    }

    if (!res.ok) {
      logger.warn(`scorecard: API ${res.status} for ${repo}`, { repo });
      return null;
    }

    const data: ApiResponse = await res.json();

    const checks: ScorecardCheck[] = data.checks.map((c) => ({
      name: c.name,
      score: c.score,
      reason: c.reason,
    }));

    return {
      score: data.score,
      checks,
      date: data.date,
      lastChecked: new Date().toISOString(),
    };
  } catch (err) {
    logger.error("scorecard: fetch failed", {
      repo,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}
