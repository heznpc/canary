# RFC: Agent-Push Leakage Axis

**Status**: Draft (2026-05-06)
**Author**: heznpc
**Target sections**: §3 (Metadatafication thesis), §5.4 (Portfolio-Level Observations), §6.2 (For Tooling)

## Motivation

Empirical pattern observed 2026-05-06 in author's local environment: across 23 of ~30 active research repos under `~/IdeaProjects/Paper/`, a uniform DDD-style restructure was committed locally but never pushed to remote. The gap was discovered only when an external audit query (a separate Claude Code session) listed unpushed work across all repos.

The pattern is not "agent failed to push" — Claude Code by default does not push without instruction. The pattern is "operator stopped inspecting `git status` because git records had become invisible background data." This is precisely the breakdown moment Star (1996) predicts for mature infrastructure: "infrastructure becomes visible only upon breakdown."

## Hypothesis

For single-developer + AI-agent workflows, the latency between agent session completion and `git push` is a measurable indicator of metadatafication progression. As the operator's attention migrates from code inspection to context engineering (paper §4.1), the operator stops actively inspecting git state, and the latency grows. The breakdown is not random; it correlates with bulk uniform operations across many repos (where individual-repo verification overhead exceeds the operator's attention budget).

## Proposed Metrics

- **APL (Agent-Push Latency)**: distribution of time from Claude session completion to first push, per repo. Long right tail indicates metadatafication.
- **PLR (Push Leakage Rate)**: fraction of agent-touched commits that remain unpushed after N days (default N=7).
- **MIP (Metadata-Invisibility Period)**: duration each repo spends in ahead/dirty state without operator intervention. Direct measurement of Star's transparency-vs-breakdown axis.

## Data Sources

- `~/.claude/projects/*/transcripts/*.jsonl` — Claude Code session records (start/end timestamps, working directory, tool calls touching git)
- multi-repo git scanner — ahead/behind/dirty state across configured roots
- `gh` API — PR/CI state for repos where agent-completed work was opened as PR

## Section Integration

- **§3 Metadatafication thesis** — APL/PLR/MIP operationalize Star's "breakdown visibility" prediction. The metrics measure transparency itself, not just adoption (CAM) or co-authorship (ACR).
- **§5.4 Portfolio-Level Observations** — single-developer N≈60 vignette: 23/30 Paper/ repos in MIP > 14 days as of 2026-05-06, all from one bulk DDD restructure session window. Complements existing multi-repo CAM data.
- **§6.2 For Tooling** — directly implements the "intent-level CI/CD triggered by agent session completion rather than `git push`" recommendation. The implementation closes the loop: paper proposes → tool measures → measurements inform paper revision.

## Module Layout (proposed)

```
experiments/src/push-leakage/
  transcript-parser.ts      Parses ~/.claude/projects/*/transcripts/*.jsonl
                            into (session_id, repo_path, end_ts, git_touches[])
  multi-repo-scan.ts        Walks configured roots, emits per-repo
                            (ahead, behind, dirty, last_session_end_ts)
  metrics.ts                Computes APL/PLR/MIP from joined data
  cli.ts                    `tsx cli.ts scan ~/IdeaProjects` — JSON/table output
mcp/tools/
  list-leaking-repos.ts     MCP tool: returns repos in MIP > threshold
  audit-session-leakage.ts  MCP tool: given session_id, lists unpushed touches
```

## Out of Scope (this RFC)

- Push automation. The tool measures and reports; it does not push without operator action. Auto-push is a separate decision (cf. Issue anthropics/claude-code#39565: agents that auto-push without consent are a known anti-pattern).
- Multi-developer attribution. Single-developer + heznpc-only authorship is sufficient for first-cut data.

## Open Questions

1. Should APL clock pause when the repo has open PRs awaiting CI/review? Counter: open PRs are not leakage; the work has propagated.
2. How to handle repos with no remote configured (newtria, oncology pre-2026-05-06)? Treat as MIP=∞ until remote exists, or exclude?
3. Cross-reference with [eddy](../../eddy/) (ADHD rapid re-engagement) — does metadatafication-induced leakage correlate with high switch propensity? Possible follow-up paper.

## Next Steps

1. Implement `transcript-parser.ts` against author's `~/.claude/projects/` (read-only).
2. Implement `multi-repo-scan.ts` with same scanner conventions as existing `experiments/src/*-experiment.ts`.
3. Run on author's `~/IdeaProjects/` for first dataset; report APL/PLR/MIP distributions.
4. Promote findings into §5.4 if the distribution shape supports the hypothesis.

## Initial Results (2026-05-07)

First-cut implementation lives at `experiments/src/push-leakage/` (transcript-scan / repo-scan / metrics / cli) and produced a sanitized portfolio snapshot in `experiments/results/push-leakage-2026-05-07.json`. The raw detail snapshot (with absolute paths, remote URLs, and commit subjects) lives under `experiments/results/raw/` and is gitignored.

A second iteration extended attribution to **cross-repo touches**: Bash invocations matching `cd /path && git ...` or `git -C /path ...` are now extracted from session content and attributed to the target path (in addition to the session's `cwd`). The numbers below reflect that improved attribution.

**Headline numbers** (single-developer, N=57 git repos under `~/IdeaProjects/`):

- Repos ahead of upstream: **23/57 (40.4%)** — `PLR_portfolio`
- Repos agent-touched (any kind): **54** — broken down as cwd-only=7, cross-repo-only=47
- Repos agent-touched ∩ in MIP > 7 days: **23/54 (42.6%)** — `PLR_agent`
- MIP percentiles: **p50 = 17d 16h, p90 = 17d 18h, max = 17d 18h** (n=23)
- APL percentiles: **p50 = 17d 0h, p90 = 17d 0h, max = 25d 20h** (n=23)

Three observations worth carrying into §5.4:

1. **Single-event signature.** The MIP distribution is nearly degenerate (`max - p50 ≈ 2 hours`). All 23 leaking repos are stuck within a ~2-hour window. This is consistent with one bulk DDD-restructure operation across the Paper/ portfolio, then no per-repo push. The thesis predicts exactly this: when git becomes background metadata, *bulk* mutations slip through unnoticed because the operator's attention budget cannot scale with repo count.

2. **Parent-cwd opacity is structural, not anecdotal.** Of 54 agent-touched repos, only 7 have a direct Claude Code CLI session whose `cwd` was the repo path. The remaining 47 (≈87%) were touched exclusively from a parent cwd (`~/IdeaProjects/Paper`, `~/IdeaProjects`) via `cd <subrepo> && git ...` chains. A "session-completion-triggered CI/CD" tool that only watches the session's `cwd` (a likely first-cut design implied by §6.2) would miss the dominant pattern of agent-driven git activity in this portfolio.

3. **Inverse evidence for active repos.** The agent-touched repos that are *not* in MIP > 7 days (canary, ploidy, oncology) are precisely the ones with PR-routed workflows where push is part of routine session loops, or recently scaffolded with their own first-push event. Where the operator's attention budget is structured around git events (PR open, CI green, merge), metadatafication does not progress. This bounds the thesis: metadatafication does not happen everywhere — it happens where attention has migrated away from git as a deliberate workflow surface.

Sanity caveats: cross-repo attribution captures the dominant `cd <path> && git ...` and `git -C <path>` patterns but misses script-mediated touches (e.g. `bash some-script.sh` where the script itself enters a subdir). Repos in the snapshot that have no remote configured (3 in this run) are excluded from leakage classification regardless of session activity.
