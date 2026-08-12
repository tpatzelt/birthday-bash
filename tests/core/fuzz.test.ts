/**
 * Fuzz (TESTING.md §4). Cheap because the core is pure.
 *
 * Catches spawn tables that place an unavoidable obstacle pair, entities
 * leaking off-pool, and arithmetic that goes non-finite.
 */

import { describe, expect, it } from 'vitest';

import { createLevel, frameCap, stepLevel, type AnyLevelState } from '../../src/core/game.js';
import { LEVEL_ORDER } from '../../src/core/input.js';
import { makeInput } from '../../src/core/input.js';
import { makeRng, rand, randRange } from '../../src/core/rng.js';
import { botInput, makeBot } from '../../src/core/bots.js';
import { findNonFinite } from '../../src/core/state.js';
import { DT, TUNING, W } from '../../src/config/tuning.js';
import type { PfandState } from '../../src/core/levels/pfand.js';

const SEEDS = 250;

describe('fuzz', () => {
  it('survives random input on every level without going non-finite', () => {
    for (const level of LEVEL_ORDER) {
      for (let seed = 0; seed < SEEDS; seed++) {
        const s = createLevel(level, seed, 620 + (seed % 281));
        const rng = makeRng(seed * 31 + 7);
        const input = makeInput();
        const cap = frameCap(level);
        while (s.status === 'run' && s.frame < cap) {
          if (rand(rng) < 0.2) {
            input.down = rand(rng) < 0.65;
            input.x = randRange(rng, 0, W);
            input.y = randRange(rng, 0, s.h);
          }
          stepLevel(s, input);
          if (s.frame % 120 === 0) {
            const bad = findNonFinite(s);
            expect(bad, `${level} seed ${seed} frame ${s.frame}`).toBeNull();
          }
        }
        expect(s.status, `${level} seed ${seed} soft-locked`).not.toBe('run');
      }
    }
  });

  it('never leaks entities out of their pools', () => {
    for (const level of LEVEL_ORDER) {
      for (let seed = 0; seed < 20; seed++) {
        const s = createLevel(level, seed, 780);
        const input = makeInput();
        const pools = poolsOf(s);
        const sizes = pools.map((p) => p.length);
        while (s.status === 'run' && s.frame < frameCap(level)) {
          input.down = true;
          input.x = (s.frame * 7) % W;
          stepLevel(s, input);
        }
        poolsOf(s).forEach((p, i) => expect(p.length).toBe(sizes[i]));
      }
    }
  });

  it('never spawns two obstacles closer than a landing plus a fresh jump', () => {
    const P = TUNING.pfand;
    // The spawn gap scales with the speed ramp, so wave-to-wave *time* is
    // constant however fast the level gets: gapMin / speedBase.
    const waveGapS = P.gapMin / P.speedBase;
    const tallest = Math.max(...P.obstacles.map((o) => o.h));
    const airtime = (-2 * P.jumpImpulse) / P.gravity - DT;
    // Worst case, back to back: the first obstacle is cleared as late as it can
    // be, so the feet touch down as late as they can...
    const latestLanding = airtime - tClearOf(tallest);
    // ...and the next one still needs its jump begun tClear before it arrives.
    const latestStart = waveGapS - tClearOf(tallest);
    // Anything below zero here is a spawn table that can demand a jump from
    // mid-air. Four frames is the margin a thumb needs to exist at all.
    expect(latestStart - latestLanding).toBeGreaterThan(4 * DT);
  });

  it('has no unavoidable-death configuration: some input always survives', () => {
    // A shallow lookahead search, not an exhaustive one. States are sampled
    // from an ordinary (casual-bot) playthrough rather than from idle input,
    // and only while the player is *neutral* — on the ground, not already
    // inside a hit, nothing already past the last moment it could have been
    // answered. Otherwise this would assert something much stronger than
    // fairness: that you can always escape a hole you are already in.
    for (const level of LEVEL_ORDER) {
      for (let seed = 0; seed < 12; seed++) {
        const s = createLevel(level, seed, 780);
        const driver = makeBot('casual', seed);
        while (s.status === 'run' && s.frame < frameCap(level)) {
          stepLevel(s, botInput(driver, s));
          if (s.frame % 90 === 0 && s.status === 'run' && neutral(s)) {
            expect(survivable(s), `${level} seed ${seed} frame ${s.frame}`).toBe(true);
          }
        }
      }
    }
  });
});

/** A position a player could reasonably be expected to escape from. */
function neutral(s: AnyLevelState): boolean {
  if (s.invuln > 0) return false;
  if (s.level === 'pfand') return s.onGround && nothingPastTheLastMoment(s);
  if (s.level === 'kayak') return s.ruhe > 25;
  return true;
}

/**
 * Height of the feet `t` seconds into a jump, for the discrete integrator the
 * level actually runs (mirrors bots.ts).
 */
function jumpHeight(t: number): number {
  const P = TUNING.pfand;
  const h = -P.jumpImpulse * t - 0.5 * P.gravity * t * (t + DT);
  return h > 0 ? h : 0;
}

/**
 * Standing on the ground with a Baustellenzaun 10 px from your face is not a
 * spawn-table bug — it is a jump missed half a second ago, and no input from
 * *here* saves it. A state only counts as neutral if a jump begun this very
 * frame could still lift the feet over whatever is bearing down before it
 * arrives; anything closer is the hole you are already in, which the comment on
 * the test above explicitly declines to assert about.
 *
 * The coverage this gives up — two obstacles spawned so close that landing from
 * the first puts you inside the second's last moment — is covered statically
 * instead, by "the spawn table always leaves time to land and jump again".
 */
function nothingPastTheLastMoment(s: PfandState): boolean {
  const P = TUNING.pfand;
  for (const it of s.items) {
    if (!it.active || it.kind === 'bottle') continue;
    const leading = it.x - it.w / 2;
    if (leading <= P.playerX + P.hitW) continue; // level with the player or behind
    const tEnter = (leading - (P.playerX + P.hitW)) / s.speed;
    if (tEnter < tClearOf(it.h)) return false;
  }
  return true;
}

/** Seconds from the start of a jump until the feet are above `h`, frame-quantised. */
function tClearOf(h: number): number {
  for (let f = 1; f <= 60; f++) if (jumpHeight(f * DT) > h) return f * DT;
  return Infinity;
}

function poolsOf(s: AnyLevelState): Array<unknown[]> {
  switch (s.level) {
    case 'pfand':
      return [s.items];
    case 'sisyphos':
      return [s.bouncers, s.shades];
    case 'katjes':
      return [s.items];
    case 'kayak':
      return [s.rocks];
  }
}

/**
 * Can the player get through the next 90 frames from here, at all?
 *
 * A shallow search over a handful of plans — the omniscient policy plus a few
 * crude ones. If none of them survives, the spawn table has produced a
 * configuration no player could have escaped, which is a bug in the level and
 * not in the player.
 */
function survivable(s: AnyLevelState): boolean {
  const crude: Array<(frame: number) => { down: boolean; x: number }> = [
    () => ({ down: false, x: 0 }),
    (f) => ({ down: f % 24 < 2, x: W / 2 }),
    () => ({ down: true, x: 40 }),
    () => ({ down: true, x: W - 40 }),
    () => ({ down: true, x: W / 2 }),
  ];
  const startLives = s.lives;

  const attempt = (next: (copy: AnyLevelState, frame: number) => { down: boolean; x: number }): boolean => {
    const copy = clone(s);
    const input = makeInput();
    for (let f = 0; f < 90; f++) {
      const p = next(copy, f);
      input.down = p.down;
      input.x = p.x;
      input.y = copy.h / 2;
      stepLevel(copy, input);
      if (copy.status === 'fail' || copy.lives < startLives) return false;
      if (copy.status === 'win') return true;
    }
    return true;
  };

  const bot = makeBot('perfect', s.seed);
  if (attempt((copy) => botInput(bot, copy))) return true;
  return crude.some((plan) => attempt((_copy, f) => plan(f)));
}

/** State is plain JSON by design, which makes forking a run this easy. */
function clone<T>(s: T): T {
  return JSON.parse(JSON.stringify(s)) as T;
}
