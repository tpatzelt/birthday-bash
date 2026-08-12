/**
 * HUD: the Pfandbon receipt strip, lives, the Ruhe meter, progress.
 *
 * Rendering never mutates state. Numerals are tabular so the score doesn't
 * jitter (DESIGN.md §7).
 */

import { TUNING, W } from '../config/tuning.js';
import type { AnyLevelState } from '../core/game.js';
import { euros } from '../core/levels/pfand.js';
import { INK, PINK, AMBER, TEAL, HAZE, CHALK, PANEL } from './palette.js';
import type { Viewport } from './canvas.js';

export function display(ctx: CanvasRenderingContext2D, size: number, weight = 800): void {
  ctx.font = `${weight} ${size}px ui-sans-serif, system-ui, "Helvetica Neue", Arial, sans-serif`;
}

export function numerals(ctx: CanvasRenderingContext2D, size: number, weight = 700): void {
  ctx.font = `${weight} ${size}px ui-monospace, "SF Mono", "Roboto Mono", Menlo, monospace`;
}

/** Uppercase, wide letter-spacing — done by hand, since canvas has no tracking. */
export function tracked(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  spacing: number,
  align: 'left' | 'center' | 'right' = 'left',
): void {
  const chars = [...text];
  let total = 0;
  for (const c of chars) total += ctx.measureText(c).width + spacing;
  total -= spacing;
  let cx = align === 'left' ? x : align === 'center' ? x - total / 2 : x - total;
  const prev = ctx.textAlign;
  ctx.textAlign = 'left';
  for (const c of chars) {
    ctx.fillText(c, cx, y);
    cx += ctx.measureText(c).width + spacing;
  }
  ctx.textAlign = prev;
}

/**
 * Solo play never exceeds a handful of lives (3 base + the mercy rule's +1).
 * Afterhour inflates a segment's own livesMax far past that on purpose (the
 * shared strike pool is the real limit, drawn separately) — past this many,
 * a per-pip row would just be clutter, so it's skipped rather than drawn tiny.
 */
const LIVES_ROW_MAX = 6;

export function livesRow(ctx: CanvasRenderingContext2D, x: number, y: number, lives: number, max: number): void {
  if (max > LIVES_ROW_MAX) return;
  for (let i = 0; i < max; i++) {
    const on = i < lives;
    ctx.fillStyle = on ? PINK : 'rgba(185,180,214,0.25)';
    ctx.fillRect(x + i * 13, y, 8, 8);
  }
}

export function drawHud(ctx: CanvasRenderingContext2D, s: AnyLevelState, vp: Viewport, frame: number): void {
  const top = 16 + vp.safeTop;
  const rule = top + 46;

  // A hairline progress rule across the whole width: the only always-on HUD.
  ctx.fillStyle = 'rgba(185,180,214,0.18)';
  ctx.fillRect(0, rule, W, 1);
  ctx.fillStyle = accentFor(s);
  ctx.fillRect(0, rule, W * s.progress, 1);

  switch (s.level) {
    case 'pfand':
      drawReceipt(ctx, s.cents, s.goal * TUNING.pfand.centsPerBottle, top);
      livesRow(ctx, W - 20 - (s.livesMax - 1) * 13 - 8, top + 6, s.lives, s.livesMax);
      break;
    case 'sisyphos': {
      ctx.fillStyle = HAZE;
      display(ctx, 10);
      tracked(ctx, 'SCHLANGE', 20, top + 8, 3.4);
      numerals(ctx, 20);
      ctx.fillStyle = CHALK;
      ctx.textAlign = 'left';
      ctx.fillText(`${Math.round(s.progress * 100)}%`, 20, top + 34);
      livesRow(ctx, W - 20 - (s.livesMax - 1) * 13 - 8, top + 4, s.lives, s.livesMax);
      if (s.shadesLeft > 0) {
        ctx.fillStyle = TEAL;
        display(ctx, 9);
        tracked(ctx, 'DU GEHÖRST DAZU', W - 20, top + 26, 2.4, 'right');
        ctx.fillRect(W - 100, top + 32, 80 * Math.min(1, s.shadesLeft / 210), 2);
      }
      break;
    }
    case 'katjes': {
      ctx.fillStyle = HAZE;
      display(ctx, 10);
      tracked(ctx, 'HERINGE', 20, top + 8, 3.4);
      ctx.textAlign = 'left';
      numerals(ctx, 22);
      ctx.fillStyle = CHALK;
      const count = `${s.fish}`;
      ctx.fillText(count, 20, top + 36);
      const countW = ctx.measureText(count).width;
      numerals(ctx, 13);
      ctx.fillStyle = 'rgba(185,180,214,0.55)';
      ctx.fillText(`/ ${s.goal}`, 20 + countW + 10, top + 36);
      livesRow(ctx, W - 20 - (s.livesMax - 1) * 13 - 8, top + 4, s.lives, s.livesMax);
      if (s.combo >= TUNING.katjes.comboShowAt) {
        ctx.fillStyle = AMBER;
        display(ctx, 10);
        tracked(ctx, `KOMBO ×${s.combo}`, 20, top + 50, 1.6);
      }
      break;
    }
    case 'kayak':
      drawRuhe(ctx, s.ruhe, top, frame);
      break;
  }
}

export function accentFor(s: AnyLevelState): string {
  switch (s.level) {
    case 'pfand':
      return AMBER;
    case 'sisyphos':
      return PINK;
    case 'katjes':
      return CHALK;
    case 'kayak':
      return TEAL;
  }
}

/** A Pfandbon-style receipt strip: € 3,25 / 5,00 in tabular numerals. */
function drawReceipt(ctx: CanvasRenderingContext2D, cents: number, goalCents: number, top: number): void {
  const w = 168;
  const h = 48;
  const x = 20;
  ctx.fillStyle = PANEL;
  ctx.fillRect(x, top - 6, w, h);
  ctx.fillStyle = 'rgba(255,179,0,0.5)';
  ctx.fillRect(x, top - 6, w, 1);

  // The torn bottom edge of a till receipt.
  ctx.fillStyle = PANEL;
  ctx.beginPath();
  for (let i = 0; i < w; i += 8) {
    ctx.moveTo(x + i, top - 6 + h);
    ctx.lineTo(x + i + 4, top - 6 + h + 4);
    ctx.lineTo(x + i + 8, top - 6 + h);
  }
  ctx.fill();

  ctx.fillStyle = 'rgba(255,179,0,0.75)';
  display(ctx, 9);
  tracked(ctx, 'PFANDBON', x + 10, top + 6, 2.8);

  ctx.textAlign = 'left';
  numerals(ctx, 20, 700);
  ctx.fillStyle = AMBER;
  ctx.fillText(`€ ${euros(cents)}`, x + 10, top + 28);
  numerals(ctx, 12, 500);
  ctx.fillStyle = 'rgba(255,179,0,0.55)';
  ctx.fillText(`/ ${euros(goalCents)}`, x + 10 + 76, top + 28);
}

/** The Ruhe meter — the only place a meter drives the mix (DESIGN.md §6). */
function drawRuhe(ctx: CanvasRenderingContext2D, ruhe: number, top: number, frame: number): void {
  const x = 20;
  const w = W - 40;
  const t = Math.max(0, Math.min(1, ruhe / 100));

  ctx.fillStyle = HAZE;
  display(ctx, 10);
  tracked(ctx, 'RUHE', x, top + 10, 4);

  ctx.fillStyle = 'rgba(185,180,214,0.18)';
  ctx.fillRect(x, top + 22, w, 6);

  // Below a quarter it breathes, which reads as "you are losing this" without
  // a word of text.
  const pulse = t < 0.25 ? 0.75 + 0.25 * Math.sin(frame * 0.25) : 1;
  ctx.globalAlpha = pulse;
  ctx.fillStyle = t < 0.25 ? PINK : TEAL;
  ctx.fillRect(x, top + 22, w * t, 6);
  ctx.globalAlpha = 1;

  ctx.fillStyle = t < 0.25 ? PINK : 'rgba(35,211,196,0.75)';
  numerals(ctx, 11);
  ctx.textAlign = 'right';
  ctx.fillText(`${Math.round(ruhe)}`, x + w, top + 12);
  ctx.textAlign = 'left';
}

/** A dark scrim used behind the overlay cards so copy stays readable. */
export function scrim(ctx: CanvasRenderingContext2D, h: number, alpha = 0.72): void {
  ctx.fillStyle = INK;
  ctx.globalAlpha = alpha;
  ctx.fillRect(0, 0, W, h);
  ctx.globalAlpha = 1;
}
