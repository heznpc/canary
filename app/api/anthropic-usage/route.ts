import { checkAnthropicUsage } from "@/lib/scanners/anthropic-usage";
import { rateLimit } from "@/lib/rate-limit";
import { headers } from "next/headers";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const USAGE_RATE_LIMIT = 10;
const USAGE_WINDOW_MS = 60_000;
const MAX_WINDOW_DAYS = 31;

export async function GET(req: Request) {
  const headersList = await headers();
  const ip =
    headersList.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";

  const result = rateLimit(ip, USAGE_RATE_LIMIT, USAGE_WINDOW_MS);
  if (!result.allowed) {
    return Response.json(
      { error: "Too many requests" },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil(result.retryAfterMs / 1000)) },
      },
    );
  }

  const url = new URL(req.url);
  const daysParam = url.searchParams.get("days");
  let days = daysParam ? parseInt(daysParam, 10) : 7;
  if (!Number.isFinite(days) || days < 1) days = 7;
  if (days > MAX_WINDOW_DAYS) days = MAX_WINDOW_DAYS;

  try {
    const usage = await checkAnthropicUsage(days);
    return Response.json({ usage, configured: usage !== null });
  } catch (err) {
    logger.error("anthropic-usage route failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return Response.json(
      { error: "Failed to fetch usage" },
      { status: 500 },
    );
  }
}
