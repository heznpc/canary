import { Badge } from "@/components/ui/badge";
import type { HealthGrade } from "@/lib/types";

const gradeConfig: Record<HealthGrade, { label: string; className: string }> = {
  A: { label: "A", className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200" },
  B: { label: "B", className: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200" },
  C: { label: "C", className: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200" },
  D: { label: "D", className: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200" },
  F: { label: "F", className: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200" },
};

export function GradeBadge({ grade }: { grade: HealthGrade }) {
  const config = gradeConfig[grade];
  return (
    <Badge variant="outline" className={`text-sm font-bold px-2.5 py-0.5 ${config.className}`}>
      {config.label}
    </Badge>
  );
}
