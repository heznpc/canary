import type { ActivityPulse } from "../types";
import { fetchWithTimeout, parseRepoSlug, githubHeaders } from "./version-utils";
import { logger } from "../logger";

interface ParticipationStats {
  all: number[];
  owner: number[];
}

function countFromLink(linkHeader: string | null): number | null {
  if (!linkHeader) return null;
  const match = linkHeader.match(/page=(\d+)>; rel="last"/);
  return match ? parseInt(match[1], 10) : null;
}

export async function checkActivity(repo: string): Promise<ActivityPulse | null> {
  const parsed = parseRepoSlug(repo);
  if (!parsed) return null;
  const { owner, name } = parsed;
  const h = githubHeaders();
  const base = `https://api.github.com/repos/${owner}/${name}`;

  try {
    const [participationRes, prsRes, repoRes, contribRes] = await Promise.all([
      fetchWithTimeout(`${base}/stats/participation`, { headers: h }, 10000),
      fetchWithTimeout(`${base}/pulls?state=open&per_page=1`, { headers: h }, 8000),
      fetchWithTimeout(base, { headers: h }, 8000),
      fetchWithTimeout(`${base}/contributors?per_page=1&anon=true`, { headers: h }, 8000),
    ]);

    let commitsLast4Weeks = 0;
    let weeklyCommitAvg = 0;
    if (participationRes.ok) {
      const stats: ParticipationStats = await participationRes.json();
      if (stats.all && stats.all.length >= 4) {
        commitsLast4Weeks = stats.all.slice(-4).reduce((a, b) => a + b, 0);
        weeklyCommitAvg = Math.round((stats.all.slice(-12).reduce((a, b) => a + b, 0) / 12) * 10) / 10;
      }
    }

    let openPRs = 0;
    if (prsRes.ok) {
      const fromLink = countFromLink(prsRes.headers.get("link"));
      if (fromLink !== null) {
        openPRs = fromLink;
      } else {
        const prs = await prsRes.json();
        openPRs = Array.isArray(prs) ? prs.length : 0;
      }
    }

    let openIssues = 0;
    if (repoRes.ok) {
      const repoData = await repoRes.json();
      openIssues = Math.max(0, (repoData.open_issues_count ?? 0) - openPRs);
    }

    let contributors = 0;
    if (contribRes.ok) {
      const fromLink = countFromLink(contribRes.headers.get("link"));
      if (fromLink !== null) {
        contributors = fromLink;
      } else {
        const data = await contribRes.json();
        contributors = Array.isArray(data) ? data.length : 0;
      }
    }

    return {
      commitsLast4Weeks,
      openPRs,
      openIssues,
      contributors,
      weeklyCommitAvg,
      lastChecked: new Date().toISOString(),
    };
  } catch (err) {
    logger.error("activity: scan failed", {
      repo, error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}
