import { readFile, writeFile, rename, mkdir, open } from "node:fs/promises";
import { dirname } from "node:path";
import type { State } from "./types.ts";

const DEFAULT_STATE: State = {
  lastRun: null,
  lastSuccess: null,
  lastError: null,
  jobs: {},
};

export async function loadState(path: string): Promise<State> {
  try {
    const text = await readFile(path, "utf8");
    const parsed = JSON.parse(text) as Partial<State>;
    return { ...DEFAULT_STATE, ...parsed, jobs: parsed.jobs ?? {} };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return { ...DEFAULT_STATE };
    throw err;
  }
}

export async function saveState(path: string, state: State): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  await writeFile(tmp, JSON.stringify(state, null, 2) + "\n", "utf8");
  // fsync to make sure the bytes are on disk before rename.
  const fh = await open(tmp, "r+");
  try {
    await fh.sync();
  } finally {
    await fh.close();
  }
  await rename(tmp, path);
}
