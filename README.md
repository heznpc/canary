# Canary

**Project health dashboard** — monitor stack freshness, deploy status, code quality, and activity across all your repositories in one place.

Canary scans your GitHub projects and grades them A–F based on dependency health, CI/CD presence, test infrastructure, stack EOL status, deploy uptime, documentation freshness, and more.

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
- **Testing**: Vitest (86 tests)
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
