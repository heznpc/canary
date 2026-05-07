# push-leakage/

Agent-push leakage axis. Joins Claude Code CLI session transcripts with
multi-repo git state to compute three metrics:

- **APL** (Agent-Push Latency) — time from last agent session to now, for repos
  currently ahead of upstream.
- **MIP** (Metadata-Invisibility Period) — time the oldest unpushed commit has
  been sitting unpropagated.
- **PLR** (Push Leakage Rate) — fraction of agent-touched repos in MIP > N days.

See `planning/drafts/agent-push-leakage.md` for the RFC and the metadatafication
thesis grounding (§3 / §5.4 / §6.2 of `paper/main.tex`).

## Modules

| File | Responsibility |
|---|---|
| `transcript-scan.ts` | Walk `~/.claude/projects/<projectdir>/<sessionid>.jsonl`, extract per-session metadata, aggregate by `cwd`. |
| `repo-scan.ts` | Walk one or more roots, find git repos, capture ahead/behind/dirty + oldest unpushed commit timestamp. |
| `metrics.ts` | Join sessions × repos, compute APL/PLR/MIP at portfolio level. |
| `cli.ts` | Entrypoint. Writes a sanitized public snapshot + a gitignored raw detail snapshot. |

## Usage

```bash
# Scan ~/IdeaProjects with the IdeaProjects transcript filter
npx tsx experiments/src/push-leakage/cli.ts ~/IdeaProjects --filter=IdeaProjects

# Scan multiple roots, override threshold
npx tsx experiments/src/push-leakage/cli.ts ~/work ~/personal --threshold-days=14

# Custom out path (writes both -detail.json under raw/ and the public snapshot)
npx tsx experiments/src/push-leakage/cli.ts ~/repos --out=/tmp/snap.json
```

## Output

Two files per run:

1. `experiments/results/push-leakage-<YYYY-MM-DD>.json` — public snapshot.
   Repo paths replaced by `<basename>-<8-hex-hash>`, remote URLs and commit
   subjects redacted. Safe to commit; paper-citable.
2. `experiments/results/raw/push-leakage-<YYYY-MM-DD>-detail.json` — full
   detail. Contains absolute paths, remote URLs, and unpushed commit subjects.
   `experiments/results/raw/` is gitignored.

## Out of Scope

This tool measures and reports. It does not push, commit, fetch, or mutate
any repo. Auto-push behaviour is a separate operator decision (see RFC § Out
of Scope; cf. anthropics/claude-code#39565 on auto-push without consent).

## Known Limitations

- **CLI-only.** Parses `~/.claude/projects/` jsonl format. Claude Desktop /
  Cowork sessions under `~/Library/Application Support/Claude/` use a different
  schema and are out of scope for the prototype.
- **Exact-match cwd join.** Sessions run from a parent directory (e.g.
  `~/IdeaProjects/Paper`) that touch child repos via `git -C <subrepo>`
  commands are not attributed to those child repos. Attributed leakage figures
  are therefore a lower bound. Future work: parse Bash tool inputs to attribute
  parent-cwd touches.
- **Worktrees.** Linked worktrees (where `.git` is a file) are scanned as
  independent repos; their state is not folded back into the parent checkout.
