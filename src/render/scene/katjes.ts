/**
 * L3 — Salzige Heringe. Es regnet Katjes.
 *
 * At 340 px/s on a small screen, silhouette contrast is the only thing that
 * makes this readable: the Hering is a flat black-and-white lozenge, the
 * vegetables are round, loud and tumbling (DESIGN.md §4).
 */

import { TUNING, W } from '../../config/tuning.js';
import { playerY, type KatjesState, type Falling } from '../../core/levels/katjes.js';
import { drawGlyph } from '../atlas.js';
import { CHALK, HAZE, PINK, VEG_GREEN, VEG_ORANGE, VEG_PURPLE } from '../palette.js';
import { verticalGradient, vignette } from './shared.js';

const T = TUNING.katjes;

export function drawKatjes(ctx: CanvasRenderingContext2D, s: KatjesState, frame: number): void {
  const h = s.h;
  const py = playerY(h);

  ctx.fillStyle = verticalGradient(ctx, 'katjes-sky', 0, h, [
    [0, '#191036'],
    [0.6, '#0D0A20'],
    [1, '#080714'],
  ]);
  ctx.fillRect(0, 0, W, h);

  // A flat Neukölln rooftop line, just enough to place the scene.
  ctx.fillStyle = '#0B0A1C';
  ctx.fillRect(0, h - 74, W, 74);
  ctx.fillStyle = 'rgba(185,180,214,0.16)';
  ctx.fillRect(0, h - 74, W, 1);
  ctx.fillStyle = '#0B0A1C';
  for (let x = 0; x < W; x += 46) ctx.fillRect(x, h - 92, 26, 18);

  for (let i = 0; i < s.items.length; i++) {
    const it = s.items[i];
    if (!it.active) continue;
    drawItem(ctx, it, frame);
  }

  drawBag(ctx, s, py, frame);
  vignette(ctx, h, 0.44);
}

function drawItem(ctx: CanvasRenderingContext2D, it: Falling, frame: number): void {
  const spin = it.spin * frame * 0.05;
  switch (it.kind) {
    case 'fish':
      drawHering(ctx, it.x, it.y, spin * 0.25);
      break;
    case 'bonus':
      drawLakritz(ctx, it.x, it.y, spin * 0.4, frame);
      break;
    case 'veg':
      drawVeg(ctx, it, spin);
      break;
  }
}

/** The Hering: flat, black-and-white, unmistakably *not* a vegetable. */
function drawHering(ctx: CanvasRenderingContext2D, x: number, y: number, rot: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.fillStyle = '#0B0A14';
  ctx.beginPath();
  ctx.ellipse(0, 0, 15, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = CHALK;
  ctx.beginPath();
  ctx.moveTo(9, 0);
  ctx.lineTo(16, -6);
  ctx.lineTo(16, 6);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = CHALK;
  ctx.beginPath();
  ctx.ellipse(-4, -1, 9, 4.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#0B0A14';
  ctx.beginPath();
  ctx.arc(-10, -1.5, 1.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawLakritz(ctx: CanvasRenderingContext2D, x: number, y: number, rot: number, frame: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.globalAlpha = 0.35 + 0.25 * Math.sin(frame * 0.2);
  ctx.fillStyle = PINK;
  ctx.beginPath();
  ctx.arc(0, 0, 18, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  // A rolled liquorice wheel.
  ctx.fillStyle = '#0B0A14';
  ctx.beginPath();
  ctx.arc(0, 0, 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = PINK;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(0, 0, 6.5, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

const VEG_COLORS = [VEG_GREEN, VEG_ORANGE, VEG_PURPLE];
const VEG_GLYPHS = ['broccoli', 'carrot', 'aubergine'] as const;

function drawVeg(ctx: CanvasRenderingContext2D, it: Falling, rot: number): void {
  // A loud halo behind the glyph: the silhouette has to survive a dark room and
  // a phone at 20 % brightness, where the emoji alone would not.
  ctx.globalAlpha = 0.3;
  ctx.fillStyle = VEG_COLORS[it.variant % 3];
  ctx.beginPath();
  ctx.arc(it.x, it.y, 20, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  drawGlyph(ctx, VEG_GLYPHS[it.variant % 3], it.x, it.y, 32, rot);
}

/** The Tüte: an open paper bag, hand-drawn. */
function drawBag(ctx: CanvasRenderingContext2D, s: KatjesState, py: number, frame: number): void {
  const w = T.playerW;
  const blink = s.invuln > 0 && Math.floor(frame / 4) % 2 === 0;
  ctx.globalAlpha = blink ? 0.4 : 1;

  const x = s.x - w / 2;
  const tilt = Math.max(-0.12, Math.min(0.12, (s.targetX - s.x) * 0.004));
  ctx.save();
  ctx.translate(s.x, py);
  ctx.rotate(tilt);

  ctx.fillStyle = '#1A1638';
  ctx.beginPath();
  ctx.moveTo(-w / 2, 0);
  ctx.lineTo(w / 2, 0);
  ctx.lineTo(w / 2 - 7, 58);
  ctx.lineTo(-w / 2 + 7, 58);
  ctx.closePath();
  ctx.fill();

  // The open mouth of the bag — the actual catch surface.
  ctx.fillStyle = '#0A0918';
  ctx.beginPath();
  ctx.ellipse(0, 0, w / 2, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = CHALK;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(0, 0, w / 2, 8, 0, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = HAZE;
  ctx.font = '800 9px ui-sans-serif, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('KATJES', 0, 34);
  ctx.textAlign = 'left';
  ctx.restore();

  void x;
  ctx.globalAlpha = 1;
}
