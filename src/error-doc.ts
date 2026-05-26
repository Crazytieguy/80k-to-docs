import { createHash } from "node:crypto";
import { findRecentErrorDoc, uploadDocFromMarkdown, type DriveDeps } from "./drive.ts";

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

export interface ErrorReport {
  summary: string;
  details: string;
}

export async function writeErrorDocIfNew(deps: DriveDeps, report: ErrorReport): Promise<void> {
  const hash = createHash("sha256").update(report.summary).digest("hex").slice(0, 16);
  const since = new Date(Date.now() - TWENTY_FOUR_HOURS_MS).toISOString();
  const existing = await findRecentErrorDoc(deps, { errorHash: hash, sinceIso: since });
  if (existing.length > 0) return;

  const stamp = new Date().toISOString().replace("T", " ").slice(0, 16);
  const name = `ERROR ${stamp} UTC — ${truncate(report.summary, 80)}`;
  const markdown = [
    `# Sync error`,
    "",
    `**When:** ${new Date().toISOString()}`,
    `**Hash:** ${hash}`,
    "",
    `## Summary`,
    "",
    "```",
    report.summary,
    "```",
    "",
    `## Details`,
    "",
    "```",
    truncate(report.details, 50_000),
    "```",
  ].join("\n");

  await uploadDocFromMarkdown(deps, {
    name,
    markdown,
    jobId: `error:${hash}`,
    errorHash: hash,
  });
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 3) + "...";
}
