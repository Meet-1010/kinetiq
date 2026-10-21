import "server-only";
import { cacheLife } from "next/cache";
import { site } from "./site";

const API = "https://api.github.com";
const gh = (token?: string) => ({
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  "User-Agent": "kinetiq-library",
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
});

export const oauthConfigured = () =>
  Boolean(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET && process.env.SESSION_SECRET);

/** Without OAuth credentials the gate can't work; in local dev we open it so the site is usable. */
export const devOpen = () => !oauthConfigured() && process.env.NODE_ENV !== "production";

export function authorizeUrl(state: string, redirectUri: string) {
  const u = new URL("https://github.com/login/oauth/authorize");
  u.searchParams.set("client_id", process.env.GITHUB_CLIENT_ID!);
  u.searchParams.set("redirect_uri", redirectUri);
  u.searchParams.set("state", state);
  // No scopes: we only read public data (profile + whether a public repo is starred).
  u.searchParams.set("scope", "");
  u.searchParams.set("allow_signup", "true");
  return u.toString();
}

export async function exchangeCode(code: string, redirectUri: string) {
  const res = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.GITHUB_CLIENT_ID,
      client_secret: process.env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: redirectUri,
    }),
  });
  const j = (await res.json()) as { access_token?: string; error_description?: string };
  if (!j.access_token) throw new Error(j.error_description ?? "GitHub did not return a token");
  return j.access_token;
}

export async function fetchUser(token: string) {
  const res = await fetch(`${API}/user`, { headers: gh(token) });
  if (!res.ok) throw new Error(`GitHub /user failed (${res.status})`);
  const u = (await res.json()) as { login: string; name: string | null; avatar_url: string };
  return { login: u.login, name: u.name, avatar: u.avatar_url };
}

export type StarCheck = "starred" | "not-starred" | "invalid-token";

export async function checkStar(token: string, repo = site.starRepo): Promise<StarCheck> {
  const res = await fetch(`${API}/user/starred/${repo}`, { headers: gh(token), cache: "no-store" });
  if (res.status === 204) return "starred";
  if (res.status === 404) return "not-starred";
  if (res.status === 401) return "invalid-token";
  throw new Error(`GitHub star check failed (${res.status})`);
}

export async function repoStars(repo = site.starRepo): Promise<number | null> {
  "use cache";
  cacheLife("hours");
  try {
    const res = await fetch(`${API}/repos/${repo}`, {
      headers: gh(process.env.GITHUB_PUBLIC_TOKEN),
    });
    if (!res.ok) return null;
    return ((await res.json()) as { stargazers_count: number }).stargazers_count;
  } catch {
    return null;
  }
}
