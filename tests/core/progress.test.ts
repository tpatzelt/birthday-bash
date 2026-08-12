import { describe, expect, it } from 'vitest';

import {
  currentLevel,
  defaultSave,
  isEased,
  isUnlocked,
  markRevealed,
  modsFor,
  offersSkip,
  recordClear,
  recordFail,
  recordLevelTime,
  sanitizeSave,
  SAVE_VERSION,
  totalTimeFrames,
  updateBestTotal,
} from '../../src/core/progress.js';
import { LEVEL_ORDER } from '../../src/core/input.js';
import { TUNING } from '../../src/config/tuning.js';

describe('save sanitising', () => {
  it('accepts a valid save', () => {
    const save = defaultSave();
    save.unlocked = 3;
    save.fails.pfand = 2;
    save.revealed = true;
    expect(sanitizeSave(JSON.parse(JSON.stringify(save)))).toEqual(save);
  });

  it('discards a wrong-version blob silently', () => {
    expect(sanitizeSave({ v: 99, unlocked: 4, revealed: true })).toEqual(defaultSave());
  });

  it('survives every kind of junk', () => {
    for (const junk of [null, undefined, 0, 'nope', [], { v: SAVE_VERSION, unlocked: 'x' }, { v: 1 }]) {
      const s = sanitizeSave(junk);
      expect(s.v).toBe(SAVE_VERSION);
      expect(s.unlocked).toBeGreaterThanOrEqual(1);
      expect(Number.isFinite(s.unlocked)).toBe(true);
    }
  });

  it('clamps out-of-range values rather than trusting them', () => {
    const s = sanitizeSave({ v: 1, unlocked: 9999, fails: { pfand: -5, katjes: 1e9 }, revealed: 'yes' });
    expect(s.unlocked).toBe(LEVEL_ORDER.length + 1);
    expect(s.fails.pfand).toBe(0);
    expect(s.fails.katjes).toBe(99);
    expect(s.revealed).toBe(false); // only a real boolean counts
  });
});

describe('unlock', () => {
  it('never decreases', () => {
    const save = defaultSave();
    recordClear(save, 'pfand');
    recordClear(save, 'sisyphos');
    expect(save.unlocked).toBe(3);
    recordClear(save, 'pfand'); // replaying an old level
    expect(save.unlocked).toBe(3);
  });

  it('gates levels until they are reached', () => {
    const save = defaultSave();
    expect(isUnlocked(save, 'pfand')).toBe(true);
    expect(isUnlocked(save, 'sisyphos')).toBe(false);
    recordClear(save, 'pfand');
    expect(isUnlocked(save, 'sisyphos')).toBe(true);
    expect(currentLevel(save)).toBe('sisyphos');
  });

  it('keeps currentLevel valid once everything is cleared', () => {
    const save = defaultSave();
    for (const level of LEVEL_ORDER) recordClear(save, level);
    expect(currentLevel(save)).toBe('kayak');
    expect(LEVEL_ORDER).toContain(currentLevel(save));
  });
});

describe('revealed', () => {
  it('never flips back to false', () => {
    const save = markRevealed(defaultSave());
    expect(sanitizeSave(JSON.parse(JSON.stringify(save))).revealed).toBe(true);
    markRevealed(save);
    expect(save.revealed).toBe(true);
  });
});

describe('mercy rules', () => {
  it('offers the skip only from the second fail', () => {
    const save = defaultSave();
    expect(offersSkip(save, 'pfand')).toBe(false);
    recordFail(save, 'pfand');
    expect(offersSkip(save, 'pfand')).toBe(false);
    recordFail(save, 'pfand');
    expect(offersSkip(save, 'pfand')).toBe(true);
  });

  it('eases silently from the fourth fail, and never before', () => {
    const save = defaultSave();
    for (let i = 0; i < TUNING.mercy.easeAfterFails - 1; i++) {
      recordFail(save, 'kayak');
      expect(isEased(save, 'kayak')).toBe(false);
      expect(modsFor(save, 'kayak')).toEqual({ densityMul: 1, speedMul: 1, extraLives: 0 });
    }
    recordFail(save, 'kayak');
    expect(isEased(save, 'kayak')).toBe(true);
    const mods = modsFor(save, 'kayak');
    expect(mods.densityMul).toBe(TUNING.mercy.easeDensityMul);
    expect(mods.speedMul).toBe(TUNING.mercy.easeSpeedMul);
    expect(mods.extraLives).toBe(TUNING.mercy.easeExtraLives);
  });

  it('eases each level independently', () => {
    const save = defaultSave();
    for (let i = 0; i < 5; i++) recordFail(save, 'pfand');
    expect(isEased(save, 'pfand')).toBe(true);
    expect(isEased(save, 'katjes')).toBe(false);
  });

  it('caps the fail counter rather than growing forever', () => {
    const save = defaultSave();
    for (let i = 0; i < 200; i++) recordFail(save, 'pfand');
    expect(save.fails.pfand).toBe(99);
  });
});

describe('high score', () => {
  it('has no total until every level has a recorded time', () => {
    const save = defaultSave();
    expect(totalTimeFrames(save)).toBeNull();
    for (const level of LEVEL_ORDER) recordLevelTime(save, level, 600);
    expect(totalTimeFrames(save)).toBe(600 * LEVEL_ORDER.length);
  });

  it('keeps the fastest clear, not the latest', () => {
    const save = defaultSave();
    recordLevelTime(save, 'pfand', 900);
    recordLevelTime(save, 'pfand', 700); // faster replay
    expect(save.times.pfand).toBe(700);
    recordLevelTime(save, 'pfand', 950); // slower replay: ignored
    expect(save.times.pfand).toBe(700);
  });

  it('records a new best only when the total actually improves', () => {
    const save = defaultSave();
    for (const level of LEVEL_ORDER) recordLevelTime(save, level, 600);
    expect(updateBestTotal(save)).toBe(true);
    expect(save.bestTotalFrames).toBe(600 * LEVEL_ORDER.length);

    // Same total again: no longer a new record.
    expect(updateBestTotal(save)).toBe(false);
    expect(save.bestTotalFrames).toBe(600 * LEVEL_ORDER.length);

    // A slower total: not a new record, and the old best survives.
    const bestBefore = save.bestTotalFrames;
    for (const level of LEVEL_ORDER) recordLevelTime(save, level, 700);
    // recordLevelTime keeps the minimum, so times are still 600 each; force a
    // genuinely worse total the way a fresh, slower save would arrive with one.
    save.times.kayak = 900;
    expect(updateBestTotal(save)).toBe(false);
    expect(save.bestTotalFrames).toBe(bestBefore);
  });

  it('does not record a time for a skipped level', () => {
    const save = defaultSave();
    recordClear(save, 'pfand'); // "Überspringen": cleared, never won
    expect(save.times.pfand).toBe(0);
    expect(totalTimeFrames(save)).toBeNull();
  });

  it('sanitises times and bestTotalFrames from untrusted JSON', () => {
    const s = sanitizeSave({
      v: SAVE_VERSION,
      times: { pfand: -5, sisyphos: 1e9, katjes: 'nope' },
      bestTotalFrames: 'nope',
    });
    expect(s.times.pfand).toBe(0);
    expect(s.times.sisyphos).toBeLessThanOrEqual(999_999);
    expect(s.times.katjes).toBe(0);
    expect(s.bestTotalFrames).toBeNull();
  });
});
