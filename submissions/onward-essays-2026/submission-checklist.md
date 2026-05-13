# Submission checklist — Onward! Essays 2026

Tracks pre-submission action items and current status (2026-05-11).

## Hard blockers (must be done before submit)

- [ ] **Venue deadline confirmed.** SPLASH 2026 Onward! Essays deadline
  not yet retrieved at scaffold time. Check
  <https://2026.splashcon.org/dates> closer to fall 2026 and update
  here.
- [ ] **Zenodo DOI filled in.** Replace
  `10.5281/zenodo.XXXXXXX` placeholder in `paper/main.tex` §7.1 and
  `CITATION.cff` with the actual deposit identifier. (Two-character
  search-and-replace.)
- [ ] **`acmart` template applied.** See `format-notes.md`. Build a
  separate `main.tex` under this directory; do not edit
  `../../paper/main.tex` directly.
- [ ] **Page count under limit.** Trim to the venue's page limit (likely
  14 pages for Onward! Essays — confirm).
- [ ] **Bibliography style matches venue.** Switch to ACM-Reference-Format
  if required.

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
