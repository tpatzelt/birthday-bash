/**
 * L3 — SALZIGE HERINGE (DESIGN.md §4).
 *
 * Catch falling Heringe in a Tüte. Vegetables cost a life — but only if you
 * catch one. Move to the fish, not away from the vegetables.
 */

import { DT, W, TUNING, type Mods } from '../../config/tuning.js';
import { approach, clamp, clamp01, lerp } from '../collide.js';
import type { InputFrame } from '../input.js';
import { emit, makeBase, takeHit, win, fail, type BaseState } from '../state.js';
import { rand, randInt, randRange } from '../rng.js';

const T = TUNING.katjes;

export type KatjesKind = 'fish' | 'veg' | 'bonus' | 'golden';

export type Falling = {
  active: boolean;
  kind: KatjesKind;
  x: number;
  y: number;
  vy: number;
  spin: number;
  /** Vegetable variant: 0 broccoli, 1 carrot, 2 aubergine. */
  variant: number;
  /** Set once a veg has bounced off the ground; it leaves next frame. */
  bounced: boolean;
};

export type KatjesState = BaseState & {
  level: 'katjes';
  x: number;
  targetX: number;
  fish: number;
  goal: number;
  /** Seconds until the next spawn. */
  spawnIn: number;
  items: Falling[];
  /** Consecutive catches since the last vegetable, for the "Kombo" HUD flourish. */
  combo: number;
};

const POOL = 40;

export function playerY(h: number): number {
  return h - T.playerYOffset;
}

export function create(seed: number, h: number, mods: Mods): KatjesState {
  const base = makeBase('katjes', seed, h, mods, T.lives);
  const items: Falling[] = new Array(POOL);
  for (let i = 0; i < POOL; i++) {
    items[i] = { active: false, kind: 'fish', x: 0, y: 0, vy: 0, spin: 0, variant: 0, bounced: false };
  }
  return {
    ...base,
    level: 'katjes',
    x: W / 2,
    targetX: W / 2,
    fish: 0,
    goal: T.goalFish,
    spawnIn: 0.4,
    items,
    combo: 0,
  };
}

/** 0 at the start of the level, 1 once the ramp is over. */
function ramp(s: KatjesState): number {
  return clamp01((s.frame * DT) / T.rampSeconds);
}

function spawn(s: KatjesState): void {
  for (let i = 0; i < s.items.length; i++) {
    const it = s.items[i];
    if (it.active) continue;
    const r = rand(s.rng);
    // shareGolden is carved OUT of shareBonus, not additive: shareFish + shareVeg
    // + shareBonus must keep summing to 1 exactly as before.
    it.kind =
      r < T.shareFish
        ? 'fish'
        : r < T.shareFish + T.shareVeg
          ? 'veg'
          : r < T.shareFish + T.shareVeg + T.shareGolden
            ? 'golden'
            : 'bonus';
    it.active = true;
    it.x = randRange(s.rng, 26, W - 26);
    it.y = -20;
    it.vy = lerp(T.fallSpeedStart, T.fallSpeedEnd, ramp(s)) * s.mods.speedMul;
    it.spin = randRange(s.rng, -3, 3);
    it.variant = randInt(s.rng, 0, 2);
    it.bounced = false;
    return;
  }
}

export function step(s: KatjesState, input: InputFrame): KatjesState {
  if (s.status !== 'run') return s;
  s.frame++;

  const half = T.playerW / 2;
  if (input.down) s.targetX = clamp(input.x, half, W - half);
  s.prevDown = input.down;
  s.x = approach(s.x, s.targetX, T.lerpRate, DT);

  if (s.invuln > 0) s.invuln--;
  if (s.shake > 0) s.shake = Math.max(0, s.shake - 60 * DT);

  // --- spawn ----------------------------------------------------------------
  s.spawnIn -= DT;
  if (s.spawnIn <= 0) {
    spawn(s);
    const interval = lerp(T.spawnIntervalStart, T.spawnIntervalEnd, ramp(s)) / s.mods.densityMul;
    s.spawnIn += interval;
    if (s.spawnIn < 0) s.spawnIn = interval;
  }

  // --- fall, catch, bounce --------------------------------------------------
  const py = playerY(s.h);
  const ground = s.h - 26;
  for (let i = 0; i < s.items.length; i++) {
    const it = s.items[i];
    if (!it.active) continue;
    it.y += it.vy * DT;

    if (it.bounced) {
      it.vy += 1400 * DT;
      if (it.y > s.h + 40) it.active = false;
      continue;
    }

    const inMouth = it.y >= py - 6 && it.y <= py + T.catchBandTop;
    if (inMouth && Math.abs(it.x - s.x) <= half) {
      it.active = false;
      if (it.kind === 'fish') {
        s.fish++;
        s.combo++;
        emit(s, 'fish', it.x, it.y, s.fish);
      } else if (it.kind === 'bonus') {
        s.fish += T.bonusValue;
        s.combo++;
        emit(s, 'bonus', it.x, it.y, s.fish);
      } else if (it.kind === 'golden') {
        s.fish += T.goldenValue;
        s.combo++;
        emit(s, 'golden', it.x, it.y, s.fish);
      } else {
        // Du hast Gemüse gegessen. In Neukölln.
        s.combo = 0;
        emit(s, 'veg', it.x, it.y, 0);
        takeHit(s, 30, it.x, it.y);
        s.shake = 8;
      }
      continue;
    }

    if (it.y >= ground) {
      // Uncaught is free: it bounces once and leaves. Only *catching* hurts.
      it.bounced = true;
      it.vy = -Math.abs(it.vy) * 0.45;
      emit(s, 'bounce', it.x, ground, it.kind === 'veg' ? 1 : 0);
    }
  }

  s.progress = Math.min(1, s.fish / s.goal);
  if (s.fish >= s.goal) win(s, s.x, py);
  else if (s.frame > T.timeCapS * 60) fail(s, s.x, py);

  return s;
}
