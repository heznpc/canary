import Link from "next/link";
import { notFound } from "next/navigation";

import { getSessionsIndex, sessionsEnabled } from "@/lib/sessions/scan";

export const dynamic = "force-dynamic";

function fmtTs(ts: string | null): string {
  if (!ts) return "—";
  return ts.replace("T", " ").slice(0, 16);
}

function shortCwd(cwd: string | null): string {
  if (!cwd) return "—";
  return cwd.replace(/^\/Users\/[^/]+/, "~");
}

export default async function SessionsPage({
  searchParams,
}: {
  searchParams: Promise<{ source?: string; q?: string; flagged?: string }>;
}) {
  if (!sessionsEnabled()) notFound();
  const params = await searchParams;
  const q = (params.q ?? "").toLowerCase();
  const source = params.source;
  const flaggedOnly = params.flagged === "1";

  const index = await getSessionsIndex();
  const sourceOptions = Array.from(new Set(index.sessions.map((s) => s.source))).sort();
  let sessions = index.sessions;
  if (source && sourceOptions.includes(source as (typeof sourceOptions)[number])) {
    sessions = sessions.filter((s) => s.source === source);
  }
  if (flaggedOnly) sessions = sessions.filter((s) => s.flaggedCount > 0);
  if (q) {
    sessions = sessions.filter(
      (s) => s.title.toLowerCase().includes(q) || (s.cwd ?? "").toLowerCase().includes(q),
    );
  }
  const total = sessions.length;
  const rows = sessions.slice(0, 300);

  return (
    <main className="mx-auto max-w-6xl p-6">
      <div className="mb-1 flex items-baseline justify-between gap-4">
        <h1 className="text-xl font-semibold">Sessions</h1>
        <nav className="text-sm">
          <Link className="underline underline-offset-4" href="/sessions/files">
            File-access investigation →
          </Link>
        </nav>
      </div>
      <p className="mb-4 text-sm opacity-70">
        {index.fileCount} transcripts indexed in {(index.durationMs / 1000).toFixed(1)}s · showing{" "}
        {rows.length} of {total}
        {index.parseErrorFiles > 0 ? ` · ${index.parseErrorFiles} files with parse errors` : ""}
      </p>

      <form className="mb-4 flex flex-wrap items-center gap-2 text-sm" method="get">
        <input
          className="rounded border border-neutral-500/40 bg-transparent px-2 py-1"
          defaultValue={params.q ?? ""}
          name="q"
          placeholder="filter title / cwd…"
        />
        <select
          className="rounded border border-neutral-500/40 bg-transparent px-2 py-1"
          defaultValue={source ?? ""}
          name="source"
        >
          <option value="">all sources</option>
          {sourceOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1">
          <input defaultChecked={flaggedOnly} name="flagged" type="checkbox" value="1" />
          rule-surface touched only
        </label>
        <button className="rounded border border-neutral-500/40 px-3 py-1" type="submit">
          Apply
        </button>
      </form>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-500/40 text-left opacity-70">
              <th className="py-2 pr-3">src</th>
              <th className="py-2 pr-3">session</th>
              <th className="py-2 pr-3">cwd</th>
              <th className="py-2 pr-3">last activity</th>
              <th className="py-2 pr-3 text-right">msgs</th>
              <th className="py-2 pr-3 text-right">tools</th>
              <th className="py-2 pr-0 text-right">rule hits</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr className="border-b border-neutral-500/15 align-top" key={s.id}>
                <td className="py-2 pr-3">
                  <span className="rounded border border-neutral-500/40 px-1.5 py-0.5 text-xs">
                    {s.source}
                  </span>
                </td>
                <td className="max-w-md py-2 pr-3">
                  <Link
                    className="underline underline-offset-4"
                    href={`/sessions/view?path=${encodeURIComponent(s.jsonlPath)}`}
                  >
                    {s.title}
                  </Link>
                </td>
                <td className="py-2 pr-3 font-mono text-xs opacity-80">{shortCwd(s.cwd)}</td>
                <td className="py-2 pr-3 whitespace-nowrap font-mono text-xs">{fmtTs(s.lastTs)}</td>
                <td className="py-2 pr-3 text-right font-mono text-xs">
                  {s.userCount}/{s.assistantCount}
                </td>
                <td className="py-2 pr-3 text-right font-mono text-xs">{s.toolCount}</td>
                <td className="py-2 pr-0 text-right font-mono text-xs">
                  {s.flaggedCount > 0 ? <strong>{s.flaggedCount}</strong> : "·"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
