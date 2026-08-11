/**
 * L1 — PFANDPIRAT NEUKÖLLN (DESIGN.md §4).
 *
 * Auto-runner. Tap anywhere to jump. Collect 20 bottles = 5,00 €.
 * Coyote time and jump buffer are non-negotiable: they are what makes a jump
 * feel fair on a touchscreen with input latency.
 */

import { DT, W, TUNING, type Mods } from '../../config/tuning.js';
import { aabb, circleBox } from '../collide.js';
import type { InputFrame } from '../input.js';
import { emit, makeBase, msToFrames, takeHit, win, fail, type BaseState } from '../state.js';
import { randInt, randRange, randWeighted, randBool } from '../rng.js';

const T = TUNING.pfand;

export type PfandKind = 'bottle' | 'roller' | 'hund' | 'zaun';

export type PfandItem = {
  active: boolean;
  kind: PfandKind;
  /** Centre x, centre y in logical canvas coordinates. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Purely cosmetic phase, so the renderer needs no state of its own. */
  phase: number;
};

export type PfandState = BaseState & {
  level: 'pfand';
  /** Player feet position; x is fixed at TUNING.pfand.playerX. */
  py: number;
  vy: number;
  onGround: boolean;
  coyote: number;
  buffer: number;
  speed: number;
  /** World distance travelled, px. Used for parallax and the spawner. */
  dist: number;
  sinceSpawn: number;
  nextGap: number;
  bottles: number;
  cents: number;
  goal: number;
  items: PfandItem[];
};

const POOL = 48;
const ITEM_MARGIN = 40;

function makeItem(): PfandItem {
  return { active: false, kind: 'bottle', x: 0, y: 0, w: 26, h: 26, phase: 0 };
}

export function groundY(h: number): number {
  return h - T.groundOffset;
}

export function create(seed: number, h: number, mods: Mods): PfandState {
  const base = makeBase('pfand', seed, h, mods, T.lives);
  const items: PfandItem[] = new Array(POOL);
  for (let i = 0; i < POOL; i++) items[i] = makeItem();
  const s: PfandState = {
    ...base,
    level: 'pfand',
    py: groundY(h),
    vy: 0,
    onGround: true,
    coyote: msToFrames(T.coyoteMs),
    buffer: 0,
    speed: T.speedBase * mods.speedMul,
    dist: 0,
    sinceSpawn: 0,
    nextGap: 220,
    bottles: 0,
    cents: 0,
    goal: T.goalBottles,
    items,
  };
  s.nextGap = rollGap(s);
  return s;
}

function rollGap(s: PfandState): number {
  // Scaling the gap with speed keeps the difficulty ramp from secretly also
  // compressing the spacing. Dividing by densityMul opens it up when the mercy
  // rules have eased the level.
  const base = randRange(s.rng, T.gapMin, T.gapMax) * (s.speed / T.speedBase);
  return base / s.mods.densityMul;
}

function spawnItem(s: PfandState, kind: PfandKind, x: number, y: number, w: number, h: number): void {
  for (let i = 0; i < s.items.length; i++) {
    const it = s.items[i];
    if (it.active) continue;
    it.active = true;
    it.kind = kind;
    it.x = x;
    it.y = y;
    it.w = w;
    it.h = h;
    it.phase = randRange(s.rng, 0, Math.PI * 2);
    return;
  }
}

function spawnWave(s: PfandState): void {
  const g = groundY(s.h);
  const x0 = W + ITEM_MARGIN;

  if (randBool(s.rng, T.pfandShare)) {
    // A Pfand cluster: 1–3 bottles, on the ground or up on a jump arc.
    const n = randInt(s.rng, T.clusterMin, T.clusterMax);
    const onArc = randBool(s.rng, T.arcShare);
    const y = onArc ? g - T.arcHeight : g - 16;
    for (let i = 0; i < n; i++) {
      spawnItem(s, 'bottle', x0 + i * 28, y, T.bottleR * 2, T.bottleR * 2);
    }
    return;
  }

  const weights = T.obstacles.map((o) => o.weight);
  const o = T.obstacles[randWeighted(s.rng, weights)];
  spawnItem(s, o.kind as PfandKind, x0, g - o.h / 2, o.w, o.h);
}

export function step(s: PfandState, input: InputFrame): PfandState {
  if (s.status !== 'run') return s;

  s.frame++;
  const t = s.frame * DT;
  const g = groundY(s.h);

  // --- speed ramp -----------------------------------------------------------
  s.speed = (T.speedBase + Math.min(T.speedRampMax, T.speedRamp * t)) * s.mods.speedMul;
  s.dist += s.speed * DT;

  // --- input: tap = jump, with buffer + coyote ------------------------------
  const tap = input.down && !s.prevDown;
  s.prevDown = input.down;
  if (tap) s.buffer = msToFrames(T.bufferMs);

  // Check before decrementing, so "buffer = N frames" means the tap stays valid
  // for N frames counting the frame it happened on.
  if (s.buffer > 0 && (s.onGround || s.coyote > 0)) {
    s.vy = T.jumpImpulse;
    s.onGround = false;
    s.buffer = 0;
    s.coyote = 0;
    emit(s, 'jump', T.playerX + T.hitW / 2, s.py);
  }
  if (s.buffer > 0) s.buffer--;
  if (s.coyote > 0) s.coyote--;

  // --- integrate ------------------------------------------------------------
  s.vy += T.gravity * DT;
  s.py += s.vy * DT;
  if (s.py >= g) {
    if (!s.onGround) emit(s, 'land', T.playerX + T.hitW / 2, g);
    s.py = g;
    s.vy = 0;
    s.onGround = true;
    s.coyote = msToFrames(T.coyoteMs);
  } else {
    s.onGround = false;
  }

  if (s.invuln > 0) s.invuln--;
  if (s.shake > 0) s.shake = Math.max(0, s.shake - 60 * DT);

  // --- spawn ----------------------------------------------------------------
  s.sinceSpawn += s.speed * DT;
  if (s.sinceSpawn >= s.nextGap) {
    s.sinceSpawn -= s.nextGap;
    s.nextGap = rollGap(s);
    spawnWave(s);
  }

  // --- move + collide -------------------------------------------------------
  const px = T.playerX;
  const pyTop = s.py - T.hitH;
  for (let i = 0; i < s.items.length; i++) {
    const it = s.items[i];
    if (!it.active) continue;
    it.x -= s.speed * DT;
    if (it.x < -ITEM_MARGIN) {
      it.active = false;
      continue;
    }
    if (it.kind === 'bottle') {
      if (circleBox(it.x, it.y, T.bottleR, px, pyTop, T.hitW, T.hitH)) {
        it.active = false;
        s.bottles++;
        s.cents += T.centsPerBottle;
        emit(s, 'bottle', it.x, it.y, s.bottles);
      }
    } else if (aabb(px, pyTop, T.hitW, T.hitH, it.x - it.w / 2, it.y - it.h / 2, it.w, it.h)) {
      if (s.invuln <= 0) {
        // A hit costs a life, never the collected bottles.
        takeHit(s, msToFrames(T.invulnMs), it.x, it.y);
        s.shake = 8;
        it.active = false;
      }
    }
  }

  s.progress = Math.min(1, s.bottles / s.goal);
  if (s.bottles >= s.goal) win(s, px, s.py);
  else if (s.frame > T.timeCapS * 60) fail(s, px, s.py);

  return s;
}

/** € as a display string with a comma, for the Pfandbon HUD. */
export function euros(cents: number): string {
  const e = Math.floor(cents / 100);
  const c = cents % 100;
  return `${e},${c < 10 ? '0' : ''}${c}`;
}
