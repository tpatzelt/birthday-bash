/**
 * Storage (TESTING.md §6): corrupted blob, wrong version, localStorage
 * throwing, quota exceeded. Every one must degrade to a playable game.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { defaultSave, markRevealed, recordClear, SAVE_KEY } from '../../src/core/progress.js';
import { __resetStorageForTests, clearSave, loadSave, saveSave } from '../../src/shell/storage.js';

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
