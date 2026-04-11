/**
 * Simple in-memory rate limiter using a sliding window per IP.
 */

interface RateLimitEntry {
  timestamps: number[];
  windowMs: number;
}

const store = new Map<string, RateLimitEntry>();

// Clean up stale entries every 5 minutes. `unref()` lets Node exit (and lets
// vitest finish) without waiting for this timer to fire.
const cleanupTimer: NodeJS.Timeout = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    entry.timestamps = entry.timestamps.filter((t) => now - t < 2 * entry.windowMs);
    if (entry.timestamps.length === 0) store.delete(key);
  }
}, 5 * 60_000);
cleanupTimer.unref?.();

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
    entry = { timestamps: [], windowMs };
    store.set(ip, entry);
  } else {
    entry.windowMs = Math.max(entry.windowMs, windowMs);
  }

  // Remove timestamps outside the window
  entry.timestamps = entry.timestamps.filter((t) => now - t < windowMs);

  // Push first, then check — atomic in a single synchronous block so
  // concurrent requests cannot both pass the check before either pushes.
  entry.timestamps.push(now);

  if (entry.timestamps.length > limit) {
    // Over limit — roll back the timestamp we just added
    entry.timestamps.pop();
    const oldest = entry.timestamps[0];
    const retryAfterMs = oldest + windowMs - now;
    return { allowed: false, retryAfterMs };
  }

  return { allowed: true };
}
