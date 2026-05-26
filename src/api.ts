import { Job, JobsResponse } from "./types.ts";
import { withRetry, HttpError } from "./throttle.ts";

const API_URL = "https://backend.eawork.org/api/jobs/";

export async function fetchJobs(fetchImpl: typeof fetch = fetch): Promise<Job[]> {
  return await withRetry(async () => {
    const res = await fetchImpl(API_URL, { headers: { Accept: "application/json" } });
    if (!res.ok) {
      throw new HttpError(res.status, await res.text(), `GET ${API_URL} → ${res.status}`);
    }
    const json = await res.json();
    return JobsResponse.parse(json);
  });
}

export function parseAreaTags(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function filterByArea(jobs: Job[], areaTags: string[]): Job[] {
  if (areaTags.length === 0) return jobs;
  const allowed = new Set(areaTags.map((s) => s.toLowerCase()));
  return jobs.filter((j) =>
    (j.tags_area ?? []).some((t) => allowed.has(t.name.toLowerCase())),
  );
}

export function jobId(job: Job): string {
  return job.post.id_external_80_000_hours;
}
