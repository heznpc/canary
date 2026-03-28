import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { rateLimit } from "../lib/rate-limit";

describe("rateLimit", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows requests under the limit", () => {
    const ip = "10.0.0.1";
    const result = rateLimit(ip, 5, 60_000);
    expect(result.allowed).toBe(true);
  });

  it("allows exactly `limit` requests within the window", () => {
    const ip = "10.0.0.2";
    for (let i = 0; i < 3; i++) {
      const result = rateLimit(ip, 3, 60_000);
      expect(result.allowed).toBe(true);
    }
  });

  it("blocks when the limit is exceeded", () => {
    const ip = "10.0.0.3";
    // Use up the limit
    for (let i = 0; i < 5; i++) {
      rateLimit(ip, 5, 60_000);
    }
    // Next request should be blocked
    const result = rateLimit(ip, 5, 60_000);
    expect(result.allowed).toBe(false);
  });

  it("returns retryAfterMs when blocked", () => {
    const ip = "10.0.0.4";
    for (let i = 0; i < 2; i++) {
      rateLimit(ip, 2, 60_000);
    }
    const result = rateLimit(ip, 2, 60_000);
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.retryAfterMs).toBeGreaterThan(0);
      expect(result.retryAfterMs).toBeLessThanOrEqual(60_000);
    }
  });

  it("allows requests again after the window expires", () => {
    const ip = "10.0.0.5";
    // Fill the limit
    for (let i = 0; i < 3; i++) {
      rateLimit(ip, 3, 10_000);
    }
    // Should be blocked
    expect(rateLimit(ip, 3, 10_000).allowed).toBe(false);

    // Advance time past the window
    vi.advanceTimersByTime(10_001);

    // Should be allowed again
    const result = rateLimit(ip, 3, 10_000);
    expect(result.allowed).toBe(true);
  });

  it("uses sliding window (partial expiry)", () => {
    const ip = "10.0.0.6";
    // Make 2 requests at t=0
    rateLimit(ip, 3, 10_000);
    rateLimit(ip, 3, 10_000);

    // Advance 5 seconds, make 1 more (total 3 in window)
    vi.advanceTimersByTime(5_000);
    rateLimit(ip, 3, 10_000);

    // Should be blocked now (3 requests in window)
    expect(rateLimit(ip, 3, 10_000).allowed).toBe(false);

    // Advance another 5001ms — the first 2 requests fall out of the window
    vi.advanceTimersByTime(5_001);

    // Only 1 request remains in the window, so 2 more should be allowed
    expect(rateLimit(ip, 3, 10_000).allowed).toBe(true);
    expect(rateLimit(ip, 3, 10_000).allowed).toBe(true);
    // Now at limit again
    expect(rateLimit(ip, 3, 10_000).allowed).toBe(false);
  });

  it("tracks different IPs independently", () => {
    const ip1 = "10.0.1.1";
    const ip2 = "10.0.1.2";

    // Fill ip1's limit
    for (let i = 0; i < 2; i++) {
      rateLimit(ip1, 2, 60_000);
    }
    expect(rateLimit(ip1, 2, 60_000).allowed).toBe(false);

    // ip2 should still be allowed
    expect(rateLimit(ip2, 2, 60_000).allowed).toBe(true);
  });

  it("handles limit of 1", () => {
    const ip = "10.0.0.7";
    expect(rateLimit(ip, 1, 60_000).allowed).toBe(true);
    expect(rateLimit(ip, 1, 60_000).allowed).toBe(false);
  });

  it("uses default windowMs of 60 seconds", () => {
    const ip = "10.0.0.8";
    rateLimit(ip, 1);
    expect(rateLimit(ip, 1).allowed).toBe(false);

    // Advance past default 60s window
    vi.advanceTimersByTime(60_001);
    expect(rateLimit(ip, 1).allowed).toBe(true);
  });
});
