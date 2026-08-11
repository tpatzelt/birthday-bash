/**
 * Lookahead scheduler with bar-aligned transitions.
 *
 * The track never restarts: moving between levels swaps the *layer set* on the
 * next bar boundary, so it feels mixed rather than cut (DESIGN.md §6).
 */

import { TUNING } from '../config/tuning.js';
import type { Engine } from './engine.js';
import { LAYERS, playStep, type LayerName, type SceneId } from './layers.js';

const LOOKAHEAD_S = 0.14;
const TICK_MS = 25;

export type Scheduler = {
  engine: Engine;
  /** Absolute AudioContext time of the next 16th note. */
  nextTime: number;
  step: number;
  bar: number;
  active: LayerName[];
  pending: SceneId | null;
  scene: SceneId;
  timer: ReturnType<typeof setTimeout> | null;
  running: boolean;
};

export function makeScheduler(engine: Engine): Scheduler {
  return {
    engine,
    nextTime: 0,
    step: 0,
    bar: 0,
    active: LAYERS.title,
    pending: null,
    scene: 'title',
    timer: null,
    running: false,
  };
}

export function stepDuration(): number {
  return 60 / TUNING.audio.bpm / 4;
}

/** Bar phase 0..1, used by the fairy lights so they pulse with the track. */
export function beatPhase(s: Scheduler): number {
  const e = s.engine;
  if (!e.ctx || !s.running) {
    // Muted or not yet unlocked: keep a free-running clock so the visuals still
    // move to the tempo. The game must be readable with no audio at all.
    return ((Date.now() / 1000) * (TUNING.audio.bpm / 60)) % 1;
  }
  const beat = stepDuration() * 4;
  const since = e.ctx.currentTime - (s.nextTime - stepDuration() * s.step);
  return ((since / beat) % 1 + 1) % 1;
}

export function startScheduler(s: Scheduler): void {
  if (s.running || !s.engine.ctx) return;
  s.running = true;
  s.nextTime = s.engine.ctx.currentTime + 0.08;
  tick(s);
}

export function stopScheduler(s: Scheduler): void {
  s.running = false;
  if (s.timer) clearTimeout(s.timer);
  s.timer = null;
}

/** Queue a scene change; it lands on the next bar boundary. */
export function setScene(s: Scheduler, scene: SceneId, immediate = false): void {
  if (s.scene === scene && !s.pending) return;
  if (immediate || !s.running) {
    s.scene = scene;
    s.active = LAYERS[scene];
    s.pending = null;
    return;
  }
  s.pending = scene;
}

function tick(s: Scheduler): void {
  const e = s.engine;
  if (!s.running || !e.ctx) return;
  const dur = stepDuration();
  const horizon = e.ctx.currentTime + LOOKAHEAD_S;

  while (s.nextTime < horizon) {
    if (s.step === 0 && s.pending) {
      // Transitions land on the bar, never mid-phrase.
      s.scene = s.pending;
      s.active = LAYERS[s.scene];
      s.pending = null;
    }
    for (let i = 0; i < s.active.length; i++) {
      playStep(e, s.active[i], s.step, s.bar, s.nextTime);
    }
    s.nextTime += dur;
    s.step++;
    if (s.step >= 16) {
      s.step = 0;
      s.bar++;
    }
  }

  s.timer = setTimeout(() => tick(s), TICK_MS);
}
