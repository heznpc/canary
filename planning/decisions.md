# Research Decisions Log

Records non-obvious choices with rationale. Append-only; don't rewrite history.

Format: `## YYYY-MM-DD -- <short title>` with **Context**, **Decision**, **Why**.

---

## 2026-04-19 -- Repository restructure to DDD-style layout (service + research monorepo)

**Context**: Canary is a Next.js service AND a research paper repo. Before restructure, research artifacts mixed into paper/ (EXPERIMENT-AUDIT.md, 6 results.json), scripts/ (experiment .ts files alongside any build scripts), and at the root (manuscript.md, outline.md, review.md).

**Decision**: Follow the ploidy-style "service + research monorepo" pattern:
- Service at top level (app/, components/, lib/, landing/, public/, package.json, etc.) -- unchanged
- Research under DDD bounded contexts: paper/ (single source of truth), experiments/ (research scripts + results), literature/, planning/

Concrete moves:
- scripts/ (6 experiment .ts files) -> experiments/src/ + scripts/ removed (no build scripts remained)
- paper/*-results.json (6 files) -> experiments/results/
- paper/EXPERIMENT-AUDIT.md -> experiments/results/
- manuscript.md, outline.md -> planning/drafts/; review.md -> planning/
- Script output paths updated: `new URL("../paper/X.json", ...)` -> `new URL("../results/X.json", ...)` (5 experiment scripts). statistical-tests.ts: basePath from `../paper` -> `../results`

**Why**: Matches the pattern established in ploidy (per Jiyeon's separate refactor of that repo). The scripts/ directory in Next.js projects is conventional for *build* scripts, not research experiments -- keeping research scripts there muddled the two bounded contexts.

---

## 2026-05-06 -- Add agent-push leakage axis (APL/PLR/MIP metrics)

**Context**: Audit on 2026-05-06 found 23 of ~30 Paper/ repos with locally-committed but unpushed DDD restructure work, all from one bulk session window in April. The pattern is the breakdown moment Star (1996) predicts for mature infrastructure: the operator stopped inspecting `git status` because git records had become invisible background data. Existing canary axes (CAM = adoption, ACR = co-authorship) measure agent input/output volume but not whether agent-produced records actually propagate to remote.

**Decision**: Add a third measurement axis to canary's experimental module: agent-push leakage. Three metrics — APL (Agent-Push Latency), PLR (Push Leakage Rate), MIP (Metadata-Invisibility Period) — joining Claude Code session transcripts with multi-repo git state. RFC draft at `planning/drafts/agent-push-leakage.md`. Module to live at `experiments/src/push-leakage/` with optional MCP tools surfacing leakage queries to live agent sessions.

**Why**: Three reasons.
1. The new axis directly operationalizes paper §6.2's "intent-level CI/CD triggered by agent session completion rather than `git push`" — which has so far been a recommendation without an instrument. This closes the loop: paper proposes → tool measures → measurements inform revisions.
2. APL/PLR/MIP measure transparency itself (Star's breakdown-visibility axis), not just agent volume (CAM/ACR). The breakdown event in the author's own portfolio is the kind of single-developer empirical vignette the paper §5.4 currently lacks.
3. Cost is low: existing scanner conventions, MCP server, and panel infrastructure can be reused. Tool emits paper-citable data on first run.

Out of scope: push automation. The tool measures and reports; auto-push remains an operator decision (cf. anthropics/claude-code#39565).

---

## 2026-05-21 -- Pre-experiment integrity sweep (Critical fixes)

**Context**: Before re-running the experimentation pipeline, a 9-dimension research-and-design audit identified three Critical issues that would invalidate any new results if left in place.

**Decision**: Fix all three in the same session, before any experiment runs.

1. **Seed the bootstrap resampler.** `experiments/src/statistical-tests.ts` previously used unseeded `Math.random()` inside the 10,000-iteration bootstrap, so the §5.5 confidence intervals (`[0.4%, 3.0%]` etc.) drifted at the third decimal across runs. Replaced with `mulberry32(STAT_SEED)`; default seed `20260521` (today's date as YYYYMMDD), overridable via the `STAT_SEED` env var. Result JSON now records the seed and PRNG name.
2. **Add Holm-Bonferroni correction.** The governance-moderation conclusion uses two Mann-Whitney U tests (CAM and ACR) on the same hypothesis (developer-led vs foundation-governed). Reporting only `p_raw` was a multiple-comparisons hole. Added Holm step-down correction across the m=2 family; both tests survive (`p_holm = 0.034`, still < 0.05). Both `p_raw` and `p_holm` now appear in §5.5 of the paper *and* in the result JSON's `multipleComparisons` field.
3. **Mark the Zenodo DOI as a pre-camera-ready TODO.** The paper currently carries `10.5281/zenodo.XXXXXXX` as a placeholder. Rather than leaving a literal `XXXXXXX` URL in a submitted manuscript, §6.5 now states explicitly that the placeholder will be replaced prior to camera-ready, with a LaTeX `% TODO(pre-camera-ready)` marker pinning the action.

**Why**: The seed and the multiple-comparisons gap are the kind of issue any first-round reviewer would flag before reading the substantive argument. The Zenodo placeholder is a footgun against the paper's own reproducibility claim — leaving it unannotated meant readers couldn't tell whether the DOI was pending or genuinely missing. Together, the three fixes don't change a single conclusion; they make the existing conclusions auditable.

Out of scope for this sweep (handled as Major / Minor in the audit, not yet decided): formal falsifying-condition statement (§3.1), cross-tool external-validity expansion (Cursor/Codex transcript schema), independent governance-classification rater.
