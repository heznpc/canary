"use client";

import type { ResearchIntel } from "@/lib/types";
import { ExternalLink, TrendingUp, Flame, Activity, Minus } from "lucide-react";

const activityConfig = {
  hot: { label: "🔥 Hot", color: "text-red-600 dark:text-red-400", icon: Flame },
  active: { label: "활발", color: "text-amber-600 dark:text-amber-400", icon: TrendingUp },
  stable: { label: "안정", color: "text-blue-600 dark:text-blue-400", icon: Activity },
  quiet: { label: "조용", color: "text-gray-500 dark:text-gray-400", icon: Minus },
} as const;

export function ResearchPanel({ intel }: { intel: ResearchIntel }) {
  const activity = activityConfig[intel.fieldActivity];
  const ActivityIcon = activity.icon;

  return (
    <div className="space-y-4">
      {/* 분야 활동도 + 요약 */}
      <div className="rounded-lg bg-muted/50 p-3 space-y-2">
        <div className="flex items-center gap-2">
          <ActivityIcon className={`h-4 w-4 ${activity.color}`} />
          <span className={`text-sm font-medium ${activity.color}`}>
            분야 활동: {activity.label}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">{intel.suggestion}</p>
      </div>

      {/* 트렌딩 키워드 */}
      {intel.trendingKeywords.length > 0 && (
        <div className="space-y-1.5">
          <h4 className="text-xs font-medium text-muted-foreground">
            최근 논문에서 자주 등장하는 키워드
          </h4>
          <div className="flex flex-wrap gap-1.5">
            {intel.trendingKeywords.map((kw) => (
              <span
                key={kw}
                className="inline-flex items-center rounded-md bg-blue-50 px-2 py-0.5 text-xs text-blue-700 ring-1 ring-inset ring-blue-600/20 dark:bg-blue-950 dark:text-blue-300 dark:ring-blue-500/30"
              >
                {kw}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* 최근 관련 논문 */}
      {intel.recentPapers.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-medium text-muted-foreground">
            최근 관련 논문 (최대 5편)
          </h4>
          <ul className="space-y-2">
            {intel.recentPapers.map((paper, i) => (
              <li key={i} className="rounded-md border p-2.5 space-y-1">
                <a
                  href={paper.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-start gap-1.5 text-sm font-medium hover:text-primary transition-colors"
                >
                  <ExternalLink className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span className="line-clamp-2">{paper.title}</span>
                </a>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span>{paper.authors}</span>
                  {paper.year > 0 && <span>{paper.year}</span>}
                  {paper.venue && (
                    <span className="truncate max-w-[150px]">{paper.venue}</span>
                  )}
                  <span>인용 {paper.citationCount}</span>
                </div>
                {paper.tldr && (
                  <p className="text-xs text-muted-foreground/80 line-clamp-2">
                    {paper.tldr}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {intel.recentPapers.length === 0 && (
        <p className="text-xs text-muted-foreground">
          최근 관련 논문을 찾지 못했습니다. 키워드를 조정해 볼 수 있습니다.
        </p>
      )}
    </div>
  );
}
