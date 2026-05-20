import { NextResponse } from "next/server";

import { getLatestPushLeakageSnapshot } from "@/lib/scanners/push-leakage";

const startTime = Date.now();

const STALE_AFTER_MS = 24 * 60 * 60 * 1000; // 24 hours

interface SnapshotFreshness {
  generatedAt: string | null;
  ageSeconds: number | null;
  source: "raw" | "public" | null;
  stale: boolean | null;
}

function pushLeakageFreshness(): SnapshotFreshness {
  try {
    const snap = getLatestPushLeakageSnapshot();
    if (!snap) {
      return { generatedAt: null, ageSeconds: null, source: null, stale: null };
    }
    const ageMs = Date.now() - new Date(snap.generatedAt).getTime();
    return {
      generatedAt: snap.generatedAt,
      ageSeconds: Math.max(0, Math.floor(ageMs / 1000)),
      source: snap.source,
      stale: ageMs > STALE_AFTER_MS,
    };
  } catch {
    return { generatedAt: null, ageSeconds: null, source: null, stale: null };
  }
}

interface EnvCheck {
  configured: boolean;
}

function envCheck(name: string): EnvCheck {
  const v = process.env[name];
  return { configured: typeof v === "string" && v.trim().length > 0 };
}

export async function GET() {
  return NextResponse.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: Math.floor((Date.now() - startTime) / 1000),
    snapshots: {
      // Surface the freshness of the snapshot files the dashboard reads from
      // disk. A stale push-leakage snapshot means the panel is showing data
      // older than the stale-after threshold (24 h by default) and the user
      // should re-run the experiments CLI.
      pushLeakage: pushLeakageFreshness(),
    },
    env: {
      // Boolean-only — never echo the secret value. Used by the dashboard to
      // surface a "set GITHUB_TOKEN for higher rate limits" banner when
      // unauthenticated, and an analogous hint for the Anthropic admin key.
      githubToken: envCheck("GITHUB_TOKEN"),
      anthropicAdminKey: envCheck("ANTHROPIC_ADMIN_API_KEY"),
    },
    staleAfterSeconds: STALE_AFTER_MS / 1000,
  });
}
