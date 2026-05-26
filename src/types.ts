import { z } from "zod";

const Tag = z.object({ name: z.string() });

const Company = z.object({
  name: z.string(),
  url: z.string().nullable().optional(),
});

const Post = z.object({
  company: Company,
  id_external_80_000_hours: z.string(),
});

export const Job = z.object({
  title: z.string(),
  post: Post,
  description_short: z.string().nullable().optional(),
  url_external: z.string().nullable().optional(),
  posted_at: z.string().nullable().optional(),
  created_at: z.string().nullable().optional(),
  updated_at: z.string(),
  salary_min: z.number().nullable().optional(),
  salary_max: z.number().nullable().optional(),
  tags_area: z.array(Tag).optional().default([]),
  tags_country: z.array(Tag).optional().default([]),
  tags_city: z.array(Tag).optional().default([]),
  tags_role_type: z.array(Tag).optional().default([]),
  tags_location_type: z.array(Tag).optional().default([]),
  tags_workload: z.array(Tag).optional().default([]),
  tags_skill: z.array(Tag).optional().default([]),
  tags_exp_required: z.array(Tag).optional().default([]),
  tags_degree_required: z.array(Tag).optional().default([]),
});

export type Job = z.infer<typeof Job>;

export const JobsResponse = z.array(Job);

export type JobStatus = "ready" | "closed";

/** Subset of {@link Job} stored as YAML frontmatter at the top of each .md file. */
export interface JobFrontmatter {
  title: string;
  employer: string;
  job_id: string;
  last_updated: string;
  posted_at: string | null;
  status: JobStatus;
  closed_at?: string;
  apply_url: string | null;
  areas: string[];
}
