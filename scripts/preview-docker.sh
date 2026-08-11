#!/usr/bin/env bash
# Build and run the real shipped image on :8080.
set -euo pipefail

PORT="${1:-8080}"
SHA="$(git rev-parse --short HEAD 2>/dev/null || echo dev)"

docker build --build-arg "GIT_SHA=${SHA}" -t birthday-bash:preview .
echo
echo "  → http://localhost:${PORT}   (Ctrl-C to stop)"
echo "  → http://localhost:${PORT}/?skip=1   (the party escape hatch)"
echo
docker run --rm -p "${PORT}:80" --name birthday-bash-preview birthday-bash:preview
