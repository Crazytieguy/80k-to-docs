import type { Job } from "./types.ts";
import { htmlFragmentToMarkdown } from "./html-to-md.ts";
import { jobId } from "./api.ts";

export interface RenderOptions {
  closed?: { closedAt: string };
}

export function renderJobMarkdown(job: Job, opts: RenderOptions = {}): string {
  const lines: string[] = [];

  if (opts.closed) {
    lines.push(
      `> ⚠️ **CLOSED on ${opts.closed.closedAt}** — this job is no longer listed on the 80,000 Hours board. Archived snapshot below.`,
    );
    lines.push("");
  }

  lines.push(`# ${escapeMd(job.title)}`);
  lines.push("");

  const companyName = job.post.company.name;
  const companyUrl = job.post.company.url?.trim();
  lines.push(companyUrl ? `**[${escapeMd(companyName)}](${companyUrl})**` : `**${escapeMd(companyName)}**`);
  lines.push("");

  const meta = buildMetaLines(job);
  if (meta.length > 0) {
    for (const line of meta) lines.push(line);
    lines.push("");
  }

  const tagLine = buildTagLine(job);
  if (tagLine) {
    lines.push(`## Tags`);
    lines.push(tagLine);
    lines.push("");
  }

  const summaryMd = htmlFragmentToMarkdown(job.description_short ?? "");
  if (summaryMd) {
    lines.push(`## Summary`);
    lines.push(summaryMd);
    lines.push("");
  }

  const applyUrl = stripUtm(job.url_external);
  if (applyUrl) {
    lines.push(`[Apply →](${applyUrl})`);
    lines.push("");
  }

  lines.push(`---`);
  const footer = [
    job.posted_at ? `Posted ${formatDate(job.posted_at)}` : null,
    `Last updated ${formatDate(job.updated_at)}`,
    `80k job ID ${jobId(job)}`,
  ]
    .filter((x): x is string => x !== null)
    .join(" · ");
  lines.push(`*${footer}*`);

  return lines.join("\n");
}

export function renderDocTitle(job: Job): string {
  const date = formatDate(job.updated_at);
  return `${date} — ${job.title} — ${job.post.company.name}`;
}

export function renderClosedTitle(originalTitle: string, closedAt: string): string {
  // originalTitle is the live title (`YYYY-MM-DD — Title — Employer`); we prefix with [CLOSED ...].
  return `[CLOSED ${closedAt}] ${originalTitle}`;
}

function buildMetaLines(job: Job): string[] {
  const lines: string[] = [];
  const locations = [
    ...job.tags_city.map((t) => t.name),
    ...job.tags_country.map((t) => t.name),
  ];
  const dedupLocations = Array.from(new Set(locations));
  if (dedupLocations.length > 0) lines.push(`- Location: ${dedupLocations.join(", ")}`);

  if (job.tags_role_type.length > 0) {
    lines.push(`- Role type: ${job.tags_role_type.map((t) => t.name).join(", ")}`);
  }
  if (job.tags_exp_required.length > 0) {
    lines.push(`- Experience: ${job.tags_exp_required.map((t) => t.name).join(", ")}`);
  }
  if (job.tags_degree_required.length > 0) {
    lines.push(`- Degree: ${job.tags_degree_required.map((t) => t.name).join(", ")}`);
  }
  const salary = formatSalary(job.salary_min, job.salary_max);
  if (salary) lines.push(`- Salary: ${salary}`);
  if (job.tags_workload.length > 0) {
    lines.push(`- Workload: ${job.tags_workload.map((t) => t.name).join(", ")}`);
  }
  if (job.tags_location_type.length > 0) {
    lines.push(`- Location type: ${job.tags_location_type.map((t) => t.name).join(", ")}`);
  }
  return lines;
}

function buildTagLine(job: Job): string {
  const parts = [
    ...job.tags_area.map((t) => t.name),
    ...job.tags_skill.map((t) => t.name),
  ];
  return Array.from(new Set(parts)).join(", ");
}

function formatSalary(min: number | null | undefined, max: number | null | undefined): string | null {
  if (min == null && max == null) return null;
  if (min != null && max != null && min === max) return `$${formatNum(min)}`;
  if (min != null && max != null) return `$${formatNum(min)} – $${formatNum(max)}`;
  if (min != null) return `from $${formatNum(min)}`;
  if (max != null) return `up to $${formatNum(max)}`;
  return null;
}

function formatNum(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

export function formatDate(iso: string): string {
  // YYYY-MM-DD in UTC.
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

function escapeMd(s: string): string {
  // Light escape: avoid accidental markdown inside titles. We deliberately leave underscores and
  // hyphens alone — they're fine in Google Doc titles and breaking on them would be ugly.
  return s.replace(/([\\`*\[\]()])/g, "\\$1");
}
