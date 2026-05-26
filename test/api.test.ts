import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { filterByArea, jobId, parseAreaTags } from "../src/api.ts";
import { JobsResponse } from "../src/types.ts";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = JobsResponse.parse(
  JSON.parse(readFileSync(resolve(here, "fixtures", "jobs-sample.json"), "utf8")),
);

describe("parseAreaTags", () => {
  it("splits comma-separated and trims", () => {
    expect(parseAreaTags("a, b ,c")).toEqual(["a", "b", "c"]);
  });
  it("handles empty/undefined", () => {
    expect(parseAreaTags("")).toEqual([]);
    expect(parseAreaTags(undefined)).toEqual([]);
  });
});

describe("filterByArea", () => {
  it("returns AI-safety subset from the real fixture", () => {
    const ai = filterByArea(fixture, [
      "AI safety & policy",
      "AI technical safety",
      "AI governance",
    ]);
    expect(ai.length).toBe(5);
    expect(fixture.length - ai.length).toBe(5);
  });

  it("is case-insensitive", () => {
    const ai = filterByArea(fixture, ["ai SAFETY & policy"]);
    expect(ai.length).toBeGreaterThan(0);
  });

  it("empty filter passes everything through", () => {
    expect(filterByArea(fixture, []).length).toBe(fixture.length);
  });
});

describe("Job schema (Zod) tolerates the real fixture", () => {
  it("all 10 fixture jobs parse", () => {
    expect(fixture.length).toBe(10);
  });

  it("every job has an external 80k ID", () => {
    for (const j of fixture) {
      expect(jobId(j)).toMatch(/^rec/);
    }
  });
});
