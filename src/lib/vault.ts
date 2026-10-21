import "server-only";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";

// Code zips are never in /public. Two backends:
//  - GitHub release on a PRIVATE repo (production): set VAULT_REPO + VAULT_TOKEN. We resolve the
//    asset and redirect the visitor to GitHub's short-lived signed download URL.
//  - Local ./vault directory (dev / self-hosting).

const remote = () => (process.env.VAULT_REPO && process.env.VAULT_TOKEN ? process.env.VAULT_REPO : null);

let assetCache: { at: number; assets: Map<string, number> } | null = null;

async function releaseAssets(repo: string) {
  if (assetCache && Date.now() - assetCache.at < 10 * 60_000) return assetCache.assets;
  const tag = process.env.VAULT_TAG ?? "vault";
  const headers = {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${process.env.VAULT_TOKEN}`,
    "User-Agent": "kinetiq-library",
  };
  const rel = await fetch(`https://api.github.com/repos/${repo}/releases/tags/${tag}`, { headers, cache: "no-store" });
  if (!rel.ok) {
    const hint =
      rel.status === 404
        ? "token can't see the repo or release: give VAULT_TOKEN Contents read on VAULT_REPO, and check VAULT_TAG"
        : rel.status === 401
          ? "VAULT_TOKEN is invalid or expired"
          : "unexpected GitHub response";
    throw new Error(`vault release lookup failed (${rel.status}): ${hint}`);
  }
  const { id } = (await rel.json()) as { id: number };

  const assets = new Map<string, number>();
  for (let page = 1; ; page++) {
    const res = await fetch(`https://api.github.com/repos/${repo}/releases/${id}/assets?per_page=100&page=${page}`, {
      headers,
      cache: "no-store",
    });
    const batch = (await res.json()) as { id: number; name: string }[];
    for (const a of batch) assets.set(a.name, a.id);
    if (batch.length < 100) break;
  }
  assetCache = { at: Date.now(), assets };
  return assets;
}

export async function zipResponse(id: string, filename: string): Promise<Response> {
  const repo = remote();
  if (repo) {
    const assetId = (await releaseAssets(repo)).get(`${id}.zip`);
    if (!assetId) return new Response("Not found", { status: 404 });
    const res = await fetch(`https://api.github.com/repos/${repo}/releases/assets/${assetId}`, {
      headers: { Accept: "application/octet-stream", Authorization: `Bearer ${process.env.VAULT_TOKEN}`, "User-Agent": "kinetiq-library" },
      redirect: "manual",
      cache: "no-store",
    });
    const location = res.headers.get("location");
    if (!location) return new Response("Download unavailable", { status: 502 });
    return new Response(null, { status: 302, headers: { Location: location, "Cache-Control": "no-store" } });
  }

  const file = path.join(process.cwd(), "vault", `${id}.zip`);
  const info = await stat(file).catch(() => null);
  if (!info) return new Response("Not found", { status: 404 });
  return new Response(Readable.toWeb(createReadStream(file)) as ReadableStream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Length": String(info.size),
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
