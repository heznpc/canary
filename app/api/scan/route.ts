import { scanAll } from "@/lib/scanners";
import { rateLimit } from "@/lib/rate-limit";
import { cacheGet, cacheSet, cacheStats } from "@/lib/cache";
import { headers } from "next/headers";
import { logger } from "@/lib/logger";
import crypto from "node:crypto";

export const dynamic = "force-dynamic";

// Allow 5 scan requests per minute per IP
const SCAN_RATE_LIMIT = 5;
const SCAN_WINDOW_MS = 60_000;

const SCAN_CACHE_KEY = "scan:all";
const SCAN_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function generateRequestId(): string {
  return `req_${crypto.randomUUID()}`;
}

export async function GET() {
  const requestId = generateRequestId();
  const headersList = await headers();
  const ip =
    headersList.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";

  logger.info("Scan request received", { requestId, ip });

  const result = rateLimit(ip, SCAN_RATE_LIMIT, SCAN_WINDOW_MS);
  if (!result.allowed) {
    logger.warn("Rate limit exceeded", { requestId, ip });
    return Response.json(
      { error: "Too many requests", requestId },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil(result.retryAfterMs / 1000)),
          "X-Request-Id": requestId,
        },
      },
    );
  }

  const isDev = process.env.NODE_ENV === "development";

  const cached = cacheGet(SCAN_CACHE_KEY);
  if (cached) {
    logger.info("Returning cached scan result", { requestId });
    const responseHeaders: Record<string, string> = {
      "X-Cache": "HIT",
      "X-Request-Id": requestId,
    };
    if (isDev) {
      const stats = cacheStats();
      responseHeaders["X-Cache-Stats"] = `hits=${stats.hits},misses=${stats.misses}`;
    }
    return Response.json(cached, { headers: responseHeaders });
  }

  const data = await scanAll(requestId);
  cacheSet(SCAN_CACHE_KEY, data, SCAN_CACHE_TTL);

  logger.info("Scan complete, result cached", { requestId });

  const responseHeaders: Record<string, string> = {
    "X-Cache": "MISS",
    "X-Request-Id": requestId,
  };
  if (isDev) {
    const stats = cacheStats();
    responseHeaders["X-Cache-Stats"] = `hits=${stats.hits},misses=${stats.misses}`;
  }
  return Response.json(data, { headers: responseHeaders });
}
