@AGENTS.md

# Canary

Project health dashboard + research paper on the "metadatafication" of version control.

## Monorepo Structure
- `app/`, `lib/`, `components/` — Next.js service (project health scanner & dashboard)
- `paper/` — LaTeX paper ("The Metadatafication of Version Control")
- `manuscript.md` — Markdown draft of the paper
- `outline.md` — Paper outline

## Key Concept
Canary is both:
1. A **service** that operationalizes the metadatafication thesis (replaces manual Git inspection with automated health grading)
2. A **research artifact** demonstrating that developer attention shifts from code-level inspection to project health metrics and agent-readability

## Paper Compilation
```bash
cd paper && pdflatex main.tex && bibtex main && pdflatex main.tex && pdflatex main.tex
```
