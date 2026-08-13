# Deployment — the artifact this repo produces

This repo's deliverable is **one static container image** in GHCR. Where that
image runs is deliberately out of scope here: it needs no volume, no env, no
network peers and no runtime configuration, so anything that can run a
container can serve it. Keeping the hosting out of this repo is what makes the
image the only contract — CI can therefore test everything this repo is
responsible for, without a deploy target existing.

```
GitHub push (main)
   └─ ci.yml (must be green)
        └─ build-and-publish.yml
             └─ ghcr.io/tpatzelt/birthday-bash:latest + :sha-<short>
                          │
                    docker run -p 80 …  ──► https://jonas.example.com
```

`example.com` stands in for the real domain throughout. **Never write the real
domain, LAN IPs, or any hosting detail into a tracked file** — see §4.

## 1. The image

Static output served by nginx. Multi-stage, small, no runtime environment.

```
FROM node:22-alpine AS build      # npm ci && npm run build -> /app/dist
FROM nginx:1.27-alpine            # dist -> /usr/share/nginx/html + nginx.conf
```

Notes that matter:

- **Pin the base images** to Renovate-parsable tags (`1.27-alpine`, not
  `alpine`). A tag Renovate can't order is a tag that silently rots for years.
- nginx config: long `immutable` cache on hashed assets, **`no-cache` on
  `index.html` and `sw.js`** — otherwise a fix pushed on the morning of the
  party never reaches a phone that already loaded the site.
- Security headers and `X-Robots-Tag: noindex` are set by `nginx.conf`, in the
  image, so they hold wherever it runs rather than depending on a proxy in
  front of it.
- `HEALTHCHECK` hitting `/` so `docker ps` shows real health.
- No volume, no writable state, no env at runtime — it's a bag of files.
- `GIT_SHA` is the one build argument. It lands in `window.__bb.version`, which
  is how you tell which build a phone is actually running.

All of the above is asserted in CI against the built image — the response
headers and cache policy by `tests/e2e/artifact.spec.ts`, the game itself by
the full-playthrough E2E (TESTING.md §7, §10).

Verify locally with the exact artifact:

```bash
npm run preview:docker   # build image, run on :8080
```

## 2. Publishing

`build-and-publish.yml`, on push to `main`, after `ci.yml` is green:

- `ghcr.io/tpatzelt/birthday-bash:latest` — rolling, what a host normally runs.
- `ghcr.io/tpatzelt/birthday-bash:sha-<short>` — immutable, one per build.

The job summary prints the `sha-` tag of every build. That is the number to
write down.

## 3. Rollback

Run the previous `sha-<short>` tag instead of `latest`. Every CI build
published one, so any earlier build is a tag change and a restart away — no
rebuild, no revert commit, nothing to do in this repo at all.

Know the last-known-good SHA **before** the party and write it down somewhere
that isn't a terminal.

## 4. Spoiler containment

The reveal text ships inside the JS bundle. Anyone with the URL can read it with
view-source. Therefore:

- Keep **this repo private** and the **GHCR package private** until after the
  party. A repo named `birthday-bash` with his name in the README is a search
  away.
- Don't put the reveal in commit messages that could show in a public feed, or
  in the GHCR package description.
- Serve a placeholder first; swap in the real game close to the day.
- Store the reveal strings **base64-encoded in `gift.ts`**, decoded at render
  time. This is not security and isn't pretending to be — it defeats a curious
  "view source" on a phone, which is the only realistic threat.
- Send the link when it's time, not before.

## 5. Party-day operations

- `?skip=1` jumps straight to the reveal if anything is broken (DESIGN.md §8).
  Know this URL by heart.
- Have the last-known-good `sha-` tag written down (§3).
- Open the real URL on your own phone, cold, from mobile data — not wifi. A
  LAN-only habit gives a false pass.
- Have the reveal as a **screenshot on your phone** as the true fallback. If the
  hosting is down at 21:00 on a Saturday, the gift still gets given.
