import type { AnthropicUsage, AnthropicUsageByModel } from "../types";
import { fetchWithTimeout } from "./version-utils";
import { cacheGet, cacheSet } from "../cache";
import { logger } from "../logger";

/**
 * Anthropic Admin API usage report scanner. Fetches token usage from
 * `/v1/organizations/usage_report/messages`, groups by model, and estimates
 * cost using a static price table. Requires `ANTHROPIC_ADMIN_API_KEY`
 * (sk-ant-admin-...); standard API keys cannot call this endpoint.
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
const MODEL_PRICING: Record<string, { input: number; output: number; cacheRead: number; cacheWrite: number }> = {
  // Opus family
  "claude-opus-4-7": { input: 15, output: 75, cacheRead: 1.5, cacheWrite: 18.75 },
  "claude-opus-4-6": { input: 15, output: 75, cacheRead: 1.5, cacheWrite: 18.75 },
  "claude-opus-4-5": { input: 15, output: 75, cacheRead: 1.5, cacheWrite: 18.75 },
  // Sonnet family
  "claude-sonnet-4-6": { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
  "claude-sonnet-4-5": { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
  // Haiku family
  "claude-haiku-4-5": { input: 1, output: 5, cacheRead: 0.1, cacheWrite: 1.25 },
};

const FALLBACK_PRICING = { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 };

function priceFor(model: string) {
  if (MODEL_PRICING[model]) return MODEL_PRICING[model];
  for (const [key, p] of Object.entries(MODEL_PRICING)) {
    if (model.startsWith(key)) return p;
  }
  return FALLBACK_PRICING;
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

/**
 * Aggregate raw usage buckets into per-model totals.
 *
 * Exported for testing. `buckets` is the `data` array straight from the
 * Anthropic response.
 */
export function aggregateUsage(
  buckets: UsageReportResponse["data"],
): Pick<AnthropicUsage, "totalInputTokens" | "totalOutputTokens" | "totalCacheReadTokens" | "totalCacheCreateTokens" | "totalEstimatedUsd" | "byModel"> {
  const perModel = new Map<string, { input: number; output: number; cacheRead: number; cacheWrite: number }>();
  for (const bucket of buckets) {
    for (const r of bucket.results) {
      const model = r.model ?? "unknown";
      const curr = perModel.get(model) ?? { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
      curr.input += r.uncached_input_tokens;
      curr.output += r.output_tokens;
      curr.cacheRead += r.cache_read_input_tokens;
      curr.cacheWrite +=
        r.cache_creation.ephemeral_1h_input_tokens +
        r.cache_creation.ephemeral_5m_input_tokens;
      perModel.set(model, curr);
    }
  }

  const byModel: AnthropicUsageByModel[] = [];
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalCacheReadTokens = 0;
  let totalCacheCreateTokens = 0;
  let totalEstimatedUsd = 0;

  for (const [model, t] of perModel) {
    const usd = estimateUsd(model, t);
    byModel.push({
      model,
      inputTokens: t.input,
      outputTokens: t.output,
      cacheReadTokens: t.cacheRead,
      cacheCreateTokens: t.cacheWrite,
      estimatedUsd: usd,
    });
    totalInputTokens += t.input;
    totalOutputTokens += t.output;
    totalCacheReadTokens += t.cacheRead;
    totalCacheCreateTokens += t.cacheWrite;
    totalEstimatedUsd += usd;
  }

  byModel.sort((a, b) => b.estimatedUsd - a.estimatedUsd);

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
