/**
 * localStorage for the Afterhour highscore, under its own versioned key.
 *
 * A line-for-line mirror of storage.ts's degrade-to-memory contract, kept
 * fully separate from the main save (SAVE_KEY) so nothing here can ever
 * touch the reveal-never-blocked guarantee.
 */

import { sanitizeAfterhourScore, type AfterhourScore } from '../core/afterhourScore.js';

export const AFTERHOUR_KEY = 'bb.afterhour.v1';

let memory: string | null = null;
let warned = false;

function backing(): Storage | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const probe = '__bb_ah_probe__';
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
    return localStorage;
  } catch {
    if (!warned) {
      warned = true;
      console.info('[bb] afterhour storage unavailable, using memory');
    }
    return null;
  }
}

export function loadAfterhourScore(): AfterhourScore {
  let raw: string | null = null;
  try {
    raw = backing()?.getItem(AFTERHOUR_KEY) ?? memory;
  } catch {
    raw = memory;
  }
  if (!raw) return sanitizeAfterhourScore(null);
  try {
    return sanitizeAfterhourScore(JSON.parse(raw));
  } catch {
    return sanitizeAfterhourScore(null);
  }
}

export function saveAfterhourScore(score: AfterhourScore): void {
  const raw = JSON.stringify(score);
  memory = raw;
  try {
    backing()?.setItem(AFTERHOUR_KEY, raw);
  } catch {
    /* quota or private mode: memory already holds it */
  }
}

/** Test seam: forget the in-memory copy between cases. */
export function __resetAfterhourStorageForTests(): void {
  memory = null;
  warned = false;
}
