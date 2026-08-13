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
import { drawFace } from '../face.js';
import {
  CHALK,
  GOLD,
  KATJES_BLUE,
  KATJES_BLUE_LIGHT,
  PINK,
  VEG_GREEN,
  VEG_ORANGE,
  VEG_PURPLE,
} from '../palette.js';
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
      drawLakritz(ctx, it.x, it.y, spin * 0.4, frame, PINK);
      break;
    case 'golden':
      drawLakritz(ctx, it.x, it.y, spin * 0.4, frame, GOLD);
      break;
    case 'veg':
      drawVeg(ctx, it, spin);
      break;
  }
}

/** Salt crystals scattered on the Hering's back — fixed offsets, never random (core/render stays deterministic). */
const SALT_DOTS: ReadonlyArray<[number, number, number]> = [
  [-6, -3.5, 0.9],
  [-1, -4, 0.7],
  [4, -3, 0.8],
  [-3, 1.5, 0.7],
  [2.5, 2, 0.9],
  [-8, 0.5, 0.6],
];

/**
 * The Hering: flat, black-and-white, unmistakably *not* a vegetable — and,
 * per the actual Katjes Salzige Heringe, visibly rolled in coarse salt.
 */
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
  // Coarse salt, clipped to the body so it doesn't spill onto the tail.
  ctx.fillStyle = 'rgba(243,240,255,0.85)';
  for (const [sx, sy, sr] of SALT_DOTS) {
    ctx.beginPath();
    ctx.arc(sx, sy, sr, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawLakritz(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  rot: number,
  frame: number,
  accent: string,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.globalAlpha = 0.35 + 0.25 * Math.sin(frame * 0.2);
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.arc(0, 0, 18, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  // A rolled liquorice wheel.
  ctx.fillStyle = '#0B0A14';
  ctx.beginPath();
  ctx.arc(0, 0, 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = accent;
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

/**
 * The Tüte: the actual Katjes bag, not a generic paper sack — their brand
 * blue, the cat-ear mark, and the wordmark in white.
 */
function drawBag(ctx: CanvasRenderingContext2D, s: KatjesState, py: number, frame: number): void {
  const w = T.playerW;
  const blink = s.invuln > 0 && Math.floor(frame / 4) % 2 === 0;
  ctx.globalAlpha = blink ? 0.4 : 1;

  const x = s.x - w / 2;
  const tilt = Math.max(-0.12, Math.min(0.12, (s.targetX - s.x) * 0.004));
  ctx.save();
  ctx.translate(s.x, py);
  ctx.rotate(tilt);
  // Squash/stretch on a veg hit, derived from the existing invuln timer —
  // no new core state needed.
  if (s.invuln > 0) {
    const wt = s.invuln / 30;
    const scaleX = 1 + T.veghitWobble * Math.sin(wt * Math.PI);
    ctx.scale(scaleX, 1 / scaleX);
  }

  const grad = ctx.createLinearGradient(0, 0, 0, 58);
  grad.addColorStop(0, KATJES_BLUE_LIGHT);
  grad.addColorStop(1, KATJES_BLUE);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(-w / 2, 0);
  ctx.lineTo(w / 2, 0);
  ctx.lineTo(w / 2 - 7, 58);
  ctx.lineTo(-w / 2 + 7, 58);
  ctx.closePath();
  ctx.fill();

  // The open mouth of the bag — the actual catch surface.
  ctx.fillStyle = '#0B3E85';
  ctx.beginPath();
  ctx.ellipse(0, 0, w / 2, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = CHALK;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(0, 0, w / 2, 8, 0, 0, Math.PI * 2);
  ctx.stroke();

  // The cat-ear mark, but the head inside it is Jonas — the bag wears him.
  // Ears go down first so they read as sticking out from behind the hair.
  ctx.fillStyle = CHALK;
  ctx.beginPath();
  ctx.moveTo(-7, 20);
  ctx.lineTo(-10, 8);
  ctx.lineTo(-1, 17);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(7, 20);
  ctx.lineTo(10, 8);
  ctx.lineTo(1, 17);
  ctx.closePath();
  ctx.fill();

  if (!drawFace(ctx, 0, 25, 19)) {
    ctx.fillStyle = CHALK;
    ctx.beginPath();
    ctx.arc(0, 20, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = KATJES_BLUE;
    ctx.beginPath();
    ctx.arc(-2.5, 20.5, 1, 0, Math.PI * 2);
    ctx.arc(2.5, 20.5, 1, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = CHALK;
  ctx.font = '800 9px ui-sans-serif, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('KATJES', 0, 50);
  ctx.textAlign = 'left';
  ctx.restore();

  void x;
  ctx.globalAlpha = 1;
}
