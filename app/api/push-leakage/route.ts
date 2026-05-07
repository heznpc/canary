import { headers } from "next/headers";

import { getLatestPushLeakageSnapshot } from "@/lib/scanners/push-leakage";
import { rateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const PUSH_LEAKAGE_RATE_LIMIT = 30;
const PUSH_LEAKAGE_WINDOW_MS = 60_000;

export async function GET() {
  const headersList = await headers();
  const ip =
    headersList.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";

  const result = rateLimit(ip, PUSH_LEAKAGE_RATE_LIMIT, PUSH_LEAKAGE_WINDOW_MS);
  if (!result.allowed) {
    return Response.json(
      { error: "Too many requests" },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil(result.retryAfterMs / 1000)) },
      },
    );
  }

  try {
    const snapshot = getLatestPushLeakageSnapshot();
    return Response.json(
      { snapshot, available: snapshot !== null },
      {
        headers: {
          // Snapshots are written by the experiments CLI on demand; the file
          // doesn't change between runs. A 5-minute browser cache is plenty.
          "Cache-Control": "private, max-age=300",
        },
      },
    );
  } catch (err) {
    logger.error("push-leakage route failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return Response.json(
      { error: "Failed to load push-leakage snapshot" },
      { status: 500 },
    );
  }
}
