import type { ActivityPulse } from "../types";
import { fetchWithTimeout, parseRepoSlug } from "./version-utils";
import { logger } from "../logger";

interface ParticipationStats {
  all: number[];   // 52 weeks of total commit counts
  owner: number[]; // 52 weeks of owner commit counts
}

function headers(): HeadersInit {
  const h: HeadersInit = { Accept: "application/vnd.github+json" };
  if (process.env.GITHUB_TOKEN) h.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  return h;
}

export async function checkActivity(repo: string): Promise<ActivityPulse | null> {
  const parsed = parseRepoSlug(repo);
  if (!parsed) return null;
  const { owner, name } = parsed;
  const h = headers();

  try {
    // Parallel: participation stats + open PRs + repo info
    const [participationRes, prsRes, repoRes] = await Promise.all([
      fetchWithTimeout(
        `https://api.github.com/repos/${owner}/${name}/stats/participation`,
        { headers: h }, 10000,
      ),
      fetchWithTimeout(
        `https://api.github.com/repos/${owner}/${name}/pulls?state=open&per_page=100`,
        { headers: h }, 8000,
      ),
      fetchWithTimeout(
        `https://api.github.com/repos/${owner}/${name}`,
        { headers: h }, 8000,
      ),
    ]);

    // Participation stats — weekly commits for last year
    let commitsLast4Weeks = 0;
    let weeklyCommitAvg = 0;

    if (participationRes.ok) {
      const stats: ParticipationStats = await participationRes.json();
      if (stats.all && stats.all.length >= 4) {
        const last4 = stats.all.slice(-4);
        commitsLast4Weeks = last4.reduce((a, b) => a + b, 0);
        const last12 = stats.all.slice(-12);
        weeklyCommitAvg = Math.round((last12.reduce((a, b) => a + b, 0) / 12) * 10) / 10;
      }
    }

    // Open PRs
    let openPRs = 0;
    if (prsRes.ok) {
      const prs = await prsRes.json();
      openPRs = Array.isArray(prs) ? prs.length : 0;
    }

    // Repo info — open_issues_count includes PRs
    let openIssues = 0;
    if (repoRes.ok) {
      const repoData = await repoRes.json();
      openIssues = Math.max(0, (repoData.open_issues_count ?? 0) - openPRs);
    }

    // Contributors (paginated — just get total from Link header)
    let contributors = 0;
    const contribRes = await fetchWithTimeout(
      `https://api.github.com/repos/${owner}/${name}/contributors?per_page=1&anon=true`,
      { headers: h }, 8000,
    );
    if (contribRes.ok) {
      const linkHeader = contribRes.headers.get("link");
      if (linkHeader) {
        const match = linkHeader.match(/page=(\d+)>; rel="last"/);
        contributors = match ? parseInt(match[1], 10) : 1;
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
      isActive: commitsLast4Weeks > 0 || openPRs > 0,
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
