/**
 * Simple in-memory rate limiter using a sliding window per IP.
 */

interface RateLimitEntry {
  timestamps: number[];
}

const store = new Map<string, RateLimitEntry>();

// Clean up stale entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    entry.timestamps = entry.timestamps.filter((t) => now - t < 60_000);
    if (entry.timestamps.length === 0) store.delete(key);
  }
}, 5 * 60_000);

/**
 * Check if a request from the given IP is allowed.
 *
 * @param ip        - Client IP address
 * @param limit     - Max requests allowed within the window
 * @param windowMs  - Sliding window duration in milliseconds (default: 60 s)
 * @returns `{ allowed: true }` or `{ allowed: false, retryAfterMs }`.
 */
export function rateLimit(
  ip: string,
  limit: number,
  windowMs: number = 60_000,
): { allowed: true } | { allowed: false; retryAfterMs: number } {
  const now = Date.now();
  let entry = store.get(ip);

  if (!entry) {
    entry = { timestamps: [] };
    store.set(ip, entry);
  }

  // Remove timestamps outside the window
  entry.timestamps = entry.timestamps.filter((t) => now - t < windowMs);

  if (entry.timestamps.length >= limit) {
    const oldest = entry.timestamps[0];
    const retryAfterMs = oldest + windowMs - now;
    return { allowed: false, retryAfterMs };
  }

  entry.timestamps.push(now);
  return { allowed: true };
}
