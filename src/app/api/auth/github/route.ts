import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { authorizeUrl, oauthConfigured } from "@/lib/github";
import { writeOAuthState } from "@/lib/session";

const safeReturnTo = (v: string | null) => (v && v.startsWith("/") && !v.startsWith("//") ? v : "/");

export async function GET(req: NextRequest) {
  if (!oauthConfigured()) return NextResponse.redirect(new URL("/?auth=unconfigured", req.url));
  const nonce = randomBytes(16).toString("hex");
  await writeOAuthState({ nonce, returnTo: safeReturnTo(req.nextUrl.searchParams.get("returnTo")) });
  return NextResponse.redirect(authorizeUrl(nonce, new URL("/api/auth/callback", req.nextUrl.origin).toString()));
}
