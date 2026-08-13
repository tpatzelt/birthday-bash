/**
 * Bot beatability — the most important tests in the repo (TESTING.md §3).
 *
 * These encode the promise in DESIGN.md §8: *he must be able to finish*. If one
 * of these goes red, the gift is broken, whatever else is green.
 */

import { describe, expect, it } from 'vitest';

import { runLevel, type BotName } from '../../src/core/bots.js';
import { LEVEL_ORDER, type LevelId } from '../../src/core/input.js';
import { frameCap } from '../../src/core/game.js';
import { findNonFinite } from '../../src/core/state.js';
import { modsForFails, TUNING } from '../../src/config/tuning.js';
import {
  defaultSave,
  markRevealed,
  modsFor,
  offersSkip,
  recordClear,
  recordFail,
  reachedReveal,
} from '../../src/core/progress.js';

/**
 * Kept modest so `npm test` stays fast; the balance report runs 200.
 *
 * Fewer seeds is not flakier here: the core is deterministic, so a given seed
 * either always wins or always loses. The seed count trades coverage for time,
 * never stability.
 */
const SEEDS = 40;

function winRate(level: LevelId, bot: BotName, seeds = SEEDS): number {
  let wins = 0;
  for (let seed = 0; seed < seeds; seed++) if (runLevel(level, seed, bot).won) wins++;
  return wins / seeds;
}

describe('perfect bot', () => {
  for (const level of LEVEL_ORDER) {
    // Not `toBe(1)` any more. `perfect` is a greedy heuristic, not an oracle:
    // on the post-difficulty-pass L2 it scores one candidate column at a time
    // and can walk itself into a corner that a human with a plan would have
    // avoided — about one seed in two hundred. Whether the *level* is fair is
    // asserted where it belongs, by the no-unavoidable-death lookahead in
    // fuzz.test.ts (which those seeds pass at every sampled frame).
    it(`wins at least 97 % of ${level} seeds`, () => {
      expect(winRate(level, 'perfect')).toBeGreaterThanOrEqual(0.97);
    });
  }
});

describe('casual bot', () => {
  for (const level of LEVEL_ORDER) {
    // The difficulty pass deliberately spent most of the old headroom here: a
    // level nobody can lose is not a present, it is a cutscene. What still has
    // to hold is that a competent run clears it more often than not, on the
    // first or second attempt.
    it(`wins ${level} at least 55 % of the time`, () => {
      expect(winRate(level, 'casual')).toBeGreaterThanOrEqual(0.55);
    });
  }
});

describe('tipsy bot', () => {
  for (const level of LEVEL_ORDER) {
    // No un-eased floor for `tipsy` any more: after the difficulty pass the
    // worst player we model is *meant* to lose the raw level. The promise in
    // DESIGN.md §8 is carried by the mercy rules below, not by the base tuning.
    it(`wins ${level} far more often once the mercy rules have eased it`, () => {
      const eased = modsForFails(TUNING.mercy.easeAfterFails);
      let wins = 0;
      for (let seed = 0; seed < SEEDS; seed++) {
        if (runLevel(level, seed, 'tipsy', { mods: eased }).won) wins++;
      }
      // The eased level must be winnable — that is the whole point of §8.2.
      expect(wins / SEEDS).toBeGreaterThanOrEqual(0.6);
      // And easing must actually ease: a safety net that changes nothing is a
      // bug the win rates alone would not catch.
      expect(wins / SEEDS).toBeGreaterThan(winRate(level, 'tipsy'));
    });
  }
});

describe('idle bot', () => {
  for (const level of LEVEL_ORDER) {
    it(`terminates ${level} without soft-locking`, () => {
      for (let seed = 0; seed < 10; seed++) {
        const r = runLevel(level, seed, 'idle');
        expect(r.state.status, `${level} seed ${seed}`).not.toBe('run');
        expect(r.frames).toBeLessThan(frameCap(level));
      }
    });
  }

  it('still survives the kayak far longer than flailing does', () => {
    // Doing nothing no longer *wins* L4 — the narrower channel takes care of
    // that — but it must stay the safest available play rather than a trap, or
    // the joke in DESIGN.md §4 stops being true. Survival time, not win rate,
    // is what carries that now. reports/balance.md tracks both.
    const frames = (bot: BotName) => {
      const xs: number[] = [];
      for (let seed = 0; seed < 20; seed++) xs.push(runLevel('kayak', seed, bot).frames);
      xs.sort((a, b) => a - b);
      return xs[xs.length >> 1];
    };
    expect(frames('idle')).toBeGreaterThan(3 * frames('mash'));
  });
});

describe('mash bot', () => {
  for (const level of LEVEL_ORDER) {
    it(`survives random input on ${level} with no NaN and no soft-lock`, () => {
      for (let seed = 0; seed < 12; seed++) {
        const r = runLevel(level, seed, 'mash', { scanEvery: 60 });
        expect(r.nonFinite, `${level} seed ${seed}`).toBeNull();
        expect(findNonFinite(r.state)).toBeNull();
        expect(r.state.status).not.toBe('run');
        expect(r.frames).toBeLessThanOrEqual(frameCap(level));
      }
    });
  }
});

describe('invariants across every bot run', () => {
  it('never produces a non-finite state value', () => {
    for (const level of LEVEL_ORDER) {
      for (const bot of ['perfect', 'casual', 'tipsy'] as BotName[]) {
        for (let seed = 0; seed < 6; seed++) {
          const r = runLevel(level, seed, bot, { scanEvery: 30 });
          expect(r.nonFinite, `${level}/${bot}/${seed}`).toBeNull();
        }
      }
    }
  });

  it('never lets lives go negative or exceed the maximum', () => {
    for (const level of LEVEL_ORDER) {
      for (let seed = 0; seed < 8; seed++) {
        const r = runLevel(level, seed, 'tipsy');
        expect(r.state.lives).toBeGreaterThanOrEqual(0);
        expect(r.state.lives).toBeLessThanOrEqual(r.state.livesMax);
      }
    }
  });

  it('keeps progress inside 0..1', () => {
    for (const level of LEVEL_ORDER) {
      const r = runLevel(level, 3, 'casual');
      expect(r.state.progress).toBeGreaterThanOrEqual(0);
      expect(r.state.progress).toBeLessThanOrEqual(1);
    }
  });
});

describe('the reveal is reachable', () => {
  it('by failing every level twice and taking every skip', () => {
    const save = defaultSave();
    for (const level of LEVEL_ORDER) {
      // Two fails: the skip button appears (DESIGN.md §8.1).
      expect(offersSkip(save, level)).toBe(false);
      recordFail(save, level);
      expect(offersSkip(save, level)).toBe(false);
      recordFail(save, level);
      expect(offersSkip(save, level)).toBe(true);
      recordClear(save, level); // "Überspringen"
    }
    markRevealed(save);
    expect(reachedReveal(save)).toBe(true);
    expect(save.unlocked).toBe(LEVEL_ORDER.length + 1);
  });

  it('by failing four times, at which point the level silently eases', () => {
    const save = defaultSave();
    const level: LevelId = 'katjes';
    for (let i = 0; i < TUNING.mercy.easeAfterFails; i++) {
      expect(modsFor(save, level).densityMul).toBe(1);
      recordFail(save, level);
    }
    const mods = modsFor(save, level);
    expect(mods.densityMul).toBeLessThan(1);
    expect(mods.speedMul).toBeLessThan(1);
    expect(mods.extraLives).toBeGreaterThan(0);
  });
});
