/**
 * Storage (TESTING.md §6): corrupted blob, wrong version, localStorage
 * throwing, quota exceeded. Every one must degrade to a playable game.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { defaultSave, markRevealed, recordClear, SAVE_KEY } from '../../src/core/progress.js';
import { defaultAfterhourScore, recordAfterhourRun } from '../../src/core/afterhourScore.js';
import { __resetStorageForTests, clearSave, loadSave, saveSave } from '../../src/shell/storage.js';
import {
  __resetAfterhourStorageForTests,
  AFTERHOUR_KEY,
  AFTERHOUR_LEGACY_KEY,
  loadAfterhourScore,
  saveAfterhourScore,
} from '../../src/shell/afterhourStorage.js';

function useStore(impl: Partial<Storage>): void {
  const base: Storage = {
    getItem: () => null,
    setItem: () => undefined,
    removeItem: () => undefined,
    clear: () => undefined,
    key: () => null,
    length: 0,
    ...impl,
  } as Storage;
  vi.stubGlobal('localStorage', base);
}

beforeEach(() => {
  __resetStorageForTests();
  __resetAfterhourStorageForTests();
  vi.spyOn(console, 'info').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('storage', () => {
  it('round-trips a save', () => {
    const store = new Map<string, string>();
    useStore({
      getItem: (k) => store.get(k) ?? null,
      setItem: (k, v) => void store.set(k, v),
      removeItem: (k) => void store.delete(k),
    });

    const save = markRevealed(recordClear(defaultSave(), 'pfand'));
    saveSave(save);
    expect(store.has(SAVE_KEY)).toBe(true);
    const back = loadSave();
    expect(back.unlocked).toBe(2);
    expect(back.revealed).toBe(true);
  });

  it('discards an unparseable blob instead of throwing', () => {
    useStore({ getItem: () => '{not json' });
    expect(() => loadSave()).not.toThrow();
    expect(loadSave()).toEqual(defaultSave());
  });

  it('discards a wrong-version blob', () => {
    useStore({ getItem: () => JSON.stringify({ v: 42, unlocked: 4, revealed: true }) });
    expect(loadSave()).toEqual(defaultSave());
  });

  it('survives localStorage throwing on write (private browsing)', () => {
    useStore({
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('SecurityError');
      },
    });
    expect(() => saveSave(defaultSave())).not.toThrow();
    expect(() => loadSave()).not.toThrow();
  });

  it('keeps progress in memory when the quota is exceeded', () => {
    useStore({
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    });
    const save = recordClear(defaultSave(), 'pfand');
    saveSave(save);
    // The write failed, but this session still knows where he is.
    expect(loadSave().unlocked).toBe(2);
  });

  it('works with no localStorage at all', () => {
    vi.stubGlobal('localStorage', undefined);
    expect(() => saveSave(defaultSave())).not.toThrow();
    expect(loadSave().unlocked).toBe(1);
    saveSave(recordClear(defaultSave(), 'sisyphos'));
    expect(loadSave().unlocked).toBe(3);
  });

  it('clears without throwing', () => {
    useStore({});
    expect(() => clearSave()).not.toThrow();
  });
});

describe('afterhour board storage', () => {
  it('round-trips the board under its own key, leaving the save alone', () => {
    const store = new Map<string, string>();
    useStore({
      getItem: (k) => store.get(k) ?? null,
      setItem: (k, v) => void store.set(k, v),
      removeItem: (k) => void store.delete(k),
    });

    const score = defaultAfterhourScore();
    recordAfterhourRun(score, { name: 'JP', loops: 3, frames: 5400, at: 1 });
    saveAfterhourScore(score);

    expect(store.has(AFTERHOUR_KEY)).toBe(true);
    expect(store.has(SAVE_KEY)).toBe(false);
    expect(loadAfterhourScore().entries[0]).toEqual({ name: 'JP', loops: 3, frames: 5400, at: 1 });
  });

  it('adopts a pre-board v1 best run from the old key', () => {
    useStore({
      getItem: (k) => (k === AFTERHOUR_LEGACY_KEY ? JSON.stringify({ v: 1, bestLoops: 2, bestFrames: 4200 }) : null),
    });
    const back = loadAfterhourScore();
    expect(back.entries).toHaveLength(1);
    expect(back.entries[0].loops).toBe(2);
  });

  it('prefers the board over the legacy blob once one exists', () => {
    const board = defaultAfterhourScore();
    recordAfterhourRun(board, { name: 'NEU', loops: 9, frames: 100, at: 5 });
    useStore({
      getItem: (k) =>
        k === AFTERHOUR_KEY
          ? JSON.stringify(board)
          : JSON.stringify({ v: 1, bestLoops: 2, bestFrames: 4200 }),
    });
    expect(loadAfterhourScore().entries.map((e) => e.name)).toEqual(['NEU']);
  });

  it('degrades to memory when localStorage is gone', () => {
    vi.stubGlobal('localStorage', undefined);
    const score = defaultAfterhourScore();
    recordAfterhourRun(score, { name: 'JP', loops: 1, frames: 60, at: 1 });
    expect(() => saveAfterhourScore(score)).not.toThrow();
    expect(loadAfterhourScore().entries).toHaveLength(1);
  });
});
