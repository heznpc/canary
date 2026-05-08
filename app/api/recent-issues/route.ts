import { headers } from "next/headers";

import { projects } from "@/lib/projects";
import { checkRecentIssues } from "@/lib/scanners/recent-issues";
import { rateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import type { RecentIssue, RecentIssueDigest } from "@/lib/types";

export const dynamic = "force-dynamic";

const RECENT_ISSUES_RATE_LIMIT = 10;
const RECENT_ISSUES_WINDOW_MS = 60_000;
const MAX_WINDOW_DAYS = 90;
const DEFAULT_TOP = 20;

interface PortfolioIssueRow extends RecentIssue {
  /** Repository slug ("owner/name") the issue belongs to. */
  repo: string;
}

export async function GET(req: Request) {
  const headersList = await headers();
  const ip =
    headersList.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";

  const limit = rateLimit(ip, RECENT_ISSUES_RATE_LIMIT, RECENT_ISSUES_WINDOW_MS);
  if (!limit.allowed) {
    return Response.json(
      { error: "Too many requests" },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil(limit.retryAfterMs / 1000)) },
      },
    );
  }

  const url = new URL(req.url);
  const daysParam = url.searchParams.get("days");
  let windowDays = daysParam ? parseInt(daysParam, 10) : 30;
  if (!Number.isFinite(windowDays) || windowDays < 1) windowDays = 30;
  if (windowDays > MAX_WINDOW_DAYS) windowDays = MAX_WINDOW_DAYS;

  const topParam = url.searchParams.get("top");
  let top = topParam ? parseInt(topParam, 10) : DEFAULT_TOP;
  if (!Number.isFinite(top) || top < 1) top = DEFAULT_TOP;
  if (top > 100) top = 100;

  try {
    const repoProjects = projects.filter((p) => p.repo);
    const digests = await Promise.all(
      repoProjects.map(async (p) => {
        try {
          return await checkRecentIssues(p.repo!, { windowDays });
        } catch (e) {
          logger.warn("recent-issues digest failed for project", {
            project: p.id,
            error: e instanceof Error ? e.message : String(e),
          });
          return null;
        }
      }),
    );

    const flat: PortfolioIssueRow[] = [];
    let totalExternal = 0;
    let totalSelfAuthored = 0;
    const perRepo: Array<{ repo: string; external: number; selfAuthored: number }> = [];
    const validDigests: RecentIssueDigest[] = [];

    for (const d of digests) {
      if (!d) continue;
      validDigests.push(d);
      totalExternal += d.external.length;
      totalSelfAuthored += d.selfAuthored;
      perRepo.push({
        repo: d.repo,
        external: d.external.length,
        selfAuthored: d.selfAuthored,
      });
      for (const issue of d.external) {
        flat.push({ ...issue, repo: d.repo });
      }
    }

    flat.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    const topIssues = flat.slice(0, top);

    return Response.json(
      {
        generatedAt: new Date().toISOString(),
        windowDays,
        totals: {
          repos: validDigests.length,
          externalIssues: totalExternal,
          selfAuthored: totalSelfAuthored,
        },
        perRepo: perRepo.sort((a, b) => b.external - a.external),
        top: topIssues,
      },
      {
        headers: {
          // Issues change frequently but not faster than once a minute. A
          // small browser cache plus the per-scanner circuit breaker is
          // enough to keep GitHub API calls bounded.
          "Cache-Control": "private, max-age=120",
        },
      },
    );
  } catch (err) {
    logger.error("recent-issues route failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return Response.json(
      { error: "Failed to load recent issues" },
      { status: 500 },
    );
  }
}
