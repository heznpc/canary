/**
 * Pairwise correlation between CAM, ACR, and UCP metrics.
 *
 * Joins three result files by repository basename:
 *   - CAM (Context Attention Metric)  — experiments/results/cam-results.json
 *   - ACR (Agent-authored Commit Ratio, 90-day window)
 *                                       — experiments/results/acr-results.json
 *   - UCP (Uncommitted-Period)        — experiments/results/raw/push-leakage-<date>-detail.json
 *
 * Outputs Pearson and Spearman correlation coefficients for each pair, plus
 * the joined dataset for further inspection.
 *
 * Read-only. Does not modify the input result files.
 *
 * Sample sizes are typically small (n=10-20 for a single-developer portfolio),
 * so Spearman (rank-based) is more robust than Pearson here. We report both.
 *
 * Usage:
 *   npx tsx experiments/src/push-leakage/correlate.ts \
 *     --detail=experiments/results/raw/push-leakage-2026-05-07-detail.json \
 *     --out=experiments/results/correlation-2026-05-07.json
 */

import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { resolve, basename, dirname, join } from "path";

interface CamResult {
  repo: string;
  cam: number;
  totalCommits90d: number;
  excluded?: boolean;
}

interface AcrWindow {
  window: number;
  totalCommits: number;
  acr: number;
  excluded?: boolean;
}

interface AcrResult {
  repo: string;
  windows: AcrWindow[];
}

interface PushLeakageRepo {
  repoPath: string;
  ucp_seconds: number | null;
  dirtyFiles: number;
  ahead: number;
  mip_seconds: number | null;
}

interface JoinedRow {
  repo: string;
  cam: number | null;
  acr_90d: number | null;
  ucp_seconds: number | null;
  ahead: number | null;
  mip_seconds: number | null;
}

export function pearson(xs: number[], ys: number[]): number | null {
  if (xs.length !== ys.length || xs.length < 3) return null;
  const n = xs.length;
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let denX = 0;
  let denY = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - meanX;
    const dy = ys[i] - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }
  if (denX === 0 || denY === 0) return null;
  return num / Math.sqrt(denX * denY);
}

/**
 * Average-ranks for ties. Returns ranks parallel to the input order.
 */
export function ranks(xs: number[]): number[] {
  const indexed = xs.map((v, i) => ({ v, i }));
  indexed.sort((a, b) => a.v - b.v);
  const out = new Array<number>(xs.length);
  let i = 0;
  while (i < indexed.length) {
    let j = i;
    while (j + 1 < indexed.length && indexed[j + 1].v === indexed[i].v) j++;
    const avgRank = (i + j) / 2 + 1; // 1-based
    for (let k = i; k <= j; k++) out[indexed[k].i] = avgRank;
    i = j + 1;
  }
  return out;
}

export function spearman(xs: number[], ys: number[]): number | null {
  if (xs.length !== ys.length || xs.length < 3) return null;
  return pearson(ranks(xs), ranks(ys));
}

function repoKey(s: string): string {
  // "heznpc/foo" → "foo"; absolute path "/x/y/foo" → "foo"; "foo-deadbeef" → "foo-deadbeef"
  return basename(s);
}

function readJson<T>(p: string): T {
  return JSON.parse(readFileSync(p, "utf-8")) as T;
}

interface CliArgs {
  camPath: string;
  acrPath: string;
  detailPath: string;
  outPath: string;
}

function parseArgs(argv: string[]): CliArgs {
  const repoRoot = resolve(new URL(".", import.meta.url).pathname, "..", "..", "..");
  const today = new Date().toISOString().slice(0, 10);
  const args: CliArgs = {
    camPath: join(repoRoot, "experiments", "results", "cam-results.json"),
    acrPath: join(repoRoot, "experiments", "results", "acr-results.json"),
    detailPath: join(repoRoot, "experiments", "results", "raw", `push-leakage-${today}-detail.json`),
    outPath: join(repoRoot, "experiments", "results", `correlation-${today}.json`),
  };
  for (const a of argv) {
    if (a.startsWith("--cam=")) args.camPath = a.slice("--cam=".length);
    else if (a.startsWith("--acr=")) args.acrPath = a.slice("--acr=".length);
    else if (a.startsWith("--detail=")) args.detailPath = a.slice("--detail=".length);
    else if (a.startsWith("--out=")) args.outPath = a.slice("--out=".length);
  }
  return args;
}

export function buildJoined(
  camRows: CamResult[],
  acrRows: AcrResult[],
  pushLeakageRepos: PushLeakageRepo[],
): JoinedRow[] {
  const camByRepo = new Map<string, number>();
  for (const c of camRows) {
    if (c.excluded) continue;
    camByRepo.set(repoKey(c.repo), c.cam);
  }

  const acr90ByRepo = new Map<string, number>();
  for (const a of acrRows) {
    const w90 = a.windows.find((w) => w.window === 90 && !w.excluded);
    if (w90) acr90ByRepo.set(repoKey(a.repo), w90.acr);
  }

  const ucpByRepo = new Map<string, PushLeakageRepo>();
  for (const p of pushLeakageRepos) ucpByRepo.set(repoKey(p.repoPath), p);

  // Union of keys across all three sources.
  const allKeys = new Set<string>([
    ...camByRepo.keys(),
    ...acr90ByRepo.keys(),
    ...ucpByRepo.keys(),
  ]);

  const rows: JoinedRow[] = [];
  for (const k of allKeys) {
    const p = ucpByRepo.get(k);
    rows.push({
      repo: k,
      cam: camByRepo.has(k) ? camByRepo.get(k)! : null,
      acr_90d: acr90ByRepo.has(k) ? acr90ByRepo.get(k)! : null,
      ucp_seconds: p?.ucp_seconds ?? null,
      ahead: p?.ahead ?? null,
      mip_seconds: p?.mip_seconds ?? null,
    });
  }
  rows.sort((a, b) => a.repo.localeCompare(b.repo));
  return rows;
}

interface PairCorrelation {
  pair: string;
  n: number;
  pearson: number | null;
  spearman: number | null;
}

export function correlatePairs(rows: JoinedRow[]): PairCorrelation[] {
  function pair(
    label: string,
    selA: (r: JoinedRow) => number | null,
    selB: (r: JoinedRow) => number | null,
  ): PairCorrelation {
    const xs: number[] = [];
    const ys: number[] = [];
    for (const r of rows) {
      const a = selA(r);
      const b = selB(r);
      if (a === null || b === null) continue;
      xs.push(a);
      ys.push(b);
    }
    return {
      pair: label,
      n: xs.length,
      pearson: pearson(xs, ys),
      spearman: spearman(xs, ys),
    };
  }
  return [
    pair("CAM × ACR_90d", (r) => r.cam, (r) => r.acr_90d),
    pair("CAM × UCP", (r) => r.cam, (r) => r.ucp_seconds),
    pair("ACR_90d × UCP", (r) => r.acr_90d, (r) => r.ucp_seconds),
    pair("CAM × MIP", (r) => r.cam, (r) => r.mip_seconds),
    pair("ACR_90d × MIP", (r) => r.acr_90d, (r) => r.mip_seconds),
  ];
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const camRows = readJson<{ userResults: CamResult[] }>(args.camPath).userResults ?? [];
  const acrRows = readJson<{ userResults: AcrResult[] }>(args.acrPath).userResults ?? [];
  const detail = readJson<{ repos: PushLeakageRepo[] }>(args.detailPath);

  const rows = buildJoined(camRows, acrRows, detail.repos);
  const correlations = correlatePairs(rows);

  const out = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    sources: {
      cam: args.camPath,
      acr: args.acrPath,
      pushLeakageDetail: args.detailPath,
    },
    nJoined: rows.length,
    correlations,
    rows,
  };

  mkdirSync(dirname(args.outPath), { recursive: true });
  writeFileSync(args.outPath, JSON.stringify(out, null, 2));

  console.error("=== Correlations (pairwise) ===");
  for (const c of correlations) {
    const fmt = (v: number | null) => (v === null ? "—" : v.toFixed(3));
    console.error(`  ${c.pair.padEnd(20)}  n=${String(c.n).padStart(2)}  pearson=${fmt(c.pearson)}  spearman=${fmt(c.spearman)}`);
  }
  console.error(`\n[correlate] joined rows: ${rows.length} → ${args.outPath}`);
}

// Only run main when invoked as a script, not when imported.
if (import.meta.url === `file://${process.argv[1]}`) main();
