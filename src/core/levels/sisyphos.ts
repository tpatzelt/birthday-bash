/**
 * L2 — SISYPHOS, 6 UHR FRÜH (DESIGN.md §4).
 *
 * Top-down. Drag to steer, the queue advances by itself. Being pushed back
 * rather than reset is what keeps three rejections from meaning "start over".
 */

import { DT, W, TUNING, type Mods } from '../../config/tuning.js';
import { approach, circles, clamp } from '../collide.js';
import type { InputFrame } from '../input.js';
import { emit, makeBase, msToFrames, takeHit, win, fail, type BaseState } from '../state.js';
import { randBool, randInt, randRange } from '../rng.js';

const T = TUNING.sisyphos;

export type Bouncer = {
  active: boolean;
  x: number;
  /** World position along the queue; screen y is derived from `progress`. */
  wy: number;
  vx: number;
  /** Cosmetic: which way the silhouette faces. */
  phase: number;
  /** Frames left of the pre-spawn glance telegraph on a fast bouncer. Cosmetic only. */
  glanceLeft: number;
};

export type PickupKind = 'shades' | 'flunker';

export type Shades = { active: boolean; x: number; wy: number; phase: number; kind: PickupKind };

export type SisyphosState = BaseState & {
  level: 'sisyphos';
  x: number;
  targetX: number;
  /** World px advanced towards the gate. */
  progress_px: number;
  goal: number;
  nextRowWy: number;
  nextShadesWy: number;
  /** Frames of "du gehörst dazu" left. */
  shadesLeft: number;
  bouncers: Bouncer[];
  shades: Shades[];
  /** Set for one frame when the gate opens, so the renderer can thump the stamp. */
  stamped: boolean;
};

const BOUNCER_POOL = 24;
const SHADES_POOL = 6;

export function playerY(h: number): number {
  return h - T.playerYOffset;
}

/** Screen y of a world position, given how far the player has advanced. */
export function screenY(wy: number, progressPx: number, h: number): number {
  return playerY(h) - (wy - progressPx);
}

export function create(seed: number, h: number, mods: Mods): SisyphosState {
  const base = makeBase('sisyphos', seed, h, mods, T.lives);
  const bouncers: Bouncer[] = new Array(BOUNCER_POOL);
  for (let i = 0; i < BOUNCER_POOL; i++) {
    bouncers[i] = { active: false, x: 0, wy: 0, vx: 0, phase: 0, glanceLeft: 0 };
  }
  const shades: Shades[] = new Array(SHADES_POOL);
  for (let i = 0; i < SHADES_POOL; i++) shades[i] = { active: false, x: 0, wy: 0, phase: 0, kind: 'shades' };
  return {
    ...base,
    level: 'sisyphos',
    x: W / 2,
    targetX: W / 2,
    progress_px: 0,
    goal: T.goalPx,
    nextRowWy: T.rowSpacing,
    nextShadesWy: T.shadesEveryPx,
    shadesLeft: 0,
    bouncers,
    shades,
    stamped: false,
  };
}

function rowSpacing(s: SisyphosState): number {
  return T.rowSpacing / s.mods.densityMul;
}

function spawnRow(s: SisyphosState, wy: number): void {
  const n = randBool(s.rng, T.twoBouncerChance) ? 2 : 1;
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < s.bouncers.length; k++) {
      const b = s.bouncers[k];
      if (b.active) continue;
      b.active = true;
      // Two bouncers in a row start on opposite halves, so a row is never a
      // solid wall — there is always a gap to steer through.
      const lo = n === 2 && i === 0 ? T.bouncerR : W / 2;
      const hi = n === 2 && i === 0 ? W / 2 : W - T.bouncerR;
      b.x = randRange(s.rng, lo, hi);
      b.wy = wy;
      const sp = randRange(s.rng, T.bouncerSpeedMin, T.bouncerSpeedMax) * s.mods.speedMul;
      b.vx = randBool(s.rng, 0.5) ? sp : -sp;
      b.phase = randInt(s.rng, 0, 3);
      // Derived from the already-rolled speed — no extra RNG draw, so the tell
      // is truthful (a fast bouncer really is fast) without shifting the seed's
      // draw order for anything spawned after this row.
      b.glanceLeft = sp >= T.bouncerFastThreshold ? msToFrames(T.glanceLeadMs) : 0;
      break;
    }
  }
}

function spawnShades(s: SisyphosState, wy: number): void {
  for (let k = 0; k < s.shades.length; k++) {
    const p = s.shades[k];
    if (p.active) continue;
    p.active = true;
    p.x = randRange(s.rng, 40, W - 40);
    p.wy = wy;
    p.phase = 0;
    // Derived from the position roll already made above, not a second RNG
    // draw: keeps the draw order (and every existing tape/snapshot) intact.
    const frac = (p.x - 40) / (W - 80);
    p.kind = frac < T.flunkerShare ? 'flunker' : 'shades';
    return;
  }
}

export function step(s: SisyphosState, input: InputFrame): SisyphosState {
  if (s.status !== 'run') return s;
  s.frame++;
  s.stamped = false;

  // --- steering -------------------------------------------------------------
  if (input.down) s.targetX = clamp(input.x, T.playerR, W - T.playerR);
  s.prevDown = input.down;
  s.x = approach(s.x, s.targetX, T.lerpRate, DT);

  // --- advance --------------------------------------------------------------
  s.progress_px += T.scrollSpeed * s.mods.speedMul * DT;
  if (s.invuln > 0) s.invuln--;
  if (s.shadesLeft > 0) s.shadesLeft--;
  if (s.shake > 0) s.shake = Math.max(0, s.shake - 60 * DT);

  // --- spawn ahead of the visible area --------------------------------------
  const spawnHorizon = s.progress_px + playerY(s.h) + 120;
  while (s.nextRowWy < spawnHorizon) {
    if (s.nextRowWy < s.goal - 120) spawnRow(s, s.nextRowWy);
    s.nextRowWy += rowSpacing(s);
  }
  while (s.nextShadesWy < spawnHorizon) {
    if (s.nextShadesWy < s.goal - 200) spawnShades(s, s.nextShadesWy);
    s.nextShadesWy += T.shadesEveryPx;
  }

  const py = playerY(s.h);

  // --- bouncers -------------------------------------------------------------
  for (let i = 0; i < s.bouncers.length; i++) {
    const b = s.bouncers[i];
    if (!b.active) continue;
    if (b.glanceLeft > 0) b.glanceLeft--;
    b.x += b.vx * DT;
    if (b.x < T.bouncerR) {
      b.x = T.bouncerR;
      b.vx = -b.vx;
    } else if (b.x > W - T.bouncerR) {
      b.x = W - T.bouncerR;
      b.vx = -b.vx;
    }
    const sy = screenY(b.wy, s.progress_px, s.h);
    if (sy > s.h + 80) {
      b.active = false;
      continue;
    }
    if (s.invuln > 0 || s.shadesLeft > 0) continue;
    if (circles(s.x, py, T.playerR, b.x, sy, T.bouncerR)) {
      // „Heute nicht." — a life, and 260 px back down the queue.
      takeHit(s, msToFrames(T.invulnMs), b.x, sy);
      s.progress_px = Math.max(0, s.progress_px - T.pushBackPx);
      s.shake = 10;
    }
  }

  // --- Sonnenbrille ---------------------------------------------------------
  for (let i = 0; i < s.shades.length; i++) {
    const p = s.shades[i];
    if (!p.active) continue;
    const sy = screenY(p.wy, s.progress_px, s.h);
    if (sy > s.h + 60) {
      p.active = false;
      continue;
    }
    if (circles(s.x, py, T.playerR, p.x, sy, T.shadesR)) {
      p.active = false;
      s.shadesLeft = msToFrames(T.shadesDurationMs);
      emit(s, p.kind === 'flunker' ? 'flunker' : 'shades', p.x, sy, 0);
    }
  }

  s.progress = Math.min(1, s.progress_px / s.goal);
  if (s.progress_px >= s.goal) {
    s.stamped = true;
    emit(s, 'stamp', s.x, py, 0);
    win(s, s.x, py);
  } else if (s.frame > T.timeCapS * 60) {
    fail(s, s.x, py);
  }

  return s;
}
