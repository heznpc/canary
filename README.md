# Canary

**The operator-machine observability layer for indie + agent developers.**

> Part of **Research Program 1 — Human-Controlled AI Systems**. Canary is the trust/observability flagship: the running instrument for the paper *The Metadatafication of Version Control*. Read the essay to see *why* the surface matters; run the scanner to see *what* is currently leaking on your own machine.

**Two entry points:**

- **Read the essay.** [`paper/main.tex`](paper/main.tex) is the single source of truth for the thesis. Canary operationalizes its §5.4 vignette — agent-touched commits that never made it to remote — as a tool you can run today.
- **Run the scanner.** `npm install && npm run pl:scan && npm run dev` walks the repos under `~/IdeaProjects` (or `CANARY_SCAN_ROOT`), surfaces push leakage, and registers an MCP server so any agent session in Claude Code / Cursor / Codex / Gemini can query the same data inline. See [Quick Start](#quick-start) below.

Canary exposes what GitHub doesn't see: unpushed commits, working-tree staleness, Claude Code session transcripts, and the cross-tool MCP surface that any agent session (Claude Code, Cursor, Codex CLI, Gemini CLI) can query inline. Where [GitHub Agentic Workflows](https://github.github.com/gh-aw/) runs agents server-side in GitHub Actions and reacts to GitHub events, canary serves operator-machine data to agents already in your session. The two are complementary layers, not competitors — canary owns the side that GitHub Actions structurally cannot reach.

**Lead capabilities — what canary sees that nothing else does:**

- **Push leakage** — agent-touched commits that never made it to remote. Joins local git ahead/behind/dirty state with Claude Code session transcripts under `~/.claude/projects/`. Measured as APL (Agent-Push Latency), MIP (Metadata-Invisibility Period), PLR (Push Leakage Rate), and UCP (Uncommitted-Period). See `planning/drafts/agent-push-leakage.md` for the framing and `paper/main.tex` §5.4 for the empirical vignette.
- **Session leakage audit** — "did anything I just did leak?" — `audit_session_leakage` MCP tool inspects sessions modified in the last N hours and joins with current git state.
- **Local session review** — a reviewer-safe index over local AI transcript stores: Claude Code, Claude Desktop local-agent sessions, Codex active/archived sessions, Gemini CLI chats, and configured generic JSONL path lists. The MCP layer exposes `list_sessions`, `get_session_transcript`, and `get_file_access`; the dashboard mirrors the same data at `/sessions`.
- **Cross-tool MCP serving** — one observability layer that any agent in any tool can query. Register once with Claude Code, Cursor, or Codex; the same scanner and session-review tools are available everywhere.

**Companion capabilities — also exposed, but where GitHub Agentic Workflows can do more:**

These features exist for completeness and human-readable surface (the dashboard), but on these axes a dedicated `gh-aw` workflow is usually a better fit because it can read, analyze, *and* respond/PR:

- Dependency / stack / CI / deploy / docs scanning
- External-contributor issue digest (canary surfaces; `gh-aw` triages and responds)
- A-F project grading

The dashboard is a secondary, human-readable companion. New features ship to the MCP layer first; the dashboard renders them when the cost of a panel is small.

**Position relative to Anthropic Channels / Codex / Gemini built-in tracing.**
Claude Code's [Channels](https://code.claude.com/docs/en/changelog) observability layer (May 2026), Codex CLI 0.125's reasoning-token reporting, and Gemini CLI's OpenTelemetry trace export all measure the *agent side* of a session: API requests, tool calls, permission waits, hooks, token spend. Canary measures the *operator-machine side* of the same session: which repositories the operator's agent touched (joining `~/.claude/projects/*.jsonl` with local git working-tree state), whether the resulting commits ever reached upstream (push-leakage), and how long the working tree has been dirty (UCP). The two layers are partitioned by what data they see — Channels sees what Anthropic's infrastructure handled, canary sees what stayed on the operator's filesystem. The push-leakage instrument in §5.4 of the paper is by construction in the canary partition because it requires data that none of those tracing layers can reach. We therefore expect serious indie + agent workflows in 2026 H2 to compose both: vendor-side traces for "did my session work correctly?" and canary for "did the work my session produced ever leave my laptop?"

> **Part of the heznpc indie+agent toolkit** — a coherent product line for solo and small-team developers running multiple AI coding agents:
>
> - **canary** *(this repo)* — observe: portfolio health, push-leakage, contributor signal
> - [**anvil**](https://github.com/heznpc/anvil) — ship: commit→push→PR→CI→merge→cleanup as one atomic MCP call; closes the push-leakage window canary measures
> - [**AirMCP**](https://github.com/heznpc/AirMCP) — extend: macOS-native tools (Calendar, Reminders, Notes, Shortcuts, Health) accessible via MCP
> - [**ploidy**](https://github.com/heznpc/ploidy-research) — scale: asymmetric-renewal session-composition protocol for LLM context windows
> - [**starter-series**](https://github.com/starter-series) — bootstrap: 13+ starters for new MCP servers, npm packages, browser/electron/native apps
> - [**papers**](https://github.com/heznpc?tab=repositories&q=&type=&language=tex) — explain: research grounding the toolkit's design choices
>
> Each piece serves a different lifecycle phase of the same target user. Cross-pollination is intentional: canary scans starter-series projects, mcp-server-starter ships with canary integration, ploidy's session protocol motivates push-leakage measurement, and anvil's atomic ship closes the push-leakage window canary surfaces — canary diagnoses, anvil immunizes.

## Research

This repository is a monorepo containing both the service and the accompanying research paper:

> **The Metadatafication of Version Control: How AI Agents Transform Git from Tool to Infrastructure**

Git is not dying — it is becoming invisible. Like EXIF metadata on photos or DNS in networking, Git records will persist as automatically-generated background data that developers rarely inspect directly. Canary operationalizes this thesis by replacing manual Git inspection with automated health grading and agent-readability scoring.

- Paper source: [`paper/`](paper/) (single source of truth)
- Experiment code: [`experiments/src/`](experiments/src/)
- Experiment results: [`experiments/results/`](experiments/results/)
- Superseded Markdown drafts: [`planning/drafts/`](planning/drafts/)

## Features

**MCP tools (the primary surface):**

- `scan_project` / `scan_all` — full health pipeline on one project or the whole portfolio
- `list_update_actions` — concrete `pnpm up foo@x.y.z` + changelog-link list per project
- `list_leaking_repos` / `audit_session_leakage` — push-leakage scan + per-session "did anything leak" check (see `planning/drafts/agent-push-leakage.md`)
- `list_recent_issues` — external-contributor issue digest across the portfolio (filters out PRs / self-tracking / bots)
- `get_anthropic_usage` — token + cost summary from the Admin API

**Underlying scanners (used by every surface):**

- Multi-ecosystem dependency scanning — Node.js, Python, Flutter, JVM
- Stack version tracking — Next.js, React, Flutter, Spring Boot, Python, TypeScript, Node.js
- Code quality — CI/CD, tests, lint, type-check, license, security policy
- Activity — commit frequency, open PRs/issues, contributor count
- Deploy status — Vercel, GitHub Pages, npm, Chrome Web Store, Zenodo
- Documentation freshness — README/CHANGELOG/TODO drift
- Data freshness — scheduled-update cycle monitoring with grace periods
- Research tracking — Semantic Scholar integration for paper projects
- AI coding intel — framework-version-specific gotchas for Claude / Copilot / Cursor workflows
- Push-leakage — APL / MIP / PLR / UCP metrics joining Claude Code session transcripts with multi-repo git state
- Session review — local AI transcript summaries, reviewer-safe transcript rendering, source filtering, and file-access inversion
- Smart grading — 100-point scoring with context-aware weights

### AISpool Migration And Expansion

The old [`aispool`](https://github.com/heznpc/aispool) CLI is superseded by canary's `lib/sessions` + MCP tools. Canary keeps the read-only local-transcript posture but moves the surface from a private SQLite inbox to an in-memory service index, dashboard pages, and cross-agent MCP calls.

Coverage now handled by the session index:

- `~/.claude/projects/**/*.jsonl`
- `~/.codex/sessions/**/*.jsonl`
- `~/.codex/archived_sessions/*.jsonl`
- `~/.gemini/tmp/**/*.jsonl`
- `~/Library/Application Support/Claude/local-agent-mode-sessions/**/*.jsonl`
- `CANARY_SESSION_LIST_FILES` path-list inputs, including `list_ALL-ai-conversations.txt`
- `CANARY_SESSION_EXTRA_DIRS` recursive generic JSONL roots

AISpool's promote/reject ledger is not carried forward as a database feature; canary is the review and evidence surface, while follow-up decisions should live in the repo or workflow that acts on the evidence.

## Tech Stack

- **Framework**: Next.js 16 (App Router), React 19, TypeScript
- **Styling**: Tailwind CSS 4, shadcn/ui
- **Testing**: Vitest
- **APIs**: GitHub REST API (Octokit), Semantic Scholar, npm/PyPI/pub.dev/Maven Central
- **Infrastructure**: In-memory cache, sliding-window rate limiter, circuit breaker, structured logging

## Quick Start

Five steps from a fresh clone to a working dashboard. The dashboard surfaces
missing prerequisites as inline banners, so you can also just run `npm run
dev` and let it tell you what to do next.

```bash
# 1. Install dependencies
npm install

# 2. Authenticate GitHub (recommended — unauthenticated API is 60 req/h)
#    Canary uses GITHUB_TOKEN first, then falls back to `gh auth token`.
gh auth login
#    Or: export GITHUB_TOKEN=...

# 3. Edit canary.config.ts to register your own repos
#    Default config monitors heznpc/canary + heznpc/AirMCP + heznpc/ploidy-research.
#    Replace those entries with your portfolio (see comments in the file).

# 4. Run the first push-leakage scan
#    Walks your local repos under ~/IdeaProjects (or CANARY_SCAN_ROOT) and
#    writes a snapshot the dashboard reads. Re-run any time data feels stale.
npm run pl:scan

# 5. Start the dashboard
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the dashboard.

### Optional / advanced

```bash
# Different scan root (default: $HOME/IdeaProjects)
CANARY_SCAN_ROOT=/path/to/repos npm run pl:scan

# Different transcript-dir filter (default: 'IdeaProjects')
CANARY_SCAN_FILTER=Projects npm run pl:scan

# Local session review roots
export CANARY_CLAUDE_DIR=$HOME/.claude/projects
export CANARY_CODEX_DIR=$HOME/.codex/sessions
export CANARY_CODEX_ARCHIVE_DIR=$HOME/.codex/archived_sessions
export CANARY_GEMINI_DIR=$HOME/.gemini/tmp
export CANARY_CLAUDE_DESKTOP_DIR="$HOME/Library/Application Support/Claude/local-agent-mode-sessions"
export CANARY_SESSION_LIST_FILES="$HOME/Documents/ai-conversation-lists-2026-07-08/list_ALL-ai-conversations.txt"
export CANARY_SESSION_EXTRA_DIRS=/path/to/other/jsonl/root

# Override the "self login" used for issue-author filtering
# (default: each repo's owner). Useful when you contribute to repos
# you don't own and want your own issues filtered out as self-tracking.
export CANARY_SELF_LOGIN=your-github-login

# Anthropic Admin key for the Claude API usage panel
export ANTHROPIC_ADMIN_API_KEY=sk-ant-admin-...

# Run tests / type-check / build
npm test
npx tsc --noEmit
npm run build
```

### Pre-push hook (optional, recommended)

Install canary's pre-push hook into any repo to surface portfolio leakage state
the moment you next push from that repo. Informational only — never blocks the
push. This is canary's flagship gh-aw-uncopable surface: the moment of the push
decision is only observable on the operator's machine.

```bash
# From inside any git repo you want monitored
node /path/to/canary/scripts/canary-install-hooks.mjs

# Or from the canary repo itself (uses canonical canary path)
npm run pl:install-hooks
```

Output during your next `git push`:

```
[canary pre-push] 3 other repos leaking (snapshot 4h ago):
  • ploidy-research            ahead=2, MIP=2d 7h
  • AirMCP                     ahead=1, MIP=14h
  • starter-series             ahead=1, MIP=8h
[canary pre-push] (informational; this push is not blocked)
```

Uninstall: `rm .git/hooks/pre-push`.

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

Tools exposed (run `npm run mcp:smoke` to confirm registration):

- `scan_project(projectId)` — run the full pipeline on one project in `canary.config.ts`
- `scan_all()` — dashboard summary + per-project grades
- `list_update_actions(projectId)` — concrete `pnpm up foo@x.y.z` / changelog-link list for outdated deps in one project
- `get_anthropic_usage(days?)` — token/cost totals from the Anthropic Admin API (requires `ANTHROPIC_ADMIN_API_KEY`)
- `list_leaking_repos({ roots?, thresholdDays?, top?, pathFilter? })` — push-leakage scan: repos in MIP > thresholdDays, sorted desc
- `audit_session_leakage({ sinceHours?, sessionId?, root? })` — "did anything just leak?" — inspect Claude Code sessions in a window and join with current git state
- `list_sessions({ source?, q?, flaggedOnly?, limit? })` — unified local AI transcript index
- `get_session_transcript({ path, redact?, role?, maxChars? })` — fetch one transcript, reviewer-safe redacted by default
- `get_file_access({ q?, flaggedOnly?, limit? })` — invert local sessions by files touched, with rule/config surfaces first
- `list_recent_issues({ windowDays?, top?, projectId? })` — external-contributor issue digest across the portfolio (or one project), filtering out self-tracking and bots

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
