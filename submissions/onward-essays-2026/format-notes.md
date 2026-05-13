# Format adaptation — Onward! Essays template

Current state of `paper/main.tex`:

- `\documentclass[12pt]{article}` (generic)
- 24 pages compiled, ~204 KB PDF
- packages: `geometry`, `mathptmx`, `amsmath`, `graphicx`, `booktabs`,
  `hyperref`, `url`, `natbib`, `array`, `tabularx`, `tikz`
- bibliography: `natbib`, plainnat.bst, `references.bib`
- one TikZ figure (§5.4 MIP strip plot)

## Onward! / SPLASH proceedings template

SPLASH 2026 uses **ACM Primary Article Template** (`acmart.cls`) in
*sigconf* mode for proceedings papers; Onward! Essays typically uses the
same. See <https://www.acm.org/publications/proceedings-template> and
the SPLASH 2026 "How to Submit" page for confirmation closer to the
deadline.

**Page limit**: typically 14 pages including references for Onward!
Essays (subject to revision). The current draft at 24 pages will need
significant trimming — start with the §5 evaluation tables (the CAM
analysis can be condensed) and §2 related-work (consolidate).

## Adaptation steps

1. **Copy** `paper/main.tex` to `submissions/onward-essays-2026/main.tex`
   so the originating source stays untouched.
2. **Replace** `\documentclass[12pt]{article}` with
   `\documentclass[sigconf]{acmart}` (or the variant the venue specifies).
3. **Replace** generic title / author block with `\title{...}` plus
   `\author{...}` blocks in acmart syntax (single-blind so author
   identity is allowed; no anonymization required — see
   `anonymization-notes.md`).
4. **Remove** `\usepackage{mathptmx}` — `acmart` controls fonts.
5. **Remove** `\usepackage[margin=1in]{geometry}` — `acmart` controls
   margins.
6. **Keep** `amsmath`, `booktabs`, `hyperref`, `url`, `natbib`,
   `array`, `tabularx`, `tikz`. `acmart` provides many but explicit
   loads do not hurt.
7. **Bibliography**: switch `\bibliographystyle{plainnat}` to
   `\bibliographystyle{ACM-Reference-Format}` if the venue requires
   ACM bib style.
8. **Compile locally** with `latexmk -pdf main.tex` after acmart
   adaptation — fix any errors specific to the template.
9. **Trim** to the page limit. Candidate sections to compress:
   - §2 Background — consolidate 5 subsections into ~1 page total
   - §5.5 Evaluation tables — keep one table, move others to
     supplemental
   - §7 Counterarguments — keep paragraph headings, compress prose

## Useful references

- ACM article templates: <https://www.acm.org/publications/proceedings-template>
- SPLASH 2026 How to Submit (when available): <https://2026.splashcon.org/>
- Onward! Essays scope: <https://2026.splashcon.org/track/splash-2026-onward--essays>

## Not changing

- All figures, citations, vignettes stay the same.
- The §5.1 surface-ordering paragraph and §5.4 vignette structure
  unchanged — they're the essay's contribution.
- TikZ figure 1 builds in `acmart` the same way it builds now.
