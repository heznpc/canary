"use client";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { GradeBadge } from "./grade-badge";
import { TagBadge } from "./tag-badge";
import { DeployIndicator } from "./deploy-indicator";
import { RecommendationLabel } from "./recommendation-label";
import type { ProjectHealth } from "@/lib/types";
import { GitBranch, Package, Clock } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ko } from "date-fns/locale";

export function ProjectCard({ health }: { health: ProjectHealth }) {
  const { project, git, dependencies, stack, deploy, grade, recommendation, reasons } = health;

  const lastCommitAgo = git?.lastCommitDate
    ? formatDistanceToNow(new Date(git.lastCommitDate), { addSuffix: true, locale: ko })
    : null;

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-lg">{project.name}</h3>
              <GradeBadge grade={grade} />
              <TagBadge tag={project.tag} />
            </div>
            <p className="text-sm text-muted-foreground">{project.description}</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Stack versions */}
        <div className="flex flex-wrap gap-1.5">
          {stack.map((s) => (
            <span
              key={s.name}
              className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${
                s.eol
                  ? "bg-red-50 text-red-700 ring-red-600/20 dark:bg-red-950 dark:text-red-300 dark:ring-red-500/30"
                  : s.releasesBehind > 0
                  ? "bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-950 dark:text-amber-300 dark:ring-amber-500/30"
                  : "bg-gray-50 text-gray-700 ring-gray-600/20 dark:bg-gray-900 dark:text-gray-300 dark:ring-gray-500/30"
              }`}
            >
              {s.name} {s.current ?? ""}
              {s.releasesBehind > 0 && ` → ${s.latest}`}
              {s.eol && " (EOL)"}
            </span>
          ))}
        </div>

        {/* Info row */}
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          {git && lastCommitAgo && (
            <div className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {lastCommitAgo}
            </div>
          )}
          {project.repo && (
            <a
              href={`https://github.com/${project.repo}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 hover:text-foreground"
            >
              <GitBranch className="h-3 w-3" />
              {project.repo}
            </a>
          )}
          {dependencies && (
            <div className="flex items-center gap-1">
              <Package className="h-3 w-3" />
              {dependencies.total} deps
              {dependencies.outdatedMajor > 0 && (
                <span className="text-amber-600 dark:text-amber-400">
                  ({dependencies.outdatedMajor} major behind)
                </span>
              )}
            </div>
          )}
        </div>

        {/* Deploy */}
        <DeployIndicator deploy={deploy} />

        {/* Recommendation & reasons */}
        <div className="border-t pt-3 space-y-1.5">
          <RecommendationLabel recommendation={recommendation} />
          <ul className="text-xs text-muted-foreground space-y-0.5">
            {reasons.map((reason, i) => (
              <li key={i}>• {reason}</li>
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
