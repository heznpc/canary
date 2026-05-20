# Security Policy

## Supported versions

Canary is a single-branch project. Security fixes land on `main`.

## Reporting a vulnerability

If you discover a security issue, please **do not** open a public issue. Instead:

1. Open a private security advisory on GitHub:
   <https://github.com/heznpc/canary/security/advisories/new>
2. Or email the maintainer listed in the repository profile.

Include:

- Affected version / commit SHA
- A minimal reproduction
- Impact assessment if you have one

You can expect an acknowledgement within a few days. Coordinated disclosure is preferred — please give the maintainer reasonable time to ship a fix before publicizing.

## Scope

In scope:

- The Canary application (`lib/`, `app/`, `components/`)
- Configuration handling (`canary.config.ts`)
- The portfolio sync exporter (`/api/sync`)

Out of scope:

- The research paper artifacts under `paper/` and `manuscript.md`
- Reference data files under `lib/data/` (these are convenience defaults; verify upstream sources for authoritative info)
- Third-party services Canary queries (GitHub API, OSV.dev, endoflife.date, npm/PyPI/pub.dev/Maven Central, Semantic Scholar)

## Hardening already in place

- Per-IP sliding-window rate limiting on the scan endpoint
- Circuit breaker on all GitHub API calls
- Input validation on dynamic API routes (`app/api/projects/[id]`, `app/api/releases`)
- All outbound requests are wrapped with timeouts
- All outbound requests go through `fetchWithTimeout` (`lib/scanners/version-utils.ts`), which enforces an explicit host allow-list plus an `https:`-only protocol gate. Defense-in-depth against SSRF; cloud-metadata IPs (`169.254.169.254`), `localhost`, and `127.0.0.1` are unconditionally rejected. The list lives in code so new scanners that add a host fail closed at runtime until the list is updated and a corresponding unit test added (`__tests__/version-utils.test.ts`).
- No secrets are persisted to disk; tokens are read from env at request time
