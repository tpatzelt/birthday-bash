/**
 * localStorage under one versioned key, with an in-memory fallback.
 *
 * Nothing in the game path may throw when localStorage is unavailable (private
 * browsing, disabled storage, quota) — a corrupted save must not be able to
 * stand between him and the present (ARCHITECTURE.md).
 */

import { sanitizeSave, SAVE_KEY, type SaveData } from '../core/progress.js';

let memory: string | null = null;
let warned = false;

function backing(): Storage | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    // Touch it: Safari private mode throws on *write*, not on access.
    const probe = '__bb_probe__';
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
    return localStorage;
  } catch {
    if (!warned) {
      warned = true;
      // Degrade quietly. The game still works; progress just won't survive a
      // reload, which is a far better outcome than a thrown error at a party.
      console.info('[bb] storage unavailable, using memory');
    }
    return null;
  }
}

export function loadSave(): SaveData {
  let raw: string | null = null;
  try {
    raw = backing()?.getItem(SAVE_KEY) ?? memory;
  } catch {
    raw = memory;
  }
  if (!raw) return sanitizeSave(null);
  try {
    return sanitizeSave(JSON.parse(raw));
  } catch {
    // Unparseable blob: discard silently, never throw on it.
    return sanitizeSave(null);
  }
}

export function saveSave(save: SaveData): void {
  const raw = JSON.stringify(save);
  memory = raw;
  try {
    backing()?.setItem(SAVE_KEY, raw);
  } catch {
    /* quota or private mode: memory already holds it */
  }
}

export function clearSave(): void {
  memory = null;
  try {
    backing()?.removeItem(SAVE_KEY);
  } catch {
    /* ignored */
  }
}

/** Test seam: forget the in-memory copy between cases. */
export function __resetStorageForTests(): void {
  memory = null;
  warned = false;
}
