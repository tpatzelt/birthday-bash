/**
 * AFTERHOUR — the hidden endless bonus level.
 *
 * Not a fifth `LevelId`: a pure orchestrator that cycles the four existing,
 * unmodified level cores back-to-back in shortening, harder bursts under one
 * shared strike pool. Reuses `createLevel`/`stepLevel` from game.ts as-is —
 * zero lines change in core/levels/{pfand,sisyphos,katjes,kayak}.ts.
 *
 * Unifying two different native loss shapes (discrete lives vs. Kayak's
 * continuous Ruhe) without touching either: a segment's own `mods.extraLives`
 * is inflated so its native life pool can never run out before the shared
 * strike pool does, and one shared 'hit' event costs exactly one strike.
 * Kayak never emits 'hit' at all, so its own failure (Ruhe hits 0, or its
 * time cap) is instead treated as consuming the *entire* remaining pool at
 * once — deliberately harsher, matching how a Ruhe-zero was already
 * unconditional failure in solo play, never a "3 strikes" level.
 */

import { LEVEL_ORDER, type InputFrame, type LevelId } from './input.js';
import { createLevel, stepLevel, type AnyLevelState } from './game.js';
import { forEachEvent, win, type EventType, type GameEvent } from './state.js';
import { TUNING, type Mods } from '../config/tuning.js';

const T = TUNING.afterhour;

export type AfterhourStatus = 'run' | 'fail';

export type AfterhourState = {
  status: AfterhourStatus;
  frame: number;
  seed: number;
  loop: number;
  segmentIndex: number;
  segment: AnyLevelState;
  strikes: number;
  strikesMax: number;
  events: GameEvent[];
  eventCount: number;
};

const EVENT_POOL_SIZE = 8;

function emitAH(s: AfterhourState, type: EventType, x = 0, y = 0, a = 0): void {
  if (s.eventCount >= s.events.length) return;
  const e = s.events[s.eventCount++];
  e.type = type;
  e.x = x;
  e.y = y;
  e.a = a;
}

function clearAH(s: AfterhourState): void {
  s.eventCount = 0;
}

export function forEachAfterhourEvent(s: AfterhourState, fn: (e: GameEvent) => void): void {
  for (let i = 0; i < s.eventCount; i++) fn(s.events[i]);
}

/** Deterministic, mixed-per-loop-per-segment seed derived from the root — no Math.random. */
function segmentSeed(root: number, loop: number, segmentIndex: number): number {
  return (root ^ Math.imul(loop + 1, 0x9e3779b1) ^ Math.imul(segmentIndex + 1, 0x85ebca6b)) | 0;
}

/**
 * Compounds loop-over-loop, reusing the exact Mods plumbing every level file
 * already consumes for the mercy auto-ease — same mechanism, pushed the other
 * way (values > 1 instead of < 1).
 *
 * Kayak's `create()` derives `drainMul = mods.extraLives > 0 ? 0.7 : 1`, an
 * unrelated softening meant for the mercy caller. Passing the same inflated
 * extraLives used for the other three segments would silently make Kayak
 * *easier* in Afterhour, backwards for a mode meant to escalate — so Kayak
 * always gets extraLives = 0.
 */
function modsFor(loop: number, levelId: LevelId): Mods {
  const densityMul = Math.min(T.densityMulMax, 1 + loop * T.densityRampPerLoop);
  const speedMul = Math.min(T.speedMulMax, 1 + loop * T.speedRampPerLoop);
  const extraLives = levelId === 'kayak' ? 0 : T.segmentExtraLives;
  return { densityMul, speedMul, extraLives };
}

/** Share of a segment's real goal that counts as "cleared" this loop — shrinks with a floor. */
function burstFraction(loop: number): number {
  return Math.max(T.burstFractionMin, T.burstFractionStart - loop * T.burstFractionStep);
}

function startSegment(root: number, loop: number, segmentIndex: number, h: number): AnyLevelState {
  const levelId = LEVEL_ORDER[segmentIndex];
  return createLevel(levelId, segmentSeed(root, loop, segmentIndex), h, modsFor(loop, levelId));
}

export function create(seed: number, h: number): AfterhourState {
  const events: GameEvent[] = new Array(EVENT_POOL_SIZE);
  for (let i = 0; i < EVENT_POOL_SIZE; i++) events[i] = { type: 'hit', x: 0, y: 0, a: 0 };
  const s: AfterhourState = {
    status: 'run',
    frame: 0,
    seed,
    loop: 0,
    segmentIndex: 0,
    segment: startSegment(seed, 0, 0, h),
    strikes: T.strikesMax,
    strikesMax: T.strikesMax,
    events,
    eventCount: 0,
  };
  emitAH(s, 'segmentStart');
  return s;
}

export function step(s: AfterhourState, input: InputFrame): AfterhourState {
  if (s.status !== 'run') return s;
  clearAH(s);
  s.frame++;

  stepLevel(s.segment, input);

  // One shared strike per native 'hit' — the exact, and only, event every
  // discrete-lives segment already emits at the moment a life is lost.
  forEachEvent(s.segment, (e) => {
    if (e.type === 'hit') s.strikes--;
  });

  if (s.segment.status === 'fail') {
    // A segment's own terminal failure (chiefly Kayak's Ruhe-zero, or a
    // burst that outran its own time cap) ends the whole run outright.
    s.strikes = 0;
  } else if (s.segment.status === 'run' && s.segment.progress >= burstFraction(s.loop)) {
    // Pre-empt the segment's own (much larger) goal with this loop's burst
    // target — the segment file itself is never touched to do this.
    win(s.segment);
  }

  if (s.strikes <= 0) {
    s.strikes = 0;
    s.status = 'fail';
    emitAH(s, 'afterhourFail');
    return s;
  }

  if (s.segment.status === 'win') {
    s.segmentIndex++;
    if (s.segmentIndex >= LEVEL_ORDER.length) {
      s.segmentIndex = 0;
      s.loop++;
      emitAH(s, 'loopComplete');
    }
    s.segment = startSegment(s.seed, s.loop, s.segmentIndex, s.segment.h);
    emitAH(s, 'segmentStart');
  }

  return s;
}

/** Total loops fully survived — the headline highscore number. */
export function loopsSurvived(s: AfterhourState): number {
  return s.loop;
}
