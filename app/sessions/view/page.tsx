import Link from "next/link";
import { notFound } from "next/navigation";

import { parseClaudeDetail } from "@/lib/sessions/claude";
import { parseCodexDetail } from "@/lib/sessions/codex";
import { redactDetail } from "@/lib/sessions/redact";
import { codexSessionsRoot, isAllowedTranscriptPath, sessionsEnabled } from "@/lib/sessions/scan";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 150;

const ROLE_STYLES: Record<string, string> = {
  user: "border-l-2 border-sky-500/70",
  assistant: "border-l-2 border-neutral-500/50",
  tool: "border-l-2 border-amber-500/60",
};

export default async function SessionViewPage({
  searchParams,
}: {
  searchParams: Promise<{ path?: string; page?: string; role?: string; redact?: string }>;
}) {
  if (!sessionsEnabled()) notFound();
  const params = await searchParams;
  const path = params.path ?? "";
  if (!isAllowedTranscriptPath(path)) notFound();

  const redacted = params.redact === "1";
  const rawDetail = path.startsWith(codexSessionsRoot())
    ? await parseCodexDetail(path)
    : await parseClaudeDetail(path);
  const detail = redacted ? redactDetail(rawDetail) : rawDetail;

  const roleFilter = params.role;
  const messages =
    roleFilter === "user" || roleFilter === "assistant" || roleFilter === "tool"
      ? detail.messages.filter((m) => m.role === roleFilter)
      : detail.messages;

  const page = Math.max(1, Number(params.page ?? "1") || 1);
  const pageCount = Math.max(1, Math.ceil(messages.length / PAGE_SIZE));
  const rows = messages.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const s = detail.summary;

  const pageHref = (p: number, role?: string) =>
    `/sessions/view?path=${encodeURIComponent(path)}&page=${p}${role ? `&role=${role}` : ""}${redacted ? "&redact=1" : ""}`;
  const redactToggleHref = `/sessions/view?path=${encodeURIComponent(path)}${redacted ? "" : "&redact=1"}`;

  return (
    <main className="mx-auto max-w-4xl p-6">
      <p className="mb-2 flex items-center gap-4 text-sm">
        <Link className="underline underline-offset-4" href="/sessions">
          ← Sessions
        </Link>
        <Link className="underline underline-offset-4" href={redactToggleHref}>
          {redacted ? "원문 보기" : "reviewer-safe (redacted)"}
        </Link>
        {redacted && (
          <span className="rounded border border-amber-500/60 px-1.5 py-0.5 text-xs">
            assistant 발화 = 미검증 주장 · 자기확신 표현 마스킹됨
          </span>
        )}
      </p>
      <h1 className="text-lg font-semibold">{s.title}</h1>
      <p className="mb-1 font-mono text-xs opacity-70">
        {s.source} · {s.cwd ?? "cwd unknown"} · {s.firstTs?.slice(0, 16)} →{" "}
        {s.lastTs?.slice(0, 16)}
        {s.originator ? ` · ${s.originator}` : ""}
        {s.gitBranch ? ` · ${s.gitBranch}` : ""}
      </p>
      <p className="mb-4 font-mono text-xs opacity-70">
        {s.userCount} user / {s.assistantCount} assistant / {s.toolCount} tool calls ·{" "}
        {s.flaggedCount} rule-surface hits · {(s.fileSizeBytes / 1_048_576).toFixed(1)} MB ·{" "}
        <span className="break-all">{s.jsonlPath}</span>
      </p>

      {detail.fileAccess.some((e) => e.flagged) && (
        <details className="mb-4 rounded border border-amber-500/50 p-3 text-sm" open>
          <summary className="cursor-pointer font-medium">
            Rule-surface access in this session ({detail.fileAccess.filter((e) => e.flagged).length})
          </summary>
          <ul className="mt-2 space-y-1 font-mono text-xs">
            {detail.fileAccess
              .filter((e) => e.flagged)
              .slice(0, 50)
              .map((e, i) => (
                <li key={i}>
                  [{e.op}] {e.path}
                  {e.detail ? <span className="opacity-60"> — {e.detail}</span> : null}
                </li>
              ))}
          </ul>
        </details>
      )}

      <nav className="mb-3 flex flex-wrap items-center gap-2 text-sm">
        <span className="opacity-70">role:</span>
        {["all", "user", "assistant", "tool"].map((r) => (
          <Link
            className={`underline underline-offset-4 ${roleFilter === r || (r === "all" && !roleFilter) ? "font-semibold" : "opacity-70"}`}
            href={pageHref(1, r === "all" ? undefined : r)}
            key={r}
          >
            {r}
          </Link>
        ))}
        <span className="ml-auto opacity-70">
          page {page}/{pageCount}
        </span>
        {page > 1 && (
          <Link className="underline underline-offset-4" href={pageHref(page - 1, roleFilter)}>
            prev
          </Link>
        )}
        {page < pageCount && (
          <Link className="underline underline-offset-4" href={pageHref(page + 1, roleFilter)}>
            next
          </Link>
        )}
      </nav>

      <ol className="space-y-3">
        {rows.map((m) => (
          <li className={`${ROLE_STYLES[m.role]} pl-3`} key={m.idx}>
            <p className="font-mono text-xs opacity-60">
              {m.role}
              {m.toolName ? `:${m.toolName}` : ""} · {m.ts?.slice(11, 19) ?? "—"}
            </p>
            {m.role === "tool" ? (
              <details>
                <summary className="cursor-pointer break-all font-mono text-xs">
                  {m.text.slice(0, 160) || "(no input excerpt)"}
                </summary>
                {m.paths && m.paths.length > 0 && (
                  <ul className="mt-1 font-mono text-xs opacity-80">
                    {m.paths.map((p) => (
                      <li key={p}>{p}</li>
                    ))}
                  </ul>
                )}
              </details>
            ) : (
              <div className="whitespace-pre-wrap break-words text-sm">
                {m.text.length > 3000 ? (
                  <details>
                    <summary className="cursor-pointer">
                      {m.text.slice(0, 3000)}… <em className="opacity-60">(expand)</em>
                    </summary>
                    {m.text.slice(3000)}
                  </details>
                ) : (
                  m.text
                )}
              </div>
            )}
          </li>
        ))}
      </ol>
    </main>
  );
}
