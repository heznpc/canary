import type { Recommendation } from "@/lib/types";
import { ArrowRight, Check, AlertTriangle, RotateCcw, Archive } from "lucide-react";

const recConfig: Record<Recommendation, { icon: React.ElementType; label: string; className: string }> = {
  keep: { icon: Check, label: "유지", className: "text-emerald-600 dark:text-emerald-400" },
  update: { icon: ArrowRight, label: "업데이트 권장", className: "text-blue-600 dark:text-blue-400" },
  upgrade: { icon: AlertTriangle, label: "업그레이드 필요", className: "text-amber-600 dark:text-amber-400" },
  rewrite: { icon: RotateCcw, label: "재작성 고려", className: "text-red-600 dark:text-red-400" },
  archive: { icon: Archive, label: "아카이브", className: "text-gray-500" },
};

export function RecommendationLabel({ recommendation }: { recommendation: Recommendation }) {
  const config = recConfig[recommendation];
  const Icon = config.icon;

  return (
    <div className={`flex items-center gap-1.5 text-sm font-medium ${config.className}`}>
      <Icon className="h-3.5 w-3.5" />
      {config.label}
    </div>
  );
}
