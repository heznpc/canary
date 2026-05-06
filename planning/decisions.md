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
