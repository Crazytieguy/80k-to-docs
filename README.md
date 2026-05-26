# 80k → Docs

Daily GitHub Actions cron that mirrors **AI-safety job postings** from the [80,000 Hours job board](https://jobs.80000hours.org/) into a Google Drive folder of formatted Google Docs. The folder doubles as an archive: jobs that disappear from the upstream board are preserved and marked `[CLOSED YYYY-MM-DD]`.

## How it works

1. GitHub Actions cron (`.github/workflows/sync.yml`) fires at 06:17 UTC daily — or on-demand via `workflow_dispatch`.
2. `src/sync.ts` fetches `https://backend.eawork.org/api/jobs/`, filters by `AREA_TAGS`, diffs against committed `state/jobs.json`, and applies create / update / close / reopen actions.
3. Each doc is created/updated via Drive `files.create` / `files.update` with `text/markdown → application/vnd.google-apps.document` conversion (one atomic API call per doc).
4. State is committed back to `main` each run — that file is the durable audit log, browsable via `git log -p state/jobs.json`.

## Setup

You need a Google Cloud service account with the `https://www.googleapis.com/auth/drive` scope, plus a Drive folder shared with the SA's email (Editor).

GitHub repo secrets:
- `GOOGLE_SA_JSON` — full SA key JSON (one line, ~2.3 KB).
- `DRIVE_FOLDER_ID` — the folder's Drive ID (from `…/folders/<ID>` URL).

GitHub repo variable (not secret — easy to retune):
- `AREA_TAGS` — comma-separated tag names. Default: `AI safety & policy,AI technical safety,AI governance` (~455 jobs).

## Status and errors

- **GitHub Actions UI** is the primary status surface. Failed runs email the repo owner.
- A summary error doc is created in the Drive folder if any per-job operation fails (dedup'd to once per 24 h per error hash).
- `state/jobs.json` always records `lastRun`, `lastSuccess`, `lastError` — `git log -p state/jobs.json` shows the failure history.

## Local development

```bash
pnpm install
pnpm test              # unit tests
pnpm typecheck         # tsc --noEmit

# Real run against your Drive folder (uses .env):
cp .env.example .env   # then fill in
pnpm sync
```

Do **not** run local sync while a GitHub Actions run is in progress — the workflow `concurrency` block prevents Actions-vs-Actions races but can't see local runs.

## Caveats

- **Public archive:** because the repo is public, `state/jobs.json` snapshots and (by reference) closed job docs remain in git history even if 80k later removes a listing. The upstream API is itself public, so nothing private is leaked — but consciously accept that this repo is a public archive of the 80k AI-safety job board.
- **Cron pause:** GitHub disables scheduled workflows in public repos after 60 days of zero repo activity. State commits each run count as activity, so this is self-sustaining as long as the workflow runs. A multi-week red streak could eventually disable cron — failure emails will alert you long before that.
- **SA key rotation:** Google recommends every 90 days. Rotate with `gcloud iam service-accounts keys create new.json --iam-account=…`, `gh secret set GOOGLE_SA_JSON --body "$(cat new.json)"`, `gcloud iam service-accounts keys delete <old-id>`.
- **Stale data after upstream tag changes:** if 80k re-tags a job out of your `AREA_TAGS`, we stop updating its doc but do **not** mark it closed (it's still upstream, just not in our filter). Tightening or loosening `AREA_TAGS` is therefore safe.
