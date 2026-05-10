# heznpc indie + agent toolkit — emerging portfolio identity

**Draft, 2026-05-11.** Captures the portfolio identity that has emerged
across heznpc's projects so future decisions (canary feature priorities,
new starter-series additions, paper venue choices, hackathon framing) can
reference a single articulated frame rather than rediscover it each time.

## Target user

Solo or duo developer who:

- runs multiple AI coding agents (Claude Code, Cursor, Codex CLI, Gemini
  CLI) daily, often several at once across worktrees / sessions
- maintains a personal portfolio of repositories that crosses categories
  (apps, MCP servers, research, scaffolding) rather than working on a
  single product
- is the operator and the consumer of the same toolkit — eats their own
  dogfood — which means the toolkit can be opinionated without needing
  enterprise-style configurability

Not the target:

- enterprise platform engineering teams (they have Backstage / Cortex)
- casual GitHub users (they have GitHub Repository Dashboard, NxCode)
- pure researchers without a coding-agent practice

## Lifecycle map

Each project addresses a different lifecycle phase of the same target user:

| Phase | Project | Surface | Role |
|---|---|---|---|
| **Bootstrap** | [starter-series](https://github.com/starter-series) (13+ starters) | npm scaffolders | start a new project (MCP server, npm package, browser/electron/native app, bot, landing page) in 5 minutes |
| **Extend** | [AirMCP](https://github.com/heznpc/AirMCP) | macOS app + MCP server | bring native macOS tools (Calendar, Reminders, Notes, Shortcuts, Health) into agent reach |
| **Observe** | canary (this repo) | MCP server + dashboard | portfolio health surveillance: deps, activity, push-leakage, contributor signal |
| **Scale** | [ploidy](https://github.com/heznpc/ploidy-research) | research protocol + paper | session composition for context-window scaling — asymmetric renewal |
| **Explain** | papers (lifespan, eddy, canary, ploidy, ai-bubble, ...) | LaTeX + Zenodo deposits | thesis-level grounding for the toolkit's design choices |

## Cross-pollination matrix

Projects intentionally cite, integrate, or motivate each other:

| from \\ to | starter-series | AirMCP | canary | ploidy | papers |
|---|---|---|---|---|---|
| **starter-series** | — | mcp-server-starter is the scaffold AirMCP itself was built on | mcp-server-starter ships with canary integration template | — | — |
| **AirMCP** | — | — | registered alongside canary in Claude Code MCP config — covers Mac side, canary covers git side | — | papers cite AirMCP as MCP infra example |
| **canary** | scans starter-series projects via `canary.config.ts` | scans AirMCP via `canary.config.ts` | — | ploidy listed as a research project; push-leakage instrument complements ploidy's session-completion trigger | paper §5.1 declares MCP-primary; §5.4 vignette is canary's flagship |
| **ploidy** | — | — | session-completion trigger motivates push-leakage measurement (canary `audit_session_leakage`) | — | lifespan paper's empirical companion |
| **papers** | — | — | canary instrument generates §5.4 vignette data | ploidy operationalizes lifespan paper's asymmetric-renewal claim | — |

Read this as: *the toolkit doesn't decompose into independent products; each
project cites or integrates with at least two others*. That's a feature, not
incidental — it's how the identity holds together as a brand rather than
"a list of things heznpc made."

## Brand archetype

Recognizable archetype: **indie-for-indies**. Compare:

| | Cal.com | Plausible | Pieter Levels | Linear (early) | heznpc |
|---|---|---|---|---|---|
| Self-dogfooded | ✓ | ✓ | ✓ | ✓ | ✓ |
| Opinionated for own scale | ✓ | ✓ | ✓ | ✓ | ✓ |
| Public build-in-the-open | ✓ | ✓ | ✓ | partial | ✓ |
| Has academic thesis backing | — | — | — | — | ✓ |

The thesis backing is the differentiator. Other indie-for-indies brands rely
on craft + visible iteration; heznpc adds research artifacts (papers,
protocols, peer-citable instruments) on top of the same foundation. This
combination is rare in the indie-software space and is the portfolio's
strongest defensible signal.

## What this implies for decisions

**Yes-list** (consistent with identity):

- new feature on canary that exposes another portfolio metric as an MCP tool
- new starter that fits the indie+agent flow (e.g. Tauri app starter,
  Cloudflare Worker starter)
- AirMCP capability that an agent would call in a portfolio session
  (push notifications, Apple Notes integration, etc.)
- paper that grounds a design choice already made in the toolkit
- cross-link from one project's README to another

**No-list** (would break identity):

- enterprise feature on canary (RBAC, multi-tenant, SSO) — wrong target user
- a new product without obvious lifecycle slot
- paper not connected to any toolkit artifact — drifts from the substance
  + iteration loop
- chasing hackathon optimization over substance (see hackathon learnings:
  format favors non-coder + human-interest demos, not infrastructure /
  protocol depth — see also the May 2026 Opus 4.7 hackathon analysis in
  this directory's adjacent notes)

## Re-evaluation triggers

This identity is descriptive of where the portfolio is on 2026-05-11; it
isn't a permanent contract. The right times to revisit:

- a project lands without a lifecycle phase (means the map needs a new row,
  or the project shouldn't be in the toolkit)
- target user shifts (e.g. heznpc starts working on a small team — the
  "solo / duo" framing weakens, opinionated defaults become friction)
- a paper publishes and changes the intellectual moat composition
- another indie portfolio in the same niche emerges and the differentiator
  shifts

Until one of those triggers, treat the identity above as the working frame
for prioritization decisions across canary and the rest of the toolkit.
