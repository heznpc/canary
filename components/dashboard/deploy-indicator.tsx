import type { DeployStatus } from "@/lib/types";

const statusConfig: Record<DeployStatus["status"], { dot: string; text: string; textClass: string }> = {
  up: { dot: "bg-emerald-500", text: "UP", textClass: "text-emerald-600 dark:text-emerald-400" },
  down: { dot: "bg-red-500", text: "DOWN", textClass: "text-red-600 dark:text-red-400" },
  unknown: { dot: "bg-yellow-500", text: "UNKNOWN", textClass: "text-yellow-600 dark:text-yellow-400" },
  "not-deployed": { dot: "bg-gray-400", text: "—", textClass: "text-muted-foreground" },
  // canary refused to probe (non-https URL, FORBIDDEN host, redirect to
  // private address, etc.). Distinct from `unknown` (network/timeout) so
  // operators can see a configuration error vs an outage at a glance.
  misconfigured: { dot: "bg-orange-500", text: "MISCONFIG", textClass: "text-orange-600 dark:text-orange-400" },
};

export function DeployIndicator({ deploy }: { deploy: DeployStatus }) {
  const config = statusConfig[deploy.status];

  return (
    <div className="flex items-center gap-1.5">
      <span className={`inline-block h-2 w-2 rounded-full ${config.dot}`} />
      {deploy.url ? (
        <a
          href={deploy.url}
          target="_blank"
          rel="noopener noreferrer"
          className={`text-xs font-medium hover:underline ${config.textClass}`}
        >
          {deploy.target} {deploy.version ? `v${deploy.version}` : config.text}
        </a>
      ) : (
        <span className={`text-xs font-medium ${config.textClass}`}>
          {deploy.target === "none" ? "No deploy" : deploy.target}
        </span>
      )}
    </div>
  );
}
