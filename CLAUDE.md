# CLAUDE.md — canary

Agent-specific instructions for working in this repository. Sibling to
`AGENTS.md` (Next.js-specific gotchas) and `CONTRIBUTING.md` (general
developer setup, commands, PR checklist, merge workflow).

This file is intentionally short. Prefer reading the linked sources for
detail rather than duplicating content here.

## What this repo is

A Next.js project-health dashboard *and* the implementation companion to a
research paper on the metadatafication of version control. The paper source
is in [`paper/main.tex`](paper/main.tex). The companion experiments are in
[`experiments/`](experiments/) and emit data the paper cites by file.

When making changes, ask whether the change is service-side
(`app/`, `components/`, `lib/`) or research-side
(`experiments/`, `paper/`, `planning/`, `literature/`). Both layers ship in
the same repo by design (see `planning/decisions.md` 2026-04-19 entry); do
not split them.

## Required reading before non-trivial changes

| If you are changing… | Read first |
|---|---|
| Paper text or LaTeX | [`paper/main.tex`](paper/main.tex) head + [`planning/decisions.md`](planning/decisions.md) |
| `experiments/src/push-leakage/` | [`planning/drafts/agent-push-leakage.md`](planning/drafts/agent-push-leakage.md) (RFC + Initial Results) |
| `mcp/server.ts` | comments at the top + [`scripts/mcp-smoke.mjs`](scripts/mcp-smoke.mjs) (the smoke test enumerates expected tools) |
| Anything in `lib/scanners/` | [`CONTRIBUTING.md`](CONTRIBUTING.md) "Code conventions" + the matching `__tests__/<name>.test.ts` |

## Workflow rules

These survive across sessions; honour them even if they look like overhead.

1. **Author and committer are heznpc only. No `Co-Authored-By` trailers.**
   This applies to every commit, including those generated through the GitHub
   web UI's squash-merge (which uses `GitHub <noreply@github.com>` as committer
   for the squash, with heznpc as author — that is the expected pattern).
2. **Run the validators locally before opening a PR.** `npm run lint`,
   `npm test`, and (if `paper/` changed) the LaTeX multi-pass build are all
   gated by CI; failing locally first saves a CI cycle.
3. **Merging is two steps, not one.** Use the pattern in
   [`CONTRIBUTING.md` §Merging](CONTRIBUTING.md#merging): `gh pr merge <N> --squash --auto`
   without `--delete-branch`, then explicit cleanup
   (`git push origin --delete <branch>` + `git branch -D <branch>`). The
   single-line `--delete-branch` form fails silently when sibling worktrees
   hold the branch — the paper's own §5.4 documents this as
   *command-cleanup-leakage*. Honouring the prescription here keeps this
   repository as the inverse-case datapoint for that vignette.
4. **One root checkout, no parallel `.claude/worktrees/` for PR work in this
   repo.** Worktrees here have a habit of accumulating stale branches the
   paper documents (see §5.4). Reserve worktrees for genuine isolation
   needs; do PR work from the main checkout.

## When in doubt

- The paper is the single source of truth for thesis claims; the code
  validates the recommendations the paper makes. Don't add a finding to one
  side without checking whether the other side needs an update.
- If a refactor would invalidate a number cited in `paper/main.tex` or a
  snapshot under `experiments/results/`, surface it explicitly in the PR
  description. The first cited number is in §5.4 (push-leakage portfolio
  metrics).
