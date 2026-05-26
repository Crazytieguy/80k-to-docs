import { createSign } from "node:crypto";
import { HttpError } from "./throttle.ts";

interface ServiceAccountKey {
  client_email: string;
  private_key: string;
  private_key_id: string;
}

interface CachedToken {
  accessToken: string;
  expiresAt: number;
}

const SCOPE = "https://www.googleapis.com/auth/drive";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

let cached: CachedToken | null = null;

export async function getAccessToken(saJson: string): Promise<string> {
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.accessToken;

  const key = JSON.parse(saJson) as ServiceAccountKey;
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT", kid: key.private_key_id };
  const payload = {
    iss: key.client_email,
    scope: SCOPE,
    aud: TOKEN_URL,
    iat: now,
    exp: now + 3600,
  };

  const headerB64 = base64url(JSON.stringify(header));
  const payloadB64 = base64url(JSON.stringify(payload));
  const signingInput = `${headerB64}.${payloadB64}`;
  const signer = createSign("RSA-SHA256");
  signer.update(signingInput);
  const signature = signer.sign(key.private_key);
  const jwt = `${signingInput}.${base64urlBuf(signature)}`;

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  const body = await res.text();
  if (!res.ok) {
    throw new HttpError(res.status, body, `token endpoint returned ${res.status}`);
  }
  const json = JSON.parse(body) as { access_token: string; expires_in: number };
  cached = {
    accessToken: json.access_token,
    expiresAt: Date.now() + json.expires_in * 1000,
  };
  return cached.accessToken;
}

export function clearTokenCache(): void {
  cached = null;
}

function base64url(s: string): string {
  return base64urlBuf(Buffer.from(s, "utf8"));
}

function base64urlBuf(buf: Buffer): string {
  return buf.toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}
