import type { JobFrontmatter } from "./types.ts";

export interface IndexEntry {
  fm: JobFrontmatter;
  /** Repo-relative path to the markdown file (e.g. `jobs/recXYZ.md`). */
  path: string;
}

export function renderIndex(args: {
  active: IndexEntry[];
  closed: IndexEntry[];
  lastRunUtc: string;
  /** Server-side area filter (env-var driven, usually empty so the UI filter handles everything). */
  areaTags: string[];
}): string {
  const lines: string[] = [];
  lines.push("# 80,000 Hours Jobs Archive");
  lines.push("");
  lines.push(
    `Daily-refreshed mirror of every job posting on the [80,000 Hours job board](https://jobs.80000hours.org/). One markdown file per job under \`jobs/\`. Closed jobs move to \`jobs/closed/\`.`,
  );
  lines.push("");
  const stats = [
    `**${args.active.length}** active`,
    args.closed.length > 0 ? `**${args.closed.length}** closed` : null,
    args.areaTags.length > 0 ? `server-filter: ${args.areaTags.join(", ")}` : null,
    `last synced ${args.lastRunUtc.slice(0, 16).replace("T", " ")} UTC`,
  ]
    .filter((s): s is string => s !== null)
    .join(" · ");
  lines.push(stats);
  lines.push("");
  lines.push(
    "_See [README](./README.md) for how this is built. Source: [GitHub repo](https://github.com/Crazytieguy/80k-to-docs)._",
  );
  lines.push("");

  if (args.active.length > 0) {
    const byArea = groupByArea(args.active);
    // Sort areas by job count (descending) so the most populated areas surface first.
    const areasSorted = Array.from(byArea.keys()).sort(
      (a, b) => byArea.get(b)!.length - byArea.get(a)!.length,
    );

    // Area-filter chips (above the section list). Tip line tells users they can multi-select.
    lines.push(renderAreaChips(args.active.length, byArea, areasSorted));
    lines.push("");
    lines.push(
      "<p class=\"hint\">Click a chip to filter; click again to deselect; combine with the search above.</p>",
    );
    lines.push("");

    lines.push("## Active jobs");
    lines.push("");
    for (const area of areasSorted) {
      lines.push(`### ${area}`);
      lines.push("");
      // Sort by the same date we display in the row (posted_at, falling back to last_updated),
      // newest first.
      const entries = byArea.get(area)!.sort((a, b) => {
        const ad = a.fm.posted_at ?? a.fm.last_updated;
        const bd = b.fm.posted_at ?? b.fm.last_updated;
        return bd.localeCompare(ad);
      });
      for (const e of entries) lines.push(formatRow(e));
      lines.push("");
    }
  }

  if (args.closed.length > 0) {
    lines.push("## Recently closed");
    lines.push("");
    const recent = args.closed
      .slice()
      .sort((a, b) => (b.fm.closed_at ?? "").localeCompare(a.fm.closed_at ?? ""))
      .slice(0, 50);
    for (const e of recent) lines.push(formatClosedRow(e));
    lines.push("");
    if (args.closed.length > 50) {
      lines.push(`_Browse the rest in [\`jobs/closed/\`](./jobs/closed/)._`);
      lines.push("");
    }
  }

  return lines.join("\n");
}

function renderAreaChips(
  total: number,
  byArea: Map<string, IndexEntry[]>,
  areasSorted: string[],
): string {
  const out: string[] = [`<div class="areas-filter" aria-label="Filter by area">`];
  out.push(
    `<button type="button" class="chip is-active" data-area="all" aria-pressed="true">All (${total})</button>`,
  );
  for (const area of areasSorted) {
    const count = byArea.get(area)!.length;
    out.push(
      `<button type="button" class="chip" data-area="${escapeAttr(area)}" aria-pressed="false">${escapeHtmlText(area)} (${count})</button>`,
    );
  }
  out.push(`</div>`);
  return out.join("\n");
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

function escapeHtmlText(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function groupByArea(entries: IndexEntry[]): Map<string, IndexEntry[]> {
  const out = new Map<string, IndexEntry[]>();
  for (const e of entries) {
    const areas = e.fm.areas.length > 0 ? e.fm.areas : ["(uncategorized)"];
    for (const area of areas) {
      const arr = out.get(area) ?? [];
      arr.push(e);
      out.set(area, arr);
    }
  }
  return out;
}

function formatRow(e: IndexEntry): string {
  // Prefer `posted_at` (the date the role actually went up) over `last_updated`,
  // which is when 80k re-indexed and is often identical across all current jobs.
  const date = (e.fm.posted_at ?? e.fm.last_updated).slice(0, 10);
  return `- \`${date}\` · [${escapeMd(e.fm.title)}](./${e.path}) — ${escapeMd(e.fm.employer)}`;
}

function formatClosedRow(e: IndexEntry): string {
  const date = (e.fm.closed_at ?? e.fm.last_updated).slice(0, 10);
  return `- \`${date}\` · [${escapeMd(e.fm.title)}](./${e.path}) — ${escapeMd(e.fm.employer)}`;
}

function escapeMd(s: string): string {
  return s.replace(/([\[\]])/g, "\\$1");
}
