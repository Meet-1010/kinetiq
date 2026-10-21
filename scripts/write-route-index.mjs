#!/usr/bin/env node
// Writes src/data/routes.json — just the valid ids — so src/proxy.ts can 404 unknown URLs
// without bundling the full library manifest. Run after library:build / demos:build.
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = async (f) => JSON.parse(await fs.readFile(path.join(ROOT, "src/data", f), "utf8").catch(() => "{}"));
const lib = await read("library.json");
const { demos = {} } = await read("demos.json");

const routes = {
  components: lib.components.map((c) => c.id),
  categories: lib.categories.map((c) => c.slug),
  live: Object.values(demos)
    .filter((d) => d.status !== "fail")
    .map((d) => d.id),
};
await fs.writeFile(path.join(ROOT, "src/data/routes.json"), JSON.stringify(routes) + "\n");
console.log(`routes.json: ${routes.components.length} components, ${routes.categories.length} categories, ${routes.live.length} live`);
