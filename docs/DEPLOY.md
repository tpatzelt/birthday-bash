# Deployment — self-hosted on the homelab

Target: the existing single-host Docker setup in `~/coding/homelab` — Caddy in
front, Cloudflare Tunnel as the only public ingress, no forwarded router ports.

The `annabel-rene` wedding site is the precedent this follows exactly: an app
repo builds a GHCR image in its own pipeline, and the homelab repo carries only
a small compose stack that pulls it. **Nothing about this game is novel
infrastructure**, which is the point — the risky part of the schedule should be
the game, not the hosting.

```
GitHub push (main)
   └─ build-and-publish.yml ─► ghcr.io/tpatzelt/birthday-bash:latest + :sha-<short>
                                         │
                          docker compose pull && up -d   (on the homelab host)
                                         │
                     birthday-bash (nginx, :80) on caddy_network
                                         │
                     Caddy  *.{$DOMAIN} ──► reverse_proxy birthday-bash:80
                                         │
                     cloudflared ──► https://caddy:443  ──► the internet
                                         │
                              https://jonas.example.com
```

`example.com` stands in for the real domain throughout, matching the homelab
repo's convention. **Never write the real domain, LAN IPs, or the tunnel UUID
into a tracked file in either repo.**

## 1. The image (this repo)

Static output served by nginx. Multi-stage, small, no runtime environment.

```
FROM node:22-alpine AS build      # npm ci && npm run build -> /app/dist
FROM nginx:1.27-alpine            # dist -> /usr/share/nginx/html + nginx.conf
```

Notes that matter:

- **Pin the base images** to Renovate-parsable tags (`1.27-alpine`, not
  `alpine`). Per the homelab CLAUDE.md, a tag Renovate can't order is a tag that
  silently rots for years.
- The published `ghcr.io/tpatzelt/*` tag itself is intentionally rolling
  (`latest`), consistent with the other personal images. Add
  `ghcr.io/tpatzelt/birthday-bash` to the homelab `renovate.json5` ignore list
  so it doesn't generate noise PRs.
- nginx config: long `immutable` cache on hashed assets, **`no-cache` on
  `index.html` and `sw.js`** — otherwise a fix pushed on the morning of the
  party never reaches a phone that already loaded the site.
- `HEALTHCHECK` hitting `/` so `docker ps` shows real health.
- No volume, no writable state, no env at runtime — it's a bag of files.

Verify locally with the exact artifact:

```bash
npm run preview:docker   # build image, run on :8080
```

## 2. The compose stack (homelab repo)

`compose/birthday-bash/compose.yaml`:

```yaml
services:
  birthday-bash:
    image: ghcr.io/tpatzelt/birthday-bash:${BIRTHDAY_BASH_IMAGE_TAG}
    container_name: birthday-bash
    restart: unless-stopped
    networks:
      - caddy_network

networks:
  caddy_network:
    external: true
    name: caddy_network
```

- Service and container name `birthday-bash` — lowercase-hyphen, and it must
  match the Caddy upstream or `check.sh`'s `check_caddy_upstreams` fails.
- Uses **compose interpolation from the auto-loaded `./.env`** rather than
  `env_file:`, the same choice `annabel-rene` makes: only the referenced var is
  involved and nothing leaks into the container.
- The tag is a variable so a **rollback is an env edit, not a compose edit**
  (§6).
- No `volumes:` — deliberately stateless. This is also why **autorestic needs no
  change**: there is nothing under `/opt/dockerdata` to snapshot. Worth stating
  explicitly so a future reader doesn't assume it was forgotten.

Also required by the repo's conventions and enforced by `check.sh`:

- `secrets/.birthday-bash.env.example` containing
  `BIRTHDAY_BASH_IMAGE_TAG=latest` (`check_env_completeness` fails if a
  `${VAR}` has no entry; `check_env_examples_exist` fails if the example is
  missing entirely).
- `secrets/.birthday-bash.env` — the real file, gitignored.
- The symlink: `compose/birthday-bash/.env -> ../../secrets/.birthday-bash.env`
- A row in the README service table (`check_readme_table` greps for
  `| **birthday-bash**`).

## 3. Caddy route

In `compose/caddy/Caddyfile`, inside the **public** `*.{$DOMAIN}` block:

```
handle @jonas {
    reverse_proxy birthday-bash:80
}
```

> **The trap, straight from the homelab CLAUDE.md:** the Caddyfile is a
> *single-file bind mount*. Any editor that writes atomically (all of them,
> including this one) replaces the inode, and the container keeps serving the
> old file. `caddy reload` will exit 0, log `adapted config to JSON`, and read
> the stale config — a completely silent failure that shows up only as the
> catch-all `abort` closing connections on the route you just added.

So:

```bash
docker compose -f compose/caddy/compose.yaml up -d --force-recreate caddy
diff <(docker exec caddy cat /etc/caddy/Caddyfile) compose/caddy/Caddyfile
```

The `diff` must be empty. Do not skip it.

## 4. Public DNS + tunnel

A `handle` block alone does **nothing** — `*.{$DOMAIN}` has no wildcard DNS
record; only explicitly routed public hostnames exist. Three steps, all required:

1. Add an ingress rule for `jonas.<domain>` in
   `/opt/dockerdata/cloudflared/config.yml` (outside the repo — it carries the
   tunnel UUID and real hostnames), pointing at `https://caddy:443` like every
   other public host, so tunnelled traffic still passes CrowdSec, the security
   headers, and the access log.
2. Mirror the rule into the tracked template `compose/cloudflared/config.yml.example`.
3. `cloudflared tunnel route dns homelab jonas`

Then restart cloudflared and confirm the hostname resolves **from outside the
LAN** — mobile data, not wifi. A `*.dev.` habit will silently give a false pass
here.

Free-plan constraints are irrelevant at this size (no video streaming, request
bodies far under 100 MB).

## 5. Deploy order

```bash
cd ~/coding/homelab
docker compose -f compose/birthday-bash/compose.yaml pull
docker compose -f compose/birthday-bash/compose.yaml up -d
# Caddyfile edit -> force-recreate + diff (§3)
./scripts/check.sh          # must print RESULT: PASS
```

`check.sh` is the gate on the homelab side: compose config, env-template
completeness, `caddy validate`, upstream-vs-compose consistency, README
coverage, yamllint, shellcheck. Then from this repo:

```bash
npm run smoke:live -- https://jonas.example.com
```

**Do §1–§5 on day one, against a placeholder page**, before the game exists.
Tunnel DNS, a new Caddy route, and a first GHCR pull are exactly the kind of
work that eats an evening, and it must not be sitting on the critical path on
Friday night. See PLAN.md M0.

## 6. Rollback

```bash
# secrets/.birthday-bash.env
BIRTHDAY_BASH_IMAGE_TAG=sha-abc1234
```

```bash
docker compose -f compose/birthday-bash/compose.yaml up -d
```

Every CI build publishes an immutable `sha-<short>` tag, so any previous build
is one env edit away. Know the last-known-good SHA **before** the party and
write it down somewhere that isn't a terminal.

## 7. Spoiler containment

The reveal text ships inside the JS bundle. Anyone with the URL can read it with
view-source. Therefore:

- Keep **this repo private** and the **GHCR package private** until after the
  party. A repo named `birthday-bash` with his name in the README is a search
  away.
- Don't put the reveal in commit messages that could show in a public feed, or
  in the GHCR package description.
- Deploy behind a placeholder page first; swap in the real game close to the day.
- Store the reveal strings **base64-encoded in `gift.ts`**, decoded at render
  time. This is not security and isn't pretending to be — it defeats a curious
  "view source" on a phone, which is the only realistic threat.
- Send the link when it's time, not before.

## 8. Party-day operations

- `?skip=1` jumps straight to the reveal if anything is broken (DESIGN.md §8).
  Know this URL by heart.
- Have the last-known-good `sha-` tag written down (§6).
- Re-run `npm run smoke:live` the morning of.
- Have the reveal as a **screenshot on your phone** as the true fallback. If the
  homelab is down at 21:00 on a Saturday, the gift still gets given.
