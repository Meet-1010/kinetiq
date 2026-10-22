// Cloudflare Worker for the demo host (static assets bound as ASSETS) — the production twin of
// scripts/demo-server.mjs. Config: deploy/demos/wrangler.jsonc (FRAME_ANCESTORS var).

const ID = /^[a-z0-9-]+-\d+$/;

function secure(res, env) {
  const r = new Response(res.body, res);
  r.headers.set("Content-Security-Policy", `frame-ancestors ${env.FRAME_ANCESTORS ?? "'self'"}`);
  r.headers.set("X-Content-Type-Options", "nosniff");
  r.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  r.headers.set("Access-Control-Allow-Origin", "*");
  return r;
}

// path -> demo id for asset paths unique to one demo (demos/_kq/paths.json, written at deploy).
// Never served publicly: /_kq/* isn't a demo id, so outside requests fall through to 404.
let pathIndex;
async function ownerOf(pathname, request, env) {
  pathIndex ??= env.ASSETS.fetch(new Request(new URL("/_kq/paths.json", request.url)))
    .then((r) => (r.ok ? r.json() : {}))
    .catch(() => ({}));
  return (await pathIndex)[decodeURIComponent(pathname)];
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const first = url.pathname.split("/")[1] ?? "";

    if (url.pathname.startsWith("/_worker") || url.pathname.endsWith(".map")) return new Response("Not found", { status: 404 });

    if (ID.test(first)) {
      if (url.pathname === `/${first}`) return Response.redirect(`${url.origin}/${first}/${url.search}`, 301);
      let res = await env.ASSETS.fetch(request);
      // SPA fallback for extension-less routes inside a demo.
      if (res.status === 404 && !/\.[a-z0-9]+$/i.test(url.pathname)) {
        res = await env.ASSETS.fetch(new Request(`${url.origin}/${first}/index.html`, request));
      }
      return secure(res, env);
    }

    // Root-absolute asset requested from inside a demo: send it back under that demo.
    const ref = request.headers.get("referer");
    const refId = ref ? new URL(ref).pathname.split("/")[1] : "";
    if (refId && ID.test(refId)) return Response.redirect(`${url.origin}/${refId}${url.pathname}${url.search}`, 307);
    // Requests from Web Workers often carry no usable Referer: find the one demo that has this file.
    const owner = await ownerOf(url.pathname, request, env);
    if (owner) return Response.redirect(`${url.origin}/${owner}${url.pathname}${url.search}`, 307);

    if (url.pathname === "/") return secure(new Response("Kinetiq live demos. Open /<component-id>/", { headers: { "Content-Type": "text/plain" } }), env);
    return secure(new Response("Not found", { status: 404 }), env);
  },
};
