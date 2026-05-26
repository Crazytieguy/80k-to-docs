import type { Job, JobFrontmatter, JobStatus } from "./types.ts";
import { htmlFragmentToMarkdown } from "./html-to-md.ts";
import { jobId } from "./api.ts";

export interface RenderOptions {
  closed?: { closedAt: string };
}

export function renderJobFile(job: Job, opts: RenderOptions = {}): string {
  const status: JobStatus = opts.closed ? "closed" : "ready";
  const frontmatter: JobFrontmatter = {
    title: job.title,
    employer: job.post.company.name,
    job_id: jobId(job),
    last_updated: job.updated_at,
    posted_at: job.posted_at ?? null,
    status,
    ...(opts.closed ? { closed_at: opts.closed.closedAt } : {}),
    apply_url: stripUtm(job.url_external),
    areas: job.tags_area.map((t) => t.name),
  };

  return [serializeFrontmatter(frontmatter), "", renderBody(job, opts)].join("\n");
}

export function renderBody(job: Job, opts: RenderOptions = {}): string {
  const lines: string[] = [];

  if (opts.closed) {
    lines.push(
      `> ⚠️ **CLOSED on ${opts.closed.closedAt}** — this job is no longer listed on the 80,000 Hours board. Archived snapshot below.`,
    );
    lines.push("");
  }

  lines.push(`# ${job.title}`);
  lines.push("");

  const companyName = job.post.company.name;
  const companyUrl = job.post.company.url?.trim();
  lines.push(companyUrl ? `**[${companyName}](${companyUrl})**` : `**${companyName}**`);
  lines.push("");

  const metaHtml = buildMetaHtml(job);
  if (metaHtml) {
    lines.push(metaHtml);
    lines.push("");
  }

  const tagLine = buildTagLine(job);
  if (tagLine) {
    lines.push(`**Areas & skills:** ${tagLine}`);
    lines.push("");
  }

  const summary = htmlFragmentToMarkdown(job.description_short ?? "");
  if (summary) {
    lines.push("## Summary");
    lines.push(summary);
    lines.push("");
  }

  const applyUrl = stripUtm(job.url_external);
  if (applyUrl) {
    lines.push(`<p class="apply-cta"><a href="${escapeAttr(applyUrl)}">Apply →</a></p>`);
    lines.push("");
  }

  lines.push("---");
  const footer = [
    job.posted_at ? `Posted ${formatDate(job.posted_at)}` : null,
    `Listing synced ${formatDate(job.updated_at)}`,
    `80k job ID \`${jobId(job)}\``,
  ]
    .filter((x): x is string => x !== null)
    .join(" · ");
  lines.push(`*${footer}*`);

  return lines.join("\n") + "\n";
}

function buildMetaHtml(job: Job): string {
  const rows: Array<[string, string]> = [];
  const locations = Array.from(
    new Set([...job.tags_city.map((t) => t.name), ...job.tags_country.map((t) => t.name)]),
  );
  if (locations.length > 0) rows.push(["Location", locations.join(", ")]);
  if (job.tags_role_type.length > 0) {
    rows.push(["Role type", job.tags_role_type.map((t) => t.name).join(", ")]);
  }
  if (job.tags_exp_required.length > 0) {
    rows.push(["Experience", job.tags_exp_required.map((t) => t.name).join(", ")]);
  }
  if (job.tags_degree_required.length > 0) {
    rows.push(["Degree", job.tags_degree_required.map((t) => t.name).join(", ")]);
  }
  const salary = formatSalary(job.salary_min, job.salary_max);
  if (salary) rows.push(["Salary", salary]);
  if (job.tags_workload.length > 0) {
    rows.push(["Workload", job.tags_workload.map((t) => t.name).join(", ")]);
  }
  // Suppress `tags_location_type` when it duplicates location info we already showed
  // (the common case — e.g. "Remote" appearing in both lists).
  const locType = job.tags_location_type
    .map((t) => t.name)
    .filter((name) => !locations.some((l) => l.toLowerCase().includes(name.toLowerCase())));
  if (locType.length > 0) rows.push(["Location type", locType.join(", ")]);

  if (rows.length === 0) return "";
  const inner = rows
    .map(([k, v]) => `<dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v)}</dd>`)
    .join("\n");
  return `<dl class="job-meta">\n${inner}\n</dl>`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

function buildTagLine(job: Job): string {
  const parts = [...job.tags_area.map((t) => t.name), ...job.tags_skill.map((t) => t.name)];
  return Array.from(new Set(parts)).join(", ");
}

function formatSalary(min: number | null | undefined, max: number | null | undefined): string | null {
  // Treat 0 as "unknown" — the 80k API uses 0 for placeholder rather than a real $0 salary.
  const lo = min && min > 0 ? min : null;
  const hi = max && max > 0 ? max : null;
  if (lo == null && hi == null) return null;
  if (lo != null && hi != null && lo === hi) return `$${formatNum(lo)}`;
  if (lo != null && hi != null) return `$${formatNum(lo)} – $${formatNum(hi)}`;
  if (lo != null) return `from $${formatNum(lo)}`;
  if (hi != null) return `up to $${formatNum(hi)}`;
  return null;
}

function formatNum(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

export function formatDate(iso: string): string {
  return iso.slice(0, 10);
}

function stripUtm(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    for (const key of Array.from(u.searchParams.keys())) {
      if (key.toLowerCase().startsWith("utm_")) u.searchParams.delete(key);
    }
    return u.toString();
  } catch {
    return url;
  }
}

function serializeFrontmatter(fm: JobFrontmatter): string {
  const lines = ["---"];
  lines.push(`title: ${yamlString(fm.title)}`);
  lines.push(`employer: ${yamlString(fm.employer)}`);
  lines.push(`job_id: ${yamlString(fm.job_id)}`);
  lines.push(`last_updated: ${yamlString(fm.last_updated)}`);
  lines.push(`posted_at: ${fm.posted_at === null ? "null" : yamlString(fm.posted_at)}`);
  lines.push(`status: ${fm.status}`);
  if (fm.closed_at) lines.push(`closed_at: ${yamlString(fm.closed_at)}`);
  lines.push(`apply_url: ${fm.apply_url === null ? "null" : yamlString(fm.apply_url)}`);
  if (fm.areas.length > 0) {
    lines.push("areas:");
    for (const a of fm.areas) lines.push(`  - ${yamlString(a)}`);
  } else {
    lines.push("areas: []");
  }
  lines.push("---");
  return lines.join("\n");
}

function yamlString(s: string): string {
  // Always double-quote and escape, simple and unambiguous.
  return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

export function parseFrontmatter(text: string): { fm: Partial<JobFrontmatter>; body: string } {
  if (!text.startsWith("---\n")) return { fm: {}, body: text };
  const end = text.indexOf("\n---\n", 4);
  if (end < 0) return { fm: {}, body: text };
  const yaml = text.slice(4, end);
  const body = text.slice(end + 5);
  // Tiny single-purpose parser — handles the exact shape `serializeFrontmatter` emits.
  const fm: Record<string, unknown> = {};
  const lines = yaml.split("\n");
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    const m = /^(\w+):\s*(.*)$/.exec(line);
    if (!m) { i++; continue; }
    const key = m[1]!;
    const raw = m[2]!;
    if (raw === "" || raw === undefined) {
      // List form on the next lines.
      const items: string[] = [];
      i++;
      while (i < lines.length && lines[i]!.startsWith("  - ")) {
        items.push(unquoteYaml(lines[i]!.slice(4)));
        i++;
      }
      fm[key] = items;
      continue;
    }
    if (raw === "null") fm[key] = null;
    else if (raw === "[]") fm[key] = [];
    else fm[key] = unquoteYaml(raw);
    i++;
  }
  return { fm: fm as Partial<JobFrontmatter>, body };
}

function unquoteYaml(s: string): string {
  if (s.startsWith('"') && s.endsWith('"')) {
    return s.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  }
  return s;
}
