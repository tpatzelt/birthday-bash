/**
 * Scripted bot policies (TESTING.md §3).
 *
 * These encode the promise in DESIGN.md §8: *he must be able to finish*. They
 * are pure and deterministic like the rest of core/, which is what lets CI play
 * the actual game — not a mock of it — a few hundred times per level per run.
 */

import { DT, W, TUNING, NO_MODS, type Mods } from '../config/tuning.js';
import { clamp } from './collide.js';
import { createLevel, frameCap, stepLevel, type AnyLevelState } from './game.js';
import type { InputFrame, LevelId } from './input.js';
import { makeInput } from './input.js';
import { makeRng, rand, randRange, type Rng } from './rng.js';
import { findNonFinite } from './state.js';

import { groundY } from './levels/pfand.js';
import { playerY as sisyPlayerY, screenY as sisyScreenY } from './levels/sisyphos.js';
import { playerY as katjesPlayerY } from './levels/katjes.js';
import { channelCentre, channelHalfWidth, playerY as kayakPlayerY, screenYOf } from './levels/kayak.js';

export type BotName = 'perfect' | 'casual' | 'tipsy' | 'idle' | 'mash';

export type BotParams = {
  /** Reaction delay in ms: the bot acts on the state as it was that long ago. */
  reactionMs: number;
  /** Aim error in px, resampled periodically. */
  aimError: number;
  /** Share of frames where the intended input simply doesn't happen. */
  missChance: number;
  /** Per-frame chance of freezing for ~1 s. */
  freezeChance: number;
};

export const BOT_PARAMS: Record<BotName, BotParams> = {
  perfect: { reactionMs: 0, aimError: 0, missChance: 0, freezeChance: 0 },
  casual: { reactionMs: 220, aimError: 12, missChance: 0.15, freezeChance: 0 },
  // freezeChance is per frame: 0.0015 is roughly one 1 s stare every 11 s,
  // which is what "occasional" means at 60 fps.
  tipsy: { reactionMs: 400, aimError: 30, missChance: 0.3, freezeChance: 0.0015 },
  idle: { reactionMs: 0, aimError: 0, missChance: 1, freezeChance: 0 },
  mash: { reactionMs: 0, aimError: 0, missChance: 0, freezeChance: 0 },
};

export type Bot = {
  name: BotName;
  params: BotParams;
  rng: Rng;
  /** Ring buffer of intended inputs, read `delay` frames late. */
  ring: InputFrame[];
  head: number;
  delay: number;
  out: InputFrame;
  aim: number;
  aimTimer: number;
  freezeLeft: number;
  /** Last intended button state — a jump is a tap, so it has to be released. */
  lastDown: boolean;
};

const RING = 64;

export function makeBot(name: BotName, seed: number): Bot {
  const params = BOT_PARAMS[name];
  const ring: InputFrame[] = new Array(RING);
  for (let i = 0; i < RING; i++) ring[i] = makeInput();
  return {
    name,
    params,
    rng: makeRng(seed ^ 0x5eed),
    ring,
    head: 0,
    delay: Math.min(RING - 1, Math.round((params.reactionMs / 1000) * 60)),
    out: makeInput(),
    aim: 0,
    aimTimer: 0,
    freezeLeft: 0,
    lastDown: false,
  };
}

/** The intended input, before reaction delay, aim error and missed frames. */
function intent(s: AnyLevelState, bot: Bot, dst: InputFrame): void {
  switch (s.level) {
    case 'pfand':
      intentPfand(s, bot, dst);
      // The core only jumps on a fresh tap, so the button must be released
      // between jumps — exactly like a thumb.
      if (dst.down && bot.lastDown) dst.down = false;
      bot.lastDown = dst.down;
      return;
    case 'sisyphos':
      return intentSisyphos(s, dst);
    case 'katjes':
      return intentKatjes(s, dst);
    case 'kayak':
      return intentKayak(s, bot, dst);
  }
}

// --- L1 --------------------------------------------------------------------

const P = TUNING.pfand;

/**
 * Height of the feet above the ground t seconds after a jump.
 *
 * This mirrors the *discrete* semi-implicit integrator the level actually runs
 * (`vy += g·dt` then `py += vy·dt`), which sits `0.5·g·dt·t` below the
 * continuous parabola — 12 px at the end of a jump, i.e. the difference between
 * clearing an obstacle and landing on it.
 */
function jumpHeight(t: number): number {
  if (t <= 0) return 0;
  const h = -P.jumpImpulse * t - 0.5 * P.gravity * t * (t + DT);
  return h > 0 ? h : 0;
}

/** Total airtime of a jump, in seconds, for that same integrator. */
const AIRTIME = (-2 * P.jumpImpulse) / P.gravity - DT;

/**
 * The two times at which the feet pass through height `h` — going up, then
 * coming down. Returns null if the jump never gets that high.
 *
 * Solving `0.5·g·t² + (0.5·g·dt + v0)·t + h = 0` for the discrete integrator.
 */
function jumpRoots(h: number): [number, number] | null {
  const a = 0.5 * P.gravity;
  const b = 0.5 * P.gravity * DT + P.jumpImpulse;
  const disc = b * b - 4 * a * h;
  if (disc <= 0) return null;
  const r = Math.sqrt(disc);
  return [(-b - r) / (2 * a), (-b + r) / (2 * a)];
}

/**
 * The window during which an item's horizontal span overlaps the player's,
 * as [enter, exit] seconds from now.
 */
function overlapWindow(itemX: number, itemW: number, speed: number): [number, number] {
  const left = itemX - itemW / 2;
  const right = itemX + itemW / 2;
  return [(left - (P.playerX + P.hitW)) / speed, (right - P.playerX) / speed];
}

function intentPfand(s: import('./levels/pfand.js').PfandState, bot: Bot, dst: InputFrame): void {
  dst.down = false;
  dst.x = P.playerX;
  dst.y = s.h / 2;
  if (!s.onGround && s.coyote <= 0) return;

  const g = groundY(s.h);
  // A player watching an obstacle approach anticipates it; they do not react to
  // it after it arrives. `lead` gives the delayed intent back the time the ring
  // buffer takes away, so reaction latency shows up where it belongs — in
  // reacting to *new* information — and the timing error shows up as jitter.
  const lead = bot.params.reactionMs / 1000;
  // ±12 px of aim error is ±30 ms of timing error; ±30 px is ±75 ms.
  const jitter = bot.aim * 0.0025;

  // The nearest obstacle still ahead of us.
  let obsT0 = Infinity;
  let obsT1 = Infinity;
  let obsH = 0;
  for (let i = 0; i < s.items.length; i++) {
    const it = s.items[i];
    if (!it.active || it.kind === 'bottle') continue;
    const [t0, t1] = overlapWindow(it.x, it.w, s.speed);
    if (t1 <= 0) continue;
    if (t0 < obsT0) {
      obsT0 = t0;
      obsT1 = t1;
      obsH = it.h;
    }
  }

  // A jump clears an obstacle iff the feet are above it for the whole overlap.
  // jumpHeight is concave, so the endpoints decide it — which makes the set of
  // frames where a jump works a contiguous window. Aim for the *middle* of that
  // window, not its leading edge: a bot (or a person) with 220 ms of reaction
  // delay acts on a world 13 frames old, and a window is only about 12 frames
  // wide. Jumping as early as possible is what makes latency fatal.
  const clearsNow = obsT0 === Infinity || (jumpHeight(obsT0) > obsH + 2 && jumpHeight(obsT1) > obsH + 2);
  if (obsT0 !== Infinity && obsT0 < AIRTIME + lead) {
    const roots = jumpRoots(obsH + 2);
    const span = obsT1 - obsT0;
    const ideal = roots ? (roots[0] + Math.max(roots[0], roots[1] - span)) / 2 : 0.12;
    if (obsT0 <= ideal + lead + jitter) dst.down = true;
    return;
  }

  // Nothing to dodge: take the arc bottles. A jump collects one iff the feet
  // pass through its band while their spans overlap.
  for (let i = 0; i < s.items.length; i++) {
    const it = s.items[i];
    if (!it.active || it.kind !== 'bottle' || it.y > g - 40) continue;
    const [t0, t1] = overlapWindow(it.x, it.w, s.speed);
    if (t1 <= lead || t0 > AIRTIME + lead) continue;
    const lo = g - it.y - (P.hitH + it.h / 2) + 4;
    const hi = g - it.y + it.h / 2 - 4;
    let ok = false;
    for (let k = 0; k <= 8; k++) {
      const t =
        Math.max(0, t0 - lead) + ((Math.min(t1 - lead, AIRTIME) - Math.max(0, t0 - lead)) * k) / 8;
      const hgt = jumpHeight(t);
      if (hgt > lo && hgt < hi) {
        ok = true;
        break;
      }
    }
    // Never take a bottle if it puts us in the air when an obstacle arrives, or
    // lands us right on top of one.
    if (ok && (obsT0 === Infinity || obsT0 > AIRTIME + 0.22 || clearsNow)) {
      dst.down = true;
      return;
    }
  }
}

// --- L2 --------------------------------------------------------------------

const S2 = TUNING.sisyphos;

function intentSisyphos(s: import('./levels/sisyphos.js').SisyphosState, dst: InputFrame): void {
  const py = sisyPlayerY(s.h);
  dst.down = true;
  dst.y = py;

  let best = s.x;
  let bestScore = -Infinity;
  const safe = s.shadesLeft > 0;
  const scroll = S2.scrollSpeed * s.mods.speedMul;
  const reach = S2.playerR + S2.bouncerR;

  for (let cand = 20; cand <= W - 20; cand += 10) {
    let score = -Math.abs(cand - s.x) * 0.02;
    let danger = 0;
    for (let i = 0; i < s.bouncers.length; i++) {
      const b = s.bouncers[i];
      if (!b.active) continue;
      const sy = sisyScreenY(b.wy, s.progress_px, s.h);
      const dy = py - sy;
      if (dy < -reach || dy > 300) continue;
      // A row is not a moment: it overlaps the player for (2·reach)/scroll
      // seconds, and a bouncer crosses a lot of the screen in that time. Score
      // the closest approach over the whole overlap, not the mid-point.
      const tEnter = Math.max(0, (dy - reach) / scroll);
      const tExit = (dy + reach) / scroll;
      let gap = Infinity;
      for (let k = 0; k <= 3; k++) {
        const t = tEnter + ((tExit - tEnter) * k) / 3;
        const bx = predictBouncerX(b.x, b.vx, t);
        const px = s.x + (cand - s.x) * (1 - Math.exp(-S2.lerpRate * t));
        gap = Math.min(gap, Math.abs(px - bx) - (reach + 6));
      }
      const urgency = 1 - Math.min(1, dy / 300);
      if (gap < 0) danger += (10 + -gap) * (0.4 + urgency);
      else score += Math.min(gap, 60) * 0.05 * urgency;
    }
    if (!safe) score -= danger;

    for (let i = 0; i < s.shades.length; i++) {
      const p = s.shades[i];
      if (!p.active) continue;
      const sy = sisyScreenY(p.wy, s.progress_px, s.h);
      const dy = py - sy;
      if (dy < 0 || dy > 260) continue;
      if (Math.abs(cand - p.x) < 24) score += 6;
    }

    if (score > bestScore) {
      bestScore = score;
      best = cand;
    }
  }
  dst.x = best;
}

/** A bouncer bounces off both edges; fold the path back into the lane. */
function predictBouncerX(x: number, vx: number, t: number): number {
  const lo = S2.bouncerR;
  const hi = W - S2.bouncerR;
  const span = hi - lo;
  if (span <= 0) return x;
  let p = x - lo + vx * t;
  p = ((p % (2 * span)) + 2 * span) % (2 * span);
  if (p > span) p = 2 * span - p;
  return lo + p;
}

// --- L3 --------------------------------------------------------------------

const K = TUNING.katjes;

function intentKatjes(s: import('./levels/katjes.js').KatjesState, dst: InputFrame): void {
  const py = katjesPlayerY(s.h);
  const half = K.playerW / 2;
  dst.down = true;
  dst.y = py;
  dst.x = s.x;

  // Score candidate resting positions rather than chasing one item: the level
  // is about what you *don't* catch, and a target that collects a Hering on the
  // way to a Brokkoli is worse than standing still.
  let bestX = s.x;
  let bestScore = -Infinity;

  for (let cand = half; cand <= W - half + 0.001; cand += 9) {
    let score = -Math.abs(cand - s.x) * 0.002;
    for (let i = 0; i < s.items.length; i++) {
      const it = s.items[i];
      if (!it.active || it.bounced || it.vy <= 0) continue;
      // The mouth is a band, not a line: an item is catchable for the whole
      // time it takes to fall through it, and a bag sweeping past mid-band
      // catches it just as well. An item already *inside* the band is the
      // dangerous case — it is one thumb-twitch from being eaten.
      const t = (py - 6 - it.y) / it.vy;
      const tExit = (py + K.catchBandTop - it.y) / it.vy;
      if (tExit < 0 || t > 2.2) continue;
      let nearest = Infinity;
      for (let k = 0; k <= 2; k++) {
        const tk = Math.max(0, t + ((tExit - t) * k) / 2);
        nearest = Math.min(nearest, Math.abs(predictBagX(s.x, cand, tk) - it.x));
      }
      // Asymmetric on purpose: assume a vegetable is caught if it is anywhere
      // near, and a fish only if it is comfortably inside.
      const caught = it.kind === 'veg' ? nearest <= half + 3 : nearest <= half - 3;
      if (!caught) {
        // Near-misses still matter: they say "you were nearly there".
        if (it.kind !== 'veg' && nearest < half + 26) score += 0.15 / (t + 0.3);
        continue;
      }
      if (it.kind === 'veg') score -= 60;
      else score += (it.kind === 'bonus' ? K.bonusValue : 1) / (t * 0.35 + 0.3);
    }
    if (score > bestScore) {
      bestScore = score;
      bestX = cand;
    }
  }
  dst.x = clamp(bestX, half, W - half);
}

/** Where the bag will be in `t` seconds if it keeps heading for `target`. */
function predictBagX(x: number, target: number, t: number): number {
  return x + (target - x) * (1 - Math.exp(-K.lerpRate * t));
}

// --- L4 --------------------------------------------------------------------

const Y = TUNING.kayak;

/**
 * The whole level in one line: move towards the centre, but never faster than
 * calm. `lerpRate` turns a 5 px target offset into ~29 px/s, just under the
 * `calmThreshold` — so a bot (or a person) who nudges gently regains Ruhe.
 */
const GENTLE_STEP = 5;

function intentKayak(s: import('./levels/kayak.js').KayakState, bot: Bot, dst: InputFrame): void {
  const py = kayakPlayerY(s.h);
  dst.down = true;
  dst.y = py;

  // Aim a little downriver, so the correction is already happening when the
  // bend arrives.
  let want = channelCentre(s.travel + 70);

  // Rocks: pick the side of the channel with room, rather than swerving late.
  const hw = channelHalfWidth(s.travel);
  for (let i = 0; i < s.rocks.length; i++) {
    const r = s.rocks[i];
    if (!r.active) continue;
    const sy = screenYOf(r.wy, s.travel, s.h);
    const dy = py - sy;
    if (dy < 0 || dy > 260) continue;
    if (Math.abs(r.x - want) < r.r + Y.hullR + 10) {
      const centre = channelCentre(r.wy);
      const away = r.x > centre ? -1 : 1;
      want = clamp(centre + away * hw * 0.45, 20, W - 20);
    }
  }

  const step = bot.name === 'perfect' ? GENTLE_STEP : GENTLE_STEP + bot.params.aimError * 0.1;
  dst.x = s.x + clamp(want - s.x, -step, step);
}

// ---------------------------------------------------------------------------
// The bot wrapper: reaction delay, aim error, missed inputs, the tipsy freeze
// ---------------------------------------------------------------------------

export function botInput(bot: Bot, s: AnyLevelState): InputFrame {
  const slot = bot.ring[bot.head % RING];

  if (bot.name === 'idle') {
    slot.down = false;
    slot.x = 0;
    slot.y = 0;
  } else if (bot.name === 'mash') {
    slot.down = rand(bot.rng) < 0.6;
    slot.x = randRange(bot.rng, 0, W);
    slot.y = randRange(bot.rng, 0, s.h);
  } else {
    intent(s, bot, slot);
    if (bot.params.aimError > 0) {
      if (bot.aimTimer <= 0) {
        bot.aim = randRange(bot.rng, -bot.params.aimError, bot.params.aimError);
        bot.aimTimer = 18 + Math.floor(rand(bot.rng) * 24);
      }
      bot.aimTimer--;
      // L1 folds the error into jump timing and L4 into how hard the thumb
      // drags (`GENTLE_STEP`); adding a position offset there would count the
      // same mistake twice.
      if (s.level === 'sisyphos' || s.level === 'katjes') slot.x = clamp(slot.x + bot.aim, 0, W);
    }
  }

  bot.head++;
  const readIdx = (bot.head - 1 - bot.delay + RING * 2) % RING;
  const src = bot.head > bot.delay ? bot.ring[readIdx] : bot.ring[0];

  if (bot.freezeLeft > 0) {
    bot.freezeLeft--;
    bot.out.down = false;
    return bot.out;
  }
  if (bot.params.freezeChance > 0 && rand(bot.rng) < bot.params.freezeChance) {
    bot.freezeLeft = 60;
    bot.out.down = false;
    return bot.out;
  }

  if (bot.params.missChance > 0 && rand(bot.rng) < bot.params.missChance) {
    // The input simply doesn't land: a tap that never registered, a thumb that
    // didn't move. Keep the previous output.
    return bot.out;
  }

  bot.out.down = src.down;
  bot.out.x = src.x;
  bot.out.y = src.y;
  return bot.out;
}

// ---------------------------------------------------------------------------
// Running a whole level headlessly
// ---------------------------------------------------------------------------

export type RunResult = {
  level: LevelId;
  bot: BotName;
  seed: number;
  won: boolean;
  frames: number;
  seconds: number;
  /** Final level-specific score, for the balance report. */
  score: number;
  livesLeft: number;
  nonFinite: string | null;
  state: AnyLevelState;
};

export type RunOptions = {
  h?: number;
  mods?: Mods;
  /** Deep-scan for NaN every N frames (0 disables). */
  scanEvery?: number;
};

export function runLevel(level: LevelId, seed: number, botName: BotName, opts: RunOptions = {}): RunResult {
  const h = opts.h ?? 780;
  const s = createLevel(level, seed, h, opts.mods ?? NO_MODS);
  const bot = makeBot(botName, seed);
  const cap = frameCap(level);
  const scanEvery = opts.scanEvery ?? 0;
  let nonFinite: string | null = null;

  while (s.status === 'run' && s.frame < cap) {
    stepLevel(s, botInput(bot, s));
    if (scanEvery > 0 && s.frame % scanEvery === 0 && !nonFinite) nonFinite = findNonFinite(s);
  }

  return {
    level,
    bot: botName,
    seed,
    won: s.status === 'win',
    frames: s.frame,
    seconds: s.frame * DT,
    score: scoreOf(s),
    livesLeft: s.lives,
    nonFinite,
    state: s,
  };
}

export function scoreOf(s: AnyLevelState): number {
  switch (s.level) {
    case 'pfand':
      return s.bottles;
    case 'sisyphos':
      return Math.round(s.progress_px);
    case 'katjes':
      return s.fish;
    case 'kayak':
      return Math.round(s.ruhe);
  }
}
