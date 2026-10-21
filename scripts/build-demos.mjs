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

const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
const ONLY = arg("only")?.split(",");
const JOBS = Number(arg("jobs") ?? Math.max(2, Math.min(5, os.cpus().length - 4)));
const FORCE = process.argv.includes("--force");
const VERIFY_ONLY = process.argv.includes("--verify-only");

const library = JSON.parse(await fs.readFile(path.join(ROOT, "src", "data", "library.json"), "utf8"));
const report = existsSync(REPORT) ? JSON.parse(await fs.readFile(REPORT, "utf8")) : { demos: {} };

const exists = (p) => fs.access(p).then(() => true, () => false);
const readJSON = async (p) => JSON.parse(await fs.readFile(p, "utf8"));

// ---------------------------------------------------------------- shell helpers

function sh(cmd, args, { cwd, env, log, timeout = 8 * 60_000 }) {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, {
      cwd,
      env: { ...process.env, CI: "false", NODE_ENV: "production", BROWSER: "none", NEXT_TELEMETRY_DISABLED: "1", ASTRO_TELEMETRY_DISABLED: "1", ...env },
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
      await fs.appendFile(log, `\n$ ${cmd} ${args.join(" ")}\n${out}\n[exit ${code}]\n`);
      resolve({ ok: code === 0, out });
    });
  });
}

/** Webpack 4-era builds hash with MD4, which modern OpenSSL refuses unless the legacy provider is on. */
async function legacyRetry(cmd, args, opts) {
  const res = await sh(cmd, args, opts);
  if (res.ok || !/0308010C|ERR_OSSL|digital envelope/.test(res.out)) return res;
  return sh(cmd, args, { ...opts, env: { ...opts.env, NODE_OPTIONS: "--openssl-legacy-provider" } });
}

const tail = (s, n = 600) => s.split("\n").filter((l) => /error|Error|ERR|failed|Cannot|not found/i.test(l)).slice(-6).join("\n").slice(-n) || s.slice(-n);

// ---------------------------------------------------------------- project detection

async function walk(dir, depth = 0, out = []) {
  if (depth > 4) return out;
  for (const e of await fs.readdir(dir, { withFileTypes: true }).catch(() => [])) {
    if (e.name === "node_modules" || e.name.startsWith(".") || e.name === "__MACOSX") continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) await walk(p, depth + 1, out);
    else out.push(p);
  }
  return out;
}

async function findRoot(dir) {
  const files = await walk(dir);
  const byDepth = (a, b) => a.split(path.sep).length - b.split(path.sep).length;
  const pkg = files.filter((f) => path.basename(f) === "package.json").sort(byDepth)[0];
  if (pkg) return { root: path.dirname(pkg), hasPkg: true };
  const html = files.filter((f) => /^index\.html?$/i.test(path.basename(f))).sort(byDepth)[0];
  if (html) return { root: path.dirname(html), hasPkg: false };
  const anyHtml = files.filter((f) => /\.html?$/i.test(f)).sort(byDepth)[0];
  return anyHtml ? { root: path.dirname(anyHtml), hasPkg: false, entry: path.basename(anyHtml) } : null;
}

function detectKind(pkg) {
  const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
  const build = pkg.scripts?.build ?? "";
  if (deps.next) return "next";
  if (deps.astro) return "astro";
  if (deps["react-scripts"]) return "cra";
  if (deps.vite || /\bvite\b/.test(build)) return "vite";
  if (deps.parcel || deps["parcel-bundler"] || /\bparcel\b/.test(build)) return "parcel";
  if (build) return "script";
  return "static";
}

// ---------------------------------------------------------------- build strategies

async function install(root, log) {
  if (await exists(path.join(root, "node_modules"))) return { ok: true };
  const pnpm = await exists(path.join(root, "pnpm-lock.yaml"));
  // Lifecycle scripts stay off: third-party packages never get to run code on install.
  return pnpm
    ? sh("pnpm", ["install", "--ignore-scripts", "--no-frozen-lockfile", "--reporter=silent"], { cwd: root, log, env: { NODE_ENV: "development" } })
    : sh("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund", "--legacy-peer-deps", "--loglevel=error", "--include=dev"], {
        cwd: root,
        log,
        env: { NODE_ENV: "development" },
      });
}

const bin = (root, name) => path.join(root, "node_modules", ".bin", name);

async function patchNextConfig(root, id) {
  const names = ["next.config.ts", "next.config.mjs", "next.config.js", "next.config.cjs"];
  const found = (await Promise.all(names.map(async (n) => ((await exists(path.join(root, n))) ? n : null)))).find(Boolean);
  const inject = `output: "export", basePath: "/${id}", trailingSlash: true, images: { unoptimized: true }, typescript: { ignoreBuildErrors: true },`;
  if (found) {
    const file = path.join(root, found);
    let src = await fs.readFile(file, "utf8");
    // Drop keys we override, then splice ours into the first config object literal.
    const re = /((?:const|let|var)\s+\w+\s*(?::\s*NextConfig)?\s*=\s*\{|module\.exports\s*=\s*\{|export default\s*\{)/;
    if (re.test(src)) {
      src = src.replace(/\boutput\s*:\s*["'][^"']*["']\s*,?/g, "").replace(re, `$1 ${inject}`);
      await fs.writeFile(file, src);
      return;
    }
    await fs.rename(file, path.join(root, `__orig_${found}`));
  }
  await fs.writeFile(path.join(root, "next.config.mjs"), `export default { ${inject} };\n`);
}

async function findOutput(root, prefer = []) {
  for (const d of [...prefer, "dist", "build", "out", "public", "www", "_site"]) {
    const p = path.join(root, d);
    if (await exists(path.join(p, "index.html"))) return p;
  }
  return null;
}

const IMPORTS_BARE = /(?:^|[\s;])import\s[^;]*?from\s*["'](?![./]|https?:)[^"']+["']|(?:^|[\s;])import\s*["'](?![./]|https?:)[^"']+["']/m;
const IMPORTS_SHADER = /from\s*["'][^"']+\.(glsl|vert|frag|vs|fs)["']/;
const localScripts = (html) => [...html.matchAll(/<script\b([^>]*)\bsrc=["'](?!https?:|\/\/)([^"']+)["'][^>]*>/gi)].map((m) => ({ attrs: m[1], src: m[2], tag: m[0] }));

async function needsBundler(root) {
  const html = await fs.readFile(path.join(root, "index.html"), "utf8");
  if (/node_modules\//.test(html) || IMPORTS_BARE.test(html)) return true;
  for (const s of localScripts(html)) {
    const code = await fs.readFile(path.join(root, s.src.split("?")[0]), "utf8").catch(() => "");
    if (IMPORTS_BARE.test(code) || IMPORTS_SHADER.test(code)) return true;
  }
  return false;
}

// Vite config for projects that relied on a zero-config bundler: shader files load as strings.
const ADHOC_CONFIG = "__kq_vite.config.mjs";
async function prepareAdhoc(root) {
  await fs.writeFile(
    path.join(root, ADHOC_CONFIG),
    `export default {
  plugins: [{ name: "kq-shaders", transform(code, id) {
    if (/\\.(glsl|vert|frag|vs|fs)$/.test(id)) return { code: "export default " + JSON.stringify(code) + ";", map: null };
  } }],
  build: { sourcemap: false },
};\n`,
  );
  // Classic <script> tags that use import syntax have to become modules for any bundler to take them.
  const file = path.join(root, "index.html");
  let html = await fs.readFile(file, "utf8");
  for (const s of localScripts(html)) {
    if (/type=/.test(s.attrs)) continue;
    const code = await fs.readFile(path.join(root, s.src.split("?")[0]), "utf8").catch(() => "");
    if (/(^|[\s;])(import|export)\s/m.test(code)) html = html.replace(s.tag, s.tag.replace("<script", '<script type="module"'));
  }
  await fs.writeFile(file, html);
}

async function buildProject(id, root, hasPkg, log) {
  if (!hasPkg) return { kind: "static", out: root };
  const pkg = await readJSON(path.join(root, "package.json")).catch(() => ({}));
  let kind = detectKind(pkg);

  // A package.json that only lists CDN-style deps with a ready index.html is still static —
  // unless its scripts import npm packages or shader files, which only ever worked through a bundler.
  if (kind === "static" && (await exists(path.join(root, "index.html")))) {
    if (!(await needsBundler(root))) return { kind, out: root };
    kind = "vite-adhoc";
  }

  // node-sass has no build for current Node/arm64; dart-sass is the drop-in replacement.
  const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
  if (deps["node-sass"]) {
    for (const k of ["dependencies", "devDependencies"]) delete pkg[k]?.["node-sass"];
    pkg.devDependencies = { ...(pkg.devDependencies ?? {}), sass: "^1.77.0" };
    await fs.writeFile(path.join(root, "package.json"), JSON.stringify(pkg, null, 2));
    await fs.rm(path.join(root, "package-lock.json"), { force: true });
  }

  const inst = await install(root, log);
  if (!inst.ok) return { kind, error: `install failed: ${tail(inst.out)}` };

  let res;
  const outDir = "__kq_dist";
  switch (kind) {
    case "next":
      await patchNextConfig(root, id);
      res = await sh(bin(root, "next"), ["build"], { cwd: root, log });
      return res.ok ? { kind, out: path.join(root, "out"), basePathed: true } : { kind, error: tail(res.out) };
    case "vite":
      res = await sh(bin(root, "vite"), ["build", "--base", "./", "--outDir", outDir, "--emptyOutDir"], { cwd: root, log });
      if (!res.ok) {
        // Some projects keep index.html under a sub-folder configured via `root`; fall back to their script.
        const fb = pkg.scripts?.build ? await sh("npm", ["run", "build"], { cwd: root, log }) : res;
        if (fb.ok) return { kind, out: await findOutput(root) };
        return { kind, error: tail(res.out) };
      }
      return { kind, out: path.join(root, outDir) };
    case "vite-adhoc": {
      const vite = path.join(ROOT, "node_modules", ".bin", "vite");
      if (!(await exists(vite))) return { kind, error: "vite not available for ad-hoc build" };
      await prepareAdhoc(root);
      res = await sh(vite, ["build", "--config", ADHOC_CONFIG, "--base", "./", "--outDir", outDir, "--emptyOutDir"], { cwd: root, log });
      return res.ok ? { kind, out: path.join(root, outDir) } : { kind, error: tail(res.out) };
    }
    case "cra":
      res = await legacyRetry(bin(root, "react-scripts"), ["build"], { cwd: root, log, env: { PUBLIC_URL: ".", GENERATE_SOURCEMAP: "false" } });
      return res.ok ? { kind, out: path.join(root, "build") } : { kind, error: tail(res.out) };
    case "parcel": {
      const entry = (pkg.scripts?.build ?? "").match(/parcel build\s+([^\s-][^\s]*)/)?.[1] ?? pkg.source ?? ((await exists(path.join(root, "src/index.html"))) ? "src/index.html" : "index.html");
      res = await sh(bin(root, "parcel"), ["build", entry, "--dist-dir", outDir, "--public-url", "./", "--no-source-maps", "--no-cache"], { cwd: root, log });
      return res.ok ? { kind, out: path.join(root, outDir) } : { kind, error: tail(res.out) };
    }
    case "astro":
      res = await sh(bin(root, "astro"), ["build", "--base", `/${id}/`], { cwd: root, log });
      return res.ok ? { kind, out: await findOutput(root, ["dist"]), basePathed: true } : { kind, error: tail(res.out) };
    default:
      res = await legacyRetry("npm", ["run", "build"], { cwd: root, log, env: { PUBLIC_URL: ".", GENERATE_SOURCEMAP: "false" } });
      if (!res.ok) return { kind, error: tail(res.out) };
      return { kind, out: (await findOutput(root)) ?? root };
  }
}

// ---------------------------------------------------------------- publishing (strip + minify + obfuscate)

const DROP = /(^|\/)(package(-lock)?\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb?|tsconfig[^/]*\.json|jsconfig\.json|vite\.config\.[cm]?[jt]s|next\.config\.[cm]?[jt]s|webpack\.config\.[cm]?js|astro\.config\.[cm]?[jt]s|postcss\.config\.[cm]?js|tailwind\.config\.[cm]?[jt]s|eslint[^/]*|\.eslintrc[^/]*|\.prettierrc[^/]*|readme(\.\w+)?|license(\.\w+)?|licence(\.\w+)?|changelog(\.\w+)?|instruction\.txt|\.gitignore|\.DS_Store|thumbs\.db)$/i;
const DROP_EXT = /\.(map|md|mdx|ts|tsx|jsx|scss|sass|less|vue|svelte|astro|log)$/i;
const DROP_DIR = /^(node_modules|\.git|\.vscode|\.idea|\.next|\.cache|\.parcel-cache|__MACOSX|\.github)$/;

/** `skipSource`: a bundled project published from its own root — keep dist/, never src/. */
async function copyClean(src, dest, { skipSource }) {
  await fs.mkdir(dest, { recursive: true });
  for (const e of await fs.readdir(src, { withFileTypes: true })) {
    if (DROP_DIR.test(e.name) || e.name === "__kq_dist" || e.name.startsWith("__kq_")) continue;
    if (skipSource && e.isDirectory() && /^(src|source|scss|sass|styles-src)$/i.test(e.name)) continue;
    const s = path.join(src, e.name);
    const d = path.join(dest, e.name);
    if (e.isDirectory()) await copyClean(s, d, { skipSource });
    else if (!DROP.test(e.name) && !DROP_EXT.test(e.name)) await fs.copyFile(s, d);
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
        const r = await esbuild.transform(code, { loader: "css", minify: true, legalComments: "none" });
        await fs.writeFile(f, r.code);
        continue;
      }
      const isModule = /^\s*(import|export)\s|[\n;]\s*(import|export)\s[\s\S]*?from\s/m.test(code) || /\bimport\.meta\b/.test(code);
      const min = await esbuild.transform(code, { loader: "js", minify: true, legalComments: "none", format: isModule ? "esm" : undefined, target: "es2020" });
      let out = min.code;
      if (obfuscate && out.length < 900_000) {
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
      .replace(/<!--(?!\[if)[\s\S]*?-->/g, "")
      // Demo-site ad loaders (Codrops/Carbon/BuySellAds) don't belong in the library.
      .replace(/<script[^>]*src=["'][^"']*(adpacks|carbonads|buysellads|srv\.carbonads)[^"']*["'][^>]*>\s*<\/script>/gi, "");
    const blocks = [...html.matchAll(/<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/gi)];
    for (const m of blocks) {
      if (!m[2].trim() || /type=["'](?!module|text\/javascript)/i.test(m[1])) continue;
      try {
        const r = await esbuild.transform(m[2], { loader: "js", minify: true, legalComments: "none", format: /module/.test(m[1]) ? "esm" : undefined });
        html = html.replace(m[2], r.code.replace(/\$/g, "$$$$"));
      } catch {}
    }
    await fs.writeFile(f, html);
  }
  return obfuscated;
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
    args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required", "--mute-audio"],
  });
  return browserP;
}

async function verify(id) {
  const b = await browser();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  const failed = [];
  page.on("pageerror", (e) => errors.push(String(e.message ?? e).slice(0, 200)));
  page.on("console", (m) => m.type() === "error" && !/favicon|DevTools|Failed to load resource/.test(m.text()) && errors.push(m.text().slice(0, 200)));
  page.on("response", (r) => {
    const u = new URL(r.url());
    if (r.status() >= 400 && u.port === String(PORT) && !/favicon/.test(u.pathname)) failed.push(`${r.status()} ${u.pathname}`);
  });
  page.on("requestfailed", (r) => {
    const u = new URL(r.url());
    if (u.port === String(PORT) && !/favicon/.test(u.pathname)) failed.push(`ERR ${u.pathname}`);
  });

  let navError = null;
  try {
    await page.goto(`http://127.0.0.1:${PORT}/${id}/`, { waitUntil: "load", timeout: 45_000 });
  } catch (e) {
    navError = String(e.message).split("\n")[0];
  }
  await page.waitForTimeout(3500);
  await page.mouse.move(640, 400).catch(() => {});
  await page.mouse.wheel(0, 600).catch(() => {});
  await page.waitForTimeout(1200);

  const visible = await page
    .evaluate(() => {
      const big = [...document.querySelectorAll("canvas,img,video,svg,picture,iframe")].filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 80 && r.height > 80;
      }).length;
      const text = (document.body?.innerText ?? "").replace(/\s+/g, " ").trim().length;
      const styled = [...document.querySelectorAll("body *")].filter((el) => {
        const r = el.getBoundingClientRect();
        const s = getComputedStyle(el);
        return r.width > 200 && r.height > 100 && (s.backgroundImage !== "none" || s.backgroundColor !== "rgba(0, 0, 0, 0)");
      }).length;
      return { big, text, styled };
    })
    .catch(() => ({ big: 0, text: 0, styled: 0 }));

  await page.evaluate(() => window.scrollTo(0, 0)).catch(() => {});
  await page.screenshot({ path: path.join(SHOTS, `${id}.jpg`), type: "jpeg", quality: 60 }).catch(() => {});
  await ctx.close();

  // Errors caused by third-party hosts (ad servers, analytics, CORS) say nothing about the component.
  const isExternal = (e) => /blocked by CORS policy|ERR_NAME_NOT_RESOLVED|ERR_BLOCKED_BY|net::ERR_/.test(e) || /https?:\/\/(?!127\.0\.0\.1)/.test(e);
  const external = errors.filter(isExternal);
  let own = errors.filter((e) => !isExternal(e));
  if (external.length) own = own.filter((e) => !/^(TypeError: )?Failed to fetch$/.test(e));

  const blank = visible.big === 0 && visible.text < 3 && visible.styled === 0;
  const status = navError || blank ? "fail" : own.length || failed.length ? "warn" : "pass";
  return { status, blank, errors: [...new Set(own)].slice(0, 5), external: [...new Set(external)].slice(0, 3), failed: [...new Set(failed)].slice(0, 8), navError };
}

// ---------------------------------------------------------------- main

async function processOne(c) {
  const id = c.id;
  const log = path.join(LOGS, `${id}.log`);
  const prev = report.demos[id];
  const entry = { id, at: new Date().toISOString() };

  if (!VERIFY_ONLY) {
    await fs.writeFile(log, `# ${id}\n`);
    const work = path.join(WORK, id);
    await fs.rm(work, { recursive: true, force: true });
    await fs.mkdir(work, { recursive: true });
    const unz = await sh("unzip", ["-q", "-o", path.join(VAULT, `${id}.zip`), "-d", work, "-x", "__MACOSX/*", "*/node_modules/*", "node_modules/*"], { cwd: work, log, timeout: 120_000 });
    if (!unz.ok && !(await fs.readdir(work)).length) return { ...entry, status: "fail", stage: "extract", error: tail(unz.out) };

    const found = await findRoot(work);
    if (!found) return { ...entry, status: "fail", stage: "detect", error: "no index.html or package.json in zip" };

    const built = await buildProject(id, found.root, found.hasPkg, log);
    entry.kind = built.kind;
    if (built.error || !built.out) return { ...entry, status: "fail", stage: "build", error: built.error ?? "build produced no index.html" };

    // Keep a minified-only copy so we can fall back if obfuscation breaks the demo.
    const raw = path.join(RAW, id);
    const dest = path.join(DEMOS_DIR, id);
    await fs.rm(raw, { recursive: true, force: true });
    await fs.rm(dest, { recursive: true, force: true });
    await copyClean(built.out, raw, { skipSource: built.out === found.root && built.kind !== "static" });
    if (found.entry && !(await exists(path.join(raw, "index.html")))) await fs.copyFile(path.join(raw, found.entry), path.join(raw, "index.html"));
    await fs.cp(raw, dest, { recursive: true });
    await protect(raw, { obfuscate: false });
    entry.obfuscatedFiles = await protect(dest, { obfuscate: true });
    entry.obfuscated = entry.obfuscatedFiles > 0;
    entry.bytes = await dirSize(dest);
    // Free disk: dependencies are not needed after the build.
    await fs.rm(path.join(found.root, "node_modules"), { recursive: true, force: true });
  } else {
    Object.assign(entry, prev ?? {});
    if (!(await exists(path.join(DEMOS_DIR, id)))) return { ...entry, status: "fail", stage: "missing" };
  }

  let v = await verify(id);
  if (v.status !== "pass" && entry.obfuscated && (await exists(path.join(RAW, id)))) {
    // Try the minified-only build; keep whichever behaves better.
    const dest = path.join(DEMOS_DIR, id);
    const backup = `${dest}.__obf`;
    await fs.rename(dest, backup);
    await fs.cp(path.join(RAW, id), dest, { recursive: true });
    const v2 = await verify(id);
    const rank = { pass: 0, warn: 1, fail: 2 };
    // Any error that only the obfuscated build has was introduced by obfuscation.
    const introduced = v.errors.some((e) => !v2.errors.includes(e)) || v.failed.some((e) => !v2.failed.includes(e));
    if (rank[v2.status] < rank[v.status] || (rank[v2.status] === rank[v.status] && introduced)) {
      await fs.rm(backup, { recursive: true, force: true });
      v = v2;
      entry.obfuscated = false;
      entry.note = "obfuscation broke this demo; serving minified build";
    } else {
      await fs.rm(dest, { recursive: true, force: true });
      await fs.rename(backup, dest);
    }
  }
  return { ...entry, ...v, stage: "verify" };
}

async function main() {
  for (const d of [WORK, RAW, LOGS, SHOTS, DEMOS_DIR]) await fs.mkdir(d, { recursive: true });
  let todo = library.components.filter((c) => c.hasCode);
  if (ONLY) todo = todo.filter((c) => ONLY.includes(c.id));
  else if (!FORCE && !VERIFY_ONLY) todo = todo.filter((c) => !report.demos[c.id] || report.demos[c.id].stage !== "verify");

  const server = createDemoServer({ frameAncestors: "'self'" }).listen(PORT);
  console.log(`Building ${todo.length} demos with ${JOBS} workers…`);

  let i = 0;
  let done = 0;
  const save = () => fs.writeFile(REPORT, JSON.stringify({ generatedAt: new Date().toISOString(), demos: report.demos }, null, 2) + "\n");
  await Promise.all(
    Array.from({ length: JOBS }, async () => {
      while (i < todo.length) {
        const c = todo[i++];
        let r;
        try {
          r = await processOne(c);
        } catch (e) {
          r = { id: c.id, status: "fail", stage: "crash", error: String(e.message ?? e).slice(0, 300) };
        }
        report.demos[c.id] = r;
        done++;
        console.log(`[${done}/${todo.length}] ${c.id.padEnd(22)} ${r.status.toUpperCase().padEnd(4)} ${r.kind ?? ""} ${r.error ? "· " + r.error.split("\n")[0].slice(0, 90) : ""}`);
        if (done % 5 === 0) await save();
      }
    }),
  );
  await save();
  server.close();
  if (browserP) await (await browserP).close();

  const all = Object.values(report.demos);
  const count = (s) => all.filter((d) => d.status === s).length;
  console.log(`\npass ${count("pass")} · warn ${count("warn")} · fail ${count("fail")}  (of ${all.length})`);
}

main();
