import type { CodeQuality, ActivityPulse, ScorecardResult } from "@/lib/types";
import {
  CheckCircle2,
  XCircle,
  GitPullRequest,
  CircleDot,
  Users,
  Activity,
  Shield,
} from "lucide-react";

function StatusIcon({ ok }: { ok: boolean }) {
  return ok ? (
    <CheckCircle2 className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
  ) : (
    <XCircle className="h-3.5 w-3.5 text-red-500 dark:text-red-400" />
  );
}

function QualityRow({ label, ok, detail }: { label: string; ok: boolean; detail?: string }) {
  return (
    <div className="flex items-center justify-between py-1">
      <div className="flex items-center gap-2 text-xs">
        <StatusIcon ok={ok} />
        <span className={ok ? "text-foreground" : "text-muted-foreground"}>{label}</span>
      </div>
      {detail && (
        <span className="text-xs text-muted-foreground">{detail}</span>
      )}
    </div>
  );
}

function scorecardColor(score: number) {
  if (score >= 8) return "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300";
  if (score >= 6) return "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300";
  if (score >= 4) return "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300";
  return "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300";
}

export function CodeHealthPanel({
  quality,
  scorecard,
  activity,
}: {
  quality: CodeQuality | null;
  scorecard: ScorecardResult | null;
  activity: ActivityPulse | null;
}) {
  if (!quality && !scorecard && !activity) {
    return (
      <p className="text-xs text-muted-foreground">
        GitHub 레포 연결 없음 — 코드 품질 스캔 불가
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {/* Code Quality */}
      {quality && (
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold text-foreground">코드 품질</h4>
            <span
              className={`text-xs font-medium px-1.5 py-0.5 rounded ${
                quality.score >= 70
                  ? "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300"
                  : quality.score >= 40
                    ? "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
                    : "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"
              }`}
            >
              {quality.score}/100
            </span>
          </div>
          <div className="divide-y divide-border">
            <QualityRow
              label="CI/CD"
              ok={quality.hasCI}
              detail={quality.ciPlatforms.join(", ") || undefined}
            />
            <QualityRow
              label="테스트"
              ok={quality.hasTests}
              detail={quality.testFramework ?? undefined}
            />
            <QualityRow label="린팅" ok={quality.hasLint} />
            <QualityRow label="타입 체크" ok={quality.hasTypeCheck} />
            <QualityRow label="라이선스" ok={quality.hasLicense} />
            <QualityRow
              label="의존성 자동 업데이트"
              ok={quality.hasDependencyBot}
              detail={quality.dependencyBotName ?? undefined}
            />
            <QualityRow label="보안 정책" ok={quality.hasSecurityPolicy} />
          </div>
        </div>
      )}

      {/* OpenSSF Scorecard */}
      {scorecard && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <Shield className="h-3.5 w-3.5" />
              OpenSSF Scorecard
            </h4>
            <span className={`text-xs font-bold px-2 py-0.5 rounded ${scorecardColor(scorecard.score)}`}>
              {scorecard.score}/10
            </span>
          </div>
          <div className="grid grid-cols-2 gap-1">
            {scorecard.checks
              .sort((a, b) => a.score - b.score)
              .slice(0, 8)
              .map((check) => (
                <div key={check.name} className="flex items-center justify-between text-[11px] px-1.5 py-1 rounded bg-muted/50">
                  <span className="text-muted-foreground truncate">{check.name}</span>
                  <span className={`font-semibold ml-1 ${
                    check.score >= 8 ? "text-green-600 dark:text-green-400"
                    : check.score >= 5 ? "text-amber-600 dark:text-amber-400"
                    : "text-red-500 dark:text-red-400"
                  }`}>
                    {check.score}
                  </span>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Activity Pulse */}
      {activity && (
        <div className="space-y-2">
          <h4 className="text-xs font-semibold text-foreground">활동 현황</h4>
          <div className="grid grid-cols-2 gap-2">
            <StatCard
              icon={<Activity className="h-3.5 w-3.5" />}
              label="최근 4주 커밋"
              value={activity.commitsLast4Weeks}
              sub={`평균 ${activity.weeklyCommitAvg}/주`}
            />
            <StatCard
              icon={<GitPullRequest className="h-3.5 w-3.5" />}
              label="열린 PR"
              value={activity.openPRs}
            />
            <StatCard
              icon={<CircleDot className="h-3.5 w-3.5" />}
              label="열린 이슈"
              value={activity.openIssues}
            />
            <StatCard
              icon={<Users className="h-3.5 w-3.5" />}
              label="기여자"
              value={activity.contributors}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  sub?: string;
}) {
  return (
    <div className="rounded-md border p-2 space-y-0.5">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        {icon}
        <span className="text-[10px]">{label}</span>
      </div>
      <div className="text-sm font-semibold">{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground">{sub}</div>}
    </div>
  );
}
