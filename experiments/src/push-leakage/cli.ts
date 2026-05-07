/**
 * Agent-push leakage CLI.
 *
 * Usage:
 *   npx tsx experiments/src/push-leakage/cli.ts <root> [<root>...] [--out=path.json] [--threshold-days=7] [--filter=substr]
 *
 * Defaults to scanning ~/IdeaProjects and writing a baseline snapshot
 * to experiments/results/push-leakage-<YYYY-MM-DD>.json.
 *
 * The CLI joins:
 *   - Claude Code CLI session transcripts under ~/.claude/projects/
 *   - Live git state across the given roots
 *
 * It is read-only: never pushes, commits, or mutates any repo. The whole
 * point is to *measure* the leakage, not paper over it (cf. RFC §"Out of scope").
 */

import { writeFileSync, mkdirSync } from "fs";
import { join, resolve } from "path";
import { homedir } from "os";

import { scanAllSessions, aggregateByRepo } from "./transcript-scan.js";
import { scanRepos } from "./repo-scan.js";
import { joinReposWithSessions, computePortfolio, fmtDuration } from "./metrics.js";

interface CliArgs {
  roots: string[];
  outPath: string | null;
  thresholdDays: number;
  filter: string | null;
}

function parseArgs(argv: string[]): CliArgs {
  const roots: string[] = [];
  let outPath: string | null = null;
  let thresholdDays = 7;
  let filter: string | null = null;

  for (const a of argv) {
    if (a.startsWith("--out=")) outPath = a.slice("--out=".length);
    else if (a.startsWith("--threshold-days=")) thresholdDays = parseInt(a.slice("--threshold-days=".length), 10);
    else if (a.startsWith("--filter=")) filter = a.slice("--filter=".length);
    else if (!a.startsWith("--")) roots.push(resolve(a));
  }

  if (roots.length === 0) roots.push(join(homedir(), "IdeaProjects"));
  return { roots, outPath, thresholdDays, filter };
}

function defaultOutPath(): string {
  const today = new Date().toISOString().slice(0, 10);
  // Resolve relative to repo root (cli.ts at experiments/src/push-leakage/cli.ts)
  const repoRoot = resolve(new URL(".", import.meta.url).pathname, "..", "..", "..");
  return join(repoRoot, "experiments", "results", `push-leakage-${today}.json`);
}

/**
 * Hash a path to a short stable identifier for the public snapshot.
 * Uses repo basename + 8-char sha256 of the absolute path so the same
 * repo gets the same hash across runs but the absolute location is hidden.
 */
function sanitizePath(absPath: string, hashes: Map<string, string>): string {
  const cached = hashes.get(absPath);
  if (cached) return cached;
  const basename = absPath.split("/").pop() ?? "repo";
  // Cheap deterministic hash: sum of char codes; sufficient since the
  // namespace is small (per-author portfolio).
  let h = 0;
  for (let i = 0; i < absPath.length; i++) h = (h * 31 + absPath.charCodeAt(i)) | 0;
  const tag = `${basename}-${(h >>> 0).toString(16).padStart(8, "0")}`;
  hashes.set(absPath, tag);
  return tag;
}

interface PortfolioSnapshot {
  schemaVersion: number;
  generatedAt: string;
  roots: string[];
  transcriptFilter: string | null;
  thresholdDays: number;
  portfolio: ReturnType<typeof computePortfolio>;
  repos: ReturnType<typeof joinReposWithSessions>;
}

function buildPublicSnapshot(detail: PortfolioSnapshot): unknown {
  const hashes = new Map<string, string>();
  return {
    ...detail,
    note: "PUBLIC snapshot. Absolute paths replaced by basename+hash; remote URLs and commit subjects redacted. Detail JSON is gitignored.",
    roots: detail.roots.map((_, i) => `<root-${i}>`),
    repos: detail.repos.map((r) => ({
      ...r,
      repoPath: sanitizePath(r.repoPath, hashes),
      remoteUrl: r.remoteUrl ? "<redacted>" : null,
      unpushedSubjects: r.unpushedSubjects.length > 0 ? [`<${r.unpushedSubjects.length} redacted>`] : [],
    })),
  };
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));

  console.error(`[push-leakage] scanning roots: ${args.roots.join(", ")}`);
  if (args.filter) console.error(`[push-leakage] transcript filter: ${args.filter}`);

  console.error("[push-leakage] step 1/3: transcripts");
  const sessions = scanAllSessions({ pathFilter: args.filter ?? undefined });
  console.error(`[push-leakage]   parsed ${sessions.length} sessions`);
  const aggregates = aggregateByRepo(sessions);
  console.error(`[push-leakage]   ${aggregates.length} attributed repo paths (cwd + cross-repo)`);

  console.error("[push-leakage] step 2/3: repo scan");
  const repos = scanRepos(args.roots);
  console.error(`[push-leakage]   found ${repos.length} git repos`);

  console.error("[push-leakage] step 3/3: join + metrics");
  const joined = joinReposWithSessions(repos, aggregates);
  const portfolio = computePortfolio(joined, args.thresholdDays);

  const outPath = args.outPath ?? defaultOutPath();
  mkdirSync(resolve(outPath, ".."), { recursive: true });
  const snapshot: PortfolioSnapshot = {
    schemaVersion: 1,
    generatedAt: portfolio.generatedAt,
    roots: args.roots,
    transcriptFilter: args.filter,
    thresholdDays: args.thresholdDays,
    portfolio,
    repos: joined,
  };

  // Detail snapshot — sensitive (absolute paths, remote URLs, commit
  // subjects). Goes into experiments/results/raw/, which is gitignored.
  const detailDir = resolve(outPath, "..", "raw");
  mkdirSync(detailDir, { recursive: true });
  const detailPath = join(detailDir, outPath.split("/").pop()!.replace(/\.json$/, "-detail.json"));
  writeFileSync(detailPath, JSON.stringify(snapshot, null, 2));

  // Public snapshot — sanitized for paper-citable use.
  const publicSnap = buildPublicSnapshot(snapshot);
  writeFileSync(outPath, JSON.stringify(publicSnap, null, 2));

  // Human-readable summary to stderr
  console.error("");
  console.error("=== Portfolio ===");
  console.error(`  scanned        : ${portfolio.totalReposScanned} repos`);
  console.error(`  with remote    : ${portfolio.reposWithRemote}`);
  console.error(`  ahead          : ${portfolio.reposAhead}`);
  console.error(`  ahead or dirty : ${portfolio.reposAheadOrDirty}`);
  console.error(`  agent-touched  : ${portfolio.reposAgentTouched} (cwd=${portfolio.reposAgentTouchedCwd}, cross-only=${portfolio.reposAgentTouchedCrossRepoOnly})`);
  console.error(`  leaking (MIP > ${portfolio.thresholdDays}d): ${portfolio.reposLeaking}`);
  console.error(`    of which agent-touched: ${portfolio.reposAgentTouchedAndLeaking}`);
  console.error(`  PLR_agent      : ${(portfolio.plr_agent * 100).toFixed(1)}% (agent-touched ∩ leaking / agent-touched)`);
  console.error(`  PLR_portfolio  : ${(portfolio.plr_portfolio * 100).toFixed(1)}% (leaking / repos-with-remote)`);
  console.error(`  APL p50/p90/max: ${fmtDuration(portfolio.apl.p50)} / ${fmtDuration(portfolio.apl.p90)} / ${fmtDuration(portfolio.apl.max)} (n=${portfolio.apl.n})`);
  console.error(`  MIP p50/p90/max: ${fmtDuration(portfolio.mip.p50)} / ${fmtDuration(portfolio.mip.p90)} / ${fmtDuration(portfolio.mip.max)} (n=${portfolio.mip.n})`);

  console.error("");
  console.error("=== Top leaking repos (MIP desc, top 10) ===");
  const topLeak = [...joined]
    .filter((j) => j.ahead > 0)
    .sort((a, b) => (b.mip_seconds ?? 0) - (a.mip_seconds ?? 0))
    .slice(0, 10);
  for (const j of topLeak) {
    console.error(
      `  ${fmtDuration(j.mip_seconds).padStart(10)}  ahead=${String(j.ahead).padStart(2)}  ${j.repoPath.replace(homedir(), "~")}`,
    );
  }

  console.error("");
  console.error(`[push-leakage] public snapshot: ${outPath}`);
  console.error(`[push-leakage] detail (gitignored): ${detailPath}`);
}

main();
