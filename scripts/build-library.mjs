#!/usr/bin/env node
// Scans the raw component folders (Category/N/{code.zip, preview video, instruction.txt}),
// reads metadata out of each zip, compresses preview videos + posters into public/previews,
// stages code zips into vault/ (never public) and writes src/data/library.json.
//
//   node scripts/build-library.mjs "/path/to/Meet's UI Library" [--force] [--jobs=6]

import { execFile, spawn } from "node:child_process";
import fs from "node:fs/promises";
import { constants as fsc } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = process.argv.find((a, i) => i > 1 && !a.startsWith("--"));
const FORCE = process.argv.includes("--force");
const META_ONLY = process.argv.includes("--meta-only");
const JOBS = Number(process.argv.find((a) => a.startsWith("--jobs="))?.split("=")[1] ?? Math.max(2, os.cpus().length - 2));

if (!SRC) {
  console.error('usage: node scripts/build-library.mjs "<source dir>" [--force] [--jobs=N]');
  process.exit(1);
}

const PREVIEWS = path.join(ROOT, "public", "previews");
const VAULT = path.join(ROOT, "vault");
const OUT = path.join(ROOT, "src", "data", "library.json");

// Folder name -> display metadata. Order here is the sidebar order.
const CATEGORIES = [
  { folder: "Scroll Animation", slug: "scroll", name: "Scroll Animations", singular: "Scroll Animation", blurb: "Scroll-driven reveals, pinned scenes and parallax storytelling." },
  { folder: "Mouse Effects", slug: "mouse", name: "Mouse Effects", singular: "Mouse Effect", blurb: "Cursor trails, magnetic fields and pointer-reactive canvases." },
  { folder: "Page Transitions", slug: "page-transitions", name: "Page Transitions", singular: "Page Transition", blurb: "Route changes that feel like cuts in a film." },
  { folder: "Grid Animations", slug: "grid", name: "Grid Animations", singular: "Grid Animation", blurb: "Galleries and layouts that reshuffle, expand and flow." },
  { folder: "Sliders", slug: "sliders", name: "Sliders", singular: "Slider", blurb: "Carousels, distortion sliders and draggable reels." },
  { folder: "Hero Animations", slug: "hero", name: "Hero Animations", singular: "Hero Animation", blurb: "Above-the-fold openers built to stop the scroll." },
  { folder: "Webgl & ThreeJS Effects", slug: "webgl", name: "WebGL Shaders", singular: "WebGL Effect", blurb: "Shaders, Three.js scenes and GPU-powered visuals." },
  { folder: "Background Animations", slug: "background", name: "Background Animations", singular: "Background Animation", blurb: "Living backdrops: gradients, particles and noise fields." },
  { folder: "Navigation Menus", slug: "navigation", name: "Navigation Menus", singular: "Navigation Menu", blurb: "Menus with choreography, from overlays to morphing bars." },
  { folder: "Hover Effects", slug: "hover", name: "Hover Effects", singular: "Hover Effect", blurb: "Micro-interactions that reward every pointer move." },
  { folder: "Text Animations", slug: "text", name: "Text Animations", singular: "Text Animation", blurb: "Split, scramble, morph and reveal typography." },
  { folder: "3D Animation", slug: "3d", name: "3D Animations", singular: "3D Animation", blurb: "Depth, perspective and real-time 3D in the browser." },
  { folder: "SVG Animations", slug: "svg", name: "SVG Animations", singular: "SVG Animation", blurb: "Path drawing, morphing and vector motion." },
  { folder: "Physics Effects", slug: "physics", name: "Physics Effects", singular: "Physics Effect", blurb: "Gravity, collisions and springy, tactile UI." },
];

const STACK_TAGS = [
  ["gsap", "GSAP"],
  ["three", "Three.js"],
  ["@react-three/fiber", "R3F"],
  ["@react-three/drei", "Drei"],
  ["lenis", "Lenis"],
  ["@studio-freight/lenis", "Lenis"],
  ["motion", "Motion"],
  ["framer-motion", "Motion"],
  ["ogl", "OGL"],
  ["pixi.js", "PixiJS"],
  ["matter-js", "Matter.js"],
  ["locomotive-scroll", "Locomotive"],
  ["@barba/core", "Barba"],
  ["swiper", "Swiper"],
  ["split-type", "SplitType"],
  ["splitting", "Splitting"],
  ["p5", "p5.js"],
  ["curtainsjs", "Curtains"],
  ["animejs", "Anime.js"],
  ["tailwindcss", "Tailwind"],
  ["typescript", "TypeScript"],
  ["@tweenjs/tween.js", "Tween.js"],
  ["lil-gui", "lil-gui"],
];

const GENERIC = new Set([
  "files", "file", "dist", "src", "code", "project", "app", "my-app", "vite-project", "react-app", "demo", "main",
  "starter", "template", "build", "public", "untitled", "untitled folder", "untitled-folder", "document", "index",
  "website", "component demo", "component-demo", "new", "test", "final", "fiels", "web", "site", "home", "page",
  "codegrid", "codrops", "animation", "effect", "copy", "folder", "new folder",
]);

const humanize = (s) =>
  s
    .replace(/\.(zip|html?)$/i, "")
    .replace(/[-_](main|master|demo|dist|build)$/i, "")
    .replace(/^(codrops|codegrid|cg)[-_ ]+/i, "")
    .replace(/[-_ ]+codrops$/i, "")
    .replace(/^\d+[-_ .]+/, "")
    .replace(/[-_.]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map((w) => (w.length <= 3 && /^(ui|3d|svg|css|js|gl|r3f|ogl|webgl)$/i.test(w) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()))
    .join(" ")
    .replace(/\bWebgl\b/g, "WebGL")
    .replace(/\bWeb G[Ll]\b/g, "WebGL")
    .replace(/\bThreejs\b/gi, "Three.js")
    .replace(/\bThree JS\b/g, "Three.js")
    .replace(/\bGsap\b/g, "GSAP")
    .replace(/\b(Ii|Iii|Iv)$/, (m) => m.toUpperCase())
    .replace(/\s+(Nextjs|Javascript|\(java Script\))$/i, "")
    .replace(/[\s|·:,-]+$/, "")
    .trim();

const decode = (s) =>
  s
    ?.replace(/&mdash;|&#8212;/g, "—")
    .replace(/&ndash;/g, "–")
    .replace(/&amp;/g, "&")
    .replace(/&#?\w+;/g, "")
    .trim();

// Starter/boilerplate names that say nothing about the effect.
const BOILERPLATE = /^(home ?page( ii)?|framework|component|text demo|webpack.*|.*starter|.*boil[d]?erplate|made with gsap|sketch \d+|use r3f assets|gsap three\.?js|shopify|tutorial grid|nav menu)$/i;

const meaningful = (s) => {
  if (!s) return false;
  const k = s
    .toLowerCase()
    .replace(/[-_](main|master)$/, "")
    .replace(/^(codrops|codegrid|cg)[-_ ]+/, "")
    .replace(/^\d+[-_ .]+/, "")
    .trim();
  return k.length > 2 && !GENERIC.has(k) && !/^(vite|react|vue|next|create)([ +-]|$)/.test(k) && !/^\d+$/.test(k) && !/^(document|untitled)\b/.test(k);
};

/** Prefer a candidate that reads as several words ("Infinite Gallery") over a mashed one ("Infinitegallery"). */
function pickTitle(candidates) {
  const ok = candidates
    .map(decode)
    .filter(meaningful)
    .map(humanize)
    .filter((t) => t.length > 2 && !BOILERPLATE.test(t));
  return ok.find((t) => t.split(" ").length >= 2 && t.length <= 42) ?? ok.find((t) => t.length <= 42 && t.length >= 5) ?? null;
}

async function listZip(zip) {
  const { stdout } = await run("unzip", ["-Z1", zip], { maxBuffer: 64 << 20 });
  return stdout.split("\n").filter((e) => e && !e.startsWith("__MACOSX") && !e.includes("/.DS_Store") && !e.includes("node_modules/"));
}

async function readFromZip(zip, entry) {
  try {
    const { stdout } = await run("unzip", ["-p", zip, entry], { maxBuffer: 16 << 20 });
    return stdout;
  } catch {
    return "";
  }
}

const depth = (p) => p.split("/").filter(Boolean).length;
const shallowest = (entries, re) => entries.filter((e) => re.test(e)).sort((a, b) => depth(a) - depth(b) || a.length - b.length)[0];

async function zipMeta(zip) {
  const entries = await listZip(zip);
  const files = entries.filter((e) => !e.endsWith("/"));
  const roots = [...new Set(files.map((e) => e.split("/")[0]))];
  const rootFolder = roots.length === 1 && files.every((f) => f.includes("/")) ? roots[0] : null;

  const pkgPath = shallowest(files, /(^|\/)package\.json$/);
  let pkg = {};
  if (pkgPath) {
    try {
      pkg = JSON.parse(await readFromZip(zip, pkgPath));
    } catch {}
  }
  const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };

  const htmlPath = shallowest(files, /(^|\/)index\.html?$/);
  const html = htmlPath ? await readFromZip(zip, htmlPath) : "";
  const htmlTitle = html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim();

  const readmePath = shallowest(files, /(^|\/)readme(\.md|\.txt)?$/i);
  const readme = readmePath ? await readFromZip(zip, readmePath) : "";
  const readmeH1 = readme.match(/^#\s+(.+)$/m)?.[1]?.replace(/[*_`[\]]/g, "").trim();
  const isDemoLink = (u) =>
    !/\.(jpe?g|png|gif|webp|svg|mp4)(\?|$)/i.test(u) &&
    !/github\.com\/(vercel|vitejs|facebook|withastro|sveltejs|nuxt|shadcn|tailwindlabs)\b/i.test(u) &&
    !/\.(js|css)(\?|$)/i.test(u) &&
    !/wp-content|create-next-app|user-attachments|adpacks|\/docs\b/i.test(u);
  const source =
    [
      ...readme.matchAll(/https?:\/\/(?:tympanus\.net\/(?:codrops|Development|Tutorials)|codepen\.io|github\.com)[^\s)>\]"']*/gi),
      ...html.matchAll(/https?:\/\/(?:tympanus\.net\/(?:codrops|Development)|codepen\.io\/[^/]+\/pen)[^\s)>\]"']*/gi),
    ]
      .map((m) => m[0].replace(/[.,]+$/, ""))
      .find(isDemoLink) ?? null;
  const hasLicense = files.some((f) => /(^|\/)licen[cs]e(\.md|\.txt)?$/i.test(f));

  let framework = "Vanilla JS";
  if (deps.next) framework = "Next.js";
  else if (deps.astro) framework = "Astro";
  else if (deps.nuxt) framework = "Nuxt";
  else if (deps.svelte) framework = "Svelte";
  else if (deps.vue) framework = "Vue";
  else if (deps.react) framework = "React";
  const bundler = deps.vite ? "Vite" : deps.parcel || deps["parcel-bundler"] ? "Parcel" : deps.webpack ? "Webpack" : null;

  const tags = [];
  for (const [dep, tag] of STACK_TAGS) if (deps[dep] && !tags.includes(tag)) tags.push(tag);
  const lower = (html + " " + files.join(" ")).toLowerCase();
  if (!tags.includes("GSAP") && /gsap/.test(lower)) tags.push("GSAP");
  if (!tags.includes("Three.js") && /three(\.module)?(\.min)?\.js|three@/.test(lower)) tags.push("Three.js");
  if (files.some((f) => /\.(glsl|frag|vert|vs|fs)$/i.test(f)) || /gl_fragcolor|precision mediump float/.test(html.toLowerCase())) tags.push("GLSL");
  if (files.some((f) => /\.tsx?$/.test(f)) && !tags.includes("TypeScript")) tags.push("TypeScript");

  const exts = files.map((f) => f.split(".").pop().toLowerCase());
  const codeFiles = exts.filter((e) => ["js", "jsx", "ts", "tsx", "vue", "svelte", "css", "scss", "html", "glsl", "frag", "vert", "astro"].includes(e)).length;

  const title = pickTitle([
    pkg.name?.replace(/^@[^/]+\//, ""),
    rootFolder,
    readmeH1,
    htmlTitle?.split(/\s+[|·–—-]\s+/)[0],
    path.basename(zip) !== "code.zip" ? path.basename(zip) : null,
  ]);

  return {
    title,
    framework,
    bundler,
    tags,
    scripts: Object.keys(pkg.scripts ?? {}),
    hasPackageJson: Boolean(pkgPath),
    fileCount: files.length,
    codeFiles,
    files: files.filter((f) => !/\.(png|jpe?g|webp|gif|avif|mp4|webm|glb|gltf|hdr|woff2?|ttf|otf|ico|svg|mp3|wav|lock|map)$/i.test(f) && !/(pnpm-lock|package-lock|yarn\.lock)/.test(f)).slice(0, 40),
    source,
    hasLicense,
  };
}

async function probe(video) {
  try {
    const { stdout } = await run("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height:format=duration", "-of", "json", video]);
    const j = JSON.parse(stdout);
    return { width: j.streams?.[0]?.width ?? 16, height: j.streams?.[0]?.height ?? 9, duration: Number(j.format?.duration ?? 0) };
  } catch {
    return { width: 16, height: 9, duration: 0 };
  }
}

const exists = (p) => fs.access(p).then(() => true, () => false);

function ff(args) {
  return new Promise((resolve, reject) => {
    const p = spawn("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args], { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    p.stderr.on("data", (d) => (err += d));
    p.on("close", (code) => (code === 0 ? resolve() : reject(new Error(err.trim() || `ffmpeg exited ${code}`))));
  });
}

async function encodePreview(input, id, info) {
  const mp4 = path.join(PREVIEWS, `${id}.mp4`);
  const poster = path.join(PREVIEWS, `${id}.jpg`);
  // 720px wide is plenty for cards and the detail player; cap long recordings at 20s.
  const scale = "scale='min(960,iw)':-2:flags=lanczos,fps=30";
  if (FORCE || !(await exists(mp4))) {
    await ff(["-i", input, "-t", "20", "-vf", scale, "-c:v", "libx264", "-preset", "slow", "-crf", "28", "-profile:v", "high", "-pix_fmt", "yuv420p", "-an", "-movflags", "+faststart", mp4]);
  }
  if (FORCE || !(await exists(poster))) {
    const at = Math.min(1.2, Math.max(0, info.duration / 3)).toFixed(2);
    await ff(["-ss", at, "-i", input, "-frames:v", "1", "-vf", "scale='min(960,iw)':-2:flags=lanczos", "-q:v", "4", poster]);
  }
}

async function pool(items, n, fn) {
  let i = 0;
  let done = 0;
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (i < items.length) {
        const item = items[i++];
        await fn(item);
        done++;
        if (done % 10 === 0 || done === items.length) process.stdout.write(`  encoded ${done}/${items.length}\n`);
      }
    }),
  );
}

async function main() {
  await fs.mkdir(PREVIEWS, { recursive: true });
  await fs.mkdir(VAULT, { recursive: true });
  await fs.mkdir(path.dirname(OUT), { recursive: true });

  const components = [];
  const problems = [];

  for (const cat of CATEGORIES) {
    const dir = path.join(SRC, cat.folder);
    if (!(await exists(dir))) {
      problems.push(`missing category folder: ${cat.folder}`);
      continue;
    }
    const nums = (await fs.readdir(dir, { withFileTypes: true }))
      .filter((d) => d.isDirectory() && /^\d+$/.test(d.name))
      .map((d) => Number(d.name))
      .sort((a, b) => a - b);

    for (const n of nums) {
      const folder = path.join(dir, String(n));
      const names = (await fs.readdir(folder)).filter((f) => !f.startsWith("."));
      const zip = names.find((f) => f.toLowerCase().endsWith(".zip"));
      const video = names.find((f) => /\.(mp4|webm|mov)$/i.test(f));
      const still = names.find((f) => /\.(webp|png|jpe?g|gif)$/i.test(f));
      const id = `${cat.slug}-${n}`;

      if (!zip) problems.push(`${cat.folder}/${n}: no code zip`);
      if (!video) problems.push(`${cat.folder}/${n}: no preview video${still ? " (has still image)" : ""}`);

      const meta = zip ? await zipMeta(path.join(folder, zip)) : null;
      const info = video ? await probe(path.join(folder, video)) : { width: 16, height: 9, duration: 0 };

      if (zip) {
        const dest = path.join(VAULT, `${id}.zip`);
        if (FORCE || !(await exists(dest))) await fs.copyFile(path.join(folder, zip), dest, fsc.COPYFILE_FICLONE);
      }
      if (!video && still) {
        await ff(["-i", path.join(folder, still), "-vf", "scale='min(960,iw)':-2", "-q:v", "4", path.join(PREVIEWS, `${id}.jpg`)]);
      }

      const zipSize = zip ? (await fs.stat(path.join(folder, zip))).size : 0;
      components.push({
        id,
        number: n,
        category: cat.slug,
        title: meta?.title ?? `${cat.singular} ${String(n).padStart(2, "0")}`,
        hasVideo: Boolean(video),
        aspect: +(info.width / info.height).toFixed(4),
        duration: +Math.min(20, info.duration).toFixed(2),
        hasCode: Boolean(zip),
        zipSize,
        framework: meta?.framework ?? null,
        bundler: meta?.bundler ?? null,
        tags: meta?.tags ?? [],
        scripts: meta?.scripts ?? [],
        hasPackageJson: meta?.hasPackageJson ?? false,
        fileCount: meta?.fileCount ?? 0,
        files: meta?.files ?? [],
        source: meta?.source ?? null,
        hasLicense: meta?.hasLicense ?? false,
        _video: video ? path.join(folder, video) : null,
        _info: info,
      });
    }
  }

  // Hand-curated fixes win over anything inferred: { "scroll-12": { "title": "…", "tags": […] } }
  const overrides = JSON.parse(await fs.readFile(path.join(ROOT, "src", "data", "overrides.json"), "utf8").catch(() => "{}"));
  for (const c of components) Object.assign(c, overrides[c.id] ?? {});

  // Disambiguate repeated titles inside a category ("Infinite Slider", "Infinite Slider II").
  const seen = new Map();
  for (const c of components) {
    const key = `${c.category}:${c.title.toLowerCase()}`;
    const count = (seen.get(key) ?? 0) + 1;
    seen.set(key, count);
    if (count > 1) c.title = `${c.title} ${["", "", "II", "III", "IV", "V", "VI", "VII", "VIII"][count] ?? count}`;
  }

  console.log(`Found ${components.length} components.${META_ONLY ? "" : ` Encoding previews with ${JOBS} workers…`}`);
  const failures = [];
  if (!META_ONLY) await pool(
    components.filter((c) => c._video),
    JOBS,
    (c) => encodePreview(c._video, c.id, c._info).catch((e) => failures.push(`${c.id}: ${e.message}`)),
  );

  const categories = CATEGORIES.map(({ folder, ...c }) => ({ ...c, count: components.filter((x) => x.category === c.slug).length })).filter((c) => c.count);
  const data = {
    generatedAt: new Date().toISOString(),
    total: components.length,
    categories,
    components: components.map(({ _video, _info, ...c }) => c),
  };
  await fs.writeFile(OUT, JSON.stringify(data, null, 2) + "\n");

  console.log(`\nWrote ${path.relative(ROOT, OUT)} (${components.length} components in ${categories.length} categories)`);
  if (problems.length) console.log(`\nNotes:\n  ${problems.join("\n  ")}`);
  if (failures.length) {
    console.log(`\nEncode failures:\n  ${failures.join("\n  ")}`);
    process.exitCode = 1;
  }
}

main();
