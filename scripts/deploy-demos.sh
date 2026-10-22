#!/usr/bin/env bash
# Deploys demos/ to Cloudflare (Worker + static assets) — a separate origin from the site.
# One-time: `npx wrangler login`. Embedding sites are set in deploy/demos/wrangler.jsonc (FRAME_ANCESTORS).
#
#   npm run demos:deploy
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

too_big=$(find "$ROOT/demos" -type f -size +25M)
if [ -n "$too_big" ]; then
  echo "Cloudflare rejects asset files over 25 MiB:" >&2
  echo "$too_big" >&2
  exit 1
fi

node "$ROOT/scripts/demo-server.mjs" --write-index
npx wrangler deploy --config "$ROOT/deploy/demos/wrangler.jsonc"
