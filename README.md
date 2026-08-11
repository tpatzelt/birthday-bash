# birthday-bash

**BERLIN-QUEST: JONAS EDITION** — a four-level mobile browser game built as a
birthday present. Beating it reveals the actual gift: a visit to Sandbox VR
Berlin.

The game is a static, offline-capable web app. It is played one-handed in
portrait on a phone, in a loud room, possibly by someone who has already had a
beer. Every design decision below follows from that sentence.

> **Spoiler containment.** The reveal text lives in this repo and in the shipped
> JS bundle. Keep the repo and the GHCR package **private until after the
> party**, and don't send the URL before it's time. See
> [docs/DEPLOY.md](docs/DEPLOY.md#spoiler-containment).

## Status

**Design phase.** No application code exists yet — this repo currently holds the
design, architecture, test strategy, and delivery plan. Implementation starts at
milestone M0 in [docs/PLAN.md](docs/PLAN.md).

## Documents

| Document | What's in it |
|---|---|
| [docs/DESIGN.md](docs/DESIGN.md) | The game: levels, mechanics, tuning constants, art direction, audio, German copy |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Deterministic core / renderer split, module layout, performance budget |
| [docs/TESTING.md](docs/TESTING.md) | The dev↔app closed loop: input tapes, bot players, balance reports, E2E on the shipped image, live smoke |
| [docs/DEPLOY.md](docs/DEPLOY.md) | GHCR image → homelab compose stack → Caddy → Cloudflare Tunnel |
| [docs/PLAN.md](docs/PLAN.md) | Day-by-day milestones, cut list, risk register, definition of done |
| [CLAUDE.md](CLAUDE.md) | Conventions for working in this repo |

## Decisions already made

- **Stack** — TypeScript + Vite + Canvas 2D. Hand-rolled engine, no game
  framework, so the game logic can run headless and deterministically in tests.
- **Backend** — none. Progress lives in `localStorage`. Nothing to back up,
  nothing to fall over on the night.
- **Hosting** — self-hosted: a static image on the existing homelab Docker host,
  behind Caddy, published through the existing Cloudflare Tunnel.
- **Language** — game copy is German (du-form, Berlin slang). Repo docs and code
  are English, matching the homelab repo.

## Once there is code

```bash
npm run dev            # Vite dev server + debug harness at /__dev
npm test               # unit + determinism + bot-beatability (headless, fast)
npm run balance        # bot win-rate/duration report -> reports/balance.md
npm run e2e            # Playwright against the production Docker image
npm run preview:docker # build and run the real shipped image on :8080
```
