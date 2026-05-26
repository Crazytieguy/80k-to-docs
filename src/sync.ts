import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { fetchJobs, filterByArea, jobId as getJobId, parseAreaTags } from "./api.ts";
import { getAccessToken } from "./google-auth.ts";
import {
  deleteFile,
  findByJobId,
  renameFile,
  updateDocFromMarkdown,
  uploadDocFromMarkdown,
  type DriveDeps,
  type DriveFile,
} from "./drive.ts";
import { writeErrorDocIfNew } from "./error-doc.ts";
import { loadState, saveState } from "./state.ts";
import {
  formatDate,
  renderClosedTitle,
  renderDocTitle,
  renderJobMarkdown,
} from "./render-job.ts";
import type { Job, JobStateEntry, State, SyncEnv } from "./types.ts";

const STATE_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "state",
  "jobs.json",
);

interface ActionCreate {
  kind: "create";
  job: Job;
}
interface ActionUpdate {
  kind: "update";
  job: Job;
  prev: JobStateEntry;
}
interface ActionClose {
  kind: "close";
  prev: JobStateEntry;
}
interface ActionReopen {
  kind: "reopen";
  job: Job;
  prev: JobStateEntry;
}
type Action = ActionCreate | ActionUpdate | ActionClose | ActionReopen;

interface JobError {
  jobId: string;
  action: Action["kind"];
  error: string;
}

async function main(): Promise<void> {
  const env = readEnv();
  const startedAt = new Date().toISOString();
  const state = await loadState(STATE_PATH);
  const errors: JobError[] = [];

  let upstreamAll: Job[];
  try {
    upstreamAll = await fetchJobs();
  } catch (err) {
    await recordAndExit(state, err, startedAt);
    return;
  }

  const areaTags = parseAreaTags(env.AREA_TAGS);
  const inScope = filterByArea(upstreamAll, areaTags);
  const upstreamIds = new Set(upstreamAll.map(getJobId));
  const inScopeMap = new Map(inScope.map((j) => [getJobId(j), j]));

  const actions = planActions(state, inScopeMap, upstreamIds);
  console.log(
    `[sync] upstream=${upstreamAll.length} inScope=${inScope.length} stateJobs=${Object.keys(state.jobs).length} actions=${actions.length}`,
  );

  const deps: DriveDeps = {
    getToken: () => getAccessToken(env.GOOGLE_SA_JSON),
    folderId: env.DRIVE_FOLDER_ID,
  };

  const counts = { created: 0, updated: 0, closed: 0, reopened: 0, skipped: 0 };
  for (const action of actions) {
    try {
      await applyAction(deps, state, action);
      counts[`${action.kind}d` as keyof typeof counts]++;
      state.lastRun = new Date().toISOString();
      await saveState(STATE_PATH, state);
    } catch (err) {
      const id = actionJobId(action);
      const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
      console.error(`[sync] ${action.kind} ${id} failed: ${msg}`);
      errors.push({ jobId: id, action: action.kind, error: msg });
    }
  }
  counts.skipped = upstreamAll.length - actions.length;

  const finishedAt = new Date().toISOString();
  state.lastRun = finishedAt;
  if (errors.length === 0) {
    state.lastSuccess = finishedAt;
    state.lastError = null;
  } else {
    state.lastError = {
      at: finishedAt,
      message: `${errors.length} job-level error(s); first: ${errors[0]!.action} ${errors[0]!.jobId} → ${errors[0]!.error}`,
    };
  }
  await saveState(STATE_PATH, state);

  console.log(
    `[sync] done created=${counts.created} updated=${counts.updated} closed=${counts.closed} reopened=${counts.reopened} skipped=${counts.skipped} errors=${errors.length}`,
  );

  if (errors.length > 0) {
    const summary = `${errors.length} job-level error(s) during sync at ${finishedAt}`;
    const details = errors.map((e) => `[${e.action}] ${e.jobId}: ${e.error}`).join("\n");
    try {
      await writeErrorDocIfNew(deps, { summary, details });
    } catch (err) {
      console.error(`[sync] failed to write error doc: ${err instanceof Error ? err.message : err}`);
    }
    process.exit(1);
  }
}

function planActions(
  state: State,
  inScopeMap: Map<string, Job>,
  upstreamIds: Set<string>,
): Action[] {
  const actions: Action[] = [];

  for (const [id, job] of inScopeMap) {
    const prev = state.jobs[id];
    if (!prev) {
      actions.push({ kind: "create", job });
    } else if (prev.status === "closed") {
      actions.push({ kind: "reopen", job, prev });
    } else if (prev.updatedAt !== job.updated_at) {
      actions.push({ kind: "update", job, prev });
    }
  }

  for (const [id, prev] of Object.entries(state.jobs)) {
    if (prev.status === "ready" && !upstreamIds.has(id)) {
      actions.push({ kind: "close", prev });
    }
  }

  return actions;
}

async function applyAction(deps: DriveDeps, state: State, action: Action): Promise<void> {
  switch (action.kind) {
    case "create":
      return await applyCreate(deps, state, action);
    case "update":
      return await applyUpdate(deps, state, action);
    case "close":
      return await applyClose(deps, state, action);
    case "reopen":
      return await applyReopen(deps, state, action);
  }
}

async function applyCreate(deps: DriveDeps, state: State, action: ActionCreate): Promise<void> {
  const id = getJobId(action.job);
  const title = renderDocTitle(action.job);
  const markdown = renderJobMarkdown(action.job);

  const existing = await findByJobId(deps, id);
  let docId: string;
  if (existing.length > 0) {
    const chosen = pickNewest(existing);
    for (const extra of existing) {
      if (extra.id !== chosen.id && !extra.name.startsWith("[DUPLICATE-of-")) {
        console.warn(`[sync] adopting ${chosen.id} for ${id}; renaming duplicate ${extra.id}`);
        try {
          await renameFile(deps, { docId: extra.id, name: `[DUPLICATE-of-${chosen.id}] ${extra.name}` });
        } catch (err) {
          console.warn(`[sync] failed to rename duplicate ${extra.id}: ${err instanceof Error ? err.message : err}`);
        }
      }
    }
    docId = chosen.id;
    await updateDocFromMarkdown(deps, { docId, name: title, markdown });
  } else {
    const file = await uploadDocFromMarkdown(deps, { name: title, markdown, jobId: id });
    docId = file.id;
  }

  state.jobs[id] = {
    docId,
    updatedAt: action.job.updated_at,
    title: action.job.title,
    employer: action.job.post.company.name,
    status: "ready",
    snapshot: action.job,
  };
}

async function applyUpdate(deps: DriveDeps, state: State, action: ActionUpdate): Promise<void> {
  const id = getJobId(action.job);
  const title = renderDocTitle(action.job);
  const markdown = renderJobMarkdown(action.job);
  await updateDocFromMarkdown(deps, { docId: action.prev.docId, name: title, markdown });
  state.jobs[id] = {
    docId: action.prev.docId,
    updatedAt: action.job.updated_at,
    title: action.job.title,
    employer: action.job.post.company.name,
    status: "ready",
    snapshot: action.job,
  };
}

async function applyClose(deps: DriveDeps, state: State, action: ActionClose): Promise<void> {
  const id = getJobId(action.prev.snapshot);
  const closedAt = formatDate(new Date().toISOString());
  const liveTitle = renderDocTitle(action.prev.snapshot);
  const title = renderClosedTitle(liveTitle, closedAt);
  const markdown = renderJobMarkdown(action.prev.snapshot, { closed: { closedAt } });
  await updateDocFromMarkdown(deps, { docId: action.prev.docId, name: title, markdown });
  state.jobs[id] = {
    ...action.prev,
    status: "closed",
    closedAt,
  };
}

async function applyReopen(deps: DriveDeps, state: State, action: ActionReopen): Promise<void> {
  const id = getJobId(action.job);
  const title = renderDocTitle(action.job);
  const markdown = renderJobMarkdown(action.job);
  await updateDocFromMarkdown(deps, { docId: action.prev.docId, name: title, markdown });
  const next: JobStateEntry = {
    docId: action.prev.docId,
    updatedAt: action.job.updated_at,
    title: action.job.title,
    employer: action.job.post.company.name,
    status: "ready",
    snapshot: action.job,
  };
  state.jobs[id] = next;
}

function actionJobId(action: Action): string {
  switch (action.kind) {
    case "create":
    case "update":
    case "reopen":
      return getJobId(action.job);
    case "close":
      return getJobId(action.prev.snapshot);
  }
}

function pickNewest(files: DriveFile[]): DriveFile {
  return files.slice().sort((a, b) => {
    const at = a.createdTime ?? "";
    const bt = b.createdTime ?? "";
    return bt.localeCompare(at);
  })[0]!;
}

async function recordAndExit(state: State, err: unknown, _startedAt: string): Promise<void> {
  const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  const stack = err instanceof Error ? err.stack?.slice(0, 1500) : undefined;
  console.error(`[sync] fatal: ${msg}`);
  state.lastRun = new Date().toISOString();
  state.lastError = { at: state.lastRun, message: msg, stack };
  await saveState(STATE_PATH, state);
  process.exit(1);
}

function readEnv(): SyncEnv {
  const required = ["GOOGLE_SA_JSON", "DRIVE_FOLDER_ID"] as const;
  for (const k of required) {
    if (!process.env[k]) {
      console.error(`[sync] missing required env var: ${k}`);
      process.exit(1);
    }
  }
  return {
    GOOGLE_SA_JSON: process.env.GOOGLE_SA_JSON!,
    DRIVE_FOLDER_ID: process.env.DRIVE_FOLDER_ID!,
    AREA_TAGS: process.env.AREA_TAGS ?? "AI safety & policy,AI technical safety,AI governance",
  };
}

// Use top-level await + import-as-script convention so direct invocation runs main().
// Vitest imports modules but never executes this file directly, so this is safe.
const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  main().catch((err) => {
    console.error("[sync] unhandled:", err);
    process.exit(1);
  });
}
