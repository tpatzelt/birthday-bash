# Delivery plan

**Today: Tue 11.08.2026. The party is this weekend — assumed Sat 15.08.**
Correct the date here and in `src/config/gift.ts` if it's Sunday; the schedule
below then gains one day of buffer, it does not gain one day of scope.

Four working evenings. The scope is fixed by the deadline, not the other way
round — §4 says what gets dropped, in order, and the decision is made in advance
so it isn't made at midnight on Friday.

## Scheduling principle

**Infrastructure first, content last.** The tunnel route, the Caddy handle
block, the GHCR pipeline, and the first successful pull all happen on day one
against a placeholder page. Those are the tasks that fail in unfamiliar ways and
they must not be discovered on Friday. Once a placeholder is live at the real
URL, every later milestone is "push and it's on his phone" — and if everything
after M1 goes wrong, there is still a working, deployed, completable game.

## M0 — Skeleton, pipeline, and a live URL (Tue 11.08)

The only milestone with no gameplay in it.

- [ ] Vite + TypeScript scaffold, ESLint (incl. the `core/**` import restriction),
      Vitest, Playwright
- [ ] `core/loop.ts` fixed timestep, `core/rng.ts` seeded PRNG, `core/input.ts`
      tape types — with the determinism test already passing
- [ ] Canvas sizing, DPR, safe-area, portrait lock, orientation hint
- [ ] Dockerfile (nginx) + `npm run preview:docker`
- [ ] `ci.yml` and `build-and-publish.yml` green, image in GHCR
- [ ] **Homelab: compose stack, env example + symlink, Caddy handle block
      (force-recreate + diff!), cloudflared ingress, `tunnel route dns`, README
      row, `check.sh` PASS**
- [ ] Placeholder page live at the real URL, verified **on mobile data**
- [ ] `npm run smoke:live` passes

**Exit:** a URL that opens on a phone. No game yet.

## M1 — Vertical slice: L3 Katjes (Wed 12.08)

The simplest mechanic goes first, and goes all the way through every layer, so
the pipeline is proven end to end before three more levels are stacked on it.

- [ ] `core/levels/katjes.ts` complete with `tuning.ts` constants
- [ ] Renderer, HUD, particles for L3
- [ ] Audio engine + scheduler + the hats/kick/clap/bass layers
- [ ] Overlay cards: title, level intro, fail, win
- [ ] `/__dev` harness incl. **Record → tape.json**
- [ ] Unit + replay + bot tests for L3; `npm run balance` produces its first table
- [ ] E2E full-level playthrough against the Docker image
- [ ] Deployed

**Exit:** one real, tested, deployed, playable level. From here the loop in
TESTING.md is running and every later level reuses it.

## M2 — L1 Pfand + L2 Sisyphos (Thu 13.08)

- [ ] L1 runner: gravity, coyote time, jump buffer, spawn table, Pfandbon HUD
- [ ] L2 dodge: bouncer rows, push-back, Sonnenbrille pickup, fairy lights on beat
- [ ] Audio layers for both
- [ ] Bot policies + balance pass for both
- [ ] **Emoji glyph check on a real iPhone and a real Android** (DESIGN.md §7
      risk R2) — hand-draw whatever reads badly, now, not later
- [ ] Deployed

## M3 — L4 Kayak + the reveal (Fri 14.08, early)

- [ ] L4: channel, sluggish steering, Ruhe meter, rocks, filter-opens-with-calm
- [ ] Whale breach → white flash
- [ ] Reveal sequence: headset frame, type-on lines, **the drop**, confetti
- [ ] `config/gift.ts` wired, base64-encoded (DEPLOY.md §7)
- [ ] Mercy rules complete: skip after 2 fails, silent auto-ease after 4
- [ ] `?skip=1`
- [ ] E2E: full four-level playthrough to the reveal + visual baseline of the
      reveal screen
- [ ] Deployed

**Exit:** the game is complete and the gift is deliverable. Everything after
this is optional.

## M4 — Polish and freeze (Fri 14.08, late)

- [ ] Balance pass driven by `reports/balance.md`, not by feel
- [ ] Service worker / offline
- [ ] Performance budget green at 4× CPU throttle
- [ ] **The full manual checklist in TESTING.md §11** — including one person who
      has never seen the game playing it without instructions
- [ ] QR code / short link prepared for the party
- [ ] Last-known-good `sha-` tag written down somewhere off-terminal
- [ ] Reveal screenshotted to your phone as the offline fallback

### Freeze: Friday night

After the freeze the **only** permitted change is `src/config/gift.ts` (time,
meeting point, names) — a config edit that touches no game logic and no test
expectation. Everything else waits until after the party, no matter how small.
Saturday-afternoon "quick fixes" are how the gift breaks.

## Saturday morning

- [ ] `npm run smoke:live` once more
- [ ] Open the real URL on your own phone, cold, from mobile data
- [ ] Confirm the details in `gift.ts` are correct

## 4. Cut list — decided now, in this order

If a milestone slips, cut from the top:

1. Visual regression baselines (keep the E2E playthrough)
2. Service worker / offline
3. **L2 Sisyphos** — the most complex to tune for the least mechanical novelty
4. **L1 Pfand** — a runner is the most replaceable level
5. Audio layering (fall back to one static loop across all levels)

**Never cut:** the reveal, the mercy rules, `?skip=1`, the full-playthrough E2E,
real-device manual testing. A two-level game that definitely works and reaches
the present beats a four-level game that might not.

## 5. Risks

| # | Risk | Likelihood | Mitigation |
|---|---|---|---|
| R1 | iOS blocks `AudioContext` until a gesture; a silent game reads as broken | High | Audio unlocks on the title button; game designed to be fully playable muted (DESIGN.md §6); E2E has a muted-playthrough case |
| R2 | Emoji sprites render differently or ambiguously on his phone | High | Small glyph set, pre-rendered atlas, real-device check at M2, hand-drawn fallbacks; characters are vector from the start |
| R3 | Tunnel/DNS work eats an evening | Medium | Done first, at M0, against a placeholder |
| R4 | Frame drops on a mid-range Android | Medium | Pooled entities, zero-allocation draw path, CI perf budget at 4× throttle |
| R5 | He can't finish a level and the mood dies | Medium | Mercy rules (DESIGN.md §8) + `tipsy` bot gate in CI + `?skip=1` |
| R6 | Spoiled early by a public repo, the URL, or view-source | Medium | DEPLOY.md §7 |
| R7 | Homelab or internet down at party time | Low | Rollback tag ready, and the reveal screenshot on your phone |
| R8 | Scope creep — a fifth level, a leaderboard, a story mode | **High** | The cut list above, and the freeze |

## 6. Definition of done

- [ ] Four levels (or the reduced set the cut list allows) playable to completion
- [ ] `casual` bot wins ≥ 85 % and `tipsy` ≥ 50 % per level, in CI
- [ ] The reveal is reachable even failing every level, and via `?skip=1`
- [ ] Full playthrough E2E green against the **shipped image** and the **live URL**
- [ ] Loads in under 2 s on 4G, works offline afterwards
- [ ] Played start to finish on a real iPhone and a real Android
- [ ] Played by someone who'd never seen it, with no instructions
- [ ] `gift.ts` says the right date, time, and place
- [ ] Rollback tag and the fallback screenshot are in hand
