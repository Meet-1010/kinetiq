import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";

// Session lives in one encrypted, httpOnly cookie (AES-256-GCM). It holds the
// visitor's GitHub token so the star can be re-checked on every download.

export type Session = {
  login: string;
  name: string | null;
  avatar: string;
  token: string;
  iat: number;
};

const COOKIE = "kq_session";
const MAX_AGE = 60 * 60 * 24 * 30;

const key = () => {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error("SESSION_SECRET must be set (32+ chars)");
  return createHash("sha256").update(secret).digest();
};

export function seal(value: unknown) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64url");
}

export function unseal<T>(sealed: string | undefined): T | null {
  if (!sealed) return null;
  try {
    const raw = Buffer.from(sealed, "base64url");
    const decipher = createDecipheriv("aes-256-gcm", key(), raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    return JSON.parse(Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8")) as T;
  } catch {
    return null;
  }
}

const cookieOpts = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};

export async function readSession() {
  const s = unseal<Session>((await cookies()).get(COOKIE)?.value);
  if (!s || Date.now() / 1000 - s.iat > MAX_AGE) return null;
  return s;
}

export async function writeSession(s: Omit<Session, "iat">) {
  (await cookies()).set(COOKIE, seal({ ...s, iat: Math.floor(Date.now() / 1000) }), { ...cookieOpts, maxAge: MAX_AGE });
}

export async function clearSession() {
  (await cookies()).delete(COOKIE);
}

/** Short-lived OAuth state (CSRF token + where to return after sign-in). */
const STATE = "kq_oauth";

export async function writeOAuthState(state: { nonce: string; returnTo: string }) {
  (await cookies()).set(STATE, seal(state), { ...cookieOpts, maxAge: 600 });
}

export async function takeOAuthState() {
  const jar = await cookies();
  const v = unseal<{ nonce: string; returnTo: string }>(jar.get(STATE)?.value);
  jar.delete(STATE);
  return v;
}
