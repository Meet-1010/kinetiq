import { getAccess } from "@/lib/access";
import { getComponent } from "@/lib/library";
import { zipResponse } from "@/lib/vault";

export async function GET(_req: Request, ctx: RouteContext<"/api/download/[id]">) {
  const { id } = await ctx.params;
  // Only ids from the generated manifest reach the filesystem/vault — no path input from the URL.
  const component = getComponent(id);
  if (!component?.hasCode) return Response.json({ error: "not_found" }, { status: 404 });

  const access = await getAccess();
  if (!access.starred) {
    return Response.json({ error: access.user ? "star_required" : "sign_in_required" }, { status: 403 });
  }

  const slug = component.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  return zipResponse(component.id, `kinetiq-${component.id}-${slug}.zip`);
}
