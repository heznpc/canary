"use client";

import { useEffect, useState } from "react";
import { SummaryCards } from "@/components/dashboard/summary-cards";
import { ProjectCard } from "@/components/dashboard/project-card";
import { FilterTabs } from "@/components/dashboard/filter-tabs";
import { AnthropicUsagePanel } from "@/components/dashboard/anthropic-usage-panel";
import { PushLeakagePanel } from "@/components/dashboard/push-leakage-panel";
import { RecentIssuesPanel } from "@/components/dashboard/recent-issues-panel";
import { ReadinessBanners } from "@/components/dashboard/readiness-banners";
import type { DashboardData } from "@/lib/types";
import { RefreshCw } from "lucide-react";

export default function Home() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/scan");
      const json = await res.json();
      setData(json);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(JSON.stringify({ level: "error", message: `Scan failed: ${message}`, timestamp: new Date().toISOString() }));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const filtered = data?.projects.filter((p) => {
    if (filter === "all") return true;
    if (filter === "needs-attention") return p.grade === "C" || p.grade === "D" || p.grade === "F";
    return p.project.category === filter;
  });

  const sorted = filtered?.sort((a, b) => {
    const gradeOrder = { F: 0, D: 1, C: 2, B: 3, A: 4 };
    return gradeOrder[a.grade] - gradeOrder[b.grade];
  });

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b">
        <div className="max-w-6xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Canary</h1>
              <p className="text-sm text-muted-foreground mt-1">
                프로젝트 건강 대시보드
              </p>
            </div>
            <div className="flex items-center gap-3">
              {data && (
                <span className="text-xs text-muted-foreground">
                  Last scan: {new Date(data.lastScan).toLocaleString("ko-KR")}
                </span>
              )}
              <button
                onClick={fetchData}
                disabled={loading}
                className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                {loading ? "스캔 중..." : "재스캔"}
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8 space-y-8">
        {/* Loading state */}
        {loading && !data && (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
            <p className="text-muted-foreground">프로젝트 스캔 중...</p>
          </div>
        )}

        {data && (
          <>
            {/* First-run readiness — surfaces missing token / stale snapshot */}
            <ReadinessBanners />

            {/* Summary */}
            <SummaryCards summary={data.summary} />

            {/* Claude API usage (renders conditionally based on admin key presence) */}
            <AnthropicUsagePanel />

            {/* Push leakage (renders conditionally based on snapshot availability) */}
            <PushLeakagePanel />

            {/* External-contributor issues across the portfolio */}
            <RecentIssuesPanel />

            {/* Filter */}
            <FilterTabs value={filter} onChange={setFilter} />

            {/* Project grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {sorted?.map((health) => (
                <ProjectCard key={health.project.id} health={health} />
              ))}
            </div>

            {sorted?.length === 0 && (
              <div className="text-center py-12 text-muted-foreground">
                해당 필터에 맞는 프로젝트가 없습니다.
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
