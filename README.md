# 80k → Docs

Daily GitHub Actions cron that mirrors **AI-safety job postings** from the [80,000 Hours job board](https://jobs.80000hours.org/) into this repo as a folder of markdown files. The whole archive is browsable here on GitHub. **[Browse the live index →](./INDEX.md)**

## Why a markdown archive (not Google Docs)?

Initial design used Google Docs in a Drive folder. Hit a hard wall: service accounts on consumer Google accounts have **zero Drive storage quota** (and Google Docs count against quota since 2021). Workarounds required Google Workspace ($6/mo). A markdown-in-git archive is free, self-hosting, has a built-in audit log (`git log`), and renders nicely on github.com.

## How it works

1. GitHub Actions cron (`.github/workflows/sync.yml`) fires at 06:17 UTC daily — or on-demand via `workflow_dispatch`.
2. `src/sync.ts` fetches `https://backend.eawork.org/api/jobs/`, filters by the `AREA_TAGS` repo variable, and diffs against the on-disk `jobs/*.md` files (using each file's YAML frontmatter for change-detection).
3. **New** → write `jobs/<jobId>.md`. **Changed** → rewrite. **Closed** (in `jobs/` but missing from upstream entirely) → rewrite into `jobs/closed/<jobId>.md` with a closed banner. **Reopened** (was closed, now back in API) → move back to `jobs/` and rewrite.
4. Regenerate `INDEX.md` from the final on-disk state and commit everything back to `main` using the default `GITHUB_TOKEN`.

There is no external state store and no secrets — the git history is the audit log.

## Configuration

One GitHub repo variable (not a secret — easy to retune):

- `AREA_TAGS` — comma-separated `tags_area` names from the 80k API. Default if unset: `AI safety & policy,AI technical safety,AI governance` (~455 jobs).

Set it via: `gh variable set AREA_TAGS --body "AI technical safety"` (narrowest, ~15 jobs).

## Local development

```bash
pnpm install
pnpm test                          # 30+ unit tests
pnpm typecheck                     # tsc --noEmit

# Real run — writes to ./jobs/ and ./INDEX.md:
AREA_TAGS="AI technical safety" pnpm sync
```

Do not run local sync while a GitHub Actions run is in progress; the workflow's `concurrency` block prevents Actions-vs-Actions races but can't see local runs.

## Caveats

- **Public archive:** the repo is public, and closed-job markdown stays in git history even if 80k removes a listing upstream. The upstream API is itself public so no real privacy is leaked — but consciously accept that this repo is a public AI-safety jobs archive.
- **Cron pause:** GitHub disables scheduled workflows in public repos after 60 days of zero repo activity. `INDEX.md` is regenerated every run (it embeds `last_run`), guaranteeing a commit every run — self-sustaining as long as the workflow runs at all. A multi-week red streak could eventually disable cron; failure emails will alert you long before that.
- **Tag retuning:** if you tighten `AREA_TAGS`, dropped jobs are left in place — they are **not** marked closed (they're still alive upstream, just not in your filter anymore). They'll stop receiving updates. Loosen the filter and they'll resume; close them upstream and they move to `jobs/closed/`.
