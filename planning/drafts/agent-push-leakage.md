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
