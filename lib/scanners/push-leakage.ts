import { readFileSync, readdirSync } from "fs";
import { join, resolve } from "path";

import type { PortfolioMetrics, JoinedRepo } from "../../experiments/src/push-leakage/metrics";

/**
 * Surface the most recent push-leakage snapshot to the dashboard.
 *
 * The push-leakage scanner is fundamentally local: it joins Claude Code CLI
 * session transcripts (~/.claude/projects/) with multi-repo git state on the
 * same machine. Running it from a Next.js request handler is too slow for
 * interactive use (~10 s on a 60-repo portfolio), so the dashboard reads the
 * latest committed snapshot instead and surfaces it as portfolio data.
 *
 * Source preference: the gitignored raw-detail snapshot under
 * experiments/results/raw/ if present (full repo paths, useful when running
 * locally), falling back to the sanitized public snapshot under
 * experiments/results/ otherwise.
 *
 * Returns null when no snapshot is found (e.g., in a fresh clone before
 * the first scan). Callers should treat null as "feature unavailable" and
 * not as an error.
 */

export interface PushLeakageSnapshotPayload {
  generatedAt: string;
  source: "raw" | "public";
  portfolio: PortfolioMetrics;
  repos: JoinedRepo[];
  topLeaking: JoinedRepo[]; // sorted by mip_seconds desc, top 10
}

interface RawSnapshotFile {
  generatedAt: string;
  portfolio: PortfolioMetrics;
  repos: JoinedRepo[];
}

const REPO_ROOT = resolve(process.cwd());
const RESULTS_DIR = join(REPO_ROOT, "experiments", "results");
const RAW_DIR = join(RESULTS_DIR, "raw");

function pickLatest(
  dir: string,
  prefix: string,
  suffix: string,
  reject: (filename: string) => boolean = () => false,
): string | null {
  let entries: string[] = [];
  try {
    entries = readdirSync(dir);
  } catch {
    return null;
  }
  const matches = entries
    .filter((e) => e.startsWith(prefix) && e.endsWith(suffix) && !reject(e))
    .sort()
    .reverse(); // ISO-date prefixed filenames sort lexically by date desc
  return matches.length > 0 ? join(dir, matches[0]) : null;
}

const isPostIntervention = (name: string): boolean => name.includes("post-intervention");

function tryParse(path: string): RawSnapshotFile | null {
  try {
    const raw = readFileSync(path, "utf-8");
    const parsed = JSON.parse(raw) as Partial<RawSnapshotFile>;
    if (!parsed.portfolio || !parsed.repos || !parsed.generatedAt) return null;
    return parsed as RawSnapshotFile;
  } catch {
    return null;
  }
}

export function getLatestPushLeakageSnapshot(): PushLeakageSnapshotPayload | null {
  // 1) Prefer raw detail (full data, gitignored) for local dev; ignore
  //    "post-intervention" snapshots so the panel reflects the steady-state
  //    portfolio rather than a one-off zero-leakage post-push reading.
  const rawPath = pickLatest(RAW_DIR, "push-leakage-", "-detail.json", isPostIntervention);
  let parsed: RawSnapshotFile | null = rawPath ? tryParse(rawPath) : null;
  let source: "raw" | "public" = "raw";

  // 2) Fall back to the sanitized public snapshot.
  if (!parsed) {
    source = "public";
    const publicPath = pickLatest(RESULTS_DIR, "push-leakage-", ".json", isPostIntervention);
    parsed = publicPath ? tryParse(publicPath) : null;
  }

  if (!parsed) return null;

  const topLeaking = [...parsed.repos]
    .filter((j) => j.ahead > 0)
    .sort((a, b) => (b.mip_seconds ?? 0) - (a.mip_seconds ?? 0))
    .slice(0, 10);

  return {
    generatedAt: parsed.generatedAt,
    source,
    portfolio: parsed.portfolio,
    repos: parsed.repos,
    topLeaking,
  };
}
