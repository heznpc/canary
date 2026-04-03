import type { CodeQuality, ActivityPulse } from "@/lib/types";
import {
  CheckCircle2,
  XCircle,
  GitPullRequest,
  CircleDot,
  Users,
  Activity,
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

export function CodeHealthPanel({
  quality,
  activity,
}: {
  quality: CodeQuality | null;
  activity: ActivityPulse | null;
}) {
  if (!quality && !activity) {
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
            <QualityRow label="보안 정책" ok={quality.hasSecurityPolicy} />
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
