import { scanAll } from "@/lib/scanners";
import { rateLimit } from "@/lib/rate-limit";
import { cacheGet, cacheSet, cacheStats } from "@/lib/cache";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

// Allow 5 scan requests per minute per IP
const SCAN_RATE_LIMIT = 5;
const SCAN_WINDOW_MS = 60_000;

const SCAN_CACHE_KEY = "scan:all";
const SCAN_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function GET() {
  const headersList = await headers();
  const ip =
    headersList.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";

  const result = rateLimit(ip, SCAN_RATE_LIMIT, SCAN_WINDOW_MS);
  if (!result.allowed) {
    return Response.json(
      { error: "Too many requests" },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil(result.retryAfterMs / 1000)),
        },
      },
    );
  }

  const cached = cacheGet(SCAN_CACHE_KEY);
  if (cached) {
    const stats = cacheStats();
    return Response.json(cached, {
      headers: { "X-Cache": "HIT", "X-Cache-Stats": `hits=${stats.hits},misses=${stats.misses}` },
    });
  }

  const data = await scanAll();
  cacheSet(SCAN_CACHE_KEY, data, SCAN_CACHE_TTL);

  const stats = cacheStats();
  return Response.json(data, {
    headers: { "X-Cache": "MISS", "X-Cache-Stats": `hits=${stats.hits},misses=${stats.misses}` },
  });
}
