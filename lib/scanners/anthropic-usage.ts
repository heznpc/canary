import type { AnthropicUsage, AnthropicUsageByModel } from "../types";
import { fetchWithTimeout } from "./version-utils";
import { cacheGet, cacheSet } from "../cache";
import { logger } from "../logger";

/**
 * Requires an Admin-scoped key (`sk-ant-admin-...`); standard keys get 403.
 * The Admin endpoint is the only programmatic source for consolidated org-wide
 * usage, so the scanner returns null rather than falling back to per-workspace
 * keys that would mislead on totals.
 */

const USAGE_URL = "https://api.anthropic.com/v1/organizations/usage_report/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const USAGE_CACHE_TTL_MS = 5 * 60 * 1000; // 5m — Anthropic says data lags ~5min
const DEFAULT_WINDOW_DAYS = 7;

/**
 * USD per 1M tokens, current as of 2026-04. Verify against
 * https://www.anthropic.com/pricing before trusting cost totals for billing.
 * Unknown models fall back to Sonnet-class rates so the number is never 0
 * when usage is non-zero.
 */
const FAMILY_PRICING = {
  opus: { input: 15, output: 75, cacheRead: 1.5, cacheWrite: 18.75 },
  sonnet: { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
  haiku: { input: 1, output: 5, cacheRead: 0.1, cacheWrite: 1.25 },
} as const;

function priceFor(model: string) {
  if (model.includes("opus")) return FAMILY_PRICING.opus;
  if (model.includes("haiku")) return FAMILY_PRICING.haiku;
  return FAMILY_PRICING.sonnet;
}

interface UsageResult {
  model: string | null;
  uncached_input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens: number;
  cache_creation: {
    ephemeral_1h_input_tokens: number;
    ephemeral_5m_input_tokens: number;
  };
}

interface UsageReportResponse {
  data: {
    starting_at: string;
    ending_at: string;
    results: UsageResult[];
  }[];
  has_more: boolean;
  next_page?: string | null;
}

export function estimateUsd(
  model: string,
  tokens: { input: number; output: number; cacheRead: number; cacheWrite: number },
): number {
  const p = priceFor(model);
  return (
    (tokens.input * p.input +
      tokens.output * p.output +
      tokens.cacheRead * p.cacheRead +
      tokens.cacheWrite * p.cacheWrite) /
    1_000_000
  );
}

/** Aggregate raw usage buckets into per-model totals. Exported for tests. */
export function aggregateUsage(
  buckets: UsageReportResponse["data"],
): Pick<AnthropicUsage, "totalInputTokens" | "totalOutputTokens" | "totalCacheReadTokens" | "totalCacheCreateTokens" | "totalEstimatedUsd" | "byModel"> {
  const perModel = new Map<string, AnthropicUsageByModel>();
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalCacheReadTokens = 0;
  let totalCacheCreateTokens = 0;

  for (const bucket of buckets) {
    for (const r of bucket.results) {
      const model = r.model ?? "unknown";
      const cacheCreate =
        r.cache_creation.ephemeral_1h_input_tokens +
        r.cache_creation.ephemeral_5m_input_tokens;
      const entry = perModel.get(model) ?? {
        model,
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheCreateTokens: 0,
        estimatedUsd: 0,
      };
      entry.inputTokens += r.uncached_input_tokens;
      entry.outputTokens += r.output_tokens;
      entry.cacheReadTokens += r.cache_read_input_tokens;
      entry.cacheCreateTokens += cacheCreate;
      perModel.set(model, entry);

      totalInputTokens += r.uncached_input_tokens;
      totalOutputTokens += r.output_tokens;
      totalCacheReadTokens += r.cache_read_input_tokens;
      totalCacheCreateTokens += cacheCreate;
    }
  }

  let totalEstimatedUsd = 0;
  for (const entry of perModel.values()) {
    entry.estimatedUsd = estimateUsd(entry.model, {
      input: entry.inputTokens,
      output: entry.outputTokens,
      cacheRead: entry.cacheReadTokens,
      cacheWrite: entry.cacheCreateTokens,
    });
    totalEstimatedUsd += entry.estimatedUsd;
  }

  const byModel = [...perModel.values()].sort((a, b) => b.estimatedUsd - a.estimatedUsd);

  return {
    totalInputTokens,
    totalOutputTokens,
    totalCacheReadTokens,
    totalCacheCreateTokens,
    totalEstimatedUsd,
    byModel,
  };
}

export async function checkAnthropicUsage(
  windowDays: number = DEFAULT_WINDOW_DAYS,
): Promise<AnthropicUsage | null> {
  const apiKey = process.env.ANTHROPIC_ADMIN_API_KEY;
  if (!apiKey) return null;

  const cacheKey = `anthropic-usage:${windowDays}d`;
  const cached = cacheGet<AnthropicUsage>(cacheKey);
  if (cached) return cached;

  const endingAt = new Date();
  const startingAt = new Date(endingAt.getTime() - windowDays * 24 * 60 * 60 * 1000);
  const url = new URL(USAGE_URL);
  url.searchParams.set("starting_at", startingAt.toISOString());
  url.searchParams.set("ending_at", endingAt.toISOString());
  url.searchParams.set("bucket_width", "1d");
  url.searchParams.set("group_by[]", "model");
  url.searchParams.set("limit", String(Math.min(windowDays, 31)));

  try {
    const res = await fetchWithTimeout(
      url.toString(),
      {
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": ANTHROPIC_VERSION,
        },
      },
      10_000,
    );
    if (!res.ok) {
      logger.warn(`anthropic-usage: admin API ${res.status}`, { windowDays });
      return null;
    }
    const body = (await res.json()) as UsageReportResponse;
    if (body.has_more) {
      // `limit` is the max bucket count, which we set equal to windowDays (≤31)
      // and bucket_width=1d — so buckets should never overflow in this config.
      // If this fires, investigate upstream API changes before trusting totals.
      logger.warn("anthropic-usage: response reported has_more=true — totals may be truncated", {
        windowDays,
      });
    }
    const aggregated = aggregateUsage(body.data);
    const result: AnthropicUsage = {
      startingAt: startingAt.toISOString(),
      endingAt: endingAt.toISOString(),
      ...aggregated,
      lastChecked: new Date().toISOString(),
    };
    cacheSet(cacheKey, result, USAGE_CACHE_TTL_MS);
    return result;
  } catch (err) {
    logger.warn("anthropic-usage: fetch failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}
