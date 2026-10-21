import { getAccess } from "@/lib/access";
import { getComponent } from "@/lib/library";
import { zipResponse } from "@/lib/vault";

/** Downloads are plain link clicks, so failures get a small page with a way back rather than raw JSON. */
function errorPage(status: number, title: string, body: string, back: string) {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} · Kinetiq</title><style>
body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0c0a09;color:#f5efea;font:15px/1.6 system-ui,sans-serif;padding:24px}
main{max-width:420px;text-align:center}h1{font-size:24px;margin:0 0 8px}p{color:#cfc5bd;margin:0 0 24px}
a{display:inline-block;background:#ff6b35;color:#1a0a03;font-weight:600;text-decoration:none;padding:10px 20px;border-radius:999px}
</style></head><body><main><h1>${title}</h1><p>${body}</p><a href="${back}">Back to the component</a></main></body></html>`;
  return new Response(html, { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

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
  try {
    return await zipResponse(component.id, `kinetiq-${component.id}-${slug}.zip`);
  } catch (e) {
    console.error(`download ${component.id} failed:`, e);
    return errorPage(
      503,
      "Download unavailable",
      "The source vault couldn’t be reached just now. Your unlock is saved, so please try again in a minute.",
      `/c/${component.id}`,
    );
  }
}
