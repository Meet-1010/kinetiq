import { NextResponse, type NextRequest } from "next/server";
import { exchangeCode, fetchUser } from "@/lib/github";
import { takeOAuthState, writeSession } from "@/lib/session";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const saved = await takeOAuthState();
  const back = (path: string, flag: string) => {
    const u = new URL(path, req.nextUrl.origin);
    u.searchParams.set("auth", flag);
    return NextResponse.redirect(u);
  };

  if (!code || !saved || saved.nonce !== state) return back(saved?.returnTo ?? "/", "failed");

  try {
    const token = await exchangeCode(code, new URL("/api/auth/callback", req.nextUrl.origin).toString());
    const user = await fetchUser(token);
    await writeSession({ ...user, token });
    return back(saved.returnTo, "ok");
  } catch {
    return back(saved.returnTo, "failed");
  }
}
