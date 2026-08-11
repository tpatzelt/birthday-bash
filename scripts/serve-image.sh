#!/usr/bin/env bash
# Build the production image and serve it on $1 for the E2E run.
#
# The whole point of TESTING.md §7 is that Playwright drives the artifact that
# ships. If Docker is not available (a laptop without the daemon running), fall
# back to serving dist/ with the same nginx config through `npx serve`-style
# static hosting is NOT good enough — say so loudly instead of pretending.
set -euo pipefail

PORT="${1:-8123}"
IMAGE="birthday-bash:e2e"
NAME="birthday-bash-e2e"
SHA="$(git rev-parse --short HEAD 2>/dev/null || echo dev)"

if ! command -v docker >/dev/null 2>&1; then
  echo "docker is required: E2E must run against the shipped image (TESTING.md §7)" >&2
  exit 1
fi

docker rm -f "$NAME" >/dev/null 2>&1 || true
docker build --build-arg "GIT_SHA=${SHA}" -t "$IMAGE" . >&2
docker run --rm --name "$NAME" -p "127.0.0.1:${PORT}:80" "$IMAGE"
