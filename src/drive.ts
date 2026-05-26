import { randomBytes } from "node:crypto";
import { HttpError, RateLimiter, withRetry } from "./throttle.ts";

const UPLOAD_BASE = "https://www.googleapis.com/upload/drive/v3/files";
const FILES_BASE = "https://www.googleapis.com/drive/v3/files";
const SHARED_DRIVE_PARAMS = "supportsAllDrives=true&includeItemsFromAllDrives=true";

const limiter = new RateLimiter(200); // 5 req/sec

export interface DriveFile {
  id: string;
  name: string;
  createdTime?: string;
  appProperties?: Record<string, string>;
}

export interface DriveDeps {
  getToken: () => Promise<string>;
  folderId: string;
}

export async function uploadDocFromMarkdown(
  deps: DriveDeps,
  args: { name: string; markdown: string; jobId: string; errorHash?: string },
): Promise<DriveFile> {
  const metadata: Record<string, unknown> = {
    name: args.name,
    parents: [deps.folderId],
    mimeType: "application/vnd.google-apps.document",
    appProperties: { jobId: args.jobId, ...(args.errorHash ? { errorHash: args.errorHash } : {}) },
  };
  const url = `${UPLOAD_BASE}?uploadType=multipart&${SHARED_DRIVE_PARAMS}&fields=id,name,createdTime,appProperties`;
  return await driveMultipart(deps, "POST", url, metadata, args.markdown);
}

export async function updateDocFromMarkdown(
  deps: DriveDeps,
  args: { docId: string; name: string; markdown: string },
): Promise<DriveFile> {
  const metadata = { name: args.name };
  const url = `${UPLOAD_BASE}/${encodeURIComponent(args.docId)}?uploadType=multipart&${SHARED_DRIVE_PARAMS}&fields=id,name,createdTime,appProperties`;
  return await driveMultipart(deps, "PATCH", url, metadata, args.markdown);
}

export async function renameFile(
  deps: DriveDeps,
  args: { docId: string; name: string },
): Promise<DriveFile> {
  const url = `${FILES_BASE}/${encodeURIComponent(args.docId)}?${SHARED_DRIVE_PARAMS}&fields=id,name`;
  const res = await driveJson(deps, "PATCH", url, { name: args.name });
  return res as DriveFile;
}

export async function findByJobId(deps: DriveDeps, jobId: string): Promise<DriveFile[]> {
  return findByProperty(deps, "jobId", jobId);
}

export async function findRecentErrorDoc(
  deps: DriveDeps,
  args: { errorHash: string; sinceIso: string },
): Promise<DriveFile[]> {
  const escapedHash = escapeForQuery(args.errorHash);
  const escapedSince = escapeForQuery(args.sinceIso);
  const q = [
    `'${escapeForQuery(deps.folderId)}' in parents`,
    `mimeType='application/vnd.google-apps.document'`,
    `trashed=false`,
    `appProperties has { key='errorHash' and value='${escapedHash}' }`,
    `createdTime > '${escapedSince}'`,
  ].join(" and ");
  return listAll(deps, q);
}

async function findByProperty(deps: DriveDeps, key: string, value: string): Promise<DriveFile[]> {
  const escapedKey = escapeForQuery(key);
  const escapedValue = escapeForQuery(value);
  const q = [
    `'${escapeForQuery(deps.folderId)}' in parents`,
    `mimeType='application/vnd.google-apps.document'`,
    `trashed=false`,
    `appProperties has { key='${escapedKey}' and value='${escapedValue}' }`,
  ].join(" and ");
  return listAll(deps, q);
}

async function listAll(deps: DriveDeps, q: string): Promise<DriveFile[]> {
  const out: DriveFile[] = [];
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({
      q,
      pageSize: "100",
      fields: "nextPageToken,files(id,name,createdTime,appProperties)",
      supportsAllDrives: "true",
      includeItemsFromAllDrives: "true",
    });
    if (pageToken) params.set("pageToken", pageToken);
    const url = `${FILES_BASE}?${params.toString()}`;
    const json = (await driveJson(deps, "GET", url)) as {
      files?: DriveFile[];
      nextPageToken?: string;
    };
    if (json.files) out.push(...json.files);
    pageToken = json.nextPageToken;
  } while (pageToken);
  return out;
}

export async function deleteFile(deps: DriveDeps, docId: string): Promise<void> {
  await limiter.acquire();
  const url = `${FILES_BASE}/${encodeURIComponent(docId)}?${SHARED_DRIVE_PARAMS}`;
  const token = await deps.getToken();
  await withRetry(async () => {
    const res = await fetch(url, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok && res.status !== 404) {
      throw new HttpError(res.status, await res.text(), `DELETE ${url} → ${res.status}`);
    }
  });
}

async function driveJson(
  deps: DriveDeps,
  method: "GET" | "POST" | "PATCH" | "DELETE",
  url: string,
  body?: unknown,
): Promise<unknown> {
  await limiter.acquire();
  const token = await deps.getToken();
  return await withRetry(async () => {
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    if (!res.ok) {
      throw new HttpError(res.status, text, `${method} ${url} → ${res.status}`);
    }
    return text ? JSON.parse(text) : null;
  });
}

async function driveMultipart(
  deps: DriveDeps,
  method: "POST" | "PATCH",
  url: string,
  metadata: Record<string, unknown>,
  content: string,
): Promise<DriveFile> {
  await limiter.acquire();
  const token = await deps.getToken();
  return await withRetry(async () => {
    const boundary = `b_${randomBytes(12).toString("hex")}`;
    const body = [
      `--${boundary}`,
      "Content-Type: application/json; charset=UTF-8",
      "",
      JSON.stringify(metadata),
      `--${boundary}`,
      "Content-Type: text/markdown; charset=UTF-8",
      "",
      content,
      `--${boundary}--`,
      "",
    ].join("\r\n");
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body,
    });
    const text = await res.text();
    if (!res.ok) {
      throw new HttpError(res.status, text, `${method} ${url} → ${res.status}`);
    }
    return JSON.parse(text) as DriveFile;
  });
}

function escapeForQuery(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}
