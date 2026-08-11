/**
 * mulberry32 — small, fast, and good enough for spawn tables.
 *
 * The state is a single uint32 held in a plain object so it serialises with the
 * rest of the game state and a replay can resume mid-stream. This is the only
 * source of randomness allowed anywhere under core/.
 */

export type Rng = { s: number };

export function makeRng(seed: number): Rng {
  // Mix the seed so that adjacent seeds (0, 1, 2 … as used by the bot matrix)
  // don't produce visibly correlated first draws.
  let h = seed >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return { s: h };
}

export function cloneRng(r: Rng): Rng {
  return { s: r.s };
}

/** Uniform in [0, 1). */
export function rand(r: Rng): number {
  r.s = (r.s + 0x6d2b79f5) >>> 0;
  let t = r.s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Uniform in [lo, hi). */
export function randRange(r: Rng, lo: number, hi: number): number {
  return lo + rand(r) * (hi - lo);
}

/** Uniform integer in [lo, hi] inclusive. */
export function randInt(r: Rng, lo: number, hi: number): number {
  return lo + Math.floor(rand(r) * (hi - lo + 1));
}

export function randBool(r: Rng, p: number): boolean {
  return rand(r) < p;
}

/** Pick an index from a weight table. Weights need not sum to 1. */
export function randWeighted(r: Rng, weights: readonly number[]): number {
  let total = 0;
  for (let i = 0; i < weights.length; i++) total += weights[i];
  let t = rand(r) * total;
  for (let i = 0; i < weights.length; i++) {
    t -= weights[i];
    if (t <= 0) return i;
  }
  return weights.length - 1;
}
