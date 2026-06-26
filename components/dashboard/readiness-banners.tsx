"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, KeyRound, RefreshCw, ExternalLink } from "lucide-react";

interface SnapshotFreshness {
  generatedAt: string | null;
  ageSeconds: number | null;
  source: "raw" | "public" | null;
  stale: boolean | null;
}

interface HealthResponse {
  status: string;
  timestamp: string;
  uptime: number;
  snapshots: { pushLeakage: SnapshotFreshness };
  env: {
    githubToken: { configured: boolean; source?: "env" | "gh" | "none" };
    anthropicAdminKey: { configured: boolean };
  };
  staleAfterSeconds: number;
}

function fmtAge(seconds: number | null): string {
  if (seconds === null || seconds === undefined) return "?";
  const d = Math.floor(seconds / 86400);
  if (d > 0) {
    const h = Math.floor((seconds % 86400) / 3600);
    return `${d}d ${h}h`;
  }
  const h = Math.floor(seconds / 3600);
  if (h > 0) return `${h}h`;
  const m = Math.floor(seconds / 60);
  return `${m}m`;
}

/**
 * Compact status banners that surface first-run friction the dashboard
 * otherwise hides.
 *
 *   - GitHub auth missing → low GitHub API rate limit (60/h unauthed) →
 *     scans will exhaust on a portfolio of any real size
 *   - push-leakage snapshot stale or absent → the PushLeakagePanel below is
 *     showing days-old or no data, the operator probably wants to refresh
 *
 * Both render conditionally; the banner block disappears once the
 * underlying conditions are resolved.
 */
export function ReadinessBanners() {
  const [health, setHealth] = useState<HealthResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/health")
      .then((r) => r.json() as Promise<HealthResponse>)
      .then((data) => {
        if (!cancelled) setHealth(data);
      })
      .catch(() => {
        // Health endpoint failing is itself notable but is surfaced by the
        // panels that fetch their own data; banners stay quiet.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!health) return null;

  const tokenMissing = !health.env?.githubToken?.configured;
  const snap = health.snapshots?.pushLeakage;
  const snapStale = snap?.stale === true;
  const snapMissing = snap?.generatedAt === null;

  if (!tokenMissing && !snapStale && !snapMissing) return null;

  return (
    <div className="space-y-2">
      {tokenMissing && (
        <div className="flex items-start gap-3 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm dark:border-amber-700 dark:bg-amber-950">
          <KeyRound className="h-4 w-4 mt-0.5 text-amber-700 dark:text-amber-300 flex-shrink-0" />
          <div className="flex-1">
            <p className="font-medium text-amber-900 dark:text-amber-100">
              GitHub 인증 미설정 — GitHub API 60 req/h 한도에 묶임
            </p>
            <p className="text-xs text-amber-800/90 dark:text-amber-200/80 mt-0.5">
              <code className="rounded bg-amber-100/60 dark:bg-amber-900/40 px-1 py-0.5 text-[11px]">gh auth login</code>{" "}
              또는 <code className="rounded bg-amber-100/60 dark:bg-amber-900/40 px-1 py-0.5 text-[11px]">GITHUB_TOKEN</code>{" "}
              설정 후 dev server 재시작.{" "}
              <a
                href="https://github.com/settings/tokens"
                target="_blank"
                rel="noopener"
                className="underline inline-flex items-center gap-1"
              >
                토큰 생성 <ExternalLink className="h-3 w-3" />
              </a>
            </p>
          </div>
        </div>
      )}

      {snapMissing && (
        <div className="flex items-start gap-3 rounded-md border border-blue-300 bg-blue-50 px-4 py-3 text-sm dark:border-blue-700 dark:bg-blue-950">
          <AlertTriangle className="h-4 w-4 mt-0.5 text-blue-700 dark:text-blue-300 flex-shrink-0" />
          <div className="flex-1">
            <p className="font-medium text-blue-900 dark:text-blue-100">
              push-leakage 스냅샷 없음
            </p>
            <p className="text-xs text-blue-800/90 dark:text-blue-200/80 mt-0.5">
              첫 스캔 실행:{" "}
              <code className="rounded bg-blue-100/60 dark:bg-blue-900/40 px-1 py-0.5 text-[11px]">npm run pl:scan</code>{" "}
              (CANARY_SCAN_ROOT 환경변수로 스캔 위치 변경 가능)
            </p>
          </div>
        </div>
      )}

      {!snapMissing && snapStale && (
        <div className="flex items-start gap-3 rounded-md border border-orange-300 bg-orange-50 px-4 py-3 text-sm dark:border-orange-700 dark:bg-orange-950">
          <RefreshCw className="h-4 w-4 mt-0.5 text-orange-700 dark:text-orange-300 flex-shrink-0" />
          <div className="flex-1">
            <p className="font-medium text-orange-900 dark:text-orange-100">
              push-leakage 스냅샷이 {fmtAge(snap?.ageSeconds ?? null)}{" "}
              지남 (stale-after = {fmtAge(health.staleAfterSeconds)})
            </p>
            <p className="text-xs text-orange-800/90 dark:text-orange-200/80 mt-0.5">
              새로고침:{" "}
              <code className="rounded bg-orange-100/60 dark:bg-orange-900/40 px-1 py-0.5 text-[11px]">npm run pl:scan</code>
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
