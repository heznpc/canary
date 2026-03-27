import { Badge } from "@/components/ui/badge";
import type { ProjectTag } from "@/lib/projects";

const tagConfig: Record<ProjectTag, { label: string; className: string }> = {
  active: { label: "Active", className: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300" },
  maintenance: { label: "Maintenance", className: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300" },
  archived: { label: "Archived", className: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400" },
  prototype: { label: "Prototype", className: "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300" },
  research: { label: "Research", className: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300" },
};

export function TagBadge({ tag }: { tag: ProjectTag }) {
  const config = tagConfig[tag];
  return (
    <Badge variant="outline" className={`text-xs ${config.className}`}>
      {config.label}
    </Badge>
  );
}
