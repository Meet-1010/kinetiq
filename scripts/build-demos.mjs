#!/usr/bin/env node
// Builds every component into a hosted live demo and checks that it actually runs.
//
// For each vault/<id>.zip:
//   1. extract to .cache/demos/work/<id>
//   2. install deps (install scripts disabled) and build with the project's own tool
//      (Vite, Next static export, CRA, Parcel, Astro, …) or copy it as-is when there's no build
//   3. publish to demos/<id>: only production output, no package.json/README/source maps;
//      JS minified + lightly obfuscated, CSS minified
//   4. open it in headless Chrome: uncaught errors, failed requests, blank screen → pass/warn/fail
//      (if obfuscation breaks a demo, fall back to the minified-only build)
//
// Results: src/data/demos.json (+ screenshots in .cache/demos/shots).
//
//   node scripts/build-demos.mjs [--only=id,id] [--jobs=4] [--force] [--verify-only]

import { execFile, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { createDemoServer, DEMOS_DIR } from "./demo-server.mjs";
import { injectCustomizer } from "./inject-customizer.mjs";

const run = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const VAULT = path.join(ROOT, "vault");
const CACHE = path.join(ROOT, ".cache", "demos");
const WORK = path.join(CACHE, "work");
const RAW = path.join(CACHE, "raw");
const LOGS = path.join(CACHE, "logs");
const SHOTS = path.join(CACHE, "shots");
const REPORT = path.join(ROOT, "src", "data", "demos.json");
const PORT = 3199;

const arg = (name) =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
const ONLY = arg("only")?.split(",");
const JOBS = Number(
  arg("jobs") ?? Math.max(2, Math.min(5, os.cpus().length - 4)),
);
const FORCE = process.argv.includes("--force");
const VERIFY_ONLY = process.argv.includes("--verify-only");

const library = JSON.parse(
  await fs.readFile(path.join(ROOT, "src", "data", "library.json"), "utf8"),
);
const report = existsSync(REPORT)
  ? JSON.parse(await fs.readFile(REPORT, "utf8"))
  : { demos: {} };

const exists = (p) =>
  fs.access(p).then(
    () => true,
    () => false,
  );
const readJSON = async (p) => JSON.parse(await fs.readFile(p, "utf8"));

// ---------------------------------------------------------------- shell helpers

function sh(cmd, args, { cwd, env, log, timeout = 8 * 60_000 }) {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, {
      cwd,
      env: {
        ...process.env,
        CI: "false",
        NODE_ENV: "production",
        BROWSER: "none",
        NEXT_TELEMETRY_DISABLED: "1",
        ASTRO_TELEMETRY_DISABLED: "1",
        ...env,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    const add = (d) => {
      out += d;
      if (out.length > 400_000) out = out.slice(-200_000);
    };
    p.stdout.on("data", add);
    p.stderr.on("data", add);
    const timer = setTimeout(() => p.kill("SIGKILL"), timeout);
    p.on("close", async (code) => {
      clearTimeout(timer);
      await fs.appendFile(
        log,
        `\n$ ${cmd} ${args.join(" ")}\n${out}\n[exit ${code}]\n`,
      );
      resolve({ ok: code === 0, out });
    });
  });
}

/** Webpack 4-era builds hash with MD4, which modern OpenSSL refuses unless the legacy provider is on. */
async function legacyRetry(cmd, args, opts) {
  const res = await sh(cmd, args, opts);
  if (res.ok || !/0308010C|ERR_OSSL|digital envelope/.test(res.out)) return res;
  return sh(cmd, args, {
    ...opts,
    env: { ...opts.env, NODE_OPTIONS: "--openssl-legacy-provider" },
  });
}

const tail = (s, n = 600) =>
  s
    .split("\n")
    .filter((l) => /error|Error|ERR|failed|Cannot|not found/i.test(l))
    .slice(-6)
    .join("\n")
    .slice(-n) || s.slice(-n);

// ---------------------------------------------------------------- project detection

async function walk(dir, depth = 0, out = []) {
  if (depth > 4) return out;
  for (const e of await fs
    .readdir(dir, { withFileTypes: true })
    .catch(() => [])) {
    if (
      e.name === "node_modules" ||
      e.name.startsWith(".") ||
      e.name === "__MACOSX"
    )
      continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) await walk(p, depth + 1, out);
    else out.push(p);
  }
  return out;
}

async function findRoot(dir) {
  const files = await walk(dir);
  const byDepth = (a, b) => a.split(path.sep).length - b.split(path.sep).length;
  const pkg = files
    .filter((f) => path.basename(f) === "package.json")
    .sort(byDepth)[0];
  if (pkg) return { root: path.dirname(pkg), hasPkg: true };
  const html = files
    .filter((f) => /^index\.html?$/i.test(path.basename(f)))
    .sort(byDepth)[0];
  if (html) return { root: path.dirname(html), hasPkg: false };
  const anyHtml = files.filter((f) => /\.html?$/i.test(f)).sort(byDepth)[0];
  return anyHtml
    ? {
        root: path.dirname(anyHtml),
        hasPkg: false,
        entry: path.basename(anyHtml),
      }
    : null;
}

/**
 * A zip that is a set of separate works (folder per work, each with its own built page, no root page)
 * becomes a "collection": the pages are published side by side under a generated gallery index.
 */
async function findCollection(work) {
  const entries = (await fs.readdir(work, { withFileTypes: true })).filter(
    (e) => e.isDirectory() && !e.name.startsWith("."),
  );
  const top = entries.length === 1 ? path.join(work, entries[0].name) : work;
  if (
    (await exists(path.join(top, "index.html"))) ||
    (await exists(path.join(top, "package.json")))
  )
    return null;
  const items = [];
  for (const e of await fs.readdir(top, { withFileTypes: true })) {
    if (!e.isDirectory() || e.name.startsWith(".")) continue;
    for (const sub of ["", "bin", "dist", "build", "docs", "public"]) {
      const dir = path.join(top, e.name, sub);
      if (await exists(path.join(dir, "index.html"))) {
        items.push({ name: e.name, dir });
        break;
      }
    }
  }
  return items.length >= 3 ? { top, items } : null;
}

async function buildCollection(id, title, { top, items }) {
  const out = path.join(WORK, `${id}__collection`);
  await fs.rm(out, { recursive: true, force: true });
  for (const it of items)
    await copyClean(it.dir, path.join(out, it.name), { skipSource: false });
  const thumbs = path.join(top, "imgs");
  if (await exists(thumbs))
    await fs.cp(thumbs, path.join(out, "imgs"), { recursive: true });
  const esc = (s) =>
    s.replace(
      /[&<>"]/g,
      (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c],
    );
  const cards = await Promise.all(
    items.map(async (it) => {
      const thumb = (await exists(path.join(thumbs, `${it.name}.png`)))
        ? `imgs/${it.name}.png`
        : null;
      const label = it.name.replace(/[-_]/g, " ");
      return `<a class="card" href="${esc(it.name)}/">${thumb ? `<img src="${thumb}" alt="" loading="lazy">` : `<div class="ph"></div>`}<span>${esc(label)}</span></a>`;
    }),
  );
  await fs.writeFile(
    path.join(out, "index.html"),
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<style>body{margin:0;background:#0c0a09;color:#f5efea;font:15px/1.5 system-ui,sans-serif;padding:32px}h1{font-size:22px;margin:0 0 4px}p{color:#9c918a;margin:0 0 24px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:16px}.card{display:block;background:#171310;border:1px solid rgba(255,228,210,.1);border-radius:16px;overflow:hidden;color:inherit;text-decoration:none;transition:transform .2s,border-color .2s}
.card:hover{transform:translateY(-3px);border-color:#ff6b35}.card img,.ph{display:block;width:100%;aspect-ratio:1;object-fit:cover;background:#221b17}.card span{display:block;padding:10px 14px;text-transform:capitalize;font-weight:600}</style></head>
<body><h1>${esc(title)}</h1><p>${items.length} interactive pieces. Pick one to open it.</p><div class="grid">${cards.join("")}</div></body></html>\n`,
  );
  return {
    kind: "collection",
    out,
    fixes: [`generated a gallery page for ${items.length} separate works`],
  };
}

const PREBUILT_DIRS = [
  "docs",
  "app",
  "dist",
  "build",
  "out",
  "www",
  "site",
  "public",
];

/** The project's own previously built site (e.g. GitHub Pages `docs/`), used when building from source fails. */
async function findPrebuilt(root) {
  for (const d of PREBUILT_DIRS) {
    const dir = path.join(root, d);
    const html = await fs
      .readFile(path.join(dir, "index.html"), "utf8")
      .catch(() => "");
    if (/<script\b/i.test(html)) return dir;
  }
  return null;
}

function detectKind(pkg) {
  const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
  const build = pkg.scripts?.build ?? "";
  if (deps.next) return "next";
  if (deps.astro) return "astro";
  if (deps["react-scripts"]) return "cra";
  if (deps.vite || /\bvite\b/.test(build)) return "vite";
  if (deps.parcel || deps["parcel-bundler"] || /\bparcel\b/.test(build))
    return "parcel";
  if (build) return "script";
  return "static";
}

// ---------------------------------------------------------------- build strategies

async function install(root, log) {
  if (await exists(path.join(root, "node_modules"))) return { ok: true };
  const pnpm = await exists(path.join(root, "pnpm-lock.yaml"));
  // Lifecycle scripts stay off: third-party packages never get to run code on install.
  return pnpm
    ? sh(
        "pnpm",
        [
          "install",
          "--ignore-scripts",
          "--no-frozen-lockfile",
          "--reporter=silent",
        ],
        { cwd: root, log, env: { NODE_ENV: "development" } },
      )
    : sh(
        "npm",
        [
          "install",
          "--ignore-scripts",
          "--no-audit",
          "--no-fund",
          "--legacy-peer-deps",
          "--loglevel=error",
          "--include=dev",
        ],
        {
          cwd: root,
          log,
          env: { NODE_ENV: "development" },
        },
      );
}

const bin = (root, name) => path.join(root, "node_modules", ".bin", name);

async function patchNextConfig(root, id) {
  const names = [
    "next.config.ts",
    "next.config.mjs",
    "next.config.js",
    "next.config.cjs",
  ];
  const found = (
    await Promise.all(
      names.map(async (n) => ((await exists(path.join(root, n))) ? n : null)),
    )
  ).find(Boolean);
  // Lint/type errors shouldn't block a demo build; Next <16 runs ESLint during `next build`.
  // turbopack.root: the work dir sits inside this repo, and Next would otherwise infer *this* repo
  // as the workspace root and compile its files (e.g. src/proxy.ts) into the demo.
  const inject = `output: "export", basePath: "/${id}", trailingSlash: true, images: { unoptimized: true }, typescript: { ignoreBuildErrors: true }, eslint: { ignoreDuringBuilds: true }, turbopack: { root: ${JSON.stringify(root)} },`;
  if (found) {
    const file = path.join(root, found);
    let src = await fs.readFile(file, "utf8");
    // Drop keys we override, then splice ours into the first config object literal.
    const re =
      /((?:const|let|var)\s+\w+\s*(?::\s*NextConfig)?\s*=\s*\{|module\.exports\s*=\s*\{|export default\s*\{)/;
    if (re.test(src)) {
      src = src
        .replace(/\boutput\s*:\s*["'][^"']*["']\s*,?/g, "")
        .replace(re, `$1 ${inject}`);
      await fs.writeFile(file, src);
      return;
    }
    await fs.rename(file, path.join(root, `__orig_${found}`));
  }
  await fs.writeFile(
    path.join(root, "next.config.mjs"),
    `export default { ${inject} };\n`,
  );
}

/**
 * Next/Astro demos are served under /<id>/, but source often hard-codes "/fonts/x.otf"-style paths into
 * public/. Prefix those with the base path, and point references to missing fonts at the same family's
 * font that does ship (e.g. Bold.otf -> Regular.ttf).
 */
async function fixAssetPaths(root, id, fixes) {
  const pub = path.join(root, "public");
  const entries = await fs
    .readdir(pub, { withFileTypes: true })
    .catch(() => []);
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const targets = [
    ...entries
      .filter((e) => e.isDirectory())
      .map((e) => `${esc(e.name)}/[^"'\`)\\s]+`),
    ...entries
      .filter((e) => e.isFile() && !/^index\.html?$/i.test(e.name))
      .map((e) => esc(e.name)),
  ];
  if (!targets.length) return;
  // Quoted string literals in JS and quoted url("…") in CSS. Imports stay untouched: the bundler
  // resolves "/x" against public/ itself, and a prefixed path would no longer resolve.
  const re = new RegExp(`(["'\`])/(${targets.join("|")})\\1`, "g");
  let prefixed = 0;
  for (const f of await walk(root)) {
    if (
      !/\.(m?[jt]sx?|css|scss)$/.test(f) ||
      /[\\/](out|dist|build|\.next|public|__kq_dist)[\\/]/.test(f) ||
      /\.config\./.test(f)
    )
      continue;
    const src = await fs.readFile(f, "utf8");
    let changed = false;
    const next = await replaceAsync(src, re, async (m) => {
      const [all, q, rel] = m;
      if (
        /(\bfrom|\bimport|import\(|require\()\s*$/.test(
          m.input.slice(Math.max(0, m.index - 12), m.index),
        )
      )
        return all;
      let file = rel;
      if (
        !(await exists(path.join(pub, rel))) &&
        /\.(otf|ttf|woff2?)$/i.test(rel)
      ) {
        const dir = path.dirname(rel);
        const family = path.basename(rel).split(/[-_.]/)[0];
        const alt = (
          await fs
            .readdir(path.join(pub, dir), { recursive: true })
            .catch(() => [])
        ).find(
          (x) =>
            path.basename(x).startsWith(family) &&
            /\.(otf|ttf|woff2?)$/i.test(x),
        );
        if (alt) {
          file = `${dir}/${alt.split(path.sep).join("/")}`;
          fixes.add(
            `font ${path.basename(rel)} is missing from the project; used ${path.basename(alt)}`,
          );
        }
      }
      changed = true;
      prefixed++;
      return `${q}/${id}/${file}${q}`;
    });
    if (changed) await fs.writeFile(f, next);
  }
  if (prefixed)
    fixes.add(
      `prefixed ${prefixed} hard-coded asset path(s) with the demo's base path`,
    );
}

async function replaceAsync(str, re, fn) {
  const parts = [];
  let last = 0;
  for (const m of str.matchAll(re)) {
    parts.push(str.slice(last, m.index), await fn(m));
    last = m.index + m[0].length;
  }
  parts.push(str.slice(last));
  return parts.join("");
}

async function findOutput(root, prefer = []) {
  for (const d of [
    ...prefer,
    "dist",
    "build",
    "out",
    "public",
    "www",
    "_site",
  ]) {
    const p = path.join(root, d);
    if (await exists(path.join(p, "index.html"))) return p;
  }
  return null;
}

const IMPORTS_BARE_G =
  /(?:^|[\s;])import\s(?:[^;]*?\sfrom\s*)?["']((?![./]|https?:|data:)[^"']+)["']/gm;
const IMPORTS_SHADER = /from\s*["'][^"']+\.(glsl|vert|frag|vs|fs)["']/;
const USES_IMPORT =
  /(^|[\s;}])(import(?:\s*[{*"']|\s+[\w$])|export(?:\s*[{*]|\s+(?:default|const|let|var|function|class|async)\b))/m;
const localScripts = (html) =>
  [
    ...html.matchAll(
      /<script\b([^>]*)\bsrc=["'](?!https?:|\/\/)([^"']+)["'][^>]*>/gi,
    ),
  ].map((m) => ({ attrs: m[1], src: m[2], tag: m[0] }));
const pkgName = (spec) =>
  spec.startsWith("@")
    ? spec.split("/").slice(0, 2).join("/")
    : spec.split("/")[0];

/** Hand-written JS in a static project (vendor *.min.js excluded). */
async function ownScripts(root) {
  return (await walk(root)).filter(
    (f) =>
      /\.m?js$/.test(f) &&
      !/\.min\.js$|[\\/](dist|build|vendor|libs?)[\\/]/i.test(f),
  );
}

/** npm packages imported by bare specifier anywhere in the project's own scripts or HTML. */
async function bareImports(root) {
  const found = new Set();
  const sources = [
    await fs.readFile(path.join(root, "index.html"), "utf8").catch(() => ""),
  ];
  for (const f of await ownScripts(root))
    sources.push(await fs.readFile(f, "utf8").catch(() => ""));
  for (const src of sources)
    for (const m of src.matchAll(IMPORTS_BARE_G)) found.add(pkgName(m[1]));
  return [...found];
}

/** Did this project only ever work through a bundler (npm imports, shader imports, import syntax in classic scripts)? */
async function needsBundler(root) {
  const html = await fs
    .readFile(path.join(root, "index.html"), "utf8")
    .catch(() => "");
  if (/node_modules\//.test(html) || (await bareImports(root)).length)
    return true;
  for (const f of await ownScripts(root))
    if (IMPORTS_SHADER.test(await fs.readFile(f, "utf8").catch(() => "")))
      return true;
  for (const s of localScripts(html)) {
    if (/type=["']module/.test(s.attrs)) continue;
    if (
      USES_IMPORT.test(
        await fs
          .readFile(path.join(root, s.src.split("?")[0]), "utf8")
          .catch(() => ""),
      )
    )
      return true;
  }
  return false;
}

/**
 * A plain <script src> whose file uses import/export never ran (the browser rejects it) and Vite won't
 * bundle it. Marking it as a module before the build lets Vite resolve its npm and extension-less imports.
 */
async function moduleizeScripts(root, fixes) {
  const STATEMENT =
    /^\s*(import\s*[\w{*"'$]|export\s*[{*]|export\s+(default|const|let|var|function|class|async)\b)/m;
  let n = 0;
  for (const f of (await walk(root)).filter(
    (x) =>
      /\.html?$/i.test(x) &&
      !/[\\/](dist|build|out|public|__kq_dist)[\\/]/.test(x),
  )) {
    let html = await fs.readFile(f, "utf8");
    const orig = html;
    for (const s of localScripts(html)) {
      if (/type=/.test(s.attrs)) continue;
      const code = await fs
        .readFile(path.join(path.dirname(f), s.src.split("?")[0]), "utf8")
        .catch(() => "");
      if (STATEMENT.test(code)) {
        html = html.replace(
          s.tag,
          s.tag.replace("<script", '<script type="module"'),
        );
        n++;
      }
    }
    if (html !== orig) await fs.writeFile(f, html);
  }
  if (n)
    fixes.add(
      `loaded ${n} script(s) as modules: they use import/export but were plain <script> tags`,
    );
}

/** `class="a"id="b"` breaks Vite's HTML parser; browsers tolerate it, so the originals "worked". */
async function repairHtml(root, fixes) {
  for (const f of (await walk(root)).filter((x) => /\.html?$/i.test(x))) {
    const html = await fs.readFile(f, "utf8");
    const fixed = html.replace(
      /(=\s*"[^"<>]*")(?=[a-zA-Z_:@][\w:.-]*\s*=)/g,
      "$1 ",
    );
    if (fixed !== html) {
      await fs.writeFile(f, fixed);
      fixes.add("repaired malformed HTML attributes");
    }
  }
}

// Vite config for projects that relied on a zero-config bundler: shader files load as strings.
const ADHOC_CONFIG = "__kq_vite.config.mjs";
async function prepareAdhoc(root, fixes) {
  // Entry pages: every top-level HTML file. Demos whose page isn't index.html (base.html,
  // step1.html…) get an index.html copy of their first page so the demo URL opens something.
  const pages = (await fs.readdir(root))
    .filter((f) => /\.html?$/i.test(f))
    .sort();
  if (!pages.includes("index.html") && pages.length) {
    await fs.copyFile(path.join(root, pages[0]), path.join(root, "index.html"));
    pages.unshift("index.html");
    fixes?.add(`opened ${pages[1]} as the demo's start page`);
  }
  const input = Object.fromEntries(
    pages.map((p) => [p.replace(/\.html?$/i, ""), p]),
  );
  await fs.writeFile(
    path.join(root, ADHOC_CONFIG),
    `export default {
  plugins: [{ name: "kq-shaders", transform(code, id) {
    if (/\\.(glsl|vert|frag|vs|fs)$/.test(id)) return { code: "export default " + JSON.stringify(code) + ";", map: null };
  } }, { name: "kq-node-shims", transformIndexHtml() {
    // Parcel v1 provided a browser "process" object; some old packages call it directly.
    return [{ tag: "script", children: "globalThis.process=globalThis.process||{env:{NODE_ENV:'production'},browser:true,emitWarning(){},nextTick:(f,...a)=>queueMicrotask(()=>f(...a))};", injectTo: "head-prepend" }];
  } }, { name: "kq-parcel-globs", transform(code, id) {
    // Parcel v1: import images from "../img/*.jpg" -> { name: url }
    if (!/\\.m?js$/.test(id) || !/(from|require\\()\\s*["'][^"']*\\*/.test(code)) return;
    const globObj = (glob) => "Object.fromEntries(Object.entries(import.meta.glob(" + JSON.stringify(glob) + ", { eager: true, import: 'default', query: '?url' })).map(([k, v]) => [k.split('/').pop().replace(/\\\\.[^.]+$/, ''), v]))";
    return { code: code
      .replace(/import\\s+(\\w+)\\s+from\\s+["']([^"']*\\*[^"']*)["'];?/g, (_, name, glob) => "const " + name + " = " + globObj(glob) + ";")
      .replace(/require\\(\\s*["']([^"']*\\*[^"']*)["']\\s*\\)/g, (_, glob) => globObj(glob)), map: null };
  } }],
  // Parcel shimmed Node globals that old browser packages still touch.
  define: { "process.env.NODE_ENV": '"production"', "process.env": "{}", "process.browser": "true", global: "globalThis" },
  build: { sourcemap: false, rollupOptions: { input: ${JSON.stringify(input)} } },
};\n`,
  );
  // Classic <script> tags that use import syntax have to become modules for any bundler to take them.
  for (const page of pages) {
    const file = path.join(root, page);
    let html = await fs.readFile(file, "utf8");
    for (const s of localScripts(html)) {
      if (/type=/.test(s.attrs)) continue;
      const code = await fs
        .readFile(path.join(root, s.src.split("?")[0]), "utf8")
        .catch(() => "");
      if (USES_IMPORT.test(code))
        html = html.replace(
          s.tag,
          s.tag.replace("<script", '<script type="module"'),
        );
    }
    await fs.writeFile(file, html);
  }
}

const MEDIA =
  /\.(png|jpe?g|webp|avif|gif|svg|ico|mp4|webm|mov|mp3|wav|ogg|glb|gltf|bin|hdr|exr|ktx2|woff2?|ttf|otf|json|txt|csv|wasm|riv|lottie)$/i;

/**
 * Vite only bundles module scripts and imported assets. Classic `<script src>` files, vendor libs in js/
 * and assets referenced by runtime strings are silently left out of dist, so we copy them over.
 */
async function restoreDropped(srcDir, outDir, fixes) {
  let copied = 0;
  const copy = async (rel) => {
    const from = path.join(srcDir, rel);
    const to = path.join(outDir, rel);
    if (!from.startsWith(srcDir) || (await exists(to)) || !(await exists(from)))
      return;
    await fs.mkdir(path.dirname(to), { recursive: true });
    await fs.copyFile(from, to);
    copied++;
  };
  for (const f of (await walk(outDir)).filter((x) => /\.html?$/i.test(x))) {
    const html = await fs.readFile(f, "utf8");
    const refs = [
      ...[
        ...html.matchAll(
          /<script\b[^>]*\bsrc=["'](?!https?:|\/\/|data:)([^"'?#]+)/gi,
        ),
      ].map((m) => m[1]),
      ...[
        ...html.matchAll(
          /<link\b[^>]*\bhref=["'](?!https?:|\/\/|data:)([^"'?#]+\.css)/gi,
        ),
      ].map((m) => m[1]),
    ];
    for (const r of refs) await copy(path.normalize(r.replace(/^\.?\//, "")));
  }
  for (const f of await walk(srcDir)) {
    const rel = path.relative(srcDir, f);
    if (
      MEDIA.test(f) &&
      !/^(dist|build|out|__kq_dist|node_modules)[\\/]/.test(rel) &&
      !/^(package(-lock)?|tsconfig|jsconfig)\.json$/.test(path.basename(f))
    )
      await copy(rel);
  }
  if (copied)
    fixes.add(`restored ${copied} file(s) the original build left out`);
}

/**
 * Run a build and repair what the original project was missing, then retry (up to 4 rounds):
 * undeclared npm packages (incl. plugins' peer deps) and referenced-but-absent icon/image files.
 */
async function withMissingDeps(root, log, fixes, run) {
  let res = await run();
  const installed = new Set();
  for (let round = 0; round < 4 && !res.ok; round++) {
    let repaired = false;

    const missing = new Set();
    const pkgPatterns = [
      /(?:failed to resolve import|Could not resolve|Can't resolve|Cannot find module|Module not found: Error: Can't resolve)\s*["']([^"']+)["']/gi,
      /["']([@\w][\w./-]*)["'] was not found/gi,
    ];
    for (const re of pkgPatterns)
      for (const m of res.out.matchAll(re))
        if (
          /^(@[\w.-]+\/)?[\w.-]+(\/[\w.\/-]*)?$/.test(m[1]) &&
          !m[1].includes(root)
        )
          missing.add(pkgName(m[1]));
    if (missing.size) {
      for (const p of missing) installed.add(p);
      // --no-save prunes earlier extraneous installs, so always reinstall the whole set.
      const add = await sh(
        "npm",
        [
          "install",
          "--ignore-scripts",
          "--no-audit",
          "--no-fund",
          "--legacy-peer-deps",
          "--no-save",
          ...installed,
        ],
        { cwd: root, log, env: { NODE_ENV: "development" } },
      );
      if (add.ok) {
        fixes.add(
          `installed undeclared dependency: ${[...missing].join(", ")}`,
        );
        repaired = true;
      }
    }

    // A newer release moved an export the project imports: drop back to the version it declared.
    const declared = await readJSON(path.join(root, "package.json"))
      .then((p) => ({
        ...(p.dependencies ?? {}),
        ...(p.devDependencies ?? {}),
      }))
      .catch(() => ({}));
    for (const m of res.out.matchAll(
      /"([\w$]+)" is not exported by "node_modules\/((?:@[^/"]+\/)?[^/"]+)\//g,
    )) {
      const [, name, dep] = m;
      const min = (declared[dep] ?? "").match(/\d+\.\d+\.\d+/)?.[0];
      if (!min || [...installed].some((p) => p.startsWith(`${dep}@`))) continue;
      installed.add(`${dep}@${min}`);
      const pin = await sh(
        "npm",
        [
          "install",
          "--ignore-scripts",
          "--no-audit",
          "--no-fund",
          "--legacy-peer-deps",
          "--no-save",
          ...installed,
        ],
        { cwd: root, log, env: { NODE_ENV: "development" } },
      );
      if (pin.ok) {
        fixes.add(
          `pinned ${dep}@${min}: newer versions moved the ${name} export`,
        );
        repaired = true;
      }
    }

    for (const m of res.out.matchAll(
      /ENOENT: no such file or directory, (?:open|stat) '([^']+)'/g,
    )) {
      const file = m[1];
      if (
        file.startsWith(root) &&
        /\.(ico|png|svg|jpe?g|webp|gif|webmanifest)$/i.test(file) &&
        !(await exists(file))
      ) {
        await fs.mkdir(path.dirname(file), { recursive: true });
        await fs.writeFile(
          file,
          /\.svg$/i.test(file)
            ? '<svg xmlns="http://www.w3.org/2000/svg"/>'
            : "",
        );
        fixes.add(`added placeholder for missing ${path.basename(file)}`);
        repaired = true;
      }
    }

    if (!repaired) break;
    res = await run();
  }
  return res;
}

async function buildFromSource(id, root, hasPkg, log, forceKind) {
  const fixes = new Set();
  const done = (r) => ({ ...r, fixes: [...fixes] });
  const index = path.join(root, "index.html");

  let pkg = hasPkg
    ? await readJSON(path.join(root, "package.json")).catch(() => ({}))
    : null;
  let kind = forceKind ?? (pkg ? detectKind(pkg) : "static");

  // "Static" projects that import npm packages or shaders only ever ran through a bundler.
  if (!forceKind && kind === "static" && (await exists(index))) {
    if (!(await needsBundler(root))) return done({ kind, out: root });
    kind = "vite-adhoc";
    if (!pkg) {
      // No package.json means no recorded versions; libraries whose latest major broke old demo
      // code get their legacy major instead of "latest".
      const LEGACY = { "locomotive-scroll": "^4.1.4" };
      const deps = Object.fromEntries(
        (await bareImports(root)).map((d) => [d, LEGACY[d] ?? "latest"]),
      );
      for (const d of Object.keys(deps))
        if (LEGACY[d])
          fixes.add(`used ${d}@${LEGACY[d]}: the demo is written for that API`);
      pkg = { name: id, private: true, type: "module", dependencies: deps };
      await fs.writeFile(
        path.join(root, "package.json"),
        JSON.stringify(pkg, null, 2),
      );
      if (Object.keys(deps).length)
        fixes.add(
          `created package.json for npm imports: ${Object.keys(deps).join(", ")}`,
        );
    }
  } else if (!pkg) return done({ kind, out: root });

  // node-sass has no build for current Node/arm64; dart-sass is the drop-in replacement.
  const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
  if (deps["node-sass"]) {
    for (const k of ["dependencies", "devDependencies"])
      delete pkg[k]?.["node-sass"];
    pkg.devDependencies = { ...(pkg.devDependencies ?? {}), sass: "^1.77.0" };
    await fs.writeFile(
      path.join(root, "package.json"),
      JSON.stringify(pkg, null, 2),
    );
    await fs.rm(path.join(root, "package-lock.json"), { force: true });
    fixes.add("replaced node-sass with sass");
  }

  let inst = await install(root, log);
  if (
    !inst.ok &&
    /registry\.npm\.taobao\.org|registry\.npmmirror\.com|ENOTFOUND|ETARGET/.test(
      inst.out,
    )
  ) {
    // Lockfile pinned to a dead mirror or vanished versions: resolve from npmjs, but keep the exact
    // versions the lockfile recorded for direct dependencies (open ranges like ">=0.102" would
    // otherwise jump years ahead and break the demo).
    const lock = await readJSON(path.join(root, "package-lock.json")).catch(
      () => null,
    );
    const locked = (name) =>
      lock?.packages?.[`node_modules/${name}`]?.version ??
      lock?.dependencies?.[name]?.version;
    let pinned = 0;
    for (const field of ["dependencies", "devDependencies"]) {
      for (const name of Object.keys(pkg[field] ?? {})) {
        const v = locked(name);
        if (v && /^\d+\.\d+\.\d+/.test(v)) {
          pkg[field][name] = v;
          pinned++;
        }
      }
    }
    if (pinned)
      await fs.writeFile(
        path.join(root, "package.json"),
        JSON.stringify(pkg, null, 2),
      );
    for (const lockFile of ["package-lock.json", "yarn.lock", "pnpm-lock.yaml"])
      await fs.rm(path.join(root, lockFile), { force: true });
    await fs.rm(path.join(root, "node_modules"), {
      recursive: true,
      force: true,
    });
    inst = await install(root, log);
    if (inst.ok)
      fixes.add(
        `re-resolved dependencies from npmjs (lockfile pointed at a dead registry)${pinned ? `, keeping its ${pinned} original versions` : ""}`,
      );
  }
  if (!inst.ok)
    return done({ kind, error: `install failed: ${tail(inst.out)}` });

  let res;
  const outDir = path.join(root, "__kq_dist"); // absolute: some projects set Vite `root` to a sub-folder
  const viteArgs = [
    "--base",
    "./",
    "--outDir",
    outDir,
    "--emptyOutDir",
    "--sourcemap",
    "false",
  ];
  switch (kind) {
    case "next":
      await patchNextConfig(root, id);
      await fixAssetPaths(root, id, fixes);
      res = await withMissingDeps(root, log, fixes, () =>
        sh(bin(root, "next"), ["build"], { cwd: root, log }),
      );
      if (!res.ok && /Turbopack, with a `webpack` config/.test(res.out)) {
        // Next 16 builds with Turbopack by default and refuses custom webpack configs.
        res = await sh(bin(root, "next"), ["build", "--webpack"], {
          cwd: root,
          log,
        });
        if (res.ok)
          fixes.add("built with webpack (project has a custom webpack config)");
      }
      return done(
        res.ok
          ? { kind, out: path.join(root, "out"), basePathed: true }
          : { kind, error: tail(res.out) },
      );
    case "vite": {
      await repairHtml(root, fixes);
      await moduleizeScripts(root, fixes);
      await fixAssetPaths(root, id, fixes);
      res = await withMissingDeps(root, log, fixes, () =>
        sh(bin(root, "vite"), ["build", ...viteArgs], { cwd: root, log }),
      );
      if (!res.ok) return done({ kind, error: tail(res.out) });
      const srcHtml = (await walk(root))
        .filter((f) => /index\.html$/.test(f) && !f.includes("__kq_dist"))
        .sort((a, b) => a.length - b.length)[0];
      if (srcHtml) await restoreDropped(path.dirname(srcHtml), outDir, fixes);
      return done({ kind, out: outDir });
    }
    case "vite-adhoc": {
      const vite = path.join(ROOT, "node_modules", ".bin", "vite");
      await repairHtml(root, fixes);
      await prepareAdhoc(root, fixes);
      res = await withMissingDeps(root, log, fixes, () =>
        sh(vite, ["build", "--config", ADHOC_CONFIG, ...viteArgs], {
          cwd: root,
          log,
        }),
      );
      if (!res.ok) return done({ kind, error: tail(res.out) });
      await restoreDropped(root, outDir, fixes);
      return done({ kind, out: outDir });
    }
    case "cra": {
      const env = {
        PUBLIC_URL: ".",
        GENERATE_SOURCEMAP: "false",
        SKIP_PREFLIGHT_CHECK: "true",
        DISABLE_ESLINT_PLUGIN: "true",
      };
      res = await withMissingDeps(root, log, fixes, () =>
        legacyRetry(bin(root, "react-scripts"), ["build"], {
          cwd: root,
          log,
          env,
        }),
      );
      return done(
        res.ok
          ? { kind, out: path.join(root, "build") }
          : { kind, error: tail(res.out) },
      );
    }
    case "parcel": {
      // Entry: explicit build script/source, else every page the scripts mention (multi-page demos), else index.html.
      const scriptPages = [
        ...new Set(
          Object.values(pkg.scripts ?? {}).flatMap((s) =>
            [...s.matchAll(/([\w./-]+\.html)/g)].map((m) => m[1]),
          ),
        ),
      ];
      const explicit =
        (pkg.scripts?.build ?? "").match(
          /parcel build\s+([^\s-][^\s]*)/,
        )?.[1] ?? pkg.source;
      const fallback = (await exists(path.join(root, "src/index.html")))
        ? "src/index.html"
        : "index.html";
      const entries = explicit
        ? [explicit]
        : scriptPages.length && !(await exists(path.join(root, "index.html")))
          ? scriptPages
          : [fallback];
      const v1 =
        Boolean(deps["parcel-bundler"]) || /^[\^~]?1\./.test(deps.parcel ?? "");
      const args = [
        "build",
        ...entries,
        v1 ? "--out-dir" : "--dist-dir",
        outDir,
        "--public-url",
        "./",
        "--no-source-maps",
        "--no-cache",
        ...(v1 ? ["--no-minify"] : []),
      ];
      res = await withMissingDeps(root, log, fixes, () =>
        legacyRetry(bin(root, "parcel"), args, { cwd: root, log }),
      );
      if (!res.ok) return done({ kind, error: tail(res.out) });
      await restoreDropped(
        path.dirname(path.join(root, entries[0])),
        outDir,
        fixes,
      );
      if (!(await exists(path.join(outDir, "index.html")))) {
        const first = path.join(outDir, path.basename(entries[0]));
        if (await exists(first))
          await fs.copyFile(first, path.join(outDir, "index.html"));
      }
      return done({ kind, out: outDir });
    }
    case "astro":
      await fixAssetPaths(root, id, fixes);
      res = await withMissingDeps(root, log, fixes, () =>
        sh(bin(root, "astro"), ["build", "--base", `/${id}/`], {
          cwd: root,
          log,
        }),
      );
      return done(
        res.ok
          ? { kind, out: await findOutput(root, ["dist"]), basePathed: true }
          : { kind, error: tail(res.out) },
      );
    default:
      res = await withMissingDeps(root, log, fixes, () =>
        legacyRetry("npm", ["run", "build"], {
          cwd: root,
          log,
          env: {
            PUBLIC_URL: ".",
            GENERATE_SOURCEMAP: "false",
            SKIP_PREFLIGHT_CHECK: "true",
          },
        }),
      );
      if (!res.ok) return done({ kind, error: tail(res.out) });
      return done({ kind, out: (await findOutput(root)) ?? root });
  }
}

/**
 * Build from source; when that's impossible (dead toolchains, native modules, git deps), fall back to
 * the project's own prebuilt site, then to a fresh Vite build of Parcel-era/zero-config projects.
 */
async function buildProject(id, root, hasPkg, log) {
  const first = await buildFromSource(id, root, hasPkg, log);
  if (!first.error && first.out) return first;

  const prebuilt = await findPrebuilt(root);
  if (prebuilt) {
    return {
      kind: `${first.kind}→prebuilt`,
      out: prebuilt,
      fixes: [
        ...first.fixes,
        `used the project's own prebuilt site (${path.basename(prebuilt)}/): building from source failed`,
      ],
    };
  }

  if (hasPkg && ["parcel", "script"].includes(first.kind)) {
    const viaVite = await buildFromSource(id, root, hasPkg, log, "vite-adhoc");
    if (!viaVite.error && viaVite.out) {
      const was =
        first.kind === "parcel" ? "Parcel v1" : "its original build script";
      return {
        ...viaVite,
        kind: `${first.kind}→vite`,
        fixes: [
          ...first.fixes,
          ...viaVite.fixes,
          `rebuilt with Vite (${was} no longer runs)`,
        ],
      };
    }
  }
  return first;
}

// ---------------------------------------------------------------- publishing (strip + minify + obfuscate)

const DROP =
  /(^|\/)(package(-lock)?\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb?|tsconfig[^/]*\.json|jsconfig\.json|vite\.config\.[cm]?[jt]s|next\.config\.[cm]?[jt]s|webpack\.config\.[cm]?js|astro\.config\.[cm]?[jt]s|postcss\.config\.[cm]?js|tailwind\.config\.[cm]?[jt]s|eslint[^/]*|\.eslintrc[^/]*|\.prettierrc[^/]*|readme(\.\w+)?|license(\.\w+)?|licence(\.\w+)?|changelog(\.\w+)?|instruction\.txt|\.gitignore|\.DS_Store|thumbs\.db)$/i;
const DROP_EXT =
  /\.(map|md|mdx|ts|tsx|jsx|scss|sass|less|vue|svelte|astro|log)$/i;
const DROP_DIR =
  /^(node_modules|\.git|\.vscode|\.idea|\.next|\.cache|\.parcel-cache|__MACOSX|\.github)$/;

/** `skipSource`: a bundled project published from its own root — keep dist/, never src/. */
async function copyClean(src, dest, { skipSource }) {
  await fs.mkdir(dest, { recursive: true });
  for (const e of await fs.readdir(src, { withFileTypes: true })) {
    if (
      DROP_DIR.test(e.name) ||
      e.name === "__kq_dist" ||
      e.name.startsWith("__kq_")
    )
      continue;
    if (
      skipSource &&
      e.isDirectory() &&
      /^(src|source|scss|sass|styles-src)$/i.test(e.name)
    )
      continue;
    const s = path.join(src, e.name);
    const d = path.join(dest, e.name);
    if (e.isDirectory()) await copyClean(s, d, { skipSource });
    else if (!DROP.test(e.name) && !DROP_EXT.test(e.name))
      await fs.copyFile(s, d);
  }
}

let obfuscator;
let esbuild;
async function protect(dir, { obfuscate }) {
  obfuscator ??= (await import("javascript-obfuscator")).default;
  esbuild ??= await import("esbuild");
  const files = await walk(dir, 0);
  let obfuscated = 0;
  for (const f of files) {
    const ext = path.extname(f).toLowerCase();
    if (ext !== ".js" && ext !== ".mjs" && ext !== ".css") continue;
    const code = await fs.readFile(f, "utf8");
    if (code.length > 2_500_000) continue; // huge vendor bundles: already minified, obfuscation only bloats them
    try {
      if (ext === ".css") {
        const r = await esbuild.transform(code, {
          loader: "css",
          minify: true,
          legalComments: "none",
        });
        await fs.writeFile(
          f,
          r.code.replace(/\/\*[#@]\s*sourceMappingURL=[^*]*\*\//g, ""),
        );
        continue;
      }
      const isModule =
        /^\s*(import|export)\s|[\n;]\s*(import|export)\s[\s\S]*?from\s/m.test(
          code,
        ) || /\bimport\.meta\b/.test(code);
      const min = await esbuild.transform(code, {
        loader: "js",
        minify: true,
        legalComments: "none",
        format: isModule ? "esm" : undefined,
        target: "es2020",
      });
      let out = min.code.replace(
        /\/[/*][#@]\s*sourceMappingURL=[^\n*]*(\*\/)?/g,
        "",
      );
      // Vendor libraries (*.min.js) are third-party and already minified: nothing of ours to protect.
      if (obfuscate && out.length < 900_000 && !/\.min\.m?js$/i.test(f)) {
        out = obfuscator
          .obfuscate(out, {
            compact: true,
            target: "browser",
            sourceType: isModule ? "module" : "script",
            renameGlobals: false,
            identifierNamesGenerator: "mangled",
            stringArray: true,
            stringArrayThreshold: 0.6,
            stringArrayEncoding: [],
            stringArrayRotate: true,
            stringArrayShuffle: true,
            splitStrings: false,
            controlFlowFlattening: false,
            deadCodeInjection: false,
            selfDefending: false,
            debugProtection: false,
            transformObjectKeys: false,
            unicodeEscapeSequence: false,
            numbersToExpressions: false,
            simplify: true,
            sourceMap: false,
          })
          .getObfuscatedCode();
        obfuscated++;
      }
      await fs.writeFile(f, out);
    } catch {
      // Unparseable (e.g. already-obfuscated or exotic syntax): leave the built file as-is.
    }
  }
  // Inline <script> blocks in hand-written HTML: minify only.
  for (const f of files.filter((x) => /\.html?$/i.test(x))) {
    let html = await fs.readFile(f, "utf8");
    html = html
      // Drop authoring comments, but keep React/Vue hydration markers (<!--$-->, <!--/$-->, <!-- -->, <!--[-->…).
      .replace(/<!--(?!\[if)([\s\S]*?)-->/g, (m, body) =>
        /^\s*$|^[$/&!?\[\]]{1,3}$/.test(body) ? m : "",
      )
      // Demo-site ad loaders (Codrops/Carbon/BuySellAds) don't belong in the library.
      .replace(
        /<script[^>]*src=["'][^"']*(adpacks|carbonads|buysellads|srv\.carbonads)[^"']*["'][^>]*>\s*<\/script>/gi,
        "",
      );
    const blocks = [
      ...html.matchAll(/<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/gi),
    ];
    for (const m of blocks) {
      if (!m[2].trim() || /type=["'](?!module|text\/javascript)/i.test(m[1]))
        continue;
      try {
        const r = await esbuild.transform(m[2], {
          loader: "js",
          minify: true,
          legalComments: "none",
          format: /module/.test(m[1]) ? "esm" : undefined,
        });
        html = html.replace(m[2], r.code.replace(/\$/g, "$$$$"));
      } catch {}
    }
    await fs.writeFile(f, html);
  }
  return obfuscated;
}

/** Static hosts cap file size (Cloudflare Pages: 25 MiB). Re-encode oversized videos in place. */
async function shrinkMedia(dir, fixes) {
  for (const f of await walk(dir, 0)) {
    if (
      !/\.(mp4|webm|mov)$/i.test(f) ||
      (await fs.stat(f)).size < 20 * 1024 * 1024
    )
      continue;
    const tmp = `${f}.__kq.mp4`;
    try {
      await run(
        "ffmpeg",
        [
          "-v",
          "error",
          "-y",
          "-i",
          f,
          "-vf",
          "scale='min(1920,iw)':-2",
          "-c:v",
          "libx264",
          "-crf",
          "28",
          "-preset",
          "medium",
          "-c:a",
          "aac",
          "-b:a",
          "96k",
          "-movflags",
          "+faststart",
          tmp,
        ],
        { maxBuffer: 1 << 20 },
      );
      await fs.rename(tmp, f);
      fixes.push(`re-encoded ${path.basename(f)} to fit hosting limits`);
    } catch {
      await fs.rm(tmp, { force: true });
    }
  }
}

async function dirSize(dir) {
  let n = 0;
  for (const f of await walk(dir, 0)) n += (await fs.stat(f)).size;
  return n;
}

// ---------------------------------------------------------------- verification (headless Chrome)

let browserP;
async function browser() {
  const { chromium } = await import("playwright-core");
  browserP ??= chromium.launch({
    channel: "chrome",
    headless: true,
    args: [
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
      "--ignore-gpu-blocklist",
      "--autoplay-policy=no-user-gesture-required",
      "--mute-audio",
    ],
  });
  return browserP;
}

// Browser-tab icons (favicon.ico, the Vite template's /vite.svg, touch icons) don't affect the demo.
const TAB_ICON = /favicon|apple-touch-icon|\/vite\.svg$/i;

async function verify(id) {
  const b = await browser();
  const ctx = await b.newContext({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
  });
  const page = await ctx.newPage();
  const errors = [];
  const failed = [];
  page.on("pageerror", (e) =>
    errors.push(String(e.message ?? e).slice(0, 200)),
  );
  page.on(
    "console",
    (m) =>
      m.type() === "error" &&
      !/favicon|DevTools|Failed to load resource/.test(m.text()) &&
      errors.push(m.text().slice(0, 200)),
  );
  page.on("response", (r) => {
    const u = new URL(r.url());
    if (
      r.status() >= 400 &&
      u.port === String(PORT) &&
      !TAB_ICON.test(u.pathname)
    )
      failed.push(`${r.status()} ${u.pathname}`);
  });
  page.on("requestfailed", (r) => {
    const u = new URL(r.url());
    // Aborted fetches (cancelled route prefetches, superseded requests, media probes) aren't failures.
    // Stylesheets/scripts blocked for a bad MIME type also show up as ERR_ABORTED, so those still count.
    if (
      /ERR_ABORTED/.test(r.failure()?.errorText ?? "") &&
      ["fetch", "xhr", "media", "other"].includes(r.resourceType())
    )
      return;
    if (u.port === String(PORT) && !TAB_ICON.test(u.pathname))
      failed.push(`ERR ${u.pathname}`);
  });

  let navError = null;
  try {
    await page.goto(`http://127.0.0.1:${PORT}/${id}/`, {
      waitUntil: "load",
      timeout: 45_000,
    });
  } catch (e) {
    navError = String(e.message).split("\n")[0];
  }
  await page.waitForTimeout(3500);
  await page.mouse.move(640, 400).catch(() => {});
  await page.mouse.wheel(0, 600).catch(() => {});
  await page.waitForTimeout(1200);

  const measure = () =>
    page
      .evaluate(() => {
        const big = [
          ...document.querySelectorAll("canvas,img,video,svg,picture,iframe"),
        ].filter((el) => {
          const r = el.getBoundingClientRect();
          return r.width > 80 && r.height > 80;
        }).length;
        const text = (document.body?.innerText ?? "")
          .replace(/\s+/g, " ")
          .trim().length;
        const styled = [...document.querySelectorAll("body *")].filter((el) => {
          const r = el.getBoundingClientRect();
          const s = getComputedStyle(el);
          return (
            r.width > 200 &&
            r.height > 100 &&
            (s.backgroundImage !== "none" ||
              s.backgroundColor !== "rgba(0, 0, 0, 0)")
          );
        }).length;
        return { big, text, styled };
      })
      .catch(() => ({ big: 0, text: 0, styled: 0 }));
  const looksBlank = (v) => v.big === 0 && v.text < 3 && v.styled === 0;
  let visible = await measure();
  // Scenes waiting on large remote assets (HDRs, models) can still be suspended here: look again.
  if (looksBlank(visible)) {
    await page.waitForTimeout(7000);
    visible = await measure();
  }

  await page.evaluate(() => window.scrollTo(0, 0)).catch(() => {});
  await page
    .screenshot({
      path: path.join(SHOTS, `${id}.jpg`),
      type: "jpeg",
      quality: 60,
    })
    .catch(() => {});
  await ctx.close();

  // Errors caused by third-party hosts (ad servers, analytics, CORS) say nothing about the component.
  // A URL in the message only means "external" when it's about loading something from another host;
  // React's minified errors link to reactjs.org but are the demo's own errors.
  const isExternal = (e) =>
    /blocked by CORS policy|ERR_NAME_NOT_RESOLVED|ERR_BLOCKED_BY|net::ERR_/.test(
      e,
    ) ||
    (/https?:\/\/(?!127\.0\.0\.1)/.test(e) &&
      !/react(js)?\.(org|dev)\/(docs\/)?error/i.test(e) &&
      /load|fetch|request|script|resource|font/i.test(e));
  const external = errors.filter(isExternal);
  let own = errors.filter((e) => !isExternal(e));
  if (external.length)
    own = own.filter((e) => !/^(TypeError: )?Failed to fetch$/.test(e));

  const blank = looksBlank(visible);
  const status =
    navError || blank ? "fail" : own.length || failed.length ? "warn" : "pass";
  return {
    status,
    blank,
    errors: [...new Set(own)].slice(0, 5),
    external: [...new Set(external)].slice(0, 3),
    failed: [...new Set(failed)].slice(0, 8),
    navError,
  };
}

// ---------------------------------------------------------------- repairs

const PATCHES = JSON.parse(
  await fs
    .readFile(path.join(ROOT, "scripts", "demo-patches.json"), "utf8")
    .catch(() => "{}"),
);

/** Hand-written fixes for bugs in specific original projects (scripts/demo-patches.json). */
async function applyPatches(id, root, fixes) {
  for (const p of PATCHES[id] ?? []) {
    const file = path.join(root, p.file);
    const src = await fs.readFile(file, "utf8").catch(() => null);
    if (src?.includes(p.find)) {
      await fs.writeFile(file, src.replace(p.find, p.replace));
      fixes.push(`patched ${p.file}: ${p.why}`);
    } else
      fixes.push(
        `patch for ${p.file} no longer matches the source (not applied)`,
      );
  }
}

/** Typos in third-party CDN hosts that make a whole library fail to load. */
async function fixCdnTypos(dir, fixes) {
  // githack serves GitHub files through a redirect to raw.githubusercontent.com (slow, ~5s for a 1.5 MB
  // HDR); jsDelivr serves the identical file at the same commit from its CDN, with CORS.
  let githack = 0;
  for (const f of (await walk(dir, 0)).filter((x) =>
    /\.(m?js|css|html?)$/i.test(x),
  )) {
    const src = await fs.readFile(f, "utf8");
    const out = src.replace(
      /https:\/\/(?:raw|rawcdn)\.githack\.com\/([\w.-]+)\/([\w.-]+)\/([\w.-]+)\//g,
      (_, user, repo, ref) => {
        githack++;
        return `https://cdn.jsdelivr.net/gh/${user}/${repo}@${ref}/`;
      },
    );
    if (out !== src) await fs.writeFile(f, out);
  }
  if (githack)
    fixes.push(
      `served ${githack} GitHub-hosted asset link(s) from jsDelivr instead of githack (faster, no redirect)`,
    );

  for (const f of (await walk(dir, 0)).filter((x) => /\.html?$/i.test(x))) {
    const html = await fs.readFile(f, "utf8");
    let fixed = html.replace(/\/\/unpkg\.co\//g, "//unpkg.com/");
    if (fixed !== html)
      fixes.push("fixed a typo in a CDN address (unpkg.co -> unpkg.com)");

    // GreenSock's CodePen-only trial builds of its bonus plugins (2020-era) break against current GSAP;
    // since 3.13 the same plugins ship free in the official package.
    const before = fixed;
    fixed = fixed.replace(
      /https:\/\/assets\.codepen\.io\/16327\/([A-Za-z0-9]+?)3?\.min\.js/g,
      "https://unpkg.com/gsap@3/dist/$1.min.js",
    );
    if (fixed !== before) {
      // CustomBounce/CustomWiggle build on CustomEase, so it has to load first.
      const tag = (name) =>
        fixed.match(
          new RegExp(
            `<script[^>]*gsap@3/dist/${name}\\.min\\.js[^>]*>\\s*</script>`,
            "i",
          ),
        );
      const ease = tag("CustomEase");
      const dependents = ["CustomBounce", "CustomWiggle"]
        .map(tag)
        .filter(Boolean)
        .sort((a, b) => a.index - b.index);
      if (ease && dependents.length && dependents[0].index < ease.index) {
        fixed = fixed.replace(ease[0], "");
        fixed = fixed.replace(dependents[0][0], ease[0] + dependents[0][0]);
      }
      fixes.push(
        "swapped CodePen trial GSAP plugins for the official free builds",
      );
    }
    if (fixed !== html) await fs.writeFile(f, fixed);
  }
}

// Well-known libraries demos use as globals or vendor files without shipping them.
const VENDOR = {
  Lenis: "lenis/dist/lenis.min.js",
  SplitType: "split-type/umd/index.min.js",
  gsap: "gsap/dist/gsap.min.js",
  ScrollTrigger: "gsap/dist/ScrollTrigger.min.js",
  imagesLoaded: "imagesloaded/imagesloaded.pkgd.min.js",
};
const VENDOR_FILES = {
  "lenis.min.js": VENDOR.Lenis,
  "lenis.js": VENDOR.Lenis,
  "gsap.min.js": VENDOR.gsap,
  "ScrollTrigger.min.js": VENDOR.ScrollTrigger,
  "imagesloaded.pkgd.min.js": VENDOR.imagesLoaded,
  "split-type.min.js": VENDOR.SplitType,
};
const VENDOR_DIR = path.join(CACHE, "vendor");
let vendorReady;
function vendorFile(rel) {
  vendorReady ??= (async () => {
    if (!(await exists(path.join(VENDOR_DIR, "node_modules", "lenis")))) {
      await fs.mkdir(VENDOR_DIR, { recursive: true });
      await sh(
        "npm",
        [
          "install",
          "--prefix",
          VENDOR_DIR,
          "--ignore-scripts",
          "--no-audit",
          "--no-fund",
          "lenis",
          "gsap",
          "split-type",
          "imagesloaded",
        ],
        {
          cwd: VENDOR_DIR,
          log: path.join(LOGS, "_vendor.log"),
        },
      );
    }
  })();
  return vendorReady.then(() => path.join(VENDOR_DIR, "node_modules", rel));
}

const SCRIPT_TAG =
  /<script\b([^>]*)\bsrc=["'](?!https?:|\/\/)([^"'?#]+)[^"']*["']([^>]*)>/gi;

/**
 * One repair round driven by what headless Chrome reported: copy files that 404 but exist elsewhere
 * in the project, restore well-known vendor libraries, and fix module/classic script mismatches.
 * Edits are applied to both the published and the minified-only copy.
 */
async function repairRuntime(id, v, srcRoot, fixes) {
  const dirs = [path.join(DEMOS_DIR, id), path.join(RAW, id)];
  const raw = dirs[1];
  let changed = false;
  const putFile = async (from, rel) => {
    for (const d of dirs) {
      const to = path.join(d, rel);
      if (!to.startsWith(d + path.sep)) return;
      await fs.mkdir(path.dirname(to), { recursive: true });
      await fs.copyFile(from, to);
    }
    changed = true;
  };

  // 1) Missing files.
  const srcFiles = srcRoot
    ? (await walk(srcRoot, 0)).filter(
        (f) => !/[\\/](__kq_dist|node_modules)[\\/]/.test(f),
      )
    : [];
  for (const f of v.failed ?? []) {
    const m = f.match(/^(?:404|ERR) \/([^/]+)\/(.+[^/])$/);
    if (!m || m[1] !== id) continue;
    const rel = decodeURIComponent(m[2]);
    const base = path.basename(rel);
    if (VENDOR_FILES[base]) {
      await putFile(await vendorFile(VENDOR_FILES[base]), rel);
      fixes.push(`restored missing library ${base} from npm`);
      continue;
    }
    const hits = srcFiles.filter((s) => path.basename(s) === base);
    if (hits.length === 1) {
      await putFile(hits[0], rel);
      fixes.push(
        `restored ${base} (the page looks for it at ${rel}, the project keeps it at ${path.relative(srcRoot, hits[0])})`,
      );
    }
  }

  // 2) Globals the page uses but never loads.
  const pages = (await fs.readdir(raw).catch(() => [])).filter((f) =>
    /\.html?$/i.test(f),
  );
  for (const e of v.errors ?? []) {
    const name = e.match(/^(?:ReferenceError: )?(\w+) is not defined/)?.[1];
    if (!name || !VENDOR[name]) continue;
    const file = path.basename(VENDOR[name]);
    await putFile(await vendorFile(VENDOR[name]), `kq-vendor/${file}`);
    for (const d of dirs)
      for (const p of pages) {
        const fp = path.join(d, p);
        const html = await fs.readFile(fp, "utf8");
        if (html.includes(`kq-vendor/${file}`)) continue;
        const at = html.search(/<script\b/i);
        const tag = `<script src="kq-vendor/${file}"></script>`;
        await fs.writeFile(
          fp,
          at >= 0
            ? html.slice(0, at) + tag + html.slice(at)
            : html.replace(/<\/body>/i, `${tag}</body>`),
        );
      }
    changed = true;
    fixes.push(`added ${name}, which the page uses but never loads`);
  }

  // 3) Script type mismatches.
  const wantsModule = (v.errors ?? []).some((e) =>
    /Cannot use import statement outside a module|Unexpected token 'export'/.test(
      e,
    ),
  );
  const parcelInModule = (v.errors ?? []).some((e) =>
    /parcelRequire is not defined/.test(e),
  );
  if (wantsModule || parcelInModule) {
    for (const p of pages) {
      const rawHtml = await fs.readFile(path.join(raw, p), "utf8");
      const edits = [];
      for (const m of rawHtml.matchAll(SCRIPT_TAG)) {
        const [tag, before, src, after] = m;
        const attrs = before + after;
        const code = await fs
          .readFile(path.join(raw, src.replace(/^\.?\//, "")), "utf8")
          .catch(() => "");
        if (wantsModule && !/type=/.test(attrs) && USES_IMPORT.test(code))
          edits.push([tag, tag.replace(/<script\b/i, '<script type="module"')]);
        if (
          parcelInModule &&
          /type=["']module["']/.test(attrs) &&
          /parcelRequire\s*=/.test(code)
        )
          edits.push([tag, tag.replace(/\s*type=["']module["']/, " defer")]);
      }
      if (!edits.length) continue;
      for (const d of dirs) {
        let html = await fs.readFile(path.join(d, p), "utf8");
        for (const [from, to] of edits) html = html.replace(from, to);
        await fs.writeFile(path.join(d, p), html);
      }
      changed = true;
      fixes.push(
        wantsModule
          ? `loaded ${edits.length} script(s) as modules: they use import/export but were plain <script> tags`
          : `loaded a Parcel bundle as a classic script: it was marked as a module, where its globals are illegal`,
      );
    }
  }
  return changed;
}

// ---------------------------------------------------------------- main

async function processOne(c) {
  const id = c.id;
  const log = path.join(LOGS, `${id}.log`);
  const prev = report.demos[id];
  const entry = { id, at: new Date().toISOString() };
  let srcRoot = null;

  if (!VERIFY_ONLY) {
    await fs.writeFile(log, `# ${id}\n`);
    const work = path.join(WORK, id);
    await fs.rm(work, { recursive: true, force: true });
    await fs.mkdir(work, { recursive: true });
    const unz = await sh(
      "unzip",
      [
        "-q",
        "-o",
        path.join(VAULT, `${id}.zip`),
        "-d",
        work,
        "-x",
        "__MACOSX/*",
        "*/node_modules/*",
        "node_modules/*",
      ],
      { cwd: work, log, timeout: 120_000 },
    );
    if (!unz.ok && !(await fs.readdir(work)).length)
      return {
        ...entry,
        status: "fail",
        stage: "extract",
        error: tail(unz.out),
      };

    const collection = await findCollection(work);
    const found = collection
      ? { root: collection.top, hasPkg: false }
      : await findRoot(work);
    if (!found)
      return {
        ...entry,
        status: "fail",
        stage: "detect",
        error: "no index.html or package.json in zip",
      };

    const patched = [];
    if (!collection) await applyPatches(id, found.root, patched);
    srcRoot = found.root;

    const built = collection
      ? await buildCollection(id, c.title, collection)
      : await buildProject(id, found.root, found.hasPkg, log);
    entry.kind = built.kind;
    if (patched.length || built.fixes?.length)
      entry.fixes = [...patched, ...(built.fixes ?? [])];
    if (built.error || !built.out)
      return {
        ...entry,
        status: "fail",
        stage: "build",
        error: built.error ?? "build produced no index.html",
      };

    // Keep a minified-only copy so we can fall back if obfuscation breaks the demo.
    const raw = path.join(RAW, id);
    const dest = path.join(DEMOS_DIR, id);
    await fs.rm(raw, { recursive: true, force: true });
    await fs.rm(dest, { recursive: true, force: true });
    await copyClean(built.out, raw, {
      skipSource: built.out === found.root && built.kind !== "static",
    });
    if (found.entry && !(await exists(path.join(raw, "index.html"))))
      await fs.copyFile(
        path.join(raw, found.entry),
        path.join(raw, "index.html"),
      );
    entry.fixes ??= [];
    await fixCdnTypos(raw, entry.fixes);
    await shrinkMedia(raw, entry.fixes);
    await fs.cp(raw, dest, { recursive: true });
    await protect(raw, { obfuscate: false });
    entry.obfuscatedFiles = await protect(dest, { obfuscate: true });
    // The Customize panel on the site drives demos through this tiny runtime (no source exposed).
    await injectCustomizer(dest);
    await injectCustomizer(raw);
    entry.obfuscated = entry.obfuscatedFiles > 0;
    entry.bytes = await dirSize(dest);
    // Free disk: dependencies are not needed after the build.
    await fs.rm(path.join(found.root, "node_modules"), {
      recursive: true,
      force: true,
    });
  } else {
    Object.assign(entry, prev ?? {});
    if (!(await exists(path.join(DEMOS_DIR, id))))
      return { ...entry, status: "fail", stage: "missing" };
  }

  let v = await verify(id);
  // Repair what the browser reported, up to two rounds (a fix can reveal the next problem).
  for (
    let round = 0;
    round < 2 && v.status !== "pass" && (await exists(path.join(RAW, id)));
    round++
  ) {
    entry.fixes ??= [];
    if (!(await repairRuntime(id, v, srcRoot, entry.fixes))) break;
    v = await verify(id);
  }
  if (
    v.status !== "pass" &&
    entry.obfuscated &&
    (await exists(path.join(RAW, id)))
  ) {
    // Try the minified-only build; keep whichever behaves better.
    const dest = path.join(DEMOS_DIR, id);
    const backup = `${dest}.__obf`;
    await fs.rename(dest, backup);
    await fs.cp(path.join(RAW, id), dest, { recursive: true });
    const v2 = await verify(id);
    const rank = { pass: 0, warn: 1, fail: 2 };
    // Any error that only the obfuscated build has was introduced by obfuscation.
    const introduced =
      v.errors.some((e) => !v2.errors.includes(e)) ||
      v.failed.some((e) => !v2.failed.includes(e));
    if (
      rank[v2.status] < rank[v.status] ||
      (rank[v2.status] === rank[v.status] && introduced)
    ) {
      await fs.rm(backup, { recursive: true, force: true });
      v = v2;
      entry.obfuscated = false;
      entry.note = "obfuscation broke this demo; serving minified build";
    } else {
      await fs.rm(dest, { recursive: true, force: true });
      await fs.rename(backup, dest);
    }
  }
  if (entry.fixes) entry.fixes = [...new Set(entry.fixes)];
  return { ...entry, ...v, stage: "verify" };
}

async function main() {
  for (const d of [WORK, RAW, LOGS, SHOTS, DEMOS_DIR])
    await fs.mkdir(d, { recursive: true });
  let todo = library.components.filter((c) => c.hasCode);
  if (ONLY) todo = todo.filter((c) => ONLY.includes(c.id));
  else if (!FORCE && !VERIFY_ONLY)
    todo = todo.filter(
      (c) => !report.demos[c.id] || report.demos[c.id].stage !== "verify",
    );

  const server = createDemoServer({ frameAncestors: "'self'" }).listen(PORT);
  console.log(`Building ${todo.length} demos with ${JOBS} workers…`);

  let i = 0;
  let done = 0;
  const save = () =>
    fs.writeFile(
      REPORT,
      JSON.stringify(
        { generatedAt: new Date().toISOString(), demos: report.demos },
        null,
        2,
      ) + "\n",
    );
  await Promise.all(
    Array.from({ length: JOBS }, async () => {
      while (i < todo.length) {
        const c = todo[i++];
        let r;
        try {
          r = await processOne(c);
        } catch (e) {
          r = {
            id: c.id,
            status: "fail",
            stage: "crash",
            error: String(e.message ?? e).slice(0, 300),
          };
        }
        report.demos[c.id] = r;
        done++;
        console.log(
          `[${done}/${todo.length}] ${c.id.padEnd(22)} ${r.status.toUpperCase().padEnd(4)} ${r.kind ?? ""} ${r.error ? "· " + r.error.split("\n")[0].slice(0, 90) : ""}`,
        );
        if (done % 5 === 0) await save();
      }
    }),
  );
  await save();
  server.close();
  if (browserP) await (await browserP).close();

  const all = Object.values(report.demos);
  const count = (s) => all.filter((d) => d.status === s).length;
  console.log(
    `\npass ${count("pass")} · warn ${count("warn")} · fail ${count("fail")}  (of ${all.length})`,
  );
}

main();
