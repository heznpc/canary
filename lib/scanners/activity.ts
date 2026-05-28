import type { ActivityPulse } from "../types";
import { fetchWithTimeout, parseRepoSlug, githubHeaders } from "./version-utils";
import { runGuarded } from "./shared-breaker";
import { logger } from "../logger";

/**
 * Wrap a fetchWithTimeout call so any failure (policy reject, network
 * error, abort) resolves to `null` instead of rejecting. This protects the
 * `Promise.all([...])` aggregation below from the all-or-nothing behaviour
 * that would otherwise turn one bad URL into a total scan failure
 * (2026-05-29 code review, finding 7).
 */
async function safeFetch(url: string, init: RequestInit, ms: number, repo: string, label: string) {
  try {
    return await fetchWithTimeout(url, init, ms);
  } catch (err) {
    logger.warn(`activity: ${label} fetch failed`, {
      repo,
      url,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

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

  return runGuarded("activity", repo, async () => {
    // Each call wrapped individually so one URL failing (policy reject,
    // 5xx, timeout) downgrades that one signal to `null` instead of
    // collapsing the whole scan via Promise.all all-or-nothing semantics.
    // Pre-2026-05-29 the wrapper rejected on the same input only when
    // the network failed; the SSRF gate added in PR #57 made it
    // synchronously reject on policy too, sharpening this latent issue.
    const [participationRes, prsRes, repoRes, contribRes] = await Promise.all([
      safeFetch(`${base}/stats/participation`, { headers: h }, 10000, repo, "participation"),
      safeFetch(`${base}/pulls?state=open&per_page=1`, { headers: h }, 8000, repo, "pulls"),
      safeFetch(base, { headers: h }, 8000, repo, "repo"),
      safeFetch(`${base}/contributors?per_page=1&anon=true`, { headers: h }, 8000, repo, "contributors"),
    ]);

    let commitsLast4Weeks = 0;
    let weeklyCommitAvg = 0;
    if (participationRes?.ok) {
      const stats: ParticipationStats = await participationRes.json();
      if (stats.all && stats.all.length >= 4) {
        commitsLast4Weeks = stats.all.slice(-4).reduce((a, b) => a + b, 0);
        weeklyCommitAvg = Math.round((stats.all.slice(-12).reduce((a, b) => a + b, 0) / 12) * 10) / 10;
      }
    }

    let openPRs = 0;
    if (prsRes?.ok) {
      const fromLink = countFromLink(prsRes.headers.get("link"));
      if (fromLink !== null) {
        openPRs = fromLink;
      } else {
        const prs = await prsRes.json();
        openPRs = Array.isArray(prs) ? prs.length : 0;
      }
    }

    let openIssues = 0;
    if (repoRes?.ok) {
      const repoData = await repoRes.json();
      openIssues = Math.max(0, (repoData.open_issues_count ?? 0) - openPRs);
    }

    let contributors = 0;
    if (contribRes?.ok) {
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
  });
}
