# Submission checklist — Onward! Essays 2026

Tracks pre-submission action items and current status (2026-05-11).

## Hard blockers (must be done before submit)

- [x] **Venue deadline confirmed.** SPLASH 2026 Onward! Essays
  **submission deadline is Friday, 15 May 2026**. Initial decisions
  22 June, conditional revisions due 27 July, final notification
  14 August, camera-ready 25 August.
  Source: <https://2026.splashcon.org/track/splash-2026-onward--essays>.
- [x] **Zenodo cite removed for first-round submission.** Per
  `anonymization-notes.md`, the deposit citation in §7.1 has been
  rewritten as "replication package committed to the artifact
  repository at the submission revision." Restore at camera-ready
  time once the deposit is finalised.
- [x] **`acmart` template applied** (`submissions/onward-essays-2026/main.tex`).
  Class is `\documentclass[sigconf, nonacm, anonymous=false]{acmart}`
  with single-blind author block (`heznpc`, `Independent`).
- [ ] **Page count under limit.** Onward! Essays caps main content at
  14 pages (refs and appendices unrestricted). Current `acmart` build
  page count: see CI artifact `canary-submissions-<sha>` after first
  push of this branch.
- [ ] **Bibliography style matches venue.** Current draft uses
  `\bibliographystyle{plainnat}`. Confirm acceptable for Onward!
  Essays or switch to `ACM-Reference-Format` once CI build succeeds.

## Recommended (high ROI before submit)

- [ ] **Final reviewer pass.** Read top-to-bottom for argument flow,
  catching residual artefacts from the dashboard-first → MCP-first
  reframe (e.g., outdated cross-references, duplicate framings).
- [ ] **Threats-to-Validity tighten.** §7.1 has three new paragraphs
  from the Round A paper PR; verify they're integrated cleanly with the
  pre-existing four (construct / internal / external / reliability).
- [ ] **Self-citation audit.** With single-blind, self-citation is fine;
  but limit to citations that earn their place (Zenodo deposit, the
  canary GitHub repo for replicating §5.4 numbers, the lifespan paper
  if companion). Avoid padding.
- [ ] **Figure 1 reads at print resolution.** The TikZ MIP strip plot
  was designed for screen; do a print preview check.
- [ ] **References.bib hygiene.** Remove unused entries, confirm DOIs
  resolve, ensure consistent capitalization in titles.

## Companion outputs (separate work, not blockers)

- [ ] Zenodo deposit updated with the final submitted PDF + replication
  package (snapshots, code commit hash, paper source).
- [ ] Companion paper status — decide whether to mention `heznpc/lifespan`
  or `heznpc/ploidy-research` as related work. Both are coherent with
  the toolkit identity but not load-bearing for the essay.

## Already done (2026-05-11)

- [x] Paper at 24 pages with 0 undefined citations, builds cleanly via
  the local LaTeX multi-pass workflow and via the `paper.yml` CI job
  (xu-cheng/latex-action@v3).
- [x] §5.1 surface ordering declared (MCP-primary, gh-aw comparison).
- [x] §5.4 vignette with Figure 1 (strip plot), three failure modes,
  worked-example numbers from `experiments/results/`.
- [x] §7 Threats to Validity expanded with single-developer / threshold
  sensitivity / local-instrument reproducibility paragraphs.
- [x] §6.2 forward-link from definition (§3) and tooling (§6.2) into
  the vignette.
- [x] External citations: Claude Code issues #26725 / #43730,
  gh CLI #12980 / #9073 / #11187, Worktrunk / gtr / toolbox / Cursor
  Agents Window, DX Core 4.
- [x] Companion artifact (canary MCP server + dashboard) public at
  github.com/heznpc/canary, with CITATION.cff and Zenodo placeholder
  ready.
