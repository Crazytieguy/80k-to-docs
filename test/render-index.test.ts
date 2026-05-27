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
  it("lists active jobs grouped by area, newest first by posted_at", () => {
    const md = renderIndex({
      active: [
        entry({ job_id: "recA", title: "Older job", posted_at: "2026-05-01T00:00:00Z" }, "jobs/recA.md"),
        entry({ job_id: "recB", title: "Newer job", posted_at: "2026-05-20T00:00:00Z" }, "jobs/recB.md"),
        entry({ job_id: "recC", title: "Tech safety", areas: ["AI technical safety"] }, "jobs/recC.md"),
      ],
      closed: [],
      lastRunUtc: "2026-05-26T10:00:00Z",
      areaTags: [],
    });
    expect(md).toContain("### AI safety & policy");
    expect(md).toContain("### AI technical safety");
    expect(md.indexOf("Newer job")).toBeLessThan(md.indexOf("Older job"));
    expect(md).toContain("[Newer job](./jobs/recB.md)");
  });

  it("emits area-filter chips with per-area counts", () => {
    const md = renderIndex({
      active: [
        entry({}, "jobs/r1.md"),
        entry({}, "jobs/r2.md"),
        entry({ areas: ["AI technical safety"] }, "jobs/r3.md"),
      ],
      closed: [],
      lastRunUtc: "2026-05-26T10:00:00Z",
      areaTags: [],
    });
    expect(md).toContain('<div class="areas-filter"');
    expect(md).toContain('data-area="all">All (3)</button>');
    expect(md).toContain('data-area="AI safety &amp; policy">AI safety &amp; policy (2)</button>');
    expect(md).toContain('data-area="AI technical safety">AI technical safety (1)</button>');
  });

  it("orders area sections by count (most populated first)", () => {
    const md = renderIndex({
      active: [
        entry({ areas: ["Niche"] }, "jobs/r1.md"),
        entry({ areas: ["Popular"] }, "jobs/r2.md"),
        entry({ areas: ["Popular"] }, "jobs/r3.md"),
        entry({ areas: ["Popular"] }, "jobs/r4.md"),
      ],
      closed: [],
      lastRunUtc: "2026-05-26T10:00:00Z",
      areaTags: [],
    });
    expect(md.indexOf("### Popular")).toBeLessThan(md.indexOf("### Niche"));
  });

  it("summary counts; omits server-filter line when areaTags is empty", () => {
    const md = renderIndex({
      active: [entry({}), entry({ job_id: "recY" })],
      closed: [entry({ status: "closed", closed_at: "2026-04-30", job_id: "recZ" }, "jobs/closed/recZ.md")],
      lastRunUtc: "2026-05-26T10:00:00Z",
      areaTags: [],
    });
    expect(md).toContain("**2** active");
    expect(md).toContain("**1** closed");
    expect(md).toContain("last synced 2026-05-26 10:00 UTC");
    expect(md).not.toContain("server-filter:");
  });

  it("shows server-filter line when areaTags is non-empty", () => {
    const md = renderIndex({
      active: [entry({})],
      closed: [],
      lastRunUtc: "2026-05-26T10:00:00Z",
      areaTags: ["AI technical safety"],
    });
    expect(md).toContain("server-filter: AI technical safety");
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
      areaTags: [],
    });
    expect(md).toContain("## Recently closed");
    expect(md).toContain("Browse the rest in");
    const z59Idx = md.indexOf("recZ59");
    const z0Idx = md.indexOf("recZ0.md");
    expect(z59Idx).toBeGreaterThanOrEqual(0);
    expect(z0Idx).toBe(-1);
  });
});
