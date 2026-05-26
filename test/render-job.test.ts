import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseFrontmatter, renderJobFile } from "../src/render-job.ts";
import { JobsResponse } from "../src/types.ts";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = JobsResponse.parse(
  JSON.parse(readFileSync(resolve(here, "fixtures", "jobs-sample.json"), "utf8")),
);
const aiJob = fixture.find((j) =>
  (j.tags_area ?? []).some((t) => t.name === "AI safety & policy"),
)!;

describe("renderJobFile", () => {
  it("emits frontmatter + body separated by ---", () => {
    const md = renderJobFile(aiJob);
    expect(md.startsWith("---\n")).toBe(true);
    expect(md).toContain(`job_id: "${aiJob.post.id_external_80_000_hours}"`);
    expect(md).toContain(`last_updated: "${aiJob.updated_at}"`);
    expect(md).toContain("status: ready");
  });

  it("active job contains H1 title and footer", () => {
    const md = renderJobFile(aiJob);
    expect(md).toContain(`# ${aiJob.title}`);
    expect(md).toContain("80k job ID");
    expect(md).toContain("Listing synced");
    expect(md).not.toContain("CLOSED");
  });

  it("renders the company link when company.url present", () => {
    const job = {
      ...aiJob,
      post: { ...aiJob.post, company: { name: "ACME", url: "https://acme.test" } },
    };
    const md = renderJobFile(job);
    expect(md).toContain("**[ACME](https://acme.test)**");
  });

  it("falls back to plain bold company when url missing", () => {
    const job = {
      ...aiJob,
      post: { ...aiJob.post, company: { name: "ACME", url: null } },
    };
    expect(renderJobFile(job)).toContain("**ACME**");
  });

  it("strips utm_ params from apply link", () => {
    const job = { ...aiJob, url_external: "https://x.test/apply?utm_source=80k&keep=1" };
    const md = renderJobFile(job);
    expect(md).toContain("https://x.test/apply?keep=1");
    expect(md).not.toContain("utm_source");
  });

  it("closed job has banner block before H1 and status=closed in frontmatter", () => {
    const md = renderJobFile(aiJob, { closed: { closedAt: "2026-06-01" } });
    expect(md).toContain("status: closed");
    expect(md).toContain(`closed_at: "2026-06-01"`);
    expect(md).toContain("> ⚠️ **CLOSED on 2026-06-01**");
    expect(md.indexOf("> ⚠️")).toBeLessThan(md.indexOf("# "));
  });

  it("Summary section uses the HTML-converted description_short", () => {
    const md = renderJobFile(aiJob);
    if (aiJob.description_short) {
      expect(md).toContain("## Summary");
      expect(md).toMatch(/\n- /);
    }
  });
});

describe("parseFrontmatter", () => {
  it("round-trips a frontmatter block produced by renderJobFile", () => {
    const md = renderJobFile(aiJob);
    const { fm, body } = parseFrontmatter(md);
    expect(fm.job_id).toBe(aiJob.post.id_external_80_000_hours);
    expect(fm.last_updated).toBe(aiJob.updated_at);
    expect(fm.title).toBe(aiJob.title);
    expect(fm.employer).toBe(aiJob.post.company.name);
    expect(fm.status).toBe("ready");
    expect(Array.isArray(fm.areas)).toBe(true);
    expect(fm.areas).toContain("AI safety & policy");
    expect(body).toContain(`# ${aiJob.title}`);
  });

  it("parses status=closed and closed_at", () => {
    const md = renderJobFile(aiJob, { closed: { closedAt: "2026-06-01" } });
    const { fm } = parseFrontmatter(md);
    expect(fm.status).toBe("closed");
    expect(fm.closed_at).toBe("2026-06-01");
  });

  it("handles posted_at=null", () => {
    const job = { ...aiJob, posted_at: null };
    const md = renderJobFile(job);
    const { fm } = parseFrontmatter(md);
    expect(fm.posted_at).toBe(null);
  });

  it("handles empty areas as []", () => {
    const job = { ...aiJob, tags_area: [] };
    const md = renderJobFile(job);
    const { fm } = parseFrontmatter(md);
    expect(fm.areas).toEqual([]);
  });

  it("escapes embedded double-quotes in strings", () => {
    const job = { ...aiJob, title: `Director of "Stuff"` };
    const md = renderJobFile(job);
    const { fm } = parseFrontmatter(md);
    expect(fm.title).toBe(`Director of "Stuff"`);
  });
});
