import "server-only";
import { checkStar, devOpen, oauthConfigured } from "./github";
import { clearSession, readSession } from "./session";

export type Access = {
  mode: "github" | "dev-open" | "unconfigured";
  user: { login: string; name: string | null; avatar: string } | null;
  starred: boolean;
};

/** Single source of truth for "may this visitor download code?" — used by /api/me and downloads. */
export async function getAccess(): Promise<Access> {
  if (devOpen()) return { mode: "dev-open", user: null, starred: true };
  if (!oauthConfigured()) return { mode: "unconfigured", user: null, starred: false };

  const session = await readSession();
  if (!session) return { mode: "github", user: null, starred: false };

  const user = { login: session.login, name: session.name, avatar: session.avatar };
  const star = await checkStar(session.token).catch(() => "not-starred" as const);
  if (star === "invalid-token") {
    await clearSession();
    return { mode: "github", user: null, starred: false };
  }
  return { mode: "github", user, starred: star === "starred" };
}
