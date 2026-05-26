import { mkdir, readFile, readdir, rename, writeFile, rm, open } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { fetchJobs, filterByArea, jobId as getJobId, parseAreaTags } from "./api.ts";
import { formatDate, parseFrontmatter, renderJobFile } from "./render-job.ts";
import { renderIndex, type IndexEntry } from "./render-index.ts";
import type { Job, JobFrontmatter } from "./types.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const JOBS_DIR = join(ROOT, "jobs");
const CLOSED_DIR = join(JOBS_DIR, "closed");
const INDEX_PATH = join(ROOT, "INDEX.md");

interface OnDisk {
  jobId: string;
  closed: boolean;
  fm: JobFrontmatter;
  path: string;            // absolute
  relPath: string;         // repo-relative (for INDEX links)
}

async function main(): Promise<void> {
  const areaTags = parseAreaTags(
    process.env.AREA_TAGS ?? "AI safety & policy,AI technical safety,AI governance",
  );
  console.log(`[sync] filter: ${areaTags.join(", ")}`);

  await mkdir(JOBS_DIR, { recursive: true });
  await mkdir(CLOSED_DIR, { recursive: true });

  const upstream = await fetchJobs();
  const inScope = filterByArea(upstream, areaTags);
  const upstreamMap = new Map(upstream.map((j) => [getJobId(j), j]));
  const inScopeMap = new Map(inScope.map((j) => [getJobId(j), j]));

  const onDisk = await loadOnDisk();
  const onDiskMap = new Map(onDisk.map((e) => [e.jobId, e]));
  console.log(
    `[sync] upstream=${upstream.length} inScope=${inScope.length} onDisk=${onDisk.length}`,
  );

  const today = formatDate(new Date().toISOString());
  const counts = { created: 0, updated: 0, closed: 0, reopened: 0, skipped: 0 };
  const errors: string[] = [];

  // Pass 1: new and updated jobs.
  for (const [id, job] of inScopeMap) {
    try {
      const existing = onDiskMap.get(id);
      if (!existing) {
        await writeJobFile(job, /* closed */ undefined);
        counts.created++;
      } else if (existing.closed) {
        // Reopen: write fresh file in jobs/, delete the closed copy.
        await writeJobFile(job, /* closed */ undefined);
        await rm(existing.path, { force: true });
        counts.reopened++;
      } else if (existing.fm.last_updated !== job.updated_at) {
        await writeJobFile(job, /* closed */ undefined);
        counts.updated++;
      } else {
        counts.skipped++;
      }
    } catch (err) {
      const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
      console.error(`[sync] failed for ${id}: ${msg}`);
      errors.push(`${id}: ${msg}`);
    }
  }

  // Pass 2: closures (in jobs/ but missing from upstream entirely — NOT just out of filter).
  for (const entry of onDisk) {
    if (entry.closed) continue;
    if (upstreamMap.has(entry.jobId)) continue;
    try {
      const snapshot = await readJobAsSnapshot(entry);
      await writeJobFile(snapshot, { closedAt: today });
      // The file path may change if the body changed under the same id; but since filename is
      // {jobId}.md and we rewrite to jobs/closed/{jobId}.md, just remove the live file.
      await rm(entry.path, { force: true });
      counts.closed++;
    } catch (err) {
      const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
      console.error(`[sync] failed to close ${entry.jobId}: ${msg}`);
      errors.push(`close ${entry.jobId}: ${msg}`);
    }
  }

  // Re-scan to build INDEX from the post-sync on-disk state.
  const post = await loadOnDisk();
  const active = post.filter((e) => !e.closed).map(toIndexEntry);
  const closed = post.filter((e) => e.closed).map(toIndexEntry);
  const indexMd = renderIndex({
    active,
    closed,
    lastRunUtc: new Date().toISOString(),
    areaTags,
  });
  await atomicWrite(INDEX_PATH, indexMd);

  console.log(
    `[sync] done created=${counts.created} updated=${counts.updated} closed=${counts.closed} reopened=${counts.reopened} skipped=${counts.skipped} errors=${errors.length}`,
  );

  if (errors.length > 0) {
    console.error(`[sync] ${errors.length} error(s); first: ${errors[0]}`);
    process.exit(1);
  }
}

async function loadOnDisk(): Promise<OnDisk[]> {
  const out: OnDisk[] = [];
  for (const closed of [false, true]) {
    const dir = closed ? CLOSED_DIR : JOBS_DIR;
    let entries: string[];
    try {
      entries = await readdir(dir);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw err;
    }
    for (const name of entries) {
      if (!name.endsWith(".md")) continue;
      if (name === "README.md") continue;
      const path = join(dir, name);
      const text = await readFile(path, "utf8");
      const { fm } = parseFrontmatter(text);
      if (!fm.job_id || !fm.last_updated || !fm.title || !fm.employer || !fm.status) continue;
      out.push({
        jobId: fm.job_id,
        closed: fm.status === "closed",
        fm: fm as JobFrontmatter,
        path,
        relPath: closed ? `jobs/closed/${name}` : `jobs/${name}`,
      });
    }
  }
  return out;
}

async function writeJobFile(job: Job, closed: { closedAt: string } | undefined): Promise<void> {
  const id = getJobId(job);
  const targetDir = closed ? CLOSED_DIR : JOBS_DIR;
  const path = join(targetDir, `${id}.md`);
  const body = renderJobFile(job, closed ? { closed } : undefined);
  await atomicWrite(path, body);
}

async function readJobAsSnapshot(entry: OnDisk): Promise<Job> {
  // Reconstruct a minimal Job from the frontmatter + body so we can re-render with a closed banner.
  // We deliberately preserve the previously-rendered body via a single read+rewrite below — but to
  // keep the renderJobFile path uniform, we synthesise a Job object from the frontmatter.
  return {
    title: entry.fm.title,
    post: {
      company: { name: entry.fm.employer, url: null },
      id_external_80_000_hours: entry.fm.job_id,
    },
    description_short: await extractSummary(entry.path),
    url_external: entry.fm.apply_url,
    posted_at: entry.fm.posted_at,
    updated_at: entry.fm.last_updated,
    salary_min: null,
    salary_max: null,
    tags_area: entry.fm.areas.map((name) => ({ name })),
    tags_country: [],
    tags_city: [],
    tags_role_type: [],
    tags_location_type: [],
    tags_workload: [],
    tags_skill: [],
    tags_exp_required: [],
    tags_degree_required: [],
  };
}

async function extractSummary(path: string): Promise<string> {
  // Pull the "## Summary" section out of the existing body so the closed snapshot keeps it.
  const text = await readFile(path, "utf8");
  const { body } = parseFrontmatter(text);
  const start = body.indexOf("## Summary\n");
  if (start < 0) return "";
  const after = body.slice(start + "## Summary\n".length);
  const end = after.search(/\n(##|\[Apply|---)/);
  const md = (end < 0 ? after : after.slice(0, end)).trim();
  // Convert markdown bullets back to HTML so renderJobFile's html-to-md path produces the same shape.
  if (!md) return "";
  if (md.startsWith("- ")) {
    const items = md
      .split("\n")
      .filter((l) => l.startsWith("- "))
      .map((l) => `<li>${escapeHtml(l.slice(2))}</li>`)
      .join("");
    return `<ul>${items}</ul>`;
  }
  return `<p>${escapeHtml(md)}</p>`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function toIndexEntry(e: OnDisk): IndexEntry {
  return { fm: e.fm, path: e.relPath };
}

async function atomicWrite(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  await writeFile(tmp, content, "utf8");
  const fh = await open(tmp, "r+");
  try { await fh.sync(); } finally { await fh.close(); }
  await rename(tmp, path);
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  main().catch((err) => {
    console.error("[sync] unhandled:", err);
    process.exit(1);
  });
}
