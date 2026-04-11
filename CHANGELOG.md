# Changelog

All notable changes to Canary are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- **Real vulnerability scanning** via OSV.dev across npm, PyPI, Pub, and Maven ecosystems. Replaces the previous hardcoded `vulnerabilities: 0` stub in every dependency scanner.
- **Real deploy verification** for `zenodo` (via doi.org) and `chrome-store` (via the listing detail page). Both branches previously returned `status: "up"` unconditionally. New optional fields `zenodoDoi` and `chromeExtensionId` on `ProjectConfig` enable verification.
- **Dynamic stack metadata** via [endoflife.date](https://endoflife.date) — latest versions and EOL cycles are now fetched at runtime (24h cache) instead of being hardcoded constants. Static `STACK_META` is retained as fallback.
- **Shared GitHub circuit breaker** in `lib/scanners/shared-breaker.ts`, used by every GitHub-touching scanner. Previously only `github.ts` was protected.
- **Externalized data files**: `lib/data/stack-intel.json` (vibecoding gotchas) and `lib/data/migration-guides.json` (release-note guide URLs) replace ~150 lines of hardcoded constants.
- **Externalized portfolio sync config**: heznpc-specific data (flagship IDs, starters, meta) moved out of `lib/sync/heznpc.ts` into the new `syncConfig` export in `canary.config.ts`. The exporter now serves any user.
- `LOG_LEVEL` env var support in `lib/logger.ts` (`debug | info | warn | error | silent`). Tests run at `warn` by default to keep suite output readable.
- `CONTRIBUTING.md`, `SECURITY.md`, `CHANGELOG.md`, and `.github/dependabot.yml` — files Canary's own `code-quality.ts` scanner expects.
- Default `canary.config.ts` includes a self-scan entry, so the dashboard works out of the box.

### Changed

- `GitStatus` type no longer carries `aheadBy` / `behindBy` / `uncommittedCount` — those are local working-tree state and cannot be measured via the GitHub REST API. The grader's penalty branches that read these fields were dead code (every scan returned 0) and have been removed.
- `rate-limit.ts` now calls `unref()` on its cleanup interval, so test runners can exit cleanly.

### Fixed

- `npm run lint` is green again. Twenty errors and three warnings in `scripts/` (require-style imports, `any` types, unused variables) had been red on `main` since early April; CI was failing on every push. All addressed without disabling the rules.
- README no longer hardcodes a test count that drifts from reality.
