import { headers } from "next/headers";

import { logger } from "@/lib/logger";
import { rateLimit } from "@/lib/rate-limit";
import { getFileAccessAggregates, sessionsEnabled } from "@/lib/sessions/scan";

export const dynamic = "force-dynamic";

const FILE_ACCESS_RATE_LIMIT = 30;
const FILE_ACCESS_WINDOW_MS = 60_000;

export async function GET(request: Request) {
  if (!sessionsEnabled()) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  const headersList = await headers();
  const ip = headersList.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
  const limited = rateLimit(ip, FILE_ACCESS_RATE_LIMIT, FILE_ACCESS_WINDOW_MS);
  if (!limited.allowed) {
    return Response.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(Math.ceil(limited.retryAfterMs / 1000)) } },
    );
  }

  try {
    const url = new URL(request.url);
    const q = url.searchParams.get("q")?.toLowerCase() ?? "";
    const flaggedOnly = url.searchParams.get("flagged") === "1";
    const limit = Math.min(Number(url.searchParams.get("limit") ?? "500") || 500, 2000);

    let aggregates = await getFileAccessAggregates();
    if (flaggedOnly) aggregates = aggregates.filter((a) => a.flagged);
    if (q) aggregates = aggregates.filter((a) => a.path.toLowerCase().includes(q));
    return Response.json({ total: aggregates.length, aggregates: aggregates.slice(0, limit) });
  } catch (err) {
    logger.error("file-access route failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return Response.json({ error: "Failed to aggregate file access" }, { status: 500 });
  }
}
