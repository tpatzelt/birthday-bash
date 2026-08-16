/**
 * The Afterhour highscore board (TESTING.md §6 rules for persisted blobs):
 * ranking, the size cap, junk in the blob, and the v1 → v2 migration. Same
 * contract as the save — never throw, never propagate junk, never lose a run
 * that was already filed.
 */

import { describe, expect, it } from 'vitest';

import {
  ANON_NAME,
  BOARD_SIZE,
  bestEntry,
  defaultAfterhourScore,
  recordAfterhourRun,
  renameEntry,
  sanitizeAfterhourScore,
  sanitizeName,
  type AfterhourScore,
} from '../../src/core/afterhourScore.js';

/** `at` ascends with each call so ties resolve by "who got there first". */
let clock = 1_700_000_000_000;
function file(score: AfterhourScore, loops: number, frames: number, name = ANON_NAME) {
  return recordAfterhourRun(score, { name, loops, frames, at: clock++ });
}

describe('afterhour board', () => {
  it('ranks by loops, then by how long the run lasted', () => {
    const s = defaultAfterhourScore();
    file(s, 1, 5000, 'AAA');
    file(s, 3, 100, 'BBB');
    file(s, 1, 9000, 'CCC');
    expect(s.entries.map((e) => e.name)).toEqual(['BBB', 'CCC', 'AAA']);
  });

  it('does not let a tie bump the run that got there first', () => {
    const s = defaultAfterhourScore();
    file(s, 2, 600, 'OLD');
    const { rank, isNewBest } = file(s, 2, 600, 'NEW');
    expect(rank).toBe(1);
    expect(isNewBest).toBe(false);
    expect(bestEntry(s)?.name).toBe('OLD');
  });

  it('reports the rank a run landed on, and a new best only at the top', () => {
    const s = defaultAfterhourScore();
    expect(file(s, 1, 100).isNewBest).toBe(true);
    const second = file(s, 0, 900);
    expect(second.rank).toBe(1);
    expect(second.isNewBest).toBe(false);
    const top = file(s, 4, 100);
    expect(top.rank).toBe(0);
    expect(top.isNewBest).toBe(true);
  });

  it('keeps only the best BOARD_SIZE runs', () => {
    const s = defaultAfterhourScore();
    for (let i = 0; i < BOARD_SIZE + 5; i++) file(s, i, 100);
    expect(s.entries).toHaveLength(BOARD_SIZE);
    expect(s.entries[0].loops).toBe(BOARD_SIZE + 4);
    expect(s.entries[BOARD_SIZE - 1].loops).toBe(5);
  });

  it('tells a run that missed the board apart from one that made it', () => {
    const s = defaultAfterhourScore();
    for (let i = 0; i < BOARD_SIZE; i++) file(s, 10 + i, 100);
    expect(file(s, 0, 10).rank).toBeNull();
    expect(s.entries).toHaveLength(BOARD_SIZE);
    expect(file(s, 999, 10).rank).toBe(0);
  });

  it('renames a filed run and remembers the initials for next time', () => {
    const s = defaultAfterhourScore();
    const { rank } = file(s, 2, 400);
    renameEntry(s, rank as number, 'jp');
    expect(s.entries[0].name).toBe('JP');
    expect(s.lastName).toBe('JP');
  });

  it('ignores a rename of a row that is not there', () => {
    const s = defaultAfterhourScore();
    expect(() => renameEntry(s, 4, 'XYZ')).not.toThrow();
    expect(s.entries).toHaveLength(0);
  });
});

describe('initials', () => {
  it('uppercases, keeps umlauts, and cuts to three glyphs', () => {
    expect(sanitizeName('jonas')).toBe('JON');
    expect(sanitizeName('äöü')).toBe('ÄÖÜ');
    expect(sanitizeName('j2')).toBe('J2');
  });

  it('drops anything that is not a letter or a digit', () => {
    expect(sanitizeName('<b>')).toBe('B');
    expect(sanitizeName('🎉🎉🎉')).toBe(ANON_NAME);
    expect(sanitizeName('   ')).toBe(ANON_NAME);
    expect(sanitizeName(42)).toBe(ANON_NAME);
    expect(sanitizeName(null)).toBe(ANON_NAME);
  });
});

describe('sanitizeAfterhourScore', () => {
  it('round-trips a real board', () => {
    const s = defaultAfterhourScore();
    file(s, 3, 900, 'JP');
    const back = sanitizeAfterhourScore(JSON.parse(JSON.stringify(s)));
    expect(back.entries).toEqual(s.entries);
    expect(back.lastName).toBe(s.lastName);
  });

  it('returns an empty board for junk, null, or a future version', () => {
    expect(sanitizeAfterhourScore(null).entries).toEqual([]);
    expect(sanitizeAfterhourScore('nope').entries).toEqual([]);
    expect(sanitizeAfterhourScore({ v: 99, entries: [{ loops: 5 }] }).entries).toEqual([]);
  });

  it('repairs and re-sorts a hand-edited blob instead of trusting it', () => {
    const back = sanitizeAfterhourScore({
      v: 2,
      lastName: 'much too long',
      entries: [
        { name: 'A', loops: 1, frames: 100, at: 1 },
        'not an entry at all',
        { name: 'B', loops: 99, frames: Infinity, at: 2 },
        { name: 'C', loops: -5, frames: -5, at: 2 },
      ],
    });
    expect(back.lastName).toBe('MUC');
    // The string is dropped outright; the rest are repaired and re-sorted.
    expect(back.entries.map((e) => e.name)).toEqual(['B', 'A', 'C']);
    expect(back.entries[0].frames).toBe(0); // Infinity is not a finite frame count
    expect(back.entries.every((e) => e.loops >= 0 && e.frames >= 0)).toBe(true);
  });

  it('keeps a device that already had a v1 best run', () => {
    const back = sanitizeAfterhourScore({ v: 1, bestLoops: 4, bestFrames: 7200 });
    expect(back.v).toBe(2);
    expect(back.entries).toEqual([{ name: ANON_NAME, loops: 4, frames: 7200, at: 0 }]);
  });

  it('migrates an empty v1 blob to an empty board, not a phantom run', () => {
    expect(sanitizeAfterhourScore({ v: 1, bestLoops: 0, bestFrames: 0 }).entries).toEqual([]);
  });
});
