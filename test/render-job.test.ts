import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { renderClosedTitle, renderDocTitle, renderJobMarkdown } from "../src/render-job.ts";
import { JobsResponse } from "../src/types.ts";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = JobsResponse.parse(
  JSON.parse(readFileSync(resolve(here, "fixtures", "jobs-sample.json"), "utf8")),
);
const aiJob = fixture.find((j) =>
  (j.tags_area ?? []).some((t) => t.name === "AI safety & policy"),
)!;

describe("renderDocTitle", () => {
  it("uses YYYY-MM-DD from updated_at and joins with em-dashes", () => {
    const t = renderDocTitle(aiJob);
    expect(t).toMatch(/^\d{4}-\d{2}-\d{2} — .+ — .+$/);
  });
});

describe("renderClosedTitle", () => {
  it("prefixes [CLOSED YYYY-MM-DD]", () => {
    expect(renderClosedTitle("2026-05-22 — Foo — Bar", "2026-06-01")).toBe(
      "[CLOSED 2026-06-01] 2026-05-22 — Foo — Bar",
    );
  });
});

describe("renderJobMarkdown", () => {
  it("active job contains H1 title and footer", () => {
    const md = renderJobMarkdown(aiJob);
    expect(md).toContain(`# ${aiJob.title}`);
    expect(md).toContain("80k job ID");
    expect(md).toContain("Last updated");
    expect(md).not.toContain("CLOSED");
  });

  it("renders the company link when company.url present", () => {
    const job = { ...aiJob };
    job.post = {
      ...job.post,
      company: { name: "ACME", url: "https://acme.test" },
    };
    const md = renderJobMarkdown(job);
    expect(md).toContain("**[ACME](https://acme.test)**");
  });

  it("falls back to plain bold company when url missing", () => {
    const job = { ...aiJob };
    job.post = { ...job.post, company: { name: "ACME", url: null } };
    expect(renderJobMarkdown(job)).toContain("**ACME**");
  });

  it("strips utm_ params from apply link", () => {
    const job = { ...aiJob, url_external: "https://x.test/apply?utm_source=80k&keep=1" };
    const md = renderJobMarkdown(job);
    expect(md).toContain("https://x.test/apply?keep=1");
    expect(md).not.toContain("utm_source");
  });

  it("closed job has banner block before H1", () => {
    const md = renderJobMarkdown(aiJob, { closed: { closedAt: "2026-06-01" } });
    expect(md.startsWith("> ⚠️ **CLOSED on 2026-06-01**")).toBe(true);
    expect(md.indexOf("> ⚠️")).toBeLessThan(md.indexOf("# "));
  });

  it("Summary section uses the HTML-converted description_short", () => {
    const md = renderJobMarkdown(aiJob);
    if (aiJob.description_short) {
      expect(md).toContain("## Summary");
      // The original was HTML <ul><li>...; converted should have markdown list items.
      expect(md).toMatch(/\n- /);
    }
  });
});
