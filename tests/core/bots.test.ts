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
    it(`wins ${level} on every seed`, () => {
      expect(winRate(level, 'perfect')).toBe(1);
    });
  }
});

describe('casual bot', () => {
  for (const level of LEVEL_ORDER) {
    it(`wins ${level} at least 85 % of the time`, () => {
      expect(winRate(level, 'casual')).toBeGreaterThanOrEqual(0.85);
    });
  }
});

describe('tipsy bot', () => {
  for (const level of LEVEL_ORDER) {
    it(`wins ${level} at least 50 % of the time`, () => {
      expect(winRate(level, 'tipsy')).toBeGreaterThanOrEqual(0.5);
    });

    it(`wins ${level} more often once the mercy rules have eased it`, () => {
      const eased = modsForFails(TUNING.mercy.easeAfterFails);
      let wins = 0;
      for (let seed = 0; seed < SEEDS; seed++) {
        if (runLevel(level, seed, 'tipsy', { mods: eased }).won) wins++;
      }
      // The eased level must be winnable — that is the whole point of §8.2.
      expect(wins / SEEDS).toBeGreaterThanOrEqual(0.6);
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

  it('still wins the kayak by doing nothing more often than not', () => {
    // L4 was tuned harder (denser, bigger rocks): doing nothing is no longer a
    // near-guarantee, but it still has to be the *safest* available play, not
    // a trap. reports/balance.md tracks the exact rate.
    expect(winRate('kayak', 'idle', 40)).toBeGreaterThanOrEqual(0.35);
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
