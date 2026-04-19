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
