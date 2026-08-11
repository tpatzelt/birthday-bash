/**
 * The level dispatcher: `create(level, seed, h, mods)` and `step(state, input)`.
 *
 * This is the whole public surface of the simulation. Everything above it —
 * renderer, audio, shell, tests, bots — talks to the game through these two
 * functions and the plain state they hand back.
 */

import type { InputFrame, LevelId, Tape } from './input.js';
import { decodeFrame, makeInput, LEVEL_ORDER } from './input.js';
import { clearEvents, type BaseState } from './state.js';
import { NO_MODS, type Mods } from '../config/tuning.js';

import * as pfand from './levels/pfand.js';
import * as sisyphos from './levels/sisyphos.js';
import * as katjes from './levels/katjes.js';
import * as kayak from './levels/kayak.js';

export type { PfandState } from './levels/pfand.js';
export type { SisyphosState } from './levels/sisyphos.js';
export type { KatjesState } from './levels/katjes.js';
export type { KayakState } from './levels/kayak.js';

export type AnyLevelState =
  | pfand.PfandState
  | sisyphos.SisyphosState
  | katjes.KatjesState
  | kayak.KayakState;

export function createLevel(level: LevelId, seed: number, h: number, mods: Mods = NO_MODS): AnyLevelState {
  switch (level) {
    case 'pfand':
      return pfand.create(seed, h, mods);
    case 'sisyphos':
      return sisyphos.create(seed, h, mods);
    case 'katjes':
      return katjes.create(seed, h, mods);
    case 'kayak':
      return kayak.create(seed, h, mods);
  }
}

/**
 * Advance one fixed 1/60 s tick. Events from the previous frame are dropped
 * first, so anything in `state.events` after this call belongs to this frame.
 */
export function stepLevel(s: AnyLevelState, input: InputFrame): AnyLevelState {
  clearEvents(s as BaseState);
  switch (s.level) {
    case 'pfand':
      return pfand.step(s, input);
    case 'sisyphos':
      return sisyphos.step(s, input);
    case 'katjes':
      return katjes.step(s, input);
    case 'kayak':
      return kayak.step(s, input);
  }
}

/** Hard frame cap per level — the "no soft-lock, ever" guarantee (TESTING.md §3). */
export function frameCap(level: LevelId): number {
  switch (level) {
    case 'pfand':
      return 160 * 60;
    case 'sisyphos':
      return 130 * 60;
    case 'katjes':
      return 160 * 60;
    case 'kayak':
      return 150 * 60;
  }
}

export function nextLevel(level: LevelId): LevelId | null {
  const i = LEVEL_ORDER.indexOf(level);
  return i >= 0 && i < LEVEL_ORDER.length - 1 ? LEVEL_ORDER[i + 1] : null;
}

/**
 * Replay a recorded tape. Same seed + same tape ⇒ identical state hash, on
 * every machine, forever (TESTING.md §2).
 */
export function replay(tape: Tape): AnyLevelState {
  const s = createLevel(tape.level, tape.seed, tape.h, tape.mods ?? NO_MODS);
  const input = makeInput();
  for (let i = 0; i < tape.frames.length; i++) {
    if (s.status !== 'run') break;
    decodeFrame(tape.frames[i], input);
    stepLevel(s, input);
  }
  return s;
}
