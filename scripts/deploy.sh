#!/usr/bin/env bash
# Deploy the published image to the homelab and prove it landed.
#
#   npm run deploy -- https://jonas.example.com
#   SMOKE_URL=https://jonas.example.com npm run deploy
#
# Deployment is manual by design: the homelab forwards no router ports, so
# GitHub Actions cannot reach it (homelab CLAUDE.md). That makes the publish
# and the deploy two separate events, which is why smoke.yml no longer fires
# itself after a publish — it would test whatever was live *before* this
# script ran. Deploying and smoking belong in one command instead.
#
# The real hostname is deliberately absent here: it arrives as an argument or
# in SMOKE_URL, never in a tracked file (DEPLOY.md §7).
set -euo pipefail

cd "$(dirname "$0")/.."

URL="${1:-${SMOKE_URL:-}}"
HOMELAB="${HOMELAB_DIR:-$HOME/coding/homelab}"
STACK="$HOMELAB/compose/birthday-bash/compose.yaml"
SHA="$(git rev-parse --short HEAD)"

if [ -z "$URL" ]; then
  echo "usage: npm run deploy -- https://jonas.example.com   (or set SMOKE_URL)" >&2
  exit 1
fi
if [ ! -f "$STACK" ]; then
  echo "no birthday-bash stack at $STACK — set HOMELAB_DIR" >&2
  exit 1
fi

# A dirty or unpushed tree means the SHA we are about to demand from the live
# site was never built by CI, and the smoke below would fail with a confusing
# version mismatch rather than the real reason.
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "working tree is dirty — commit before deploying, or the live SHA can't match" >&2
  exit 1
fi
if ! git merge-base --is-ancestor HEAD "origin/$(git rev-parse --abbrev-ref HEAD)" 2>/dev/null; then
  echo "HEAD is not on the remote — push first, or CI has not built this commit yet" >&2
  exit 1
fi

echo "  pull      ghcr.io/tpatzelt/birthday-bash (expecting ${SHA})"
docker compose -f "$STACK" pull -q

echo "  recreate  birthday-bash"
docker compose -f "$STACK" up -d

# Compose returns as soon as the container is started; nginx answering is a
# separate question, and smoking a container that is still booting reads as a
# deploy failure.
printf '  health    '
for _ in $(seq 60); do
  status="$(docker inspect -f '{{.State.Health.Status}}' birthday-bash 2>/dev/null || echo missing)"
  case "$status" in
    healthy) echo "healthy"; break ;;
    missing) echo "container not running"; exit 1 ;;
    *) sleep 1 ;;
  esac
done
[ "${status:-}" = healthy ] || { echo "never became healthy"; exit 1; }

# The real gate. Asserts the live site is serving *this* commit, so a deploy
# that silently kept the old image fails here instead of at the party.
echo "  smoke     ${SHA}"
exec npm run --silent smoke:live -- "$URL" "$SHA"
