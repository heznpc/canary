"use client";

import { useEffect, useState } from "react";
import { GitBranch, Clock, AlertCircle } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";

import type { PushLeakageSnapshotPayload } from "@/lib/scanners/push-leakage";

interface PushLeakageResponse {
  snapshot: PushLeakageSnapshotPayload | null;
  available: boolean;
}

type PanelState =
  | { kind: "loading" }
  | { kind: "unavailable" }
  | { kind: "ready"; payload: PushLeakageSnapshotPayload }
  | { kind: "error" };

function fmtDuration(seconds: number | null): string {
  if (seconds === null || seconds === undefined) return "—";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  if (d > 0) return `${d}d ${h}h`;
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function fmtPct(x: number | null | undefined): string {
  if (x === null || x === undefined) return "—";
  return `${(x * 100).toFixed(1)}%`;
}

export function PushLeakagePanel() {
  const [state, setState] = useState<PanelState>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    fetch("/api/push-leakage")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<PushLeakageResponse>;
      })
      .then((data) => {
        if (cancelled) return;
        if (data.available && data.snapshot) {
          setState({ kind: "ready", payload: data.snapshot });
        } else {
          setState({ kind: "unavailable" });
        }
      })
      .catch(() => {
        if (!cancelled) setState({ kind: "error" });
      });
    return () => { cancelled = true; };
  }, []);

  if (state.kind === "error") return null;

  if (state.kind === "loading") {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">Push leakage 스냅샷 불러오는 중...</p>
        </CardContent>
      </Card>
    );
  }

  if (state.kind === "unavailable") {
    return (
      <Card>
        <CardContent className="pt-6">
          <div>
            <p className="text-sm font-medium">Push leakage</p>
            <p className="text-xs text-muted-foreground mt-1">
              스냅샷 없음. <code className="rounded bg-muted px-1 py-0.5 text-[11px]">npx tsx experiments/src/push-leakage/cli.ts ~/IdeaProjects --filter=IdeaProjects</code> 후 새로고침.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const { portfolio, topLeaking, generatedAt, source } = state.payload;
  const hasLeaking = topLeaking.length > 0;

  return (
    <Card>
      <CardContent className="pt-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Push leakage</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {new Date(generatedAt).toLocaleString("ko-KR")} ·
              <span className="ml-1 inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] uppercase tracking-wide">
                {source}
              </span>
            </p>
          </div>
          <a
            href="https://github.com/heznpc/canary/blob/main/planning/drafts/agent-push-leakage.md"
            target="_blank"
            rel="noopener"
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            RFC →
          </a>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div className="flex items-center gap-3">
            <GitBranch className="h-5 w-5 text-amber-500 opacity-60" />
            <div>
              <p className="text-xs text-muted-foreground">Repos ahead</p>
              <p className="text-sm font-semibold tabular-nums">
                {portfolio.reposAhead} / {portfolio.reposWithRemote}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-rose-500 opacity-60" />
            <div>
              <p className="text-xs text-muted-foreground">PLR (portfolio)</p>
              <p className="text-sm font-semibold tabular-nums">
                {fmtPct(portfolio.plr_portfolio)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Clock className="h-5 w-5 text-violet-500 opacity-60" />
            <div>
              <p className="text-xs text-muted-foreground">MIP p50 / max</p>
              <p className="text-sm font-semibold tabular-nums">
                {fmtDuration(portfolio.mip.p50)} / {fmtDuration(portfolio.mip.max)}
              </p>
            </div>
          </div>
        </div>

        {(portfolio.ucp.n > 0 || portfolio.reposDirty > 0) && (
          <div className="grid grid-cols-3 gap-4 pt-3 border-t text-xs">
            <div>
              <p className="text-muted-foreground">Dirty repos</p>
              <p className="font-semibold tabular-nums">{portfolio.reposDirty}</p>
            </div>
            <div>
              <p className="text-muted-foreground">UCP p50 / max</p>
              <p className="font-semibold tabular-nums">
                {fmtDuration(portfolio.ucp.p50)} / {fmtDuration(portfolio.ucp.max)}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Agent-touched</p>
              <p className="font-semibold tabular-nums">
                {portfolio.reposAgentTouched} ({portfolio.reposAgentTouchedCwd}/{portfolio.reposAgentTouchedCrossRepoOnly} cwd/cross)
              </p>
            </div>
          </div>
        )}

        {hasLeaking && (
          <div className="space-y-1 pt-3 border-t">
            <p className="text-xs text-muted-foreground mb-1.5">Top leaking (sorted by MIP)</p>
            {topLeaking.slice(0, 5).map((j) => (
              <div key={j.repoPath} className="flex items-center justify-between text-xs">
                <span className="font-mono text-muted-foreground truncate pr-2">
                  {j.repoPath.split("/").pop() ?? j.repoPath}
                </span>
                <span className="tabular-nums text-muted-foreground whitespace-nowrap">
                  ahead={j.ahead} · {fmtDuration(j.mip_seconds)}
                </span>
              </div>
            ))}
          </div>
        )}

        {!hasLeaking && (
          <p className="text-xs text-muted-foreground pt-3 border-t">
            모든 원격이 동기 상태. 0 leaking repos at threshold.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
