# Testing — the closed loop

The goal is not coverage. The goal is that **nothing reaches Jonas's phone that
hasn't been proven playable and completable by something automated**, and that
when a tuning change makes the game worse, a machine says so before a human has
to notice.

Four loops, from tightest to widest:

```
  ┌─ play in /__dev ──► Record ──► tape.json ──► unit/replay test ─┐
  │                                                                │  seconds
  └────────────────────── tuning.ts ◄──── balance report ──────────┘

  ┌─ npm test ─────────────────────────────────────────────────────┐  ~10 s
  │  core determinism · replay tapes · bot beatability · storage    │
  └────────────────────────────────────────────────────────────────┘

  ┌─ npm run e2e ──────────────────────────────────────────────────┐  ~2 min
  │  Playwright drives the REAL Docker image on a phone viewport    │
  └────────────────────────────────────────────────────────────────┘

  ┌─ npm run smoke:live ───────────────────────────────────────────┐  ~1 min
  │  same bot playthrough against the deployed tunnel URL           │
  └────────────────────────────────────────────────────────────────┘
```

The outermost loop is the one that actually closes dev↔app: the identical bot
playthrough runs against the local core, against the shipped image, and against
the live public URL. If all three agree, the thing on his phone works.

---

## 1. Unit — `vitest`, `src/core/**`

Pure functions, no DOM, milliseconds. Physics integration, collision, spawn
tables, scoring, the Ruhe formula, mercy-rule state transitions, PRNG.

Notable cases that are easy to get wrong and expensive to discover at the party:

- Coyote time and jump buffer at the exact frame boundaries (L1).
- Push-back on rejection cannot move the player to negative progress (L2).
- A vegetable landing uncaught must *not* cost a life (L3).
- `Ruhe` clamps at both ends; `panic` at exactly the `|vx| = 55` threshold (L4).
- `unlocked` never decreases; `revealed` never flips back to false.

## 2. Determinism & replay — `vitest`, `tests/tapes/*.json`

The regression backbone.

```ts
const final = replay(tape);                 // tape = { seed, level, frames[] }
expect(hash(final)).toMatchSnapshot();      // exact state hash
```

- **Same seed + same tape ⇒ identical state hash.** Run twice in one process and
  once in a fresh worker, to catch hidden module-level state.
- A tape recorded on a real phone in `/__dev` becomes a permanent test in one
  drag-and-drop. Every "that felt wrong" moment gets captured this way.
- When a tuning change is intentional, the snapshot updates — and the balance
  report (§5) says whether it was an improvement.
- Guard test: seeding with the same value from two different entry points
  produces the same first 1000 draws; `Math.random` is not referenced anywhere
  under `core/` (grep assertion, plus an ESLint rule).

## 3. Bot beatability — `vitest`, the most important tests in the repo

Scripted policies play each level headlessly. These encode the promise in
DESIGN.md §8: *he must be able to finish*.

| Bot | Policy | Assertion |
|---|---|---|
| `perfect` | greedy — jumps at the ideal frame, moves to the best-scoring position it can see | Wins ≥ **97 %** of 200 seeds per level. It is a heuristic, not an oracle: on L2 it corners itself about one seed in two hundred, and those seeds pass the §4 fairness lookahead at every sampled frame |
| `casual` | 220 ms reaction delay, ±12 px aim error, misses 15 % of inputs | Wins ≥ **55 %** of 200 seeds per level |
| `tipsy` | 400 ms delay, ±30 px error, 30 % missed inputs, occasional 1 s freeze | **No un-eased floor** — it is meant to lose. On the *eased* level: wins ≥ **60 %**, and always more often than un-eased |
| `idle` | never touches the screen | **Must terminate.** Fails cleanly everywhere, and in L4 must still outlast `mash` several times over — doing nothing is the safest play, not a winning one |
| `mash` | random taps/drags every frame | No exception, no NaN in state, terminates within the level time cap |

Additional invariants asserted across all bot runs:

- No state value is ever `NaN` or `undefined` (deep scan each 60 frames).
- Every level terminates within a hard frame cap — **no soft-locks**, ever.
- **The reveal is reachable**: a run that fails every level twice and takes every
  skip must still arrive at `revealed: true`.
- `tipsy` failing four times must produce the silent auto-ease, and the eased
  level must then be winnable by `tipsy`.

The second difficulty pass moved where the promise lives. `casual` ≥ 85 % and
`tipsy` ≥ 50 % on the *raw* level meant no level could realistically be lost,
which is not a game. The guarantee that he reaches the reveal is carried by the
mercy rules — skip after two fails, silent auto-ease after four — so those are
the numbers now gated hard, and the raw levels are allowed to be difficult.

## 4. Fuzz — `vitest`, 1000 seeds × random input

Cheap because the core is pure. Catches spawn tables that place an unavoidable
obstacle pair, entities leaking off-pool, and arithmetic that goes non-finite.
Asserts specifically: **no unavoidable-death configuration exists** — for every
frame in every seed, at least one input sequence survives the next 90 frames
(checked by a shallow lookahead search, not exhaustively).

## 5. Balance report — `npm run balance`

Not a pass/fail test; a **decision instrument**. Runs the bot matrix across N
seeds and writes `reports/balance.md`:

| Level | perfect | casual | tipsy | median duration (casual) | median fails before win |
|---|---|---|---|---|---|
| Pfand | 100 % | 91 % | 58 % | 68 s | 0.4 |
| … | | | | | |

Tuning is then a diff against a table rather than an argument about feel. The
report is regenerated and committed at each milestone, so the effect of a
constant change is visible in review. Session-length targets from DESIGN.md §2
are checked here — if the four medians sum past ~7 minutes, the game is too long
for a party and something gets shortened.

## 6. Shell & storage — `vitest` + `happy-dom`

Overlay card rendering, `gift.ts` values actually appearing in the reveal DOM,
pointer→`InputFrame` mapping, and storage: corrupted blob, wrong version,
`localStorage` throwing (private mode), quota exceeded. Every one must degrade
to a playable game.

## 7. E2E — Playwright, **against the production Docker image**

```bash
npm run e2e            # builds the image, runs it, tests it, tears it down
```

Not `vite dev`. Not `vite preview`. The container that goes to the homelab —
same nginx config, same headers, same asset hashing, same service worker. A test
that passes against a dev server proves nothing about the artifact that ships.

Devices: `iPhone 14` (WebKit) and `Pixel 7` (Chromium), portrait, touch enabled.

Scenarios:

1. **Cold load** — title screen visible < 2 s, no console errors, service worker
   registers.
2. **Full playthrough** — inject a golden tape via `window.__bb.loadTape()` and
   run all four levels through to the reveal; assert the Sandbox VR text and the
   `gift.ts` details are visible in the DOM. This is the single most valuable
   test in the suite: it proves the whole gift works end to end in a real browser.
3. **Real touch** — at least one level is played with genuine
   `touchstart/move/end` events rather than an injected tape, to prove the input
   path itself is wired up (a tape bypasses `controls.ts` entirely).
4. **Interruption** — background the tab mid-level (`visibilitychange`) and
   return: game is paused, not fast-forwarded through 30 s of accumulated time.
5. **Reload persistence** — reload mid-game; progress and mute state survive.
6. **Rotate** — landscape shows the "bitte drehen" hint and does not corrupt the
   canvas transform on rotating back.
7. **Offline** — load once, go offline, reload: still playable.
8. **`?skip=1`** — reaches the reveal directly (the party escape hatch).
9. **Muted playthrough** — the game is completable with audio blocked, and no
   unhandled rejection is thrown when `AudioContext` is refused.

## 8. Visual regression — Playwright screenshots

Made possible by determinism: `setSeed(k)` → `freeze()` → `step(n)` →
screenshot. Fixed seed and fixed frame count means pixel-stable output.

Baselines: title, each level at an early and a busy frame, each fail card, the
skip button state, and **the reveal** (the one screen that absolutely must not
regress unnoticed). Compared at a 0.2 % pixel threshold to tolerate font
rasterisation differences.

```bash
npm run visual          # check against the committed baselines
npm run visual:update   # regenerate after an intentional visual change
```

Both run through `scripts/visual.sh`, which serves the production image as
usual (§7) but puts the **browsers** inside `mcr.microsoft.com/playwright`
pinned to the exact `@playwright/test` version. Font rasterisation is the thing
that makes screenshot tests rot, so the browser has to be identical everywhere:
the committed PNGs are that container's output, which is why the same baselines
hold on a workstation and on a CI runner. Baselines generated on the host would
be valid on exactly one machine — hence the `VISUAL=1` gate, so a plain
`npm run e2e` can't fail on them.

The busy-frame screenshots are taken with no input at all, so a level nobody is
playing eventually loses: `BUSY_FRAMES` in the spec holds a per-level step count
that stays below each level's idle-death frame, and the test asserts the phase is
still `play` so a baseline can't silently become a photo of a fail card.

## 9. Budgets — CI-enforced

- `size-limit` on the gzipped bundle (≤ 150 KB) and total transfer (≤ 300 KB).
- Playwright trace over 10 s of bot play at 4× CPU throttle → assert **p95 frame
  ≤ 20 ms**. This is the test that catches "the game got slow" before the phone
  does.
- A memory check: heap after 3 full playthroughs is within 1.5× of heap after
  one — catches pool leaks.

## 10. Live smoke — after deploy

```bash
npm run smoke:live -- https://jonas.example.com
```

- `200 OK`, correct content-type and cache headers, security headers present.
- Asset hashes in the served HTML actually resolve (catches a half-pushed image).
- The **same full-playthrough tape from §7.2** run against the live URL on a
  mobile viewport, asserting the reveal renders.
- `window.__bb.version` matches the git SHA that CI just deployed — proves you
  are looking at the build you think you are, not a cached old one.

Wired as a GitHub Actions job after publish, and re-runnable by hand at any
time. **Run it once more on the morning of the party.**

## 11. What automation cannot do — manual checklist

Automation cannot tell you whether it's *fun*, whether the vegetables read at a
glance on a real OLED at 20 % brightness, or whether emoji look right on his
phone. Before the freeze:

- [ ] Played end-to-end on a real **iPhone** — sound on, one-handed, no wifi
- [ ] Played end-to-end on a real **Android** — same
- [ ] Emoji glyphs check on both (DESIGN.md §7 risk)
- [ ] Played once by **someone who has never seen it**, without instructions —
      the only real test of whether the levels explain themselves
- [ ] Played once in a **dark, loud room**
- [ ] Battery/heat sanity: 10 minutes of play doesn't cook the phone
- [ ] The QR code / link actually opens on a phone with no logins
- [ ] The reveal read aloud — does it land, or is it too long?

## 12. CI

| Workflow | Trigger | Does |
|---|---|---|
| `ci.yml` | PR, push | typecheck → lint → unit/determinism/bot/fuzz → build image → e2e → visual (§8, own job) → budgets |
| `build-and-publish.yml` | push to `main` | builds and pushes `ghcr.io/tpatzelt/birthday-bash:latest` + `:sha-<short>` (mirrors the annabel-rene pipeline) |
| `smoke.yml` | after publish, + `workflow_dispatch` | §10 against the live URL |

`ci.yml` must be green before `build-and-publish.yml` runs. The bot-beatability
job is the required check — everything else can be argued about, but the game
being completable cannot.
