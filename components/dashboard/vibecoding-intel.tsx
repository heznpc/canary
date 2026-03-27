"use client";

import type { VibeCodingIntel } from "@/lib/types";
import { AlertTriangle, Lightbulb, FileText } from "lucide-react";

export function VibeCodingPanel({ intel }: { intel: VibeCodingIntel }) {
  const hasContent =
    intel.gotchas.length > 0 || intel.tips.length > 0;

  if (!hasContent) {
    return (
      <p className="text-xs text-muted-foreground">
        특별한 고려사항이 없습니다.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {/* AI 설정 파일 상태 */}
      <div className="flex items-center gap-3 text-xs">
        <span
          className={`inline-flex items-center gap-1 ${intel.hasAgentsMd || intel.hasClaudeMd ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}`}
        >
          <FileText className="h-3 w-3" />
          AGENTS.md {intel.hasAgentsMd ? "O" : "X"}
        </span>
        <span
          className={`inline-flex items-center gap-1 ${intel.hasClaudeMd ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}`}
        >
          <FileText className="h-3 w-3" />
          CLAUDE.md {intel.hasClaudeMd ? "O" : "X"}
        </span>
      </div>

      {/* 주의사항 */}
      {intel.gotchas.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium flex items-center gap-1 text-amber-600 dark:text-amber-400">
            <AlertTriangle className="h-3 w-3" />
            AI가 실수할 수 있는 부분
          </p>
          <ul className="space-y-1">
            {intel.gotchas.map((g, i) => (
              <li key={i} className="text-xs text-muted-foreground pl-4 relative">
                <span className="absolute left-0 text-amber-500">!</span>
                {g}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 팁 */}
      {intel.tips.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium flex items-center gap-1 text-blue-600 dark:text-blue-400">
            <Lightbulb className="h-3 w-3" />
            팁
          </p>
          <ul className="space-y-1">
            {intel.tips.map((t, i) => (
              <li key={i} className="text-xs text-muted-foreground pl-4 relative">
                <span className="absolute left-0 text-blue-500">*</span>
                {t}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
