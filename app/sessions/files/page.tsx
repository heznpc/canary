import Link from "next/link";
import { notFound } from "next/navigation";

import { getFileAccessAggregates, getSessionsIndex, sessionsEnabled } from "@/lib/sessions/scan";

export const dynamic = "force-dynamic";

export default async function FileAccessPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; flagged?: string; path?: string }>;
}) {
  if (!sessionsEnabled()) notFound();
  const params = await searchParams;
  const q = (params.q ?? "").toLowerCase();
  const flaggedOnly = params.flagged !== "0"; // investigation view defaults to rule surfaces
  const focusPath = params.path;

  const [aggregates, index] = await Promise.all([getFileAccessAggregates(), getSessionsIndex()]);
  const sessionById = new Map(index.sessions.map((s) => [s.id, s]));

  let rows = aggregates;
  if (flaggedOnly) rows = rows.filter((a) => a.flagged);
  if (q) rows = rows.filter((a) => a.path.toLowerCase().includes(q));
  const total = rows.length;
  rows = rows.slice(0, 400);

  const focus = focusPath ? aggregates.find((a) => a.path === focusPath) : undefined;

  return (
    <main className="mx-auto max-w-5xl p-6">
      <p className="mb-2 text-sm">
        <Link className="underline underline-offset-4" href="/sessions">
          ← Sessions
        </Link>
      </p>
      <h1 className="mb-1 text-xl font-semibold">File-access investigation</h1>
      <p className="mb-4 text-sm opacity-70">
        Which sessions read or wrote which files — rule/config surfaces first. Showing {rows.length}{" "}
        of {total} paths.
      </p>

      <form className="mb-4 flex flex-wrap items-center gap-2 text-sm" method="get">
        <input
          className="rounded border border-neutral-500/40 bg-transparent px-2 py-1"
          defaultValue={params.q ?? ""}
          name="q"
          placeholder="filter path…"
        />
        <label className="flex items-center gap-1">
          <input defaultChecked={!flaggedOnly} name="flagged" type="checkbox" value="0" />
          include non-rule paths
        </label>
        <button className="rounded border border-neutral-500/40 px-3 py-1" type="submit">
          Apply
        </button>
      </form>

      {focus && (
        <section className="mb-6 rounded border border-amber-500/50 p-3">
          <h2 className="break-all font-mono text-sm font-semibold">{focus.path}</h2>
          <p className="mb-2 text-xs opacity-70">
            {focus.reads} reads · {focus.writes} writes · {focus.bash} shell ·{" "}
            {focus.sessionIds.length} sessions
          </p>
          <ul className="space-y-1 text-sm">
            {focus.sessionIds.slice(0, 50).map((id) => {
              const s = sessionById.get(id);
              if (!s) return <li key={id}>{id}</li>;
              return (
                <li key={id}>
                  <Link
                    className="underline underline-offset-4"
                    href={`/sessions/view?path=${encodeURIComponent(s.jsonlPath)}`}
                  >
                    [{s.source}] {s.title}
                  </Link>{" "}
                  <span className="font-mono text-xs opacity-60">{s.lastTs?.slice(0, 16)}</span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-500/40 text-left opacity-70">
              <th className="py-2 pr-3">path</th>
              <th className="py-2 pr-3 text-right">reads</th>
              <th className="py-2 pr-3 text-right">writes</th>
              <th className="py-2 pr-3 text-right">shell</th>
              <th className="py-2 pr-3 text-right">sessions</th>
              <th className="py-2 pr-0">last</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => (
              <tr className="border-b border-neutral-500/15" key={a.path}>
                <td className="max-w-xl break-all py-1.5 pr-3 font-mono text-xs">
                  <Link
                    className={`underline underline-offset-4 ${a.flagged ? "font-semibold" : ""}`}
                    href={`/sessions/files?path=${encodeURIComponent(a.path)}${flaggedOnly ? "" : "&flagged=0"}`}
                  >
                    {a.path}
                  </Link>
                </td>
                <td className="py-1.5 pr-3 text-right font-mono text-xs">{a.reads}</td>
                <td className="py-1.5 pr-3 text-right font-mono text-xs">{a.writes}</td>
                <td className="py-1.5 pr-3 text-right font-mono text-xs">{a.bash}</td>
                <td className="py-1.5 pr-3 text-right font-mono text-xs">{a.sessionIds.length}</td>
                <td className="py-1.5 pr-0 font-mono text-xs">{a.lastTs?.slice(0, 16) ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
