/**
 * Mercy rules, level unlock, and the save shape (DESIGN.md §8, ARCHITECTURE.md).
 *
 * He must reach the reveal. These are the rules that make that true, and they
 * live in the pure core so they are unit-testable and so a bot run can prove
 * that failing every level still arrives at `revealed: true`.
 */

import { LEVEL_ORDER, type LevelId } from './input.js';
import { modsForFails, TUNING, type Mods } from '../config/tuning.js';

export const SAVE_VERSION = 1;
export const SAVE_KEY = 'bb.save.v1';

export type SaveData = {
  v: typeof SAVE_VERSION;
  /**
   * Number of levels unlocked, 1..5. Never decreases. 5 means all four are
   * behind him and the reveal has been reached.
   */
  unlocked: number;
  fails: Record<LevelId, number>;
  /** Write-once. Nobody should have to re-earn a present. */
  revealed: boolean;
  muted: boolean;
};

export function defaultSave(): SaveData {
  return {
    v: SAVE_VERSION,
    unlocked: 1,
    fails: { pfand: 0, sisyphos: 0, katjes: 0, kayak: 0 },
    revealed: false,
    muted: false,
  };
}

function intIn(v: unknown, lo: number, hi: number, dflt: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.floor(v))) : dflt;
}

/**
 * Accepts anything and returns a usable save. A corrupted blob must not be able
 * to stand between him and the present, so this never throws and never
 * propagates junk — it silently falls back to defaults, field by field.
 */
export function sanitizeSave(raw: unknown): SaveData {
  const out = defaultSave();
  if (!raw || typeof raw !== 'object') return out;
  const r = raw as Partial<SaveData> & { fails?: Partial<Record<LevelId, unknown>> };
  if (r.v !== SAVE_VERSION) return out;
  out.unlocked = intIn(r.unlocked, 1, LEVEL_ORDER.length + 1, 1);
  out.revealed = r.revealed === true;
  out.muted = r.muted === true;
  if (r.fails && typeof r.fails === 'object') {
    for (const id of LEVEL_ORDER) out.fails[id] = intIn(r.fails[id], 0, 99, 0);
  }
  return out;
}

export function levelIndex(level: LevelId): number {
  return LEVEL_ORDER.indexOf(level);
}

export function isUnlocked(save: SaveData, level: LevelId): boolean {
  return levelIndex(level) < save.unlocked;
}

/** The level to resume on. */
export function currentLevel(save: SaveData): LevelId {
  return LEVEL_ORDER[Math.min(save.unlocked, LEVEL_ORDER.length) - 1];
}

export function recordFail(save: SaveData, level: LevelId): SaveData {
  save.fails[level] = Math.min(99, (save.fails[level] ?? 0) + 1);
  return save;
}

/** Completing (or skipping) a level unlocks the next one. `unlocked` never decreases. */
export function recordClear(save: SaveData, level: LevelId): SaveData {
  save.unlocked = Math.max(save.unlocked, Math.min(LEVEL_ORDER.length + 1, levelIndex(level) + 2));
  return save;
}

export function markRevealed(save: SaveData): SaveData {
  save.revealed = true;
  return save;
}

/** „Überspringen" — never offered before the second fail (DESIGN.md §8.1). */
export function offersSkip(save: SaveData, level: LevelId): boolean {
  return (save.fails[level] ?? 0) >= TUNING.mercy.skipAfterFails;
}

/** Silent auto-ease after the fourth fail. No "easy mode" label, ever. */
export function modsFor(save: SaveData, level: LevelId): Mods {
  return modsForFails(save.fails[level] ?? 0);
}

export function isEased(save: SaveData, level: LevelId): boolean {
  return (save.fails[level] ?? 0) >= TUNING.mercy.easeAfterFails;
}

/** True once the last level is behind him — the reveal is the only terminal state. */
export function reachedReveal(save: SaveData): boolean {
  return save.revealed || save.unlocked > LEVEL_ORDER.length;
}
