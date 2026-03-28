import { describe, it, expect, beforeEach } from "vitest";
import { cacheGet, cacheSet, cacheInvalidate, cacheStats } from "../lib/cache";

describe("cache", () => {
  beforeEach(() => {
    cacheInvalidate("test-key");
    cacheInvalidate("key-a");
    cacheInvalidate("key-b");
    cacheInvalidate("expire-key");
  });

  describe("cacheSet and cacheGet", () => {
    it("stores and retrieves a value", () => {
      cacheSet("test-key", { name: "hello" });
      const result = cacheGet<{ name: string }>("test-key");
      expect(result).toEqual({ name: "hello" });
    });

    it("returns null for a missing key", () => {
      expect(cacheGet("nonexistent-key-12345")).toBeNull();
    });

    it("stores primitive values", () => {
      cacheSet("key-a", 42);
      expect(cacheGet<number>("key-a")).toBe(42);
      cacheSet("key-b", "a string");
      expect(cacheGet<string>("key-b")).toBe("a string");
    });

    it("returns null for expired entries", () => {
      cacheSet("expire-key", "data", -1);
      expect(cacheGet("expire-key")).toBeNull();
    });

    it("overwrites existing entries with the same key", () => {
      cacheSet("test-key", "first");
      cacheSet("test-key", "second");
      expect(cacheGet<string>("test-key")).toBe("second");
    });

    it("uses default TTL when none is specified", () => {
      cacheSet("test-key", "value");
      // Should still be available immediately (default TTL is 5 minutes)
      expect(cacheGet<string>("test-key")).toBe("value");
    });
  });

  describe("cacheInvalidate", () => {
    it("removes an existing entry and returns true", () => {
      cacheSet("test-key", "value");
      expect(cacheInvalidate("test-key")).toBe(true);
      expect(cacheGet("test-key")).toBeNull();
    });

    it("returns false for a non-existent key", () => {
      expect(cacheInvalidate("no-such-key-99999")).toBe(false);
    });

    it("makes a subsequent get return null", () => {
      cacheSet("test-key", 123);
      cacheInvalidate("test-key");
      expect(cacheGet("test-key")).toBeNull();
    });
  });

  describe("cacheStats", () => {
    it("returns an object with hits, misses, and size", () => {
      const stats = cacheStats();
      expect(stats).toHaveProperty("hits");
      expect(stats).toHaveProperty("misses");
      expect(stats).toHaveProperty("size");
      expect(typeof stats.hits).toBe("number");
      expect(typeof stats.misses).toBe("number");
      expect(typeof stats.size).toBe("number");
    });

    it("increments misses on cache miss", () => {
      const before = cacheStats();
      cacheGet("definitely-missing-key-abc");
      const after = cacheStats();
      expect(after.misses).toBe(before.misses + 1);
    });

    it("increments hits on cache hit", () => {
      cacheSet("stat-hit-key", "val");
      const before = cacheStats();
      cacheGet("stat-hit-key");
      const after = cacheStats();
      expect(after.hits).toBe(before.hits + 1);
      cacheInvalidate("stat-hit-key");
    });

    it("counts misses for expired entries", () => {
      cacheSet("stat-expire-key", "val", -1);
      const before = cacheStats();
      cacheGet("stat-expire-key");
      const after = cacheStats();
      expect(after.misses).toBe(before.misses + 1);
    });
  });
});
