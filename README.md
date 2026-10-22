# Kinetiq

**Motion components, ready to ship.** A curated library of 300+ scroll, WebGL, hover, text and
transition effects. Every component plays live on the site, and the full source unlocks with a GitHub star.

## How it works

| Piece | Where |
| --- | --- |
| Raw collection (`Category/N/{code.zip, video, instruction.txt}`) | `~/MEET/Courses/Meet's UI Library` |
| Ingestion: metadata, compressed previews, vault copy | `scripts/build-library.mjs` |
| Manifest the site renders from | `src/data/library.json` |
| Compressed previews + posters (public) | `public/previews/` |
| Code zips (**never public**, gitignored) | `vault/` locally, private GitHub release in prod |
| Star gate: GitHub OAuth, encrypted session, live star check | `src/lib/{github,session,access}.ts` |
| Gated download | `src/app/api/download/[id]/route.ts` |

## Develop

```bash
npm install
npm run library:build -- "/Users/meetchauhan/MEET/Courses/Meet's UI Library"   # add --meta-only to skip video encoding
npm run dev
```

Without OAuth env vars, local dev runs in **dev-open** mode: the gate is open so you can test downloads.
In production a missing config never opens the gate; downloads show "opening soon" instead.

## Live demos

```bash
npm run demos:build      # build + verify every component (resumable; --only=id,id --force to redo)
npm run demos:serve      # serve demos/ on http://localhost:3100
```

Each zip is built with its own tool (Vite, Next static export, CRA, Parcel, Astro, or copied as-is),
then published to `demos/<id>` with **only production output**: no package.json, README, configs,
`src/` or source maps; JS minified and lightly obfuscated. Every demo is then opened in headless Chrome
and graded `pass` / `warn` (runs, logs errors) / `fail` (build error or blank page) into
`src/data/demos.json`. Only pass/warn demos get a "Try it live" button. Install scripts are disabled
for all dependency installs.

Bugs in a specific original project that no generic rule can catch go in `scripts/demo-patches.json`
as exact find/replace pairs with a reason. They're applied to a copy of the source before building
(the zips are never modified), and every applied patch shows up in the demo report.

Demos must be hosted on a different origin than the site; `demo-server.mjs` also redirects
root-absolute asset paths back under the right demo and sets `frame-ancestors`.

## Adding components

Drop a new folder `Category/N/` with `code.zip` and a preview video into the collection, then re-run
`npm run library:build`. Existing previews are skipped, so only new ones get encoded. To add a new category,
add it to `CATEGORIES` in `scripts/build-library.mjs`.

## Deploy (Vercel)

1. Create the public repo people will star (default `Meet-1010/kinetiq`) and push this project to it.
2. Create a GitHub OAuth App with callback `https://<domain>/api/auth/callback`.
3. Upload the vault to a **private** repo release: `npm run vault:upload` (uses your `gh` login).
4. Create a fine-grained PAT with read-only *Contents* access to that private repo only.
5. Set the env vars from `.env.example` in Vercel and deploy.

## Credits

Many components started as open-source demos (Codrops, CodePen, GitHub). Each zip keeps its original
license/README, and the site links the original demo where one was found.
