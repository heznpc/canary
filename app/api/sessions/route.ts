import { headers } from "next/headers";

import { logger } from "@/lib/logger";
import { rateLimit } from "@/lib/rate-limit";
import { getSessionsIndex, sessionsEnabled } from "@/lib/sessions/scan";

export const dynamic = "force-dynamic";

const SESSIONS_RATE_LIMIT = 30;
const SESSIONS_WINDOW_MS = 60_000;

export async function GET(request: Request) {
  if (!sessionsEnabled()) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  const headersList = await headers();
  const ip = headersList.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
  const limited = rateLimit(ip, SESSIONS_RATE_LIMIT, SESSIONS_WINDOW_MS);
  if (!limited.allowed) {
    return Response.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(Math.ceil(limited.retryAfterMs / 1000)) } },
    );
  }

  try {
    const url = new URL(request.url);
    const source = url.searchParams.get("source");
    const q = url.searchParams.get("q")?.toLowerCase() ?? "";
    const limit = Math.min(Number(url.searchParams.get("limit") ?? "200") || 200, 1000);

    const index = await getSessionsIndex();
    const sourceOptions = new Set(index.sessions.map((s) => s.source));
    let sessions = index.sessions;
    if (source && sourceOptions.has(source as (typeof index.sessions)[number]["source"])) {
      sessions = sessions.filter((s) => s.source === source);
    }
    if (q) {
      sessions = sessions.filter(
        (s) => s.title.toLowerCase().includes(q) || (s.cwd ?? "").toLowerCase().includes(q),
      );
    }
    return Response.json({
      total: sessions.length,
      scannedAt: index.scannedAt,
      durationMs: index.durationMs,
      fileCount: index.fileCount,
      sessions: sessions.slice(0, limit),
    });
  } catch (err) {
    logger.error("sessions route failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return Response.json({ error: "Failed to build session index" }, { status: 500 });
  }
}
