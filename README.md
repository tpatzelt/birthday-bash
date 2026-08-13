# birthday-bash

**JONAS BIRTHDAY BASH** — a four-level mobile browser game built as a
birthday present. Beating it reveals the actual gift: a visit to Sandbox VR
Berlin.

The game is a static, offline-capable web app. It is played one-handed in
portrait on a phone, in a loud room, possibly by someone who has already had a
beer. Every design decision below follows from that sentence.

> **Spoiler containment.** The reveal text lives in this repo and in the shipped
> JS bundle. Keep the repo and the GHCR package **private until after the
> party**, and don't send the URL before it's time. See
> [docs/DEPLOY.md](docs/DEPLOY.md#4-spoiler-containment).

## Status

**Playable, tested, and buildable.** All four levels, the mercy rules, the
reveal, the audio, the offline shell and the deployment image are in. What is
left is on real hardware and on whatever hosts the image, not in the code:

- [ ] The published image running at the real URL, opened from mobile data
- [ ] Played end to end on a real iPhone and a real Android (TESTING.md §11)
- [ ] Emoji glyph check on both — the atlas falls back to hand-drawn vectors for
      anything the font can't render, but which glyphs *read* is a human call
- [ ] Confirm date, time and meeting point in `src/config/gift.ts`

| Gate | Where | Now |
|---|---|---|
| `perfect` bot wins ≥ 97 % per level | `npm test` | 99–100 % |
| `casual` ≥ 55 % | `npm test` | see the balance report |
| `tipsy` on the eased level ≥ 60 % | `npm test` | the mercy rules are what guarantee the reveal |
| JS bundle ≤ 150 KB gzipped | `npm run e2e` | ~20 KB |
| Full playthrough to the reveal | `npm run e2e` | green against the shipped image |

Current numbers per level: [reports/balance.md](reports/balance.md).

## Documents

| Document | What's in it |
|---|---|
| [docs/DESIGN.md](docs/DESIGN.md) | The game: levels, mechanics, tuning constants, art direction, audio, German copy |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Deterministic core / renderer split, module layout, performance budget |
| [docs/TESTING.md](docs/TESTING.md) | The dev↔app closed loop: input tapes, bot players, balance reports, E2E on the shipped image |
| [docs/DEPLOY.md](docs/DEPLOY.md) | The artifact: the nginx image, GHCR tags, rollback, spoiler containment |
| [docs/PLAN.md](docs/PLAN.md) | Day-by-day milestones, cut list, risk register, definition of done |
| [CLAUDE.md](CLAUDE.md) | Conventions for working in this repo |

## Decisions already made

- **Stack** — TypeScript + Vite + Canvas 2D. Hand-rolled engine, no game
  framework, so the game logic can run headless and deterministically in tests.
- **Backend** — none. Progress lives in `localStorage`. Nothing to back up,
  nothing to fall over on the night.
- **Hosting** — out of scope for this repo. It ships one self-contained static
  nginx image to GHCR; where that runs is the host's business, which is what
  lets CI test everything this repo owns.
- **Language** — game copy is German (du-form, Berlin slang). Repo docs and code
  are English.

## Commands

```bash
npm run dev            # Vite dev server + debug harness at /__dev
npm test               # unit + determinism + bot-beatability + fuzz (headless, ~60 s)
npm run balance        # bot win-rate/duration report -> reports/balance.md
npm run e2e            # Playwright against the production Docker image
npm run preview:docker # build and run the real shipped image on :8080
```

`npm run e2e` drives the real Docker image on a phone viewport, in Chromium and
WebKit: gameplay, the performance and bundle budgets, and the served artifact's
headers and caching. WebKit needs system libraries (`sudo npx playwright
install-deps webkit`); without them run `E2E_SKIP_WEBKIT=1 npm run e2e` — CI
runs both, and runs everything above on every push.

## The layout

```
src/core/     pure, deterministic simulation — no DOM, no Math.random, no clock
src/render/   canvas: scenes, HUD, pooled particles, emoji atlas + vector fallbacks
src/audio/    WebAudio: one continuous 126 BPM track, layers per level
src/shell/    boot, overlay cards, pointer input, storage, the /__dev harness
src/config/   tuning.ts (every constant) and gift.ts (the reveal, base64)
tests/tapes/  input tapes: drop one in and it is a regression test
```

The development loop: play in `/__dev` → **Record** → drop `tape.json` into
`tests/tapes/` → it is now a permanent test. See [docs/TESTING.md](docs/TESTING.md).
