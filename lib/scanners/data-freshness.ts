import type { DataFreshnessStatus } from "../types";
import type { DataFreshnessConfig, DataCycle } from "../projects";
import { fetchWithTimeout, parseRepoSlug, githubHeaders } from "./version-utils";
import { runGuarded } from "./shared-breaker";
import { logger } from "../logger";

interface CommitInfo {
  sha: string;
  commit: {
    message: string;
    committer: { date: string } | null;
  };
}

export async function checkDataFreshness(
  repo: string,
  config: DataFreshnessConfig,
): Promise<DataFreshnessStatus | null> {
  const parsed = parseRepoSlug(repo);
  if (!parsed) return null;

  const { owner, name } = parsed;

  return runGuarded("data-freshness", repo, async () => {
    const headers = githubHeaders();

    const url =
      `https://api.github.com/repos/${owner}/${name}/commits` +
      `?path=${encodeURIComponent(config.watchPath)}&per_page=1`;

    const res = await fetchWithTimeout(url, { headers }, 8000);
    if (!res.ok) {
      logger.warn(`data-freshness: GitHub API ${res.status} for ${repo}`, { repo });
      return null;
    }

    const commits: CommitInfo[] = await res.json();

    const now = new Date();
    let lastUpdateDate: string | null = null;
    let lastUpdateMessage: string | null = null;
    let daysSinceUpdate: number | null = null;

    if (commits.length > 0) {
      const commit = commits[0];
      lastUpdateDate = commit.commit.committer?.date ?? null;
      lastUpdateMessage = commit.commit.message.split("\n")[0] ?? null;

      if (lastUpdateDate) {
        const diffMs = now.getTime() - new Date(lastUpdateDate).getTime();
        daysSinceUpdate = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      }
    }

    const nextExpected = lastUpdateDate
      ? computeNextExpected(new Date(lastUpdateDate), config.expectedCycle)
      : null;

    const deadlineDate = nextExpected
      ? new Date(nextExpected.getTime() + config.gracePeriodDays * 86_400_000)
      : null;

    const stale = deadlineDate ? now > deadlineDate : false;

    return {
      lastUpdateDate,
      lastUpdateMessage,
      daysSinceUpdate,
      expectedCycle: cycleName(config.expectedCycle),
      stale,
      nextExpectedDate: nextExpected?.toISOString() ?? null,
      lastChecked: now.toISOString(),
    };
  });
}

function computeNextExpected(lastUpdate: Date, cycle: DataCycle): Date {
  switch (cycle) {
    case "weekly-wed":
      return nextWeekday(lastUpdate, 3, 7);
    case "weekly-thu":
      return nextWeekday(lastUpdate, 4, 7);
    case "biweekly-wed":
      return nextWeekday(lastUpdate, 3, 14);
    case "monthly": {
      const next = new Date(lastUpdate);
      next.setMonth(next.getMonth() + 1);
      return next;
    }
  }
}

function nextWeekday(from: Date, targetDay: number, intervalDays: number): Date {
  const earliest = new Date(from.getTime() + intervalDays * 86_400_000);
  const diff = (targetDay - earliest.getUTCDay() + 7) % 7;
  const next = new Date(earliest.getTime() + diff * 86_400_000);
  return next;
}

function cycleName(cycle: DataCycle): string {
  switch (cycle) {
    case "weekly-wed": return "매주 수요일";
    case "weekly-thu": return "매주 목요일";
    case "biweekly-wed": return "격주 수요일";
    case "monthly": return "매월";
  }
}
