"use client";

import { useState } from "react";
import type { UpdateAction, ReleaseNoteSummary } from "@/lib/types";
import { Copy, Check, ExternalLink, ChevronDown, Loader2 } from "lucide-react";

export function UpdateActions({ actions }: { actions: UpdateAction[] }) {
  if (actions.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        모든 의존성이 최신 상태입니다.
      </p>
    );
  }

  const majors = actions.filter((a) => a.severity === "major");
  const minors = actions.filter((a) => a.severity === "minor");
  const patches = actions.filter((a) => a.severity === "patch");

  // Node PM일 때만 일괄 업데이트 커맨드 생성 (Python/Flutter/JVM은 벌크 불가)
  const nodePMs = new Set(["pnpm", "npm", "yarn"]);
  const firstCmd = actions[0]?.command ?? "";
  const pm = firstCmd.split(" ")[0];
  const isNodePm = nodePMs.has(pm);
  const bulkMinorPatch = isNodePm
    ? actions.filter((a) => a.severity !== "major").map((a) => a.name)
    : [];
  const bulkCmd =
    bulkMinorPatch.length > 0
      ? `${pm} update ${bulkMinorPatch.join(" ")}`
      : null;

  return (
    <div className="space-y-3">
      {/* 일괄 minor/patch 업데이트 */}
      {bulkCmd && (
        <div className="rounded-md bg-muted/50 p-3">
          <p className="text-xs font-medium mb-1.5">
            Minor/Patch 일괄 업데이트 ({bulkMinorPatch.length}개)
          </p>
          <CopyableCommand command={bulkCmd} />
        </div>
      )}

      {/* 메이저 업데이트 (개별) */}
      {majors.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-red-600 dark:text-red-400">
            Breaking Changes ({majors.length}개)
          </p>
          {majors.map((action) => (
            <ActionRow key={action.name} action={action} />
          ))}
        </div>
      )}

      {/* 마이너 */}
      {minors.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-amber-600 dark:text-amber-400">
            Minor ({minors.length}개)
          </p>
          {minors.map((action) => (
            <ActionRow key={action.name} action={action} compact />
          ))}
        </div>
      )}

      {/* 패치 */}
      {patches.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">
            Patch ({patches.length}개)
          </p>
          {patches.map((action) => (
            <ActionRow key={action.name} action={action} compact />
          ))}
        </div>
      )}
    </div>
  );
}

function ActionRow({
  action,
  compact,
}: {
  action: UpdateAction;
  compact?: boolean;
}) {
  const [releaseNotes, setReleaseNotes] =
    useState<ReleaseNoteSummary | null>(null);
  const [loadingNotes, setLoadingNotes] = useState(false);
  const [showNotes, setShowNotes] = useState(false);

  const fetchNotes = async () => {
    if (releaseNotes) {
      setShowNotes(!showNotes);
      return;
    }
    setLoadingNotes(true);
    setShowNotes(true);
    try {
      const params = new URLSearchParams({
        package: action.name,
        from: action.current,
        to: action.latest,
        ...(action.githubRepo ? { repo: action.githubRepo } : {}),
      });
      const res = await fetch(`/api/releases?${params}`);
      if (res.ok) {
        setReleaseNotes(await res.json());
      }
    } catch {
      // 실패 시 무시
    } finally {
      setLoadingNotes(false);
    }
  };

  return (
    <div className="rounded-md border p-2.5 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-mono font-medium truncate">
            {action.name}
          </span>
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            {action.current} → {action.latest}
          </span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {action.severity === "major" && (
            <button
              onClick={fetchNotes}
              className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline"
            >
              {loadingNotes ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <ChevronDown
                  className={`h-3 w-3 transition-transform ${showNotes ? "rotate-180" : ""}`}
                />
              )}
              릴리스 노트
            </button>
          )}
          {action.changelogUrl && (
            <a
              href={action.changelogUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground"
            >
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      </div>

      {!compact && <CopyableCommand command={action.command} />}

      {/* 온디맨드 릴리스 노트
         XSS-safe: breaking/highlights are rendered as React text children (JSX interpolation),
         which auto-escapes HTML entities. No dangerouslySetInnerHTML is used. */}
      {showNotes && releaseNotes && (
        <div className="border-t pt-2 mt-2 space-y-2">
          {releaseNotes.releases.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              릴리스 노트를 찾을 수 없습니다.
            </p>
          ) : (
            releaseNotes.releases.slice(0, 3).map((rel) => (
              <div key={rel.version} className="space-y-1">
                <a
                  href={rel.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-medium hover:underline"
                >
                  v{rel.version}{" "}
                  <span className="text-muted-foreground font-normal">
                    ({rel.date})
                  </span>
                </a>
                {rel.breaking.length > 0 && (
                  <ul className="text-xs space-y-0.5">
                    {rel.breaking.slice(0, 5).map((b, i) => (
                      <li
                        key={i}
                        className="text-red-600 dark:text-red-400 pl-3 relative before:content-['!'] before:absolute before:left-0 before:font-bold"
                      >
                        {b}
                      </li>
                    ))}
                  </ul>
                )}
                {rel.highlights.length > 0 && (
                  <ul className="text-xs space-y-0.5">
                    {rel.highlights.slice(0, 3).map((h, i) => (
                      <li
                        key={i}
                        className="text-muted-foreground pl-3 relative before:content-['+'] before:absolute before:left-0"
                      >
                        {h}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))
          )}
          {releaseNotes.migrationGuideUrl && (
            <a
              href={releaseNotes.migrationGuideUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline"
            >
              <ExternalLink className="h-3 w-3" />
              마이그레이션 가이드
            </a>
          )}
        </div>
      )}
    </div>
  );
}

function CopyableCommand({ command }: { command: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard API 미지원 또는 권한 거부
    }
  };

  return (
    <div className="flex items-center gap-2 rounded bg-muted px-2.5 py-1.5">
      <code className="text-xs font-mono flex-1 overflow-x-auto">
        {command}
      </code>
      <button
        onClick={copy}
        className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
      >
        {copied ? (
          <Check className="h-3.5 w-3.5 text-emerald-500" />
        ) : (
          <Copy className="h-3.5 w-3.5" />
        )}
      </button>
    </div>
  );
}
