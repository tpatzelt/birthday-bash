# Architecture

## The one decision everything follows from

**The game logic is a pure, deterministic function. Rendering, audio, and DOM
are consumers of its output and are never allowed to influence it.**

```
step(state, input, dt) -> state'      pure, no DOM, no Date.now(), no Math.random()
```

Given a seed and a recorded sequence of per-frame inputs (an *input tape*), the
resulting state is bit-identical on every machine, every run, forever. That
single property is what makes the closed loop in TESTING.md possible: it lets a
test play the actual game — not a mock of it — thousands of times per second,
headlessly, and assert on the outcome.

Everything else in this document exists to protect that property.

### Rules that keep it true

| Rule | Why |
|---|---|
| `core/` imports nothing from `render/`, `audio/`, `shell/`, or the DOM | A single `window` reference makes the core untestable in Node |
| Fixed timestep `1/60 s`, accumulator, max 5 catch-up steps per frame | Variable `dt` makes physics frame-rate-dependent and replays unreproducible |
| No `Math.random()` anywhere in `core/` — only the injected seeded PRNG | The one global that silently destroys determinism |
| No `Date.now()` / `performance.now()` in `core/` — time is `state.frame` | Same |
| No floating-point accumulation of world position from `dt` | `dt` is constant, so `frame · step` is exact and drift-free |
| State is plain JSON-serialisable data — no class instances, no `Map` of objects | Lets a whole state be hashed, snapshotted, and diffed in a test |
| Events (`{type:'coin', x, y}`) are *emitted into an array on the state*, never dispatched | Audio and particles read them; the core stays pure |

An ESLint rule enforces the import restriction (`no-restricted-imports` on
`core/**`); the determinism tests catch the rest.

## Module layout

```
src/
  core/                  pure simulation — no DOM, fully testable in Node
    rng.ts               mulberry32, explicit seed, serialisable cursor
    loop.ts              fixed-timestep accumulator
    input.ts             InputFrame type + tape record/replay
    state.ts             GameState, LevelState, save/load shape
    collide.ts           AABB + circle helpers
    levels/
      pfand.ts           L1 sim
      sisyphos.ts        L2 sim
      katjes.ts          L3 sim
      kayak.ts           L4 sim
    progress.ts          mercy rules, level unlock, auto-ease
  render/                canvas — reads state, draws, never writes state
    canvas.ts            sizing, DPR, safe-area, letterbox math
    atlas.ts             emoji -> offscreen canvas pre-render
    scene/               one draw module per level + shared backdrops
    hud.ts               receipt strip, Ruhe meter, lives
    particles.ts         pooled; driven by state.events
  audio/
    engine.ts            AudioContext, master bus, gesture unlock
    scheduler.ts         lookahead scheduler, bar-aligned transitions
    layers.ts            the layer table from DESIGN.md §6
    sfx.ts               one-shots, driven by state.events
  shell/
    boot.ts              entry point, wiring
    overlay.ts           DOM cards (title, level intro, fail, reveal)
    controls.ts          pointer -> InputFrame, visibility/pause, orientation
    storage.ts           localStorage progress, versioned + corruption-safe
    dev.ts               debug harness (see below)
  config/
    gift.ts              THE reveal text, date, meeting point. Edit-safe.
    tuning.ts            every constant from DESIGN.md §4, one object
```

`config/tuning.ts` holding *all* constants is what makes the balance report
(TESTING.md §5) able to sweep them, and what lets a tuning change be a one-line
diff reviewable against a win-rate table.

## Rendering

Canvas 2D, single canvas, no WebGL — the scenes are flat 2D with well under 200
entities, and Canvas 2D removes a whole class of mobile GPU/context-loss bugs.

- Logical resolution `390 × H` (see DESIGN.md §4); the canvas backing store is
  `logical × min(devicePixelRatio, 3)`, transform set once on resize.
- `H` is derived from the viewport aspect so the game **fills the phone** rather
  than letterboxing; levels anchor to `H`, never assume a fixed height.
- `env(safe-area-inset-*)` respected — nothing interactive under the notch or
  the home indicator.
- Entities are **pooled**; no per-frame allocation in the draw path. The target
  device is a mid-range Android, where GC pauses read as stutter and stutter
  reads as "the game is broken".
- `prefers-reduced-motion` suppresses screen shake and confetti density.

## State, saving, and the reveal

`localStorage` under one versioned key:

```ts
{ v: 1, unlocked: 3, fails: {pfand: 0, ...}, revealed: false, muted: false }
```

- The key is versioned; an unparseable or wrong-version blob is **discarded
  silently**, never thrown on. A corrupted save must not be able to stand
  between him and the present.
- `revealed: true` is write-once and permanently unlocks the "→ zum Geschenk"
  button (DESIGN.md §5).
- Private-browsing / disabled storage degrades to an in-memory store. Nothing
  in the game path may throw when `localStorage` is unavailable.

## The debug harness (`/__dev`)

Not a nice-to-have — it is the developer's half of the closed loop.

- Seed input, level jump, time-scale (0×–4×), **single-frame stepper**
- Live state inspector, hitbox/channel overlay, frame-time graph
- **Record** → captures the input tape of the session and downloads
  `tape.json`, ready to drop into `tests/tapes/`
- **Replay** → loads a tape and plays it back, with the stepper available

So the workflow is: play until something feels wrong → hit Record → the failure
becomes a regression test. That is the loop.

Guarded behind a route check and stripped from the production bundle by a Vite
`define` flag, so it costs the shipped game nothing.

## Test hooks in the shipped build

E2E must drive the **real production bundle**, so a small, deliberate API is
exposed on `window.__bb` **in the shipped image**:

```ts
window.__bb = { loadTape, setSeed, freeze, step, getState, version }
```

- `freeze()` stops the rAF loop so Playwright can step the game a known number of
  frames instead of racing it — how the E2E playthrough drives four levels to the
  reveal in seconds.
- This is a *decision to ship a test seam*, not an oversight. The game is a
  static single-player toy with no secrets except the reveal, and being able to
  test the exact artifact that ships is worth far more than hiding it.
- It is inert unless called, and adds ~1 KB.

## Performance budget

Enforced in CI (TESTING.md §9), not aspirational:

| Metric | Budget |
|---|---|
| JS bundle, gzipped | ≤ 150 KB |
| Total transfer, first load | ≤ 300 KB |
| p95 frame time, 4× CPU-throttled mobile emulation | ≤ 20 ms |
| Time to interactive, emulated 4G | ≤ 2.0 s |
| Allocation in the steady-state draw path | 0 |

## Offline

A service worker precaches the whole app on first load (it's small enough to
precache entirely). Network-first for nothing — there is no network. This is
both a robustness win and a thematic one: the game works in the basement.

Cache is keyed by build hash; a stale service worker must not be able to serve a
half-updated bundle on the night.
