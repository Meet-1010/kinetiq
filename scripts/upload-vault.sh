#!/usr/bin/env bash
# Uploads vault/*.zip as release assets on a PRIVATE GitHub repo, which the download route
# then serves through short-lived signed URLs. Safe to re-run: existing assets are replaced.
#
#   VAULT_REPO=Meet-1010/kinetiq-vault npm run vault:upload
set -euo pipefail

REPO="${VAULT_REPO:-Meet-1010/kinetiq-vault}"
TAG="${VAULT_TAG:-vault}"
DIR="$(cd "$(dirname "$0")/.." && pwd)/vault"

if ! gh repo view "$REPO" >/dev/null 2>&1; then
  echo "Creating private repo $REPO"
  gh repo create "$REPO" --private --description "Kinetiq component source vault (private)" --add-readme
fi

visibility=$(gh repo view "$REPO" --json visibility -q .visibility)
if [ "$visibility" != "PRIVATE" ]; then
  echo "Refusing to upload: $REPO is $visibility. The vault must be private." >&2
  exit 1
fi

if ! gh release view "$TAG" -R "$REPO" >/dev/null 2>&1; then
  gh release create "$TAG" -R "$REPO" --title "Component vault" --notes "Source zips served by the Kinetiq site." --latest=false
fi

shopt -s nullglob
files=("$DIR"/*.zip)
echo "Uploading ${#files[@]} zips to $REPO@$TAG"
for ((i = 0; i < ${#files[@]}; i += 20)); do
  gh release upload "$TAG" -R "$REPO" --clobber "${files[@]:i:20}"
  echo "  $((i + 20 > ${#files[@]} ? ${#files[@]} : i + 20))/${#files[@]}"
done
echo "Done."
