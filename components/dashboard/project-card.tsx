"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { GradeBadge } from "./grade-badge";
import { TagBadge } from "./tag-badge";
import { DeployIndicator } from "./deploy-indicator";
import { RecommendationLabel } from "./recommendation-label";
import { UpdateActions } from "./update-actions";
import { VibeCodingPanel } from "./vibecoding-intel";
import { ResearchPanel } from "./research-intel";
import { CodeHealthPanel } from "./code-health-intel";
import { MetadataficationPanel } from "./metadatafication-panel";
import type { ProjectHealth } from "@/lib/types";
import {
  GitBranch,
  Package,
  Clock,
  ChevronDown,
  Terminal,
  Sparkles,
  BookOpen,
  ShieldCheck,
  Layers,
  MessageSquare,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ko } from "date-fns/locale";

type DetailTab = "updates" | "vibecoding" | "research" | "codehealth" | "metadatafication";

export function ProjectCard({ health }: { health: ProjectHealth }) {
  const [expanded, setExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<DetailTab>("updates");

  const {
    project,
    git,
    dependencies,
    stack,
    deploy,
    updateActions,
    vibeCoding,
    research,
    codeQuality,
    scorecard,
    activity,
    contextAttention,
    agentAuthorship,
    metadatafication,
    recentIssues,
    grade,
    recommendation,
    reasons,
  } = health;

  const lastCommitAgo = git?.lastCommitDate
    ? formatDistanceToNow(new Date(git.lastCommitDate), {
        addSuffix: true,
        locale: ko,
      })
    : null;

  const outdatedCount = updateActions.length;
  const hasGotchas = vibeCoding.gotchas.length > 0;
  const hasResearch = research !== null && research.recentPapers.length > 0;
  const hasCodeHealth = codeQuality !== null || activity !== null;
  const hasMetadatafication =
    contextAttention !== null || agentAuthorship !== null || metadatafication !== null;
  const phaseShort = metadatafication
    ? metadatafication.phase === "infrastructure-metadata"
      ? "P3"
      : metadatafication.phase === "assisted-tool"
        ? "P2"
        : "P1"
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
            <p className="text-sm text-muted-foreground">
              {project.description}
            </p>
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
          {recentIssues && recentIssues.external.length > 0 && (
            <a
              href={`https://github.com/${project.repo}/issues?q=is%3Aissue+is%3Aopen`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-amber-600 dark:text-amber-400 hover:underline"
              title={`${recentIssues.external.length} external-contributor issue(s) in last ${recentIssues.windowDays}d`}
            >
              <MessageSquare className="h-3 w-3" />
              {recentIssues.external.length}
            </a>
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

        {/* Expand toggle */}
        {(outdatedCount > 0 || hasGotchas || vibeCoding.tips.length > 0 || hasResearch || hasCodeHealth || hasMetadatafication) && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors w-full pt-1"
          >
            <ChevronDown
              className={`h-3.5 w-3.5 transition-transform ${expanded ? "rotate-180" : ""}`}
            />
            {expanded ? "접기" : "상세 보기"}
            {!expanded && (
              <span className="flex items-center gap-2 ml-auto">
                {outdatedCount > 0 && (
                  <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                    <Terminal className="h-3 w-3" />
                    {outdatedCount}개 업데이트
                  </span>
                )}
                {hasGotchas && (
                  <span className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400">
                    <Sparkles className="h-3 w-3" />
                    AI 고려사항
                  </span>
                )}
                {hasCodeHealth && (
                  <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                    <ShieldCheck className="h-3 w-3" />
                    코드 건강
                  </span>
                )}
                {hasResearch && (
                  <span className="inline-flex items-center gap-1 text-purple-600 dark:text-purple-400">
                    <BookOpen className="h-3 w-3" />
                    리서치 동향
                  </span>
                )}
                {hasMetadatafication && phaseShort && (
                  <span className="inline-flex items-center gap-1 text-indigo-600 dark:text-indigo-400">
                    <Layers className="h-3 w-3" />
                    Meta {phaseShort}
                  </span>
                )}
              </span>
            )}
          </button>
        )}

        {/* Expanded detail */}
        {expanded && (
          <div className="border-t pt-3 space-y-3">
            {/* Tab switcher */}
            <div className="flex gap-1">
              <TabButton
                active={activeTab === "updates"}
                onClick={() => setActiveTab("updates")}
                icon={<Terminal className="h-3 w-3" />}
                label="업데이트 액션"
                count={outdatedCount}
              />
              <TabButton
                active={activeTab === "vibecoding"}
                onClick={() => setActiveTab("vibecoding")}
                icon={<Sparkles className="h-3 w-3" />}
                label="바이브코딩"
                count={vibeCoding.gotchas.length}
              />
              {hasCodeHealth && (
                <TabButton
                  active={activeTab === "codehealth"}
                  onClick={() => setActiveTab("codehealth")}
                  icon={<ShieldCheck className="h-3 w-3" />}
                  label="코드 건강"
                  count={codeQuality ? codeQuality.score : 0}
                />
              )}
              {hasResearch && (
                <TabButton
                  active={activeTab === "research"}
                  onClick={() => setActiveTab("research")}
                  icon={<BookOpen className="h-3 w-3" />}
                  label="리서치"
                  count={research!.recentPapers.length}
                />
              )}
              {hasMetadatafication && (
                <TabButton
                  active={activeTab === "metadatafication"}
                  onClick={() => setActiveTab("metadatafication")}
                  icon={<Layers className="h-3 w-3" />}
                  label="Meta"
                  count={metadatafication?.progressScore ?? 0}
                />
              )}
            </div>

            {/* Tab content */}
            {activeTab === "updates" && (
              <UpdateActions actions={updateActions} />
            )}
            {activeTab === "vibecoding" && (
              <VibeCodingPanel intel={vibeCoding} />
            )}
            {activeTab === "codehealth" && (
              <CodeHealthPanel quality={codeQuality} scorecard={scorecard} activity={activity} />
            )}
            {activeTab === "research" && research && (
              <ResearchPanel intel={research} />
            )}
            {activeTab === "metadatafication" && (
              <MetadataficationPanel
                contextAttention={contextAttention}
                agentAuthorship={agentAuthorship}
                metadatafication={metadatafication}
              />
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  count: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
        active
          ? "bg-primary text-primary-foreground"
          : "bg-muted text-muted-foreground hover:text-foreground"
      }`}
    >
      {icon}
      {label}
      {count > 0 && (
        <span
          className={`rounded-full px-1.5 py-0.5 text-[10px] ${
            active
              ? "bg-primary-foreground/20"
              : "bg-foreground/10"
          }`}
        >
          {count}
        </span>
      )}
    </button>
  );
}
