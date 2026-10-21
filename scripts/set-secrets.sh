#!/usr/bin/env bash
# Stores the two private production secrets in Vercel. Values are typed at a hidden prompt,
# never echoed, never written to disk or shell history.
#
#   npm run secrets
set -euo pipefail
cd "$(dirname "$0")/.."

put() {
  local name="$1" label="$2" value
  read -r -s -p "$label: " value
  echo
  if [ -z "$value" ]; then
    echo "  skipped $name (empty)"
    return
  fi
  npx -y vercel@65.0.0 env rm "$name" production -y >/dev/null 2>&1 || true
  printf '%s' "$value" | npx -y vercel@65.0.0 env add "$name" --environment production 2>&1 | grep -E "Added|Error" | sed 's/^/  /'
}

put GITHUB_CLIENT_SECRET "GitHub OAuth app Client Secret"
put VAULT_TOKEN "Vault token (fine-grained PAT, Contents read-only on kinetiq-vault)"
echo "Done. Tell Claude to redeploy and test."
