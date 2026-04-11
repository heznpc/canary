# Contributing to Canary

Thanks for your interest. This document covers the basics — full architectural notes live in `README.md`.

## Development setup

```bash
npm install
export GITHUB_TOKEN=ghp_...  # optional but recommended for higher rate limits
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

## Reporting issues

Open a GitHub issue with steps to reproduce. For security issues, see `SECURITY.md`.
