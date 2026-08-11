/**
 * Canvas sizing: DPR, safe areas, and the logical→device transform.
 *
 * The logical resolution is 390 × H, where H comes from the viewport aspect so
 * the game *fills* the phone rather than letterboxing. Levels anchor to H and
 * never assume a fixed height (ARCHITECTURE.md).
 */

import { canvasHeight, W } from '../config/tuning.js';

export type Viewport = {
  /** Logical size the game draws in. */
  w: number;
  h: number;
  /** CSS pixels per logical pixel. */
  scale: number;
  dpr: number;
  /** Letterbox offset in CSS px, when the aspect ratio is out of range. */
  ox: number;
  oy: number;
  cssW: number;
  cssH: number;
  /** Safe-area insets, in logical px, for anything interactive. */
  safeTop: number;
  safeBottom: number;
};

export function readInset(name: string): number {
  if (typeof window === 'undefined' || typeof document === 'undefined') return 0;
  const probe = document.createElement('div');
  probe.style.cssText = `position:fixed;top:0;left:0;height:env(${name},0px);pointer-events:none;visibility:hidden;`;
  document.body.appendChild(probe);
  const v = probe.getBoundingClientRect().height;
  probe.remove();
  return Number.isFinite(v) ? v : 0;
}

export function makeViewport(cssW: number, cssH: number, dpr: number): Viewport {
  const h = canvasHeight(cssW, cssH);
  const scale = Math.min(cssW / W, cssH / h);
  return {
    w: W,
    h,
    scale,
    dpr,
    ox: (cssW - W * scale) / 2,
    oy: (cssH - h * scale) / 2,
    cssW,
    cssH,
    safeTop: 0,
    safeBottom: 0,
  };
}

/**
 * Resize the backing store and set the transform once. Backing store is
 * `logical × min(devicePixelRatio, 3)` — beyond 3 the extra pixels cost frame
 * time on a mid-range Android and buy nothing.
 */
export function resizeCanvas(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D): Viewport {
  const cssW = Math.max(1, canvas.clientWidth || window.innerWidth);
  const cssH = Math.max(1, canvas.clientHeight || window.innerHeight);
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const vp = makeViewport(cssW, cssH, dpr);

  const backingW = Math.round(cssW * dpr);
  const backingH = Math.round(cssH * dpr);
  if (canvas.width !== backingW || canvas.height !== backingH) {
    canvas.width = backingW;
    canvas.height = backingH;
  }

  const s = vp.scale * dpr;
  ctx.setTransform(s, 0, 0, s, vp.ox * dpr, vp.oy * dpr);
  ctx.imageSmoothingEnabled = true;

  const top = readInset('safe-area-inset-top');
  const bottom = readInset('safe-area-inset-bottom');
  vp.safeTop = top / vp.scale;
  vp.safeBottom = bottom / vp.scale;
  return vp;
}

/** Client (CSS page) coordinates → logical canvas coordinates. */
export function toLogical(vp: Viewport, rect: { left: number; top: number }, clientX: number, clientY: number): {
  x: number;
  y: number;
} {
  return {
    x: (clientX - rect.left - vp.ox) / vp.scale,
    y: (clientY - rect.top - vp.oy) / vp.scale,
  };
}

export function isLandscape(): boolean {
  if (typeof window === 'undefined') return false;
  return window.innerWidth > window.innerHeight * 1.15;
}

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
