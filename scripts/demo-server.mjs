#!/usr/bin/env node
// Static server for built live demos: demos/<id>/… is served at /<id>/….
// Runs on its own origin so demo code can never reach the main site's cookies or APIs.
//
// Built projects often reference root-absolute paths ("/models/x.glb", "/_next/…") that would
// miss the /<id>/ prefix. Those requests carry the demo page as Referer, so we redirect them
// back under the right demo.
//
//   node scripts/demo-server.mjs [--port=3100]

import { createReadStream } from "node:fs";
import { mkdir, readdir, stat, writeFile } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const DEMOS_DIR = path.join(ROOT, "demos");

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".glb": "model/gltf-binary",
  ".gltf": "model/gltf+json",
  ".bin": "application/octet-stream",
  ".hdr": "application/octet-stream",
  ".exr": "application/octet-stream",
  ".ktx2": "image/ktx2",
  ".wasm": "application/wasm",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml",
  ".glsl": "text/plain; charset=utf-8",
  ".frag": "text/plain; charset=utf-8",
  ".vert": "text/plain; charset=utf-8",
};

const ID = /^[a-z0-9-]+-\d+$/;

async function listFiles(dir, base = dir, out = []) {
  for (const e of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) await listFiles(p, base, out);
    else out.push("/" + path.relative(base, p).split(path.sep).join("/"));
  }
  return out;
}

/**
 * "/fonts/x.otf" -> "3d-8" for every path that exists in exactly one demo. Requests from Web Workers
 * and some fetches carry no usable Referer, so this is how a root-absolute asset finds its demo.
 */
export async function buildPathIndex() {
  const owners = new Map();
  for (const id of (await readdir(DEMOS_DIR).catch(() => [])).filter((d) => ID.test(d))) {
    for (const p of await listFiles(path.join(DEMOS_DIR, id))) owners.set(p, owners.has(p) ? null : id);
  }
  return Object.fromEntries([...owners].filter(([p, id]) => id && !/\/index\.html?$/.test(p)));
}

/** Writes demos/_kq/paths.json for the Cloudflare worker (read through its ASSETS binding only). */
export async function writePathIndex() {
  const index = await buildPathIndex();
  await mkdir(path.join(DEMOS_DIR, "_kq"), { recursive: true });
  await writeFile(path.join(DEMOS_DIR, "_kq", "paths.json"), JSON.stringify(index));
  return Object.keys(index).length;
}

let pathIndex;
let pathIndexAt = 0;

async function isFile(p) {
  const s = await stat(p).catch(() => null);
  return s?.isFile() ? s : null;
}

/** Resolve /<id>/<rest> to a file inside demos/<id>, never escaping it. */
async function resolveFile(id, rest) {
  const base = path.join(DEMOS_DIR, id);
  const target = path.resolve(base, "." + path.posix.normalize("/" + decodeURIComponent(rest)));
  if (target !== base && !target.startsWith(base + path.sep)) return null;
  const candidates = [target, path.join(target, "index.html"), target + ".html"];
  for (const c of candidates) {
    const s = await isFile(c);
    if (s) return { file: c, size: s.size };
  }
  // SPA fallback for extension-less routes.
  if (!path.extname(target)) {
    const s = await isFile(path.join(base, "index.html"));
    if (s) return { file: path.join(base, "index.html"), size: s.size };
  }
  return null;
}

export function createDemoServer({ frameAncestors = process.env.DEMO_FRAME_ANCESTORS ?? "'self' http://localhost:3000" } = {}) {
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://x");
      const [, first = "", ...restParts] = url.pathname.split("/");
      const rest = restParts.join("/");

      const security = {
        "Content-Security-Policy": `frame-ancestors ${frameAncestors}`,
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "strict-origin-when-cross-origin",
      };

      if (ID.test(first) && (await stat(path.join(DEMOS_DIR, first)).catch(() => null))) {
        if (!rest && !url.pathname.endsWith("/")) {
          res.writeHead(301, { Location: `/${first}/${url.search}`, ...security });
          return res.end();
        }
        const hit = await resolveFile(first, rest);
        if (!hit) {
          res.writeHead(404, { "Content-Type": "text/plain", ...security });
          return res.end("Not found");
        }
        const ext = path.extname(hit.file).toLowerCase();
        res.writeHead(200, {
          "Content-Type": TYPES[ext] ?? "application/octet-stream",
          "Content-Length": hit.size,
          "Cache-Control": ext === ".html" ? "no-cache" : "public, max-age=86400",
          "Access-Control-Allow-Origin": "*",
          ...security,
        });
        if (req.method === "HEAD") return res.end();
        return createReadStream(hit.file).pipe(res);
      }

      // Root-absolute request from inside a demo: send it back under that demo.
      const ref = req.headers.referer ? new URL(req.headers.referer) : null;
      const refId = ref?.pathname.split("/")[1];
      if (refId && ID.test(refId)) {
        res.writeHead(307, { Location: `/${refId}${url.pathname}${url.search}`, ...security });
        return res.end();
      }
      if (!pathIndex || Date.now() - pathIndexAt > 30_000) {
        pathIndex = buildPathIndex();
        pathIndexAt = Date.now();
      }
      const owner = (await pathIndex)[decodeURIComponent(url.pathname)];
      if (owner) {
        res.writeHead(307, { Location: `/${owner}${url.pathname}${url.search}`, ...security });
        return res.end();
      }

      if (url.pathname === "/") {
        const ids = (await readdir(DEMOS_DIR).catch(() => [])).filter((d) => ID.test(d));
        res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8", ...security });
        return res.end(`Kinetiq live demos: ${ids.length} available. Open /<component-id>/`);
      }
      res.writeHead(404, { "Content-Type": "text/plain", ...security });
      res.end("Not found");
    } catch {
      res.writeHead(400);
      res.end("Bad request");
    }
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url) && process.argv.includes("--write-index")) {
  writePathIndex().then((n) => console.log(`demos/_kq/paths.json: ${n} unique asset paths`));
} else if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.argv.find((a) => a.startsWith("--port="))?.split("=")[1] ?? process.env.PORT ?? 3100);
  createDemoServer().listen(port, () => console.log(`demo server on http://localhost:${port}`));
}
