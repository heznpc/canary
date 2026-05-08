"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { MessageSquare, ExternalLink, Inbox } from "lucide-react";
import type { RecentIssue } from "@/lib/types";

interface PortfolioIssueRow extends RecentIssue {
  repo: string;
}

interface RecentIssuesResponse {
  generatedAt: string;
  windowDays: number;
  totals: { repos: number; externalIssues: number; selfAuthored: number };
  perRepo: Array<{ repo: string; external: number; selfAuthored: number }>;
  top: PortfolioIssueRow[];
}

type PanelState =
  | { kind: "loading" }
  | { kind: "empty"; data: RecentIssuesResponse }
  | { kind: "ready"; data: RecentIssuesResponse }
  | { kind: "error" };

function fmtRelative(iso: string): string {
  const ts = new Date(iso).getTime();
  if (!Number.isFinite(ts)) return iso;
  const diffMs = Date.now() - ts;
  const min = Math.round(diffMs / 60_000);
  if (min < 60) return `${min}m ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}

export function RecentIssuesPanel() {
  const [state, setState] = useState<PanelState>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    fetch("/api/recent-issues?days=30&top=10")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<RecentIssuesResponse>;
      })
      .then((data) => {
        if (cancelled) return;
        if (data.totals.externalIssues === 0) {
          setState({ kind: "empty", data });
        } else {
          setState({ kind: "ready", data });
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
          <p className="text-sm text-muted-foreground">External-contributor 이슈 불러오는 중...</p>
        </CardContent>
      </Card>
    );
  }

  if (state.kind === "empty") {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium flex items-center gap-2">
                <Inbox className="h-4 w-4 text-muted-foreground" />
                External-contributor 이슈
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                최근 {state.data.windowDays}일 동안 외부 기여자가 만든 open issue 없음 ({state.data.totals.repos} repos 스캔).
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const { data } = state;

  return (
    <Card>
      <CardContent className="pt-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-amber-500" />
              External-contributor 이슈 ({data.totals.externalIssues}개, 최근 {data.windowDays}일)
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {data.totals.repos} repos 스캔 · self-authored {data.totals.selfAuthored}개 (제외)
            </p>
          </div>
        </div>

        <div className="space-y-1.5">
          {data.top.map((issue) => (
            <a
              key={`${issue.repo}#${issue.number}`}
              href={issue.url}
              target="_blank"
              rel="noopener"
              className="flex items-start justify-between gap-3 rounded-md border bg-card px-3 py-2 hover:bg-accent transition-colors"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">
                  {issue.title}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5 truncate">
                  <span className="font-mono">{issue.repo}#{issue.number}</span>
                  <span className="mx-1.5">·</span>
                  <span>by {issue.author}</span>
                  <span className="mx-1.5">·</span>
                  <span>{fmtRelative(issue.createdAt)}</span>
                  {issue.comments > 0 && (
                    <>
                      <span className="mx-1.5">·</span>
                      <span>{issue.comments} comments</span>
                    </>
                  )}
                </p>
                {issue.labels.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {issue.labels.slice(0, 4).map((l) => (
                      <span key={l} className="text-[10px] rounded bg-muted px-1.5 py-0.5 text-muted-foreground">
                        {l}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <ExternalLink className="h-3 w-3 mt-1 text-muted-foreground flex-shrink-0" />
            </a>
          ))}
        </div>

        {data.perRepo.length > 1 && (
          <div className="pt-2 border-t">
            <p className="text-xs text-muted-foreground mb-1">Per-repo breakdown</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs">
              {data.perRepo.map((r) => (
                <div key={r.repo} className="flex justify-between">
                  <span className="font-mono truncate text-muted-foreground">{r.repo}</span>
                  <span className="tabular-nums">{r.external}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
