/**
 * Backdrop helpers shared by the level scenes.
 *
 * Gradients and other allocating objects are built once and cached by key: the
 * steady-state draw path must not allocate.
 */

import { W } from '../../config/tuning.js';

const gradients = new Map<string, CanvasGradient>();

export function verticalGradient(
  ctx: CanvasRenderingContext2D,
  key: string,
  y0: number,
  y1: number,
  stops: Array<[number, string]>,
): CanvasGradient {
  const cacheKey = `${key}:${y0}:${y1}`;
  let g = gradients.get(cacheKey);
  if (!g) {
    g = ctx.createLinearGradient(0, y0, 0, y1);
    for (const [at, color] of stops) g.addColorStop(at, color);
    gradients.set(cacheKey, g);
  }
  return g;
}

export function clearGradientCache(): void {
  gradients.clear();
}

/** Deterministic pseudo-noise for static scenery — same layout every run. */
export function hash01(n: number): number {
  const x = Math.sin(n * 127.1) * 43758.5453;
  return x - Math.floor(x);
}

/** A skyline of flat blocks, scrolled by `offset`. */
export function skyline(
  ctx: CanvasRenderingContext2D,
  offset: number,
  baseY: number,
  color: string,
  span: number,
  minH: number,
  maxH: number,
  seed = 0,
): void {
  ctx.fillStyle = color;
  const first = Math.floor(offset / span) - 1;
  for (let i = first; i < first + Math.ceil(W / span) + 3; i++) {
    const r = hash01(i * 1.37 + seed);
    const h = minH + r * (maxH - minH);
    const x = i * span - offset;
    ctx.fillRect(x, baseY - h, span - 4, h);
    // A couple of lit windows, always in the same place for a given block.
    if (r > 0.45) {
      ctx.globalAlpha = 0.55;
      const wy = baseY - h + 10 + hash01(i * 3.1) * (h - 26);
      ctx.fillStyle = 'rgba(255,179,0,0.5)';
      ctx.fillRect(x + 8, wy, 5, 7);
      ctx.fillStyle = color;
      ctx.globalAlpha = 1;
    }
  }
}

/** Two soft vignette lobes: the game is always slightly inside a headset. */
export function vignette(ctx: CanvasRenderingContext2D, h: number, strength = 0.5): void {
  const key = `vig:${h}:${strength}`;
  let g = gradients.get(key);
  if (!g) {
    g = ctx.createRadialGradient(W / 2, h / 2, Math.min(W, h) * 0.28, W / 2, h / 2, Math.max(W, h) * 0.72);
    g.addColorStop(0, 'rgba(7,6,15,0)');
    g.addColorStop(1, `rgba(7,6,15,${strength})`);
    gradients.set(key, g);
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, h);
}
