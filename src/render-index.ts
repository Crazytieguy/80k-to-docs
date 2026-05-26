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
  areaTags: string[];
}): string {
  const lines: string[] = [];
  lines.push("# 80,000 Hours — AI Safety Jobs Archive");
  lines.push("");
  lines.push(
    `Daily-refreshed mirror of AI-safety job postings from the [80,000 Hours job board](https://jobs.80000hours.org/). One markdown file per job under \`jobs/\`. Closed jobs move to \`jobs/closed/\`.`,
  );
  lines.push("");
  lines.push(`- **Active:** ${args.active.length}`);
  lines.push(`- **Closed (archived):** ${args.closed.length}`);
  lines.push(`- **Filter:** ${args.areaTags.join(", ")}`);
  lines.push(`- **Last run:** ${args.lastRunUtc}`);
  lines.push("");
  lines.push(
    "_See [README.md](./README.md) for how this is built. Source: [`.github/workflows/sync.yml`](./.github/workflows/sync.yml)._",
  );
  lines.push("");

  if (args.active.length > 0) {
    lines.push("## Active jobs");
    lines.push("");
    const byArea = groupByArea(args.active);
    const areas = Array.from(byArea.keys()).sort();
    for (const area of areas) {
      lines.push(`### ${area}`);
      lines.push("");
      const entries = byArea.get(area)!.sort((a, b) =>
        b.fm.last_updated.localeCompare(a.fm.last_updated),
      );
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
  const date = e.fm.last_updated.slice(0, 10);
  return `- \`${date}\` · [${escapeMd(e.fm.title)}](./${e.path}) — ${escapeMd(e.fm.employer)}`;
}

function formatClosedRow(e: IndexEntry): string {
  const date = (e.fm.closed_at ?? e.fm.last_updated).slice(0, 10);
  return `- \`${date}\` · [${escapeMd(e.fm.title)}](./${e.path}) — ${escapeMd(e.fm.employer)}`;
}

function escapeMd(s: string): string {
  return s.replace(/([\[\]])/g, "\\$1");
}
