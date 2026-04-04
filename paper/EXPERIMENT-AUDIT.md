# Experiment Design Audit Report

**Date:** 2026-04-04
**Scope:** Two proposed experiments for the Canary paper ("The Metadatafication of Version Control")
**Methodology:** Independent design agents produced protocols; separate adversarial audit agents reviewed them.

---

## Executive Summary

Both experiments as initially designed have fundamental flaws. E3 (Context Artifact Ratio) measures the wrong thing. E6 (Gotcha Z_proc) tests the wrong theory. Neither should be implemented in current form.

| Experiment | Fatal Flaw | Verdict |
|-----------|-----------|---------|
| E3: Context Artifact Ratio | Measures file presence, not developer attention | **Redesign required** — replace with commit-activity metric |
| E6: Gotcha Z_proc | Version migration ≠ culturally mediated derivation | **Route to Z-Gap, redesign with genuine Z_proc stimuli** |

---

## Root Cause Analysis

Three structural failures in the design process produced these flaws:

### 1. Validity was never checked before feasibility

The research → design pipeline evaluated experiments by "Can we do this with existing infrastructure?" without first asking "Does this prove what we claim?" E3 ranked #1 because the GitHub tree API was already called, not because file ratios measure attention migration.

### 2. Corrections were not propagated to downstream agents

During cross-analysis, the Z-Gap session's 2nd review (with LaTeX source verification) explicitly corrected:
> "VibeCoding Intel은 Z_proc보다 surface-form convention 수준"

This correction was acknowledged in the analysis phase but was NOT included in the prompt given to the E6 design agent. The design agent therefore built an elaborate protocol on a premise already identified as incorrect.

### 3. No adversarial step was built into the pipeline

The workflow was: Research → Design → Integration → (user-requested) Audit. The audit should have preceded or been concurrent with the design phase.

---

## E3 Audit: Context Artifact Ratio

### Design Summary
- Classify every file in 25 GitHub repos as "context" or "source"
- Context = agent config + docs + build/tooling config + specs
- Metric: CAR = context_files / (context_files + source_files)
- Visualization: horizontal stacked bar chart, 25 repos

### Critical Flaws

#### Flaw 1: Claim-evidence misalignment (FATAL)

The paper claims (§4.1): "developer attention migrates from code-level inspection to context engineering."

CAR measures: static ratio of file types in a repository tree.

These are fundamentally different. A `tsconfig.json` exists since `create-next-app`. Its presence indicates nothing about where developer attention is focused. The metric rewards file proliferation, not attention investment.

**What would actually measure attention:**
- Fraction of recent commits touching context files vs. source files
- Git blame age distribution on context files (recently written vs. created at init)
- Diff volume ratio (lines changed in context vs. source)
- Recency-weighted CAR (weight files by inverse time since last modification)

#### Flaw 2: Legacy config inflates ratio without supporting thesis

Every TypeScript project has tsconfig.json. Every Node project has package.json. These predate AI agents. Counting them as "context" makes CAR a measure of "modern toolchain complexity" — a well-known, uninteresting property. Only agent-era artifacts (AGENTS.md, CLAUDE.md, .cursorrules, structured specs) support the metadatafication claim.

#### Flaw 3: No baseline

If CAR = 0.25, is that high or low? Without measuring CAR for:
- Random popular GitHub repos (population baseline)
- The same repos at an earlier time point (temporal baseline)
- Repos from non-AI-using developers (control group)

...the number is uninterpretable.

#### Flaw 4: N=1 developer circularity

All 25 repos are from a single developer who uses Claude Code. Claude Code encourages CLAUDE.md creation. Measuring CLAUDE.md prevalence in a Claude Code user's repos and concluding "context artifacts are growing" is circular.

#### Flaw 5: Test files are unclassifiable

Tests are source code that executes, but also specification artifacts. The paper itself lists "test suites" alongside context artifacts (§4.1). Either classification undermines a different part of the argument.

#### Flaw 6: Monorepo structures create incomparable units

This project contains paper/ (LaTeX) and app/ (Next.js). Measuring CAR across the entire tree produces numbers not comparable to single-purpose repos.

#### Flaw 7: File count treats 1-line .gitignore = 500-line AGENTS.md

No weighting by size, LOC, or editing activity.

### Recommended Redesign Direction

Replace static file ratio with **commit-activity-based context attention metric**:

```
CAM = commits_touching_context_files / total_commits  (over last 90 days)
```

Infrastructure already exists: activity.ts queries commit history, code-quality.ts fetches file trees. The combination identifies which commits touch which file categories.

Add temporal dimension: measure CAM at quarterly intervals using git log date ranges.

Add baseline: run against 10-20 well-known OSS repos.

---

## E6 Audit: Gotcha Pairs as Z_proc Test Stimuli

### Design Summary
- 15 "gotcha pairs" from vibecoding.ts (e.g., React 18 forwardRef → React 19 ref-as-prop)
- Each formalized as (NL_intent, code_old, code_new)
- Embed using 4 models (Codestral, BGE-M3, UniXcoder, MiniLM)
- R_proc = d(code_old, code_new) / mean(d(NL, code_old), d(NL, code_new))
- Prediction: R_proc > 1 for code-trained models → supports Z stratification

### Critical Flaws

#### Flaw 1: This is not Z_proc (FATAL — theoretical)

Z-Gap defines Z_proc as "how it is derived, culturally mediated."

Running example from Z-Gap paper: "a Bourbaki algebraist proves axiomatically, a Soviet constructivist computes explicitly, and an Indian mathematician reaches it through geometric intuition."

React 18→19 migration is NOT cultural mediation. It is temporal succession within a single community. Developers don't choose forwardRef vs ref-as-prop based on tradition; they migrate because the old API is deprecated.

Correct Z_proc stimuli would be: Go error handling vs. Python exceptions vs. Rust Result types — same semantics (Z_sem), different community derivation traditions.

#### Flaw 2: vibecoding.ts contains no code pairs

The "gotchas" are Korean-language advisory strings (e.g., "ref가 일반 prop으로 전달됨 -- forwardRef() 불필요"). code_old and code_new must be fabricated by the experimenter, making stimuli experimenter-dependent, not "extracted from" data.

#### Flaw 3: R_proc mixes incommensurable distances

- Numerator d_proc: code-to-code (same modality)
- Denominator d_sem: NL-to-code (cross-modal)

These live in different regions of embedding space. For models that separate NL and code clusters, d_sem is systematically larger regardless of content, making R_proc < 1 by construction. Z-Gap's existing R = d_inter/d_intra keeps both terms within the same modality.

#### Flaw 4: 15 pairs is severely underpowered

Power calculation: for R_proc=1 vs R_proc=1.3 with typical cosine-distance variance, 15 observations give ~25-35% power. Need ~60 pairs for 80% power. Z-Gap's main experiment uses 100 stimuli and still struggles with P2.

#### Flaw 5: Monolingual English contradicts Z-Gap's methodology

Z-Gap tests 5 languages (en, ko, zh, ar, es) because the thesis is about cross-lingual invariance. A monolingual experiment cannot test Z stratification claims.

#### Flaw 6: Training data contamination

React 19, Next.js 16, Spring Boot 3 migration guides are among the most indexed technical documents. Models have almost certainly seen these exact migration patterns, making d_proc measurements uninterpretable.

#### Flaw 7: No control conditions

Missing:
- Random code pairs (d_proc ceiling)
- Same-version refactoring pairs (d_proc floor)
- Cross-language same-semantics pairs (Z_sem reference)

#### Flaw 8: No correction for multiple comparisons

4 models × 15 pairs × 2 subgroups = family-wise error rate ~34% at α=0.05.

### Recommended Redesign Direction

**Option A (for Z-Gap paper):** Replace version migration pairs with genuine Z_proc stimuli:
- Go `if err != nil { return err }` vs. Python `try/except` vs. Rust `Result<T,E>` vs. Haskell `Either` — same error-handling semantics, different community traditions
- 50+ operations, 5 languages, full Z-Gap model suite
- R metric stays within NL-NL modality (cross-lingual d_intra vs d_inter) to match existing methodology

**Option B (for Canary paper):** Do not attempt Z_proc. The gotcha data supports a simpler, valid claim: "stack-version-specific context is a concrete form of specification complexity that context engineering must capture." This is a narrative point, not an experiment.

---

## Process Recommendations

1. **Validate before designing.** Before any experiment protocol, write one sentence: "This metric measures X. The paper claims Y. X=Y because Z." If Z requires argumentation, the experiment has a validity problem.

2. **Propagate constraints to all agents.** When delegating work, encode all prior corrections and established facts in the agent prompt.

3. **Build adversarial review into the pipeline.** Every design should face a "red team" agent before proceeding to implementation.

4. **Resist feasibility bias.** "We can measure this easily" ≠ "This measurement supports our claim."
