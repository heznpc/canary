"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import type { AnthropicUsage } from "@/lib/types";
import { DollarSign, Zap, ExternalLink } from "lucide-react";

interface UsageResponse {
  usage: AnthropicUsage | null;
  configured: boolean;
}

type PanelState =
  | { kind: "loading" }
  | { kind: "not-configured" }
  | { kind: "ready"; usage: AnthropicUsage }
  | { kind: "error" };

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function fmtUsd(n: number): string {
  return `$${n.toFixed(2)}`;
}

export function AnthropicUsagePanel() {
  const [state, setState] = useState<PanelState>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    fetch("/api/anthropic-usage?days=7")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<UsageResponse>;
      })
      .then((data) => {
        if (cancelled) return;
        if (data.configured && data.usage) setState({ kind: "ready", usage: data.usage });
        else setState({ kind: "not-configured" });
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
          <p className="text-sm text-muted-foreground">Claude 사용량 불러오는 중...</p>
        </CardContent>
      </Card>
    );
  }

  if (state.kind === "not-configured") {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Claude API 사용량</p>
              <p className="text-xs text-muted-foreground mt-1">
                ANTHROPIC_ADMIN_API_KEY 설정 시 7일 토큰·비용 표시
              </p>
            </div>
            <a
              href="https://console.anthropic.com/settings/usage"
              target="_blank"
              rel="noopener"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              Console
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (state.kind !== "ready") return null;
  const u = state.usage;

  return (
    <Card>
      <CardContent className="pt-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Claude API 사용량 (최근 7일)</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {new Date(u.startingAt).toLocaleDateString("ko-KR")} →{" "}
              {new Date(u.endingAt).toLocaleDateString("ko-KR")}
            </p>
          </div>
          <a
            href="https://console.anthropic.com/settings/usage"
            target="_blank"
            rel="noopener"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            Console <ExternalLink className="h-3 w-3" />
          </a>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex items-center gap-3">
            <Zap className="h-5 w-5 text-amber-500 opacity-60" />
            <div>
              <p className="text-xs text-muted-foreground">토큰 (입력/출력)</p>
              <p className="text-sm font-semibold tabular-nums">
                {fmtTokens(u.totalInputTokens)} / {fmtTokens(u.totalOutputTokens)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <DollarSign className="h-5 w-5 text-emerald-500 opacity-60" />
            <div>
              <p className="text-xs text-muted-foreground">추정 비용</p>
              <p className="text-sm font-semibold tabular-nums">
                {fmtUsd(u.totalEstimatedUsd)}
              </p>
            </div>
          </div>
        </div>

        {u.byModel.length > 0 && (
          <div className="space-y-1 pt-2 border-t">
            {u.byModel.slice(0, 3).map((m) => (
              <div key={m.model} className="flex items-center justify-between text-xs">
                <span className="font-mono text-muted-foreground truncate pr-2">
                  {m.model}
                </span>
                <span className="tabular-nums text-muted-foreground whitespace-nowrap">
                  {fmtTokens(m.inputTokens + m.outputTokens)} · {fmtUsd(m.estimatedUsd)}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
