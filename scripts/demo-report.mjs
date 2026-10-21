#!/usr/bin/env node
// Renders src/data/demos.json into reports/demo-report.html: one card per component with its
// headless-Chrome screenshot, build type, auto-repairs applied, and any errors seen.
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lib = JSON.parse(await fs.readFile(path.join(ROOT, "src/data/library.json"), "utf8"));
const { demos, generatedAt } = JSON.parse(await fs.readFile(path.join(ROOT, "src/data/demos.json"), "utf8"));
const OUT = path.join(ROOT, "reports", "demo-report.html");
await fs.mkdir(path.dirname(OUT), { recursive: true });

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const cats = Object.fromEntries(lib.categories.map((c) => [c.slug, c.name]));
const rows = lib.components.map((c) => ({ c, d: demos[c.id] ?? { status: "fail", stage: "not built" } }));
const count = (s) => rows.filter((r) => r.d.status === s).length;
const fixed = rows.filter((r) => r.d.fixes?.length).length;

const card = ({ c, d }) => {
  const problems = [
    d.error &&
      `<b>Build:</b> ${esc(
        d.error
          .split("\n")
          .filter((l) => l.trim() && !/complete log of this run|^\s+at |\[Getter\/Setter\]|^npm error\s*$/.test(l))
          .slice(-2)
          .join(" · ")
          .replace(/\/Users\/[^ ]*?\/\.cache\/demos\/work\//g, "")
          .slice(0, 300),
      )}`,
    d.navError && `<b>Load:</b> ${esc(d.navError)}`,
    d.blank && "<b>Blank page</b> after load + scroll",
    ...(d.errors ?? []).map((e) => `<b>JS:</b> ${esc(e)}`),
    ...(d.failed ?? []).map((e) => `<b>Missing:</b> ${esc(e)}`),
  ].filter(Boolean);
  return `<article class="card ${d.status}" data-status="${d.status}" data-cat="${c.category}" data-fixed="${d.fixes?.length ? 1 : 0}">
  <a class="shot" href="http://localhost:3100/${c.id}/" target="_blank" rel="noreferrer">
    <img loading="lazy" src="../.cache/demos/shots/${c.id}.jpg" alt="" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'noshot',textContent:'no screenshot'}))">
  </a>
  <div class="body">
    <div class="top"><span class="badge">${d.status}</span><span class="id">${c.id}</span><span class="kind">${esc(d.kind ?? "")}</span></div>
    <h3>${esc(c.title)}</h3>
    <p class="cat">${esc(cats[c.category])}${d.obfuscated ? " · obfuscated" : d.note ? " · minified only" : ""}</p>
    ${d.fixes?.length ? `<ul class="fixes">${d.fixes.map((f) => `<li>${esc(f)}</li>`).join("")}</ul>` : ""}
    ${problems.length ? `<ul class="problems">${problems.slice(0, 6).map((p) => `<li>${p}</li>`).join("")}</ul>` : ""}
  </div>
</article>`;
};

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Kinetiq demo report</title>
<style>
:root{--bg:#0c0a09;--panel:#171310;--line:rgba(255,228,210,.1);--text:#f5efea;--muted:#9c918a;--pass:#34d399;--warn:#fbbf24;--fail:#f87171;--accent:#ff6b35}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:14px/1.5 Inter,system-ui,sans-serif}
header{position:sticky;top:0;z-index:2;background:rgba(12,10,9,.92);backdrop-filter:blur(10px);border-bottom:1px solid var(--line);padding:16px 24px}
h1{margin:0;font-size:20px}.sub{color:var(--muted);font-size:13px;margin-top:2px}
.stats{display:flex;gap:10px;flex-wrap:wrap;margin-top:12px}
.stats button{background:var(--panel);border:1px solid var(--line);color:var(--text);border-radius:999px;padding:6px 14px;font:inherit;cursor:pointer}
.stats button.on{border-color:var(--accent);color:var(--accent)}
.stats b{font-variant-numeric:tabular-nums}
main{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:16px;padding:20px 24px}
.card{background:var(--panel);border:1px solid var(--line);border-radius:16px;overflow:hidden}
.shot{display:block;aspect-ratio:16/10;background:#000}.shot img,.noshot{width:100%;height:100%;object-fit:cover;display:grid;place-items:center;color:var(--muted)}
.body{padding:12px 14px 14px}.top{display:flex;gap:8px;align-items:center;font-size:11px;font-family:ui-monospace,monospace;color:var(--muted)}
.badge{text-transform:uppercase;font-weight:700;padding:2px 8px;border-radius:999px;background:rgba(255,255,255,.06)}
.pass .badge{color:var(--pass)}.warn .badge{color:var(--warn)}.fail .badge{color:var(--fail)}.kind{margin-left:auto}
h3{margin:6px 0 0;font-size:15px}.cat{margin:0;color:var(--muted);font-size:12px}
ul{margin:8px 0 0;padding-left:16px;font-size:12px}.fixes{color:#fdba74}.problems{color:#d6cfc9;word-break:break-word}.problems b{color:var(--muted);font-weight:600}
</style></head><body>
<header><h1>Kinetiq · live demo report</h1>
<div class="sub">Every component built from its zip and opened in headless Chrome · ${esc(new Date(generatedAt).toLocaleString())} · screenshots link to the local demo server (npm run demos:serve)</div>
<div class="stats">
<button class="on" data-f="all">All <b>${rows.length}</b></button>
<button data-f="pass">✅ Pass <b>${count("pass")}</b></button>
<button data-f="warn">⚠️ Runs with errors <b>${count("warn")}</b></button>
<button data-f="fail">❌ Not working <b>${count("fail")}</b></button>
<button data-f="fixed">🔧 Auto-repaired <b>${fixed}</b></button>
</div></header>
<main>${rows.sort((a, b) => ({ fail: 0, warn: 1, pass: 2 })[a.d.status] - ({ fail: 0, warn: 1, pass: 2 })[b.d.status]).map(card).join("\n")}</main>
<script>
document.querySelectorAll('.stats button').forEach(b=>b.onclick=()=>{document.querySelectorAll('.stats button').forEach(x=>x.classList.toggle('on',x===b));const f=b.dataset.f;
document.querySelectorAll('.card').forEach(c=>c.style.display=(f==='all'||c.dataset.status===f||(f==='fixed'&&c.dataset.fixed==='1'))?'':'none')});
</script></body></html>`;

await fs.writeFile(OUT, html);
console.log(`Wrote ${path.relative(ROOT, OUT)}: pass ${count("pass")} · warn ${count("warn")} · fail ${count("fail")} · auto-repaired ${fixed}`);
