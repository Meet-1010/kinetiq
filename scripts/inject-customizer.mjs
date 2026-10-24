#!/usr/bin/env node
// Injects scripts/customizer-runtime.js (minified) as the first script of every HTML page in a
// demo folder, so the site's Customize panel can talk to the running demo. Idempotent: an
// existing injection is replaced. Allowed parent origins come from deploy/demos/wrangler.jsonc.
//
//   node scripts/inject-customizer.mjs [demosDir]     (default: demos/)

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MARK = /<script data-kq-customize>[\s\S]*?<\/script>/g;

let built;
async function runtime() {
  if (built) return built;
  const { transform } = await import("esbuild");
  const config = await fs.readFile(path.join(ROOT, "deploy", "demos", "wrangler.jsonc"), "utf8").catch(() => "");
  const ancestors = config.match(/"FRAME_ANCESTORS"\s*:\s*"([^"]*)"/)?.[1] ?? "";
  const parents = ancestors.split(/\s+/).filter((s) => /^https?:\/\//.test(s));
  const src = (await fs.readFile(path.join(ROOT, "scripts", "customizer-runtime.js"), "utf8")).replace(
    "/*__KQ_PARENTS__*/ []",
    JSON.stringify(parents),
  );
  const { code } = await transform(src, { minify: true, legalComments: "none", target: "es2017" });
  // "</script" inside the inline script would end it early.
  built = `<script data-kq-customize>${code.trim().replace(/<\/script/gi, "<\\/script")}</script>`;
  return built;
}

export async function injectInto(html) {
  const tag = await runtime();
  const clean = html.replace(MARK, "");
  // Keep <meta charset> first: browsers only look for it in the first 1024 bytes.
  const charset = clean.match(/<meta[^>]+charset[^>]*>/i);
  if (charset && charset.index < 2048) return clean.slice(0, charset.index + charset[0].length) + tag + clean.slice(charset.index + charset[0].length);
  const head = clean.match(/<head[^>]*>/i);
  if (head) return clean.slice(0, head.index + head[0].length) + tag + clean.slice(head.index + head[0].length);
  const doctype = clean.match(/<!doctype[^>]*>/i);
  return doctype ? clean.slice(0, doctype.index + doctype[0].length) + tag + clean.slice(doctype.index + doctype[0].length) : tag + clean;
}

async function htmlFiles(dir, out = []) {
  for (const e of await fs.readdir(dir, { withFileTypes: true }).catch(() => [])) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) await htmlFiles(p, out);
    else if (/\.html?$/i.test(e.name)) out.push(p);
  }
  return out;
}

/** Inject into every page of one demo folder. Returns the number of pages touched. */
export async function injectCustomizer(dir) {
  const files = await htmlFiles(dir);
  for (const f of files) await fs.writeFile(f, await injectInto(await fs.readFile(f, "utf8")));
  return files.length;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const demos = path.resolve(process.argv[2] ?? path.join(ROOT, "demos"));
  let pages = 0;
  let count = 0;
  for (const id of (await fs.readdir(demos)).filter((d) => /^[a-z0-9-]+-\d+$/.test(d))) {
    pages += await injectCustomizer(path.join(demos, id));
    count++;
  }
  console.log(`customizer injected into ${pages} pages across ${count} demos (${(await runtime()).length} bytes each)`);
}
