/**
 * L4 — KAYAK VR: MIRAGE (DESIGN.md §4).
 *
 * The joke level: it punishes trying hard. The sluggish lerp *is* the mechanic —
 * it makes over-correcting the natural mistake, and the Ruhe meter punishes
 * flailing, not error.
 */

import { DT, W, TUNING, type Mods } from '../../config/tuning.js';
import { approach, circles, clamp, clamp01, lerp } from '../collide.js';
import type { InputFrame } from '../input.js';
import { emit, makeBase, msToFrames, win, fail, type BaseState } from '../state.js';
import { randBool, randRange } from '../rng.js';

const T = TUNING.kayak;

export type Rock = { active: boolean; x: number; wy: number; r: number; phase: number };

export type KayakState = BaseState & {
  level: 'kayak';
  x: number;
  targetX: number;
  /** px/s, derived from the last frame's movement — the "panic" input. */
  vx: number;
  /** World px travelled downriver. */
  travel: number;
  goal: number;
  ruhe: number;
  /** Mercy: the auto-ease slows the drain rather than adding a life. */
  drainMul: number;
  inside: boolean;
  nextRockWy: number;
  rocks: Rock[];
  /** Set on the winning frame: the whale breaches across the full width. */
  whale: boolean;
  /** Frames until the next ambient-wildlife roll. Purely cosmetic, never touches Ruhe. */
  wildlifeIn: number;
};

const ROCK_POOL = 12;

export function playerY(h: number): number {
  return h - T.playerYOffset;
}

/** River centre line. Pure function of world y — the river is the same every run. */
export function channelCentre(worldY: number): number {
  return W / 2 + 72 * Math.sin(worldY * 0.0042) + 34 * Math.sin(worldY * 0.0113 + 1.7);
}

/** The channel narrows over the level. */
export function channelHalfWidth(travel: number): number {
  return lerp(T.halfWidthStart, T.halfWidthEnd, clamp01(travel / T.goalPx));
}

/** World y of a screen row, given how far downriver the kayak is. */
export function worldYOf(screenYPx: number, travel: number, h: number): number {
  return travel + (playerY(h) - screenYPx);
}

export function screenYOf(worldY: number, travel: number, h: number): number {
  return playerY(h) - (worldY - travel);
}

export function create(seed: number, h: number, mods: Mods): KayakState {
  const base = makeBase('kayak', seed, h, mods, 1);
  const rocks: Rock[] = new Array(ROCK_POOL);
  for (let i = 0; i < ROCK_POOL; i++) rocks[i] = { active: false, x: 0, wy: 0, r: T.rockR, phase: 0 };
  const s: KayakState = {
    ...base,
    level: 'kayak',
    x: channelCentre(0),
    targetX: channelCentre(0),
    vx: 0,
    travel: 0,
    // The eased river is shorter, not slower: a slower drift would only mean
    // more time spent losing Ruhe.
    goal: T.goalPx * mods.speedMul,
    ruhe: T.ruheStart,
    drainMul: mods.extraLives > 0 ? 0.7 : 1,
    inside: true,
    nextRockWy: T.rockEveryPx,
    rocks,
    whale: false,
    wildlifeIn: 0,
  };
  s.wildlifeIn = rollWildlifeInterval(s);
  return s;
}

function rollWildlifeInterval(s: KayakState): number {
  return Math.round(randRange(s.rng, T.wildlifeIntervalMin, T.wildlifeIntervalMax) * 60);
}

function spawnRock(s: KayakState, wy: number): void {
  for (let i = 0; i < s.rocks.length; i++) {
    const r = s.rocks[i];
    if (r.active) continue;
    const hw = channelHalfWidth(wy);
    const side = randBool(s.rng, 0.5) ? 1 : -1;
    // Near an edge, never dead centre: a rock in the middle of the channel
    // would force exactly the panicked correction the level is about.
    r.x = clamp(channelCentre(wy) + side * hw * randRange(s.rng, 0.72, 1.02), 20, W - 20);
    r.wy = wy;
    r.r = T.rockR;
    r.phase = randRange(s.rng, 0, Math.PI * 2);
    r.active = true;
    return;
  }
}

export function step(s: KayakState, input: InputFrame): KayakState {
  if (s.status !== 'run') return s;
  s.frame++;

  // --- steering, deliberately sluggish --------------------------------------
  if (input.down) s.targetX = clamp(input.x, 16, W - 16);
  s.prevDown = input.down;
  const prevX = s.x;
  s.x = approach(s.x, s.targetX, T.lerpRate, DT);
  s.vx = (s.x - prevX) / DT;

  if (s.invuln > 0) s.invuln--;
  if (s.shake > 0) s.shake = Math.max(0, s.shake - 90 * DT);

  // --- channel --------------------------------------------------------------
  const cx = channelCentre(s.travel);
  const hw = channelHalfWidth(s.travel);
  s.inside = Math.abs(s.x - cx) <= hw;

  // --- Ruhe -----------------------------------------------------------------
  const panic = Math.max(0, Math.abs(s.vx) - T.panicThreshold);
  s.ruhe -= panic * T.panicDrain * s.drainMul * DT;
  if (!s.inside) s.ruhe -= T.outsideDrain * s.drainMul * DT;
  else if (Math.abs(s.vx) < T.calmThreshold) {
    const before = s.ruhe;
    s.ruhe = Math.min(T.ruheMax, s.ruhe + T.calmRegen * DT);
    if (before < T.ruheMax && s.frame % 30 === 0) emit(s, 'calm', s.x, playerY(s.h), s.ruhe);
  }
  s.ruhe = clamp(s.ruhe, 0, T.ruheMax);

  // --- drift ----------------------------------------------------------------
  // Drifting wrong is slow, not fatal.
  s.travel += (s.inside ? T.speedInside : T.speedOutside) * DT;

  // --- ambient wildlife: rewards sustained-high Ruhe, never reads it back ---
  s.wildlifeIn--;
  if (s.wildlifeIn <= 0) {
    const chanceT = clamp01((s.ruhe - T.wildlifeRuheFloor) / (T.ruheMax - T.wildlifeRuheFloor));
    const chance = lerp(T.wildlifeChanceLow, T.wildlifeChanceHigh, chanceT);
    if (randBool(s.rng, chance)) {
      const kind = randBool(s.rng, 0.5) ? 0 : 1; // 0 = fish jump, 1 = bird
      emit(s, 'wildlife', randRange(s.rng, 30, W - 30), playerY(s.h) - randRange(s.rng, 40, 220), kind);
    }
    s.wildlifeIn = rollWildlifeInterval(s);
  }

  // --- rocks ----------------------------------------------------------------
  const horizon = s.travel + playerY(s.h) + 120;
  while (s.nextRockWy < horizon) {
    if (s.nextRockWy < s.goal - 200) spawnRock(s, s.nextRockWy);
    s.nextRockWy += T.rockEveryPx / s.mods.densityMul;
  }

  const py = playerY(s.h);
  for (let i = 0; i < s.rocks.length; i++) {
    const r = s.rocks[i];
    if (!r.active) continue;
    const sy = screenYOf(r.wy, s.travel, s.h);
    if (sy > s.h + 60) {
      r.active = false;
      continue;
    }
    if (s.invuln <= 0 && circles(s.x, py, T.hullR, r.x, sy, r.r)) {
      s.ruhe = clamp(s.ruhe - T.rockHitRuhe, 0, T.ruheMax);
      s.invuln = msToFrames(T.rockHitInvulnMs);
      s.shake = 12;
      emit(s, 'rock', r.x, sy, 0);
    }
  }

  s.progress = clamp01(s.travel / s.goal);
  if (s.travel >= s.goal) {
    s.whale = true;
    emit(s, 'whale', W / 2, py - 120, 0);
    win(s, s.x, py);
  } else if (s.ruhe <= 0) {
    // „Zu hektisch. Atme."
    fail(s, s.x, py);
  } else if (s.frame > T.timeCapS * 60) {
    fail(s, s.x, py);
  }

  return s;
}
