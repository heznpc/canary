import { describe, it, expect, vi, afterEach } from "vitest";
import {
  aggregateUsage,
  checkAnthropicUsage,
  estimateUsd,
} from "../lib/scanners/anthropic-usage";

describe("estimateUsd", () => {
  it("applies Opus pricing for claude-opus-4-7", () => {
    const usd = estimateUsd("claude-opus-4-7", {
      input: 1_000_000,
      output: 1_000_000,
      cacheRead: 0,
      cacheWrite: 0,
    });
    // Opus: $15/M in + $75/M out = $90
    expect(usd).toBeCloseTo(90, 2);
  });

  it("applies Sonnet pricing for claude-sonnet-4-6", () => {
    const usd = estimateUsd("claude-sonnet-4-6", {
      input: 1_000_000,
      output: 1_000_000,
      cacheRead: 0,
      cacheWrite: 0,
    });
    expect(usd).toBeCloseTo(18, 2);
  });

  it("applies Haiku pricing for claude-haiku-4-5", () => {
    const usd = estimateUsd("claude-haiku-4-5", {
      input: 1_000_000,
      output: 1_000_000,
      cacheRead: 0,
      cacheWrite: 0,
    });
    expect(usd).toBeCloseTo(6, 2);
  });

  it("falls back to Sonnet-class rates for unknown models", () => {
    const usd = estimateUsd("claude-mystery-99", {
      input: 1_000_000,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
    });
    expect(usd).toBeCloseTo(3, 2);
  });

  it("matches model prefixes (e.g. dated variants)", () => {
    const usd = estimateUsd("claude-haiku-4-5-20251001", {
      input: 1_000_000,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
    });
    expect(usd).toBeCloseTo(1, 2);
  });
});

describe("aggregateUsage", () => {
  it("sums tokens across buckets and groups by model", () => {
    const buckets = [
      {
        starting_at: "2026-04-20T00:00:00Z",
        ending_at: "2026-04-21T00:00:00Z",
        results: [
          {
            model: "claude-sonnet-4-6",
            uncached_input_tokens: 100_000,
            output_tokens: 20_000,
            cache_read_input_tokens: 5_000,
            cache_creation: {
              ephemeral_1h_input_tokens: 1_000,
              ephemeral_5m_input_tokens: 2_000,
            },
          },
        ],
      },
      {
        starting_at: "2026-04-21T00:00:00Z",
        ending_at: "2026-04-22T00:00:00Z",
        results: [
          {
            model: "claude-sonnet-4-6",
            uncached_input_tokens: 50_000,
            output_tokens: 10_000,
            cache_read_input_tokens: 0,
            cache_creation: {
              ephemeral_1h_input_tokens: 0,
              ephemeral_5m_input_tokens: 0,
            },
          },
          {
            model: "claude-opus-4-7",
            uncached_input_tokens: 200_000,
            output_tokens: 50_000,
            cache_read_input_tokens: 0,
            cache_creation: {
              ephemeral_1h_input_tokens: 0,
              ephemeral_5m_input_tokens: 0,
            },
          },
        ],
      },
    ];

    const agg = aggregateUsage(buckets);

    expect(agg.totalInputTokens).toBe(350_000);
    expect(agg.totalOutputTokens).toBe(80_000);
    expect(agg.totalCacheReadTokens).toBe(5_000);
    expect(agg.totalCacheCreateTokens).toBe(3_000);
    expect(agg.byModel).toHaveLength(2);
    // Opus should be sorted first (higher cost)
    expect(agg.byModel[0].model).toBe("claude-opus-4-7");
    expect(agg.byModel[1].model).toBe("claude-sonnet-4-6");
  });

  it("handles empty buckets", () => {
    const agg = aggregateUsage([]);
    expect(agg.totalInputTokens).toBe(0);
    expect(agg.totalEstimatedUsd).toBe(0);
    expect(agg.byModel).toHaveLength(0);
  });

  it("treats missing model as 'unknown'", () => {
    const agg = aggregateUsage([
      {
        starting_at: "2026-04-20T00:00:00Z",
        ending_at: "2026-04-21T00:00:00Z",
        results: [
          {
            model: null,
            uncached_input_tokens: 1_000,
            output_tokens: 500,
            cache_read_input_tokens: 0,
            cache_creation: {
              ephemeral_1h_input_tokens: 0,
              ephemeral_5m_input_tokens: 0,
            },
          },
        ],
      },
    ]);
    expect(agg.byModel[0].model).toBe("unknown");
  });
});

describe("checkAnthropicUsage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.ANTHROPIC_ADMIN_API_KEY;
  });

  it("returns null without hitting the network when admin key is missing", async () => {
    const spy = vi.spyOn(globalThis, "fetch");
    const result = await checkAnthropicUsage(7);
    expect(result).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });

  it("returns null when the admin API responds with a non-ok status", async () => {
    process.env.ANTHROPIC_ADMIN_API_KEY = "sk-ant-admin-test";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("forbidden", { status: 403 }),
    );
    const result = await checkAnthropicUsage(3);
    expect(result).toBeNull();
  });
});
