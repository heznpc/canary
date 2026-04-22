# Canary

**Project health dashboard + research platform** — monitor stack freshness, deploy status, code quality, and activity across all your repositories, grounded in a thesis on the *metadatafication* of version control.

Canary scans your GitHub projects and grades them A–F based on dependency health, CI/CD presence, test infrastructure, stack EOL status, deploy uptime, documentation freshness, and more. It also serves as the implementation companion to our research paper on how AI agents are transforming Git from a developer-facing tool into invisible background infrastructure.

## Research

This repository is a monorepo containing both the service and the accompanying research paper:

> **The Metadatafication of Version Control: How AI Agents Transform Git from Tool to Infrastructure**

Git is not dying — it is becoming invisible. Like EXIF metadata on photos or DNS in networking, Git records will persist as automatically-generated background data that developers rarely inspect directly. Canary operationalizes this thesis by replacing manual Git inspection with automated health grading and agent-readability scoring.

- Paper source: [`paper/`](paper/) (single source of truth)
- Experiment code: [`experiments/src/`](experiments/src/)
- Experiment results: [`experiments/results/`](experiments/results/)
- Superseded Markdown drafts: [`planning/drafts/`](planning/drafts/)

## Features

- **Multi-ecosystem dependency scanning** — Node.js, Python, Flutter, JVM (Gradle/Maven)
- **Stack version tracking** — Next.js, React, Flutter, Spring Boot, Python, TypeScript, Node.js
- **Code quality checks** — CI/CD pipelines, test frameworks, linting, type safety, license
- **Activity monitoring** — Commit frequency, open PRs/issues, contributor count
- **Deploy status** — Vercel, GitHub Pages, npm, Chrome Web Store, Zenodo
- **Documentation freshness** — README version drift, CHANGELOG staleness, TODO count
- **Data freshness** — Monitor scheduled data update cycles with grace periods
- **Research tracking** — Semantic Scholar integration for paper projects
- **AI coding intel** — Framework-version-specific gotchas for Claude/Copilot workflows
- **Smart grading** — 100-point scoring with context-aware weights (active vs. maintenance vs. prototype)

## Tech Stack

- **Framework**: Next.js 16 (App Router), React 19, TypeScript
- **Styling**: Tailwind CSS 4, shadcn/ui
- **Testing**: Vitest
- **APIs**: GitHub REST API (Octokit), Semantic Scholar, npm/PyPI/pub.dev/Maven Central
- **Infrastructure**: In-memory cache, sliding-window rate limiter, circuit breaker, structured logging

## Getting Started

```bash
# Install dependencies
npm install

# Set GitHub token for higher API rate limits
export GITHUB_TOKEN=ghp_...

# Run dev server
npm run dev

# Run tests
npm test
```

Open [http://localhost:3000](http://localhost:3000) to view the dashboard.

## Claude Integration

Canary coexists with Claude's own dashboards via three complementary layers:

### 1. Claude API usage panel (dashboard tile)

If `ANTHROPIC_ADMIN_API_KEY` (an Admin key starting `sk-ant-admin-...`) is set, the dashboard shows a 7-day token + cost summary broken down by model, alongside a link to the official Anthropic Console. Without the key the tile renders a "not configured" placeholder — the rest of canary is unaffected.

### 2. MCP server

Canary ships a stdio MCP server that exposes scanner results as tools so Claude Code / Claude Desktop can call them natively.

```bash
# First-time build (also runs automatically via `npm run mcp`)
npm run mcp:build

# Run standalone
npm run mcp
```

Register it with Claude Code (bundle path is absolute so Claude can spawn it from any cwd):

```bash
claude mcp add canary -- node /absolute/path/to/canary/mcp/dist/server.mjs
```

Tools exposed:

- `scan_project(projectId)` — run the full pipeline on one project in `canary.config.ts`
- `scan_all()` — dashboard summary + per-project grades
- `get_anthropic_usage(days?)` — token/cost totals from the Admin API (requires the env var above)

The MCP layer is a thin adapter (`mcp/adapters.ts`) over the existing scanners, so scanner refactors don't force protocol changes.

### 3. Footer link

The landing page footer links straight to the Anthropic Console usage page, so visitors with their own keys can jump to the canonical source of truth for billing.

## Project Structure

```
app/                    # Next.js App Router pages & API routes
  api/scan/             # Full project scan endpoint
  api/projects/[id]/    # Single project scan
  api/health/           # Health check
  api/releases/         # Release notes lookup
  api/sync/             # Portfolio export
components/dashboard/   # UI components (cards, badges, panels)
lib/
  scanners/             # All health scanners
    github.ts           # Git status & dependency scanning
    code-quality.ts     # CI, tests, lint, license detection
    activity.ts         # Commit frequency, PRs, issues
    deploy.ts           # Deploy status checking
    stack.ts            # Stack version analysis
    grader.ts           # Health grading algorithm
    docs.ts             # Documentation freshness
    data-freshness.ts   # Data update cycle monitoring
    vibecoding.ts       # AI coding intelligence
    research.ts         # Academic field tracking
    releases.ts         # Release notes extraction
  cache.ts              # In-memory TTL cache
  rate-limit.ts         # Per-IP rate limiting
  circuit-breaker.ts    # GitHub API circuit breaker
  logger.ts             # Structured JSON logging
paper/                  # Research paper (LaTeX)
  main.tex              # Paper source
  references.bib        # Bibliography
  main.pdf              # Compiled PDF
manuscript.md           # Markdown draft
outline.md              # Paper outline
landing/                # Multilingual landing page (GitHub Pages)
```

## Grading System

| Grade | Score | Recommendation |
|-------|-------|----------------|
| A     | 90+   | Keep           |
| B     | 75–89 | Keep           |
| C     | 60–74 | Update         |
| D     | 40–59 | Upgrade        |
| F     | 0–39  | Rewrite        |

Penalties are applied for: outdated dependencies, security vulnerabilities, EOL stacks, deploy downtime, missing CI/tests/lint, inactivity, stale documentation, and more. Maintenance and prototype projects receive leniency adjustments.

## License

MIT
