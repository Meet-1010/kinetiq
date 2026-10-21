import { NextResponse, type NextRequest } from "next/server";
import routes from "@/data/routes.json";

// Dynamic pages stream inside <Suspense> (for instant navigation), which means a late notFound()
// can no longer change the HTTP status. Reject unknown ids here instead, before rendering starts.
const components = new Set(routes.components);
const categories = new Set(routes.categories);
const live = new Set(routes.live);

export function proxy(request: NextRequest) {
  const [, section, id, sub] = request.nextUrl.pathname.split("/");
  const known =
    section === "library" ? categories.has(id) : sub === "live" ? live.has(id) : sub === undefined || sub === "" ? components.has(id) : false;
  if (known) return NextResponse.next();
  return NextResponse.rewrite(new URL("/not-found", request.url), { status: 404 });
}

export const config = {
  matcher: ["/c/:id", "/c/:id/:sub*", "/library/:category"],
};
