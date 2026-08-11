/**
 * Every tuning constant in the game, in one object.
 *
 * A magic number in a level file is a bug: the balance report sweeps this
 * object, and a reviewer must be able to see a constant change as a one-line
 * diff next to the win-rate table it moved. Values are the starting points from
 * DESIGN.md §4, corrected by reports/balance.md.
 */

export const FPS = 60;
export const DT = 1 / FPS;

/** Logical canvas width. Height is derived per device, see canvasHeight(). */
export const W = 390;

/** H = clamp(round(390 * vh / vw), 620, 900) — DESIGN.md §4. */
export function canvasHeight(vw: number, vh: number): number {
  if (!(vw > 0) || !(vh > 0)) return 780;
  return Math.max(620, Math.min(900, Math.round((W * vh) / vw)));
}

export const TUNING = {
  pfand: {
    goalBottles: 20,
    centsPerBottle: 25,
    lives: 3,
    playerX: 92,
    groundOffset: 130, // ground y = H - groundOffset
    hitW: 34,
    hitH: 46,
    gravity: 2400,
    jumpImpulse: -760,
    coyoteMs: 100,
    bufferMs: 120,
    speedBase: 240,
    speedRamp: 2.7, // px/s per second
    speedRampMax: 160,
    gapMin: 210,
    gapMax: 340,
    pfandShare: 0.55, // rest are obstacles
    clusterMin: 1,
    clusterMax: 3,
    arcShare: 0.45, // share of clusters placed on a jump arc
    arcHeight: 96,
    bottleR: 13,
    invulnMs: 1200,
    timeCapS: 150,
    obstacles: [
      { kind: 'roller', w: 40, h: 30, weight: 0.4 },
      { kind: 'hund', w: 24, h: 16, weight: 0.28 },
      { kind: 'zaun', w: 30, h: 54, weight: 0.32 },
    ],
  },

  sisyphos: {
    goalPx: 2600,
    lives: 3,
    playerYOffset: 170, // player y = H - playerYOffset
    playerR: 16,
    lerpRate: 12,
    scrollSpeed: 110,
    rowSpacing: 240,
    bouncerR: 22,
    bouncerSpeedMin: 60,
    bouncerSpeedMax: 130,
    twoBouncerChance: 0.45,
    pushBackPx: 260,
    invulnMs: 1500,
    shadesEveryPx: 700,
    shadesDurationMs: 3500,
    shadesR: 18,
    timeCapS: 120,
  },

  katjes: {
    goalFish: 25,
    lives: 3,
    playerYOffset: 120,
    playerW: 62,
    lerpRate: 16,
    spawnIntervalStart: 0.62,
    spawnIntervalEnd: 0.34,
    rampSeconds: 45,
    fallSpeedStart: 210,
    fallSpeedEnd: 340,
    shareFish: 0.65,
    shareVeg: 0.27,
    shareBonus: 0.08,
    bonusValue: 3,
    itemR: 15,
    catchBandTop: 26, // how far above the bag's y an item still counts as caught
    timeCapS: 150,
  },

  kayak: {
    goalPx: 4800,
    playerYOffset: 190,
    lerpRate: 6,
    ruheStart: 100,
    ruheMax: 100,
    panicThreshold: 55, // |vx| above this drains Ruhe
    panicDrain: 0.05,
    outsideDrain: 7,
    calmThreshold: 30, // |vx| below this, inside the channel, regains Ruhe
    calmRegen: 5,
    speedInside: 130,
    speedOutside: 78,
    halfWidthStart: 84,
    halfWidthEnd: 62,
    rockEveryPx: 520,
    rockR: 26,
    rockHitRuhe: 16,
    rockHitInvulnMs: 600,
    hullR: 15,
    timeCapS: 140,
  },

  mercy: {
    /** Fails on a level before „Überspringen" appears (DESIGN.md §8.1). */
    skipAfterFails: 2,
    /** Fails before the level silently auto-eases (DESIGN.md §8.2). */
    easeAfterFails: 4,
    easeDensityMul: 0.8,
    easeSpeedMul: 0.9,
    easeExtraLives: 1,
  },

  audio: {
    bpm: 126,
    beatsPerBar: 4,
    masterGain: 0.55,
  },
} as const;

export type Tuning = typeof TUNING;

/** Difficulty modifiers applied by the mercy rules. Never harsher than 1. */
export type Mods = {
  densityMul: number;
  speedMul: number;
  extraLives: number;
};

export const NO_MODS: Mods = { densityMul: 1, speedMul: 1, extraLives: 0 };

export function modsForFails(fails: number): Mods {
  if (fails >= TUNING.mercy.easeAfterFails) {
    return {
      densityMul: TUNING.mercy.easeDensityMul,
      speedMul: TUNING.mercy.easeSpeedMul,
      extraLives: TUNING.mercy.easeExtraLives,
    };
  }
  return { ...NO_MODS };
}
