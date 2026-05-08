import type { RecentIssue, RecentIssueDigest } from "../types";
import { fetchWithTimeout, githubHeaders, parseRepoSlug } from "./version-utils";
import { runGuarded } from "./shared-breaker";

/**
 * Fetch open issues authored by external contributors for a single repo.
 *
 * Motivation: in the agent-driven workflow this dashboard supports, the
 * operator's question "did anyone open an issue I should look at?" otherwise
 * requires a manual GitHub visit or an out-of-band agent prompt. Surfacing
 * the digest as part of the same scan that already fetches activity stats
 * brings external-contributor signal into the operator's normal field of
 * view.
 *
 * The digest filters out:
 *   - Pull requests (the GitHub `/issues` endpoint mixes them in via
 *     a `pull_request` field; we drop those — PRs already have their own
 *     panel).
 *   - Issues authored by the repo owner or the configured self-login
 *     (`CANARY_SELF_LOGIN` env, falling back to the repo owner). These are
 *     self-tracking issues, not external contributor signal.
 *   - Bot-authored issues (login ending in `[bot]`).
 *
 * State is open by default — the dashboard wants live attention demand,
 * not historical record. The shape preserves enough for follow-up reasoning
 * (label triage, "needs reply" via comments == 0).
 *
 * Window defaults to 30 days; configurable via `windowDays` parameter so a
 * caller can ask for a shorter "since I last looked" view.
 */

const DEFAULT_WINDOW_DAYS = 30;
const MAX_PER_REPO = 20;

export interface RecentIssuesOptions {
  windowDays?: number;
  /** Override the self-login that should be filtered out as "self-authored". */
  selfLogin?: string;
}

interface RawIssue {
  number: number;
  title: string;
  html_url: string;
  state: string;
  created_at: string;
  comments: number;
  user: { login: string; type?: string } | null;
  labels: Array<string | { name: string }>;
  pull_request?: unknown;
}

function selfLoginFor(repo: string, opts: RecentIssuesOptions): string {
  if (opts.selfLogin) return opts.selfLogin;
  const env = process.env.CANARY_SELF_LOGIN;
  if (env && env.trim()) return env.trim();
  // Fall back to the repo owner — the most common case for personal portfolios.
  const parsed = parseRepoSlug(repo);
  return parsed?.owner ?? "";
}

function normaliseLabels(raw: RawIssue["labels"]): string[] {
  return raw
    .map((l) => (typeof l === "string" ? l : (l?.name ?? "")))
    .filter((s): s is string => Boolean(s));
}

export async function checkRecentIssues(
  repo: string,
  options: RecentIssuesOptions = {},
): Promise<RecentIssueDigest | null> {
  const parsed = parseRepoSlug(repo);
  if (!parsed) return null;
  const { owner, name } = parsed;

  const windowDays = options.windowDays ?? DEFAULT_WINDOW_DAYS;
  const selfLogin = selfLoginFor(repo, options);

  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();
  const url =
    `https://api.github.com/repos/${owner}/${name}/issues` +
    `?state=open&since=${encodeURIComponent(since)}` +
    `&sort=created&direction=desc&per_page=${MAX_PER_REPO}`;

  return runGuarded("recent-issues", repo, async () => {
    const res = await fetchWithTimeout(url, { headers: githubHeaders() }, 10000);
    if (!res.ok) {
      // 404 or 403 commonly happens for archived/private repos; surface as null
      // rather than throwing — the caller treats null as "feature unavailable".
      return null;
    }
    const raw = (await res.json()) as RawIssue[];
    const items = Array.isArray(raw) ? raw : [];

    const selfAuthoredOpen: RawIssue[] = [];
    const externalIssues: RecentIssue[] = [];
    let totalInWindow = 0;

    for (const r of items) {
      // Skip PRs — the issues endpoint includes them.
      if (r.pull_request !== undefined) continue;
      totalInWindow++;

      const author = r.user?.login ?? "(unknown)";
      const authorIsBot =
        author.endsWith("[bot]") ||
        (r.user?.type ?? "").toLowerCase() === "bot";

      if (author === selfLogin || authorIsBot) {
        selfAuthoredOpen.push(r);
        continue;
      }

      externalIssues.push({
        number: r.number,
        title: r.title,
        url: r.html_url,
        author,
        authorIsBot,
        createdAt: r.created_at,
        comments: r.comments,
        labels: normaliseLabels(r.labels),
        state: r.state === "closed" ? "closed" : "open",
      });
    }

    return {
      repo,
      external: externalIssues,
      selfAuthored: selfAuthoredOpen.length,
      totalInWindow,
      windowDays,
      lastChecked: new Date().toISOString(),
    };
  });
}
