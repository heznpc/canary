# experiments/ -- Canary Research Experiments

Companion experiments for the metadatafication paper. Written in TypeScript
because they call the GitHub REST API (Octokit) -- same runtime as the service.

## Layout

```
experiments/
├── src/
│   ├── acr-experiment.ts       Agent-Authored Commit Ratio (30d/90d/365d)
│   ├── adoption-timeline.ts    Metadatafication adoption curve
│   ├── cam-experiment.ts       Context Attention Metric (repos + reference OSS)
│   ├── cam-loc.ts              CAM weighted by lines of code
│   ├── cam-temporal.ts         CAM over time
│   └── statistical-tests.ts    Combines acr + cam results for significance tests
└── results/
    ├── acr-results.json
    ├── adoption-timeline-results.json
    ├── cam-results.json
    ├── cam-loc-results.json
    ├── cam-temporal-results.json
    ├── statistical-tests-results.json
    └── EXPERIMENT-AUDIT.md     Methodological audit
```

## Reproducing

```bash
npx tsx experiments/src/acr-experiment.ts [username]
npx tsx experiments/src/adoption-timeline.ts
npx tsx experiments/src/cam-experiment.ts [username]
npx tsx experiments/src/cam-loc.ts
npx tsx experiments/src/cam-temporal.ts
npx tsx experiments/src/statistical-tests.ts   # reads cam + acr results
```

Requires `.env.local` at the repo root with GitHub API credentials.

## Service vs experiments

- `app/`, `components/`, `lib/`, `landing/`, `public/` -- Next.js service (production dashboard)
- `experiments/` -- research scripts that produced the paper's quantitative claims

They are intentionally separate bounded contexts even though both use Octokit.
