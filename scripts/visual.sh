#!/usr/bin/env bash
# Visual regression run (TESTING.md §8).
#
# Screenshots are compared pixel by pixel, so the browser build and its font
# rasterisation have to be identical everywhere the suite runs. That rules out
# the host: baselines generated on a workstation are noise to everybody else.
# Instead the browsers run inside the official Playwright image pinned to the
# exact @playwright/test version from package-lock.json — the same image CI
# uses, so one set of committed baselines is valid in both places.
#
#   bash scripts/visual.sh                     # check against the baselines
#   bash scripts/visual.sh --update-snapshots  # regenerate them
#
# The app itself is still the production nginx image (TESTING.md §7); only the
# browser moves into a container.
set -euo pipefail

cd "$(dirname "$0")/.."

PORT="${VISUAL_PORT:-8124}"
APP_NAME="birthday-bash-visual"
PW_VERSION="$(node -p "require('@playwright/test/package.json').version")"
PW_IMAGE="mcr.microsoft.com/playwright:v${PW_VERSION}-noble"
SHA="$(git rev-parse --short HEAD 2>/dev/null || echo dev)"

if ! command -v docker >/dev/null 2>&1; then
  echo "docker is required: the browsers run in ${PW_IMAGE} so baselines are portable" >&2
  exit 1
fi

cleanup() { docker rm -f "$APP_NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT
cleanup

docker build --build-arg "GIT_SHA=${SHA}" -t birthday-bash:visual . >&2
docker run -d --rm --name "$APP_NAME" -p "127.0.0.1:${PORT}:80" birthday-bash:visual >/dev/null

for _ in $(seq 60); do
  if curl -fsS "http://127.0.0.1:${PORT}/index.html" >/dev/null 2>&1; then break; fi
  sleep 1
done

# --network host lets the containerised browser reach the app container's
# published port. --user keeps the snapshots that get written owned by you and
# not by root; HOME must then point somewhere writable.
docker run --rm --network host \
  --user "$(id -u):$(id -g)" \
  -v "$PWD:/work" -w /work \
  -e HOME=/tmp \
  -e VISUAL=1 \
  -e "E2E_BASE_URL=http://127.0.0.1:${PORT}" \
  -e CI="${CI:-}" \
  "$PW_IMAGE" \
  npx playwright test tests/e2e/visual.spec.ts "$@"
