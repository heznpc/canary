# canary positioning vs. GitHub Agentic Workflows (gh-aw)

**Draft, 2026-05-11.** Captures the architectural distinction between canary
and [GitHub Agentic Workflows](https://github.github.com/gh-aw/) so future
canary decisions (what to build, what to drop, how to frame the README) can
reference a single articulated comparison rather than rediscover it.

## One-line distinction

> **gh-aw runs agents server-side in GitHub Actions and reacts to GitHub
> events. Canary serves operator-machine data to agents in any session.**

Same broad domain (AI-agent-assisted repo work), different architectural
layer. Composable, not competing.

## Capability matrix

|  | gh-aw | canary |
|---|---|---|
| Where it runs | GitHub Actions cloud | Operator's local machine |
| When it runs | GitHub event triggers + schedule | On-demand from agent sessions + scheduled CLI |
| Workflow definition | Markdown in `.github/workflows/*.md` | TypeScript scanners + MCP tools + Next.js dashboard |
| Data sources | GitHub API (issues, PRs, commits, releases, files, Actions runs) | GitHub API + **local git working-tree state** + **`~/.claude/projects/` session transcripts** + **`canary.config.ts`** |
| Tokens | Read-only repo tokens (write via "safe outputs") | User's `GITHUB_TOKEN` (read) + filesystem (read) |
| Writes back | Comments, labels, PRs, issues (via validation step) | Read-only — never writes to repos |
| Agent runtime | Copilot CLI, Claude, Codex, Gemini, OpenCode (one per workflow run) | Whichever agent the operator is using in their session |
| Cross-tool | Single agent per workflow | One MCP server queryable from Claude Code / Cursor / Codex CLI / Gemini CLI sessions simultaneously |
| Cross-repo at org scale | Yes (Org Health Report agent) | Yes (`canary.config.ts` lists repos) |
| Cross-machine | No (per-repo / per-org) | Per-machine, where the operator works |
| Cross-forge | GitHub-native only | Currently GitHub-only, structurally extendable |

## Where they overlap (gh-aw is the stronger fit)

For these surfaces, a dedicated gh-aw workflow can read, analyse, *and
respond* — it can label issues, comment, generate PRs, validate CI, all in
one loop. Canary only reads and surfaces; it can't close the loop. Indie
operators using GitHub heavily will get more value out of gh-aw here:

- Issue triage and labeling
- PR review automation
- CI failure diagnosis and auto-fix PRs
- Continuous documentation updates
- Continuous improvement / refactoring suggestions
- Organisation-level health reports
- Stale-repo identification

Canary still surfaces some of these (external-contributor issue digest,
A-F project grading, deps/CI/deploy scanners), but the canonical answer
for an indie operator on these axes is "set up a gh-aw workflow."

## Where canary owns the surface (gh-aw cannot follow)

These features require data sources gh-aw structurally cannot access from
GitHub Actions:

- **Push-leakage axis** (APL, MIP, PLR, UCP) — requires local git
  ahead/behind/dirty state. gh-aw sees only what reached GitHub.
- **Session-leakage audit** (`audit_session_leakage`) — reads Claude Code
  CLI session transcripts from `~/.claude/projects/`. Strictly on-machine.
- **Working-tree mtime signal** (UCP) — local filesystem only.
- **Cross-tool MCP serving** — gh-aw runs one agent per workflow inside
  Actions; canary serves any agent in any session the operator has open.
- **Pre-push observability** — by the time gh-aw sees a commit, it has
  already been pushed. Canary can observe (and a planned `pre-push` hook
  can intercept) before the push event.
- **Cross-machine operator state** — if the operator runs work across a
  laptop and a desktop, canary can in principle consolidate; gh-aw is
  per-org / per-repo, not per-operator-machine.

The thesis-defining surface (paper §5.4 push-leakage vignette) lives
entirely in this column.

## Strategic implications for canary

**Lean in** — these are canary's defensible moat against gh-aw:

- Push-leakage instrument (already implemented, surface in lead position)
- Session-leakage audit (already implemented, surface in lead position)
- Cross-tool MCP architecture (already implemented, document explicitly)
- Pre-push hook (proposed, not yet implemented)
- Cross-forge generalisation (proposed, gh-aw cannot follow off GitHub)
- macOS menubar app (proposed, gh-aw structurally cannot be a native app)
- Local-IDE state surfacing (proposed)

**Lean out / accept gh-aw fit** — don't compete head-on:

- Generic dep / CI / deploy / docs scanners — keep for completeness, do
  not market as primary value
- Auto-triage / auto-respond / auto-PR — would require gh-aw-style
  GitHub Actions integration; not where canary differentiates
- A-F grading as standalone value — useful, but commoditised

**Reframe** — the canary identity statement (README opening, paper §5.1)
should foreground the gh-aw-uncopable surface, not the overlapping one.

## Re-evaluation triggers

This positioning is descriptive of 2026-05-11. Times to revisit:

- gh-aw extends to read operator-machine data (would shrink canary's
  defensible zone — unlikely architecturally, but possible via a local
  agent runner)
- Anthropic ships a portfolio-observability MCP server officially
  (would directly enter canary's niche)
- canary's audience shifts (e.g., team-scale) and gh-aw integration
  becomes the more natural pattern
