# Contributing to Canary

Thanks for your interest. This document covers the basics — full architectural notes live in `README.md`.

## Development setup

```bash
npm install
gh auth login                 # or export GITHUB_TOKEN=... for higher rate limits
npm run dev                   # http://localhost:3000
```

## Commands

| Command          | What it does                              |
| ---------------- | ----------------------------------------- |
| `npm run dev`    | Next.js dev server                        |
| `npm run build`  | Production build                          |
| `npm run lint`   | ESLint (must pass before merging)         |
| `npm test`       | Vitest unit tests                         |
| `npx tsc --noEmit` | Type-check without emit                 |

## Pull request checklist

Before opening a PR:

1. `npm run lint` — clean
2. `npm test` — all green
3. `npx tsc --noEmit` — no errors
4. Add or update tests for any scanner you change. Scanners under `lib/scanners/` should have a matching `__tests__/<name>.test.ts`.
5. If you add a new dependency, justify it in the PR description.

## Code conventions

- TypeScript strict mode is on. Don't introduce `any`; use `unknown` and narrow.
- Network calls go through `fetchWithTimeout` from `lib/scanners/version-utils.ts`.
- All GitHub API calls share the circuit breaker in `lib/scanners/shared-breaker.ts`.
- Logger lives at `lib/logger.ts` — emit structured JSON, not free-form strings.
- Don't hardcode user-specific data in `lib/`. It belongs in `canary.config.ts`.

## Merging

Once the PR is approved and CI is green, merge with:

```bash
gh pr merge <N> --squash --auto
```

Note: **`--delete-branch` is intentionally omitted.** The combined `gh pr merge --squash --auto --delete-branch` runs branch cleanup as a client-side step (`git push origin --delete` + `git branch -D`) that fails silently when the branch is held by a sibling git worktree. The server-side merge still succeeds, but the orphan remote branch accumulates — a real failure mode the paper documents in §5.4 ("command-cleanup-leakage"). This repo's own §5.4 vignette uses zero stale branches as the inverse-case datapoint, so the workflow is intentionally protective.

After the PR is merged, do branch cleanup in two explicit steps:

```bash
git fetch origin --prune                     # surfaces any orphan refs
git push origin --delete <feature-branch>    # only if --prune flagged it as stuck on remote
git branch -D <feature-branch>               # local; fails noisily if a worktree holds it
git worktree list                            # confirm no orphan worktree was left behind
```

If `git branch -D` fails, run `git worktree list` and `git worktree remove <path>` on the holding worktree before retrying. Do not work around the failure; the failure is the signal.

For agents operating across multiple repos in one session, prefer the main checkout for PR work and reserve `.claude/worktrees/` for genuine parallel-isolation needs. Each worktree is one more place a future merge may try to clean up — keep the topology shallow.

## Reporting issues

Open a GitHub issue with steps to reproduce. For security issues, see `SECURITY.md`.
