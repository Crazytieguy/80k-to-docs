# 80k → Docs

Daily GitHub Actions cron that mirrors **every job posting** from the [80,000 Hours job board](https://jobs.80000hours.org/) into this repo as a folder of markdown files.

**[→ Browse the archive at crazytieguy.github.io/80k-to-docs](https://crazytieguy.github.io/80k-to-docs/)** (GitHub Pages, auto-deployed on every commit). The raw markdown is at [`index.md`](./index.md) and [`jobs/`](./jobs/). Click any area chip to filter; type in the search box to narrow further.

## Why a markdown archive (not Google Docs)?

Initial design used Google Docs in a Drive folder. Hit a hard wall: service accounts on consumer Google accounts have **zero Drive storage quota** (and Google Docs count against quota since 2021). Workarounds required Google Workspace ($6/mo). A markdown-in-git archive is free, self-hosting, has a built-in audit log (`git log`), and renders nicely on github.com.

## How it works

1. GitHub Actions cron (`.github/workflows/sync.yml`) fires at 06:17 UTC daily — or on-demand via `workflow_dispatch`.
2. `src/sync.ts` fetches `https://backend.eawork.org/api/jobs/` and diffs against the on-disk `jobs/*.md` files (using each file's YAML frontmatter for change-detection).
3. **New** → write `jobs/<jobId>.md`. **Changed** → rewrite. **Closed** (in `jobs/` but missing from upstream) → rewrite into `jobs/closed/<jobId>.md` with a closed banner. **Reopened** (was closed, now back in API) → move back to `jobs/` and rewrite.
4. Regenerate `index.md` from the final on-disk state and commit everything back to `main` using the default `GITHUB_TOKEN`.

There is no external state store and no secrets — the git history is the audit log.

## Configuration

Optional GitHub repo variable for forks that want a narrowed mirror:

- `AREA_TAGS` — comma-separated `tags_area` names from the 80k API (e.g. `AI technical safety,AI governance`). **Unset or empty = mirror every job** (the default for this deployment; UI chips do the per-area filtering).

## Local development

```bash
pnpm install
pnpm test           # 37 unit tests
pnpm typecheck      # tsc --noEmit
pnpm sync           # real run — writes to ./jobs/ and ./index.md
```

Do not run local sync while a GitHub Actions run is in progress; the workflow's `concurrency` block prevents Actions-vs-Actions races but can't see local runs.

## Caveats

- **Public archive:** the repo is public, and closed-job markdown stays in git history even if 80k removes a listing upstream. The upstream API is itself public so no real privacy is leaked.
- **Cron pause:** GitHub disables scheduled workflows in public repos after 60 days of zero repo activity. `index.md` regenerates every run (it embeds `last_synced`), guaranteeing a commit when anything changes; failure emails will alert you to a multi-week red streak long before cron could be disabled.
