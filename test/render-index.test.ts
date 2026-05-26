import { describe, it, expect } from "vitest";
import { renderIndex, type IndexEntry } from "../src/render-index.ts";
import type { JobFrontmatter } from "../src/types.ts";

function fm(over: Partial<JobFrontmatter>): JobFrontmatter {
  return {
    title: "Title",
    employer: "Employer",
    job_id: "recX",
    last_updated: "2026-05-22T10:00:00Z",
    posted_at: null,
    status: "ready",
    apply_url: null,
    areas: ["AI safety & policy"],
    ...over,
  };
}

function entry(over: Partial<JobFrontmatter>, path = "jobs/recX.md"): IndexEntry {
  return { fm: fm(over), path };
}

describe("renderIndex", () => {
  it("lists active jobs grouped by area, newest first", () => {
    const md = renderIndex({
      active: [
        entry({ job_id: "recA", title: "Older job", last_updated: "2026-05-01T00:00:00Z" }, "jobs/recA.md"),
        entry({ job_id: "recB", title: "Newer job", last_updated: "2026-05-20T00:00:00Z" }, "jobs/recB.md"),
        entry({ job_id: "recC", title: "Tech safety", areas: ["AI technical safety"] }, "jobs/recC.md"),
      ],
      closed: [],
      lastRunUtc: "2026-05-26T10:00:00Z",
      areaTags: ["AI safety & policy", "AI technical safety"],
    });
    expect(md).toContain("### AI safety & policy");
    expect(md).toContain("### AI technical safety");
    // Newer job comes first inside its group
    expect(md.indexOf("Newer job")).toBeLessThan(md.indexOf("Older job"));
    expect(md).toContain("[Newer job](./jobs/recB.md)");
  });

  it("includes summary counts and filter", () => {
    const md = renderIndex({
      active: [entry({}), entry({ job_id: "recY" })],
      closed: [entry({ status: "closed", closed_at: "2026-04-30", job_id: "recZ" }, "jobs/closed/recZ.md")],
      lastRunUtc: "2026-05-26T10:00:00Z",
      areaTags: ["AI safety & policy"],
    });
    expect(md).toContain("**2** active");
    expect(md).toContain("**1** closed");
    expect(md).toContain("filter: AI safety & policy");
    expect(md).toContain("last synced 2026-05-26 10:00 UTC");
  });

  it("only lists 50 most recent closed jobs and links to the folder", () => {
    const closed: IndexEntry[] = Array.from({ length: 60 }, (_, i) =>
      entry(
        {
          status: "closed",
          job_id: `recZ${i}`,
          closed_at: `2026-05-${String(i + 1).padStart(2, "0")}`,
        },
        `jobs/closed/recZ${i}.md`,
      ),
    );
    const md = renderIndex({
      active: [],
      closed,
      lastRunUtc: "2026-05-26T10:00:00Z",
      areaTags: ["AI safety & policy"],
    });
    expect(md).toContain("## Recently closed");
    expect(md).toContain("Browse the rest in");
    // recZ59 is newest (May 60th -> May 30 due to padStart wrap, but order is by closed_at string)
    const z59Idx = md.indexOf("recZ59");
    const z0Idx = md.indexOf("recZ0.md");
    expect(z59Idx).toBeGreaterThanOrEqual(0);
    // recZ0 is the oldest and is past the cutoff of 50.
    expect(z0Idx).toBe(-1);
  });
});
