# SPLASH 2026 — Onward! Essays submission

**Status: scaffold (2026-05-11), not yet submitted.**

Working directory for the SPLASH 2026 Onward! Essays submission of "The
Metadatafication of Version Control." The manuscript lives at
[`../../paper/main.tex`](../../paper/main.tex); this folder holds only the
venue-specific adapters and notes.

## Why Onward! Essays

Among the venues surveyed on 2026-05-09, Onward! Essays is the strongest
fit:

- Explicit scope welcomes work on *"software's relationship to human
  endeavors, or its philosophical, sociological, psychological, historical,
  or anthropological underpinnings"* — the metadatafication thesis sits
  squarely in that category (Star and Ruhleder 1996 infrastructure
  studies + agent-era software practice).
- **Two-phase review** (revise-and-resubmit friendly).
- **Single-blind** — author identity is known to reviewers, so the canary
  artifact + portfolio (heznpc indie+agent toolkit) is admissible context.

Reference URL: <https://2026.splashcon.org/track/splash-2026-onward--essays>.

## Files

| File | Purpose |
|---|---|
| `cover-letter.md` | Draft cover letter for the submission portal. |
| `format-notes.md` | What changes from `paper/main.tex` are needed for Onward!'s ACM SIGPLAN template + page limits. |
| `submission-checklist.md` | Pre-submission action items + current status of each. |
| `anonymization-notes.md` | Explicit rationale for why no anonymization is needed (single-blind venue) + how that interacts with self-citation of the canary repo and Zenodo deposit. |

## Open items before submission

- [ ] Replace Zenodo DOI placeholder (`10.5281/zenodo.XXXXXXX`) in
  `paper/main.tex` §7.1 and `CITATION.cff` with actual deposit identifier.
- [ ] Adapt `paper/main.tex` to ACM SIGPLAN article class (currently
  generic `\documentclass[12pt]{article}` — see `format-notes.md`).
- [ ] Final review pass — see `submission-checklist.md`.
- [ ] Decide whether to include companion paper (`heznpc/lifespan`,
  `heznpc/ploidy-research`) as related work or self-citations only.

## Round-2 expectations

Onward!'s two-phase review accepts essays for revision at the first round
when *"the essay contains promising material and has the potential to meet
the conference's standards, but may fall short of this in its initial
form."* Likely reviewer feedback we should be ready to address:

- Single-developer N for §5.4 push-leakage vignette — strengthen with
  multi-developer follow-up data, or further bound the claim
- The Star 1996 framing — argue more carefully against alternative
  framings (e.g., Bowker & Star 1999 "boundary objects")
- §6.2 tooling recommendations — push toward formal evaluation, or
  acknowledge as design speculation more explicitly
