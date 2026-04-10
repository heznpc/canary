"use client";

import type {
  ContextAttention,
  AgentAuthorship,
  MetadataficationStatus,
  AgentTool,
} from "@/lib/types";
import { Activity, GitCommit, Layers } from "lucide-react";

interface Props {
  contextAttention: ContextAttention | null;
  agentAuthorship: AgentAuthorship | null;
  metadatafication: MetadataficationStatus | null;
}

const PHASE_LABEL: Record<MetadataficationStatus["phase"], string> = {
  "active-tool": "Phase 1 · Active Tool",
  "assisted-tool": "Phase 2 · Creation",
  "infrastructure-metadata": "Phase 3 · Refinement",
};

const PHASE_COLOR: Record<MetadataficationStatus["phase"], string> = {
  "active-tool":
    "bg-gray-100 text-gray-700 ring-gray-500/20 dark:bg-gray-900 dark:text-gray-300 dark:ring-gray-500/30",
  "assisted-tool":
    "bg-blue-50 text-blue-700 ring-blue-500/20 dark:bg-blue-950 dark:text-blue-300 dark:ring-blue-500/30",
  "infrastructure-metadata":
    "bg-emerald-50 text-emerald-700 ring-emerald-500/20 dark:bg-emerald-950 dark:text-emerald-300 dark:ring-emerald-500/30",
};

const TOOL_LABEL: Record<AgentTool, string> = {
  claude: "Claude",
  copilot: "Copilot",
  cursor: "Cursor",
  devin: "Devin",
  other: "Other",
};

export function MetadataficationPanel({
  contextAttention,
  agentAuthorship,
  metadatafication,
}: Props) {
  if (!contextAttention && !agentAuthorship && !metadatafication) {
    return (
      <p className="text-xs text-muted-foreground">
        Metadatafication 데이터를 수집하지 못했습니다.
      </p>
    );
  }

  const cam = contextAttention?.cam ?? 0;
  const acr = agentAuthorship?.acr ?? 0;

  return (
    <div className="space-y-4">
      {/* Phase indicator */}
      {metadatafication && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Layers className="h-3.5 w-3.5 text-muted-foreground" />
            <span
              className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${PHASE_COLOR[metadatafication.phase]}`}
            >
              {PHASE_LABEL[metadatafication.phase]}
            </span>
            <span className="text-xs text-muted-foreground">
              progress {metadatafication.progressScore}/100
            </span>
          </div>
          <p className="text-xs text-muted-foreground pl-5">
            {metadatafication.rationale}
          </p>
          {/* Progress bar */}
          <div className="h-1 w-full overflow-hidden rounded-full bg-muted ml-5">
            <div
              className="h-full bg-gradient-to-r from-blue-500 to-emerald-500 transition-all"
              style={{ width: `${metadatafication.progressScore}%` }}
            />
          </div>
        </div>
      )}

      {/* CAM card */}
      {contextAttention && (
        <div className="space-y-1.5 rounded-md border p-3">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-xs font-medium">
              <Activity className="h-3 w-3 text-blue-500" />
              Context Attention Metric (90d)
            </span>
            <span className="text-xs font-mono">{(cam * 100).toFixed(1)}%</span>
          </div>
          <p className="text-xs text-muted-foreground">
            {contextAttention.contextCommits} of {contextAttention.totalCommits} commits
            touched agent-era files
          </p>
          {contextAttention.agentEraFiles.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-1">
              {contextAttention.agentEraFiles.slice(0, 6).map((f) => (
                <span
                  key={f}
                  className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground"
                >
                  {f}
                </span>
              ))}
              {contextAttention.agentEraFiles.length > 6 && (
                <span className="text-[10px] text-muted-foreground">
                  +{contextAttention.agentEraFiles.length - 6} more
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* ACR card */}
      {agentAuthorship && (
        <div className="space-y-1.5 rounded-md border p-3">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-xs font-medium">
              <GitCommit className="h-3 w-3 text-emerald-500" />
              Agent-Authored Commit Ratio (90d)
            </span>
            <span className="text-xs font-mono">{(acr * 100).toFixed(1)}%</span>
          </div>
          <p className="text-xs text-muted-foreground">
            {agentAuthorship.agentCommits} agent · {agentAuthorship.botCommits} bot ·{" "}
            {agentAuthorship.totalCommits - agentAuthorship.agentCommits - agentAuthorship.botCommits} human
            {agentAuthorship.sampled && " (sampled)"}
          </p>
          {agentAuthorship.dominantTool && agentAuthorship.agentCommits > 0 && (
            <div className="flex flex-wrap gap-1 pt-1">
              {(Object.entries(agentAuthorship.toolBreakdown) as [AgentTool, number][])
                .filter(([, count]) => count > 0)
                .sort((a, b) => b[1] - a[1])
                .map(([tool, count]) => (
                  <span
                    key={tool}
                    className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
                  >
                    {TOOL_LABEL[tool]} ×{count}
                  </span>
                ))}
            </div>
          )}
          <p className="text-[10px] text-muted-foreground italic pt-1">
            ACR is a conservative lower bound — many AI-assisted commits lack markers.
          </p>
        </div>
      )}
    </div>
  );
}
