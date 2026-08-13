# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Project

A four-level browser game for a phone, given as a birthday present; finishing it
reveals a visit to Sandbox VR Berlin. Static TypeScript + Vite + Canvas 2D, no
backend. It ships as one self-contained static nginx image to GHCR.

Read [docs/PLAN.md](docs/PLAN.md) first — it carries the deadline, the milestone
you are probably in, and the cut list. **The deadline is real and immovable**
(the party is Sat 15.08.2026). Prefer finishing a level to perfecting one.

## The rule that matters most

`src/core/**` is a **pure, deterministic simulation**: no DOM, no `window`, no
`Math.random()`, no `Date.now()`, fixed `1/60 s` timestep, plain serialisable
state. The entire test strategy — replayable input tapes, headless bot
playthroughs, reproducible balance runs — collapses the moment something in
`core/` reaches for a global. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

If a change seems to need randomness or wall-clock time in the core, thread the
seeded PRNG or `state.frame` through instead.

## Conventions

- **Tuning constants live in `src/config/tuning.ts`**, nowhere else. A magic
  number in a level file is a bug — the balance report can't sweep it and a
  reviewer can't see it change.
- **All gift/reveal text lives in `src/config/gift.ts`**, base64-encoded. It is
  the only file permitted to change after the Friday freeze.
- Game-facing copy is **German** (du-form, dry, Berlin-blunt — DESIGN.md §9).
  Code, comments, docs, and commit messages are English.
- Rendering never mutates state; the core emits events into `state.events` and
  audio/particles read them.
- No per-frame allocation in the draw path — entities are pooled.
- This repo is **private until after 15.08.2026** and the reveal must not leak
  into commit messages or the GHCR package description (DEPLOY.md §4).
- Real domains, hostnames, and IPs never appear in tracked files; `example.com`
  is the stand-in.

## Commands

```bash
npm run dev            # Vite dev server; debug harness at /__dev
npm test               # unit + determinism + bot beatability + fuzz (fast)
npm run balance        # regenerate reports/balance.md
npm run e2e            # Playwright against the production Docker image
npm run preview:docker # build and run the shipped image on :8080
```

## The development loop

Play in `/__dev` → hit **Record** → drop the downloaded `tape.json` into
`tests/tapes/` → it is now a regression test. Use this instead of describing a
bug in prose. See [docs/TESTING.md](docs/TESTING.md).

Tuning changes are justified against `reports/balance.md`, not against feel.
Regenerate and commit it alongside the change.

## Deployment

`main` → GitHub Actions → `ghcr.io/tpatzelt/birthday-bash:latest` +
`:sha-<short>`. That image is where this repo's responsibility ends.

**Hosting is deliberately out of scope here.** Nothing in this repo — no
script, no workflow, no doc — should know how or where the image is served, or
carry a real hostname. That boundary is what lets `ci.yml` run *every* test
against the image itself, with no deploy target and no live URL involved. If a
change seems to need one, it belongs on the host side instead. See
[docs/DEPLOY.md](docs/DEPLOY.md).
