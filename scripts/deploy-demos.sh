#!/usr/bin/env bash
# Deploys demos/ to Cloudflare Pages (separate origin from the site).
# One-time: `npx wrangler login`, then set FRAME_ANCESTORS in the Pages project settings.
#
#   npm run demos:deploy
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PROJECT="${DEMO_PAGES_PROJECT:-kinetiq-demos}"

too_big=$(find "$ROOT/demos" -type f -size +25M)
if [ -n "$too_big" ]; then
  echo "Cloudflare Pages rejects files over 25 MiB:" >&2
  echo "$too_big" >&2
  exit 1
fi

cp "$ROOT/scripts/demo-worker.js" "$ROOT/demos/_worker.js"
npx wrangler pages project create "$PROJECT" --production-branch main 2>/dev/null || true
npx wrangler pages deploy "$ROOT/demos" --project-name "$PROJECT" --branch main --commit-dirty=true
rm -f "$ROOT/demos/_worker.js"
