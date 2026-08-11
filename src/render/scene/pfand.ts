/**
 * L1 — Sonnenallee, morgens um sieben.
 *
 * The player is hand-drawn vector (it must not vary by platform); the props
 * come from the emoji atlas.
 */

import { TUNING, W } from '../../config/tuning.js';
import { groundY, type PfandState } from '../../core/levels/pfand.js';
import { drawGlyph } from '../atlas.js';
import { AMBER, CHALK, HAZE, INK, PINK } from '../palette.js';
import { skyline, verticalGradient, vignette } from './shared.js';

const T = TUNING.pfand;

export function drawPfand(ctx: CanvasRenderingContext2D, s: PfandState, frame: number): void {
  const h = s.h;
  const g = groundY(h);

  // --- sky: Berlin at 7 a.m., which is not quite morning yet ---------------
  ctx.fillStyle = verticalGradient(ctx, 'pfand-sky', 0, g, [
    [0, '#0B0A1E'],
    [0.55, '#141033'],
    [1, '#2A1436'],
  ]);
  ctx.fillRect(0, 0, W, g);

  // Stars and a low moon fill the upper third: on a tall phone the play area
  // is only the bottom quarter, and an empty sky reads as an unfinished screen.
  ctx.fillStyle = 'rgba(243,240,255,0.5)';
  for (let i = 0; i < 26; i++) {
    const sx = ((i * 137) % W) + Math.sin(i) * 4;
    const sy = 30 + ((i * 79) % Math.max(40, g - 260));
    ctx.globalAlpha = 0.15 + ((i * 13) % 7) / 14;
    ctx.fillRect(sx, sy, 1.6, 1.6);
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = 'rgba(243,240,255,0.7)';
  ctx.beginPath();
  ctx.arc(W - 76, g * 0.24, 17, 0, Math.PI * 2);
  ctx.fill();

  skyline(ctx, s.dist * 0.06, g - 150, '#0C0A1F', 92, 90, Math.max(140, g * 0.36), 3);
  skyline(ctx, s.dist * 0.12, g - 96, '#0E0C22', 74, 70, Math.max(120, g * 0.26), 1);
  skyline(ctx, s.dist * 0.28, g - 34, '#141130', 58, 40, 120, 7);

  // --- street --------------------------------------------------------------
  ctx.fillStyle = '#0A0918';
  ctx.fillRect(0, g, W, h - g);
  ctx.fillStyle = 'rgba(185,180,214,0.35)';
  ctx.fillRect(0, g, W, 1);

  // Kerb dashes, moving with the world so the speed is legible.
  ctx.fillStyle = 'rgba(185,180,214,0.16)';
  const dash = 34;
  const off = s.dist % dash;
  for (let x = -off; x < W; x += dash) ctx.fillRect(x, g + 26, 18, 2);

  // Street lamps, on the far parallax layer.
  const lampSpan = 190;
  const lampOff = (s.dist * 0.45) % lampSpan;
  for (let i = -1; i < Math.ceil(W / lampSpan) + 1; i++) {
    const x = i * lampSpan - lampOff;
    ctx.fillStyle = '#171436';
    ctx.fillRect(x, g - 128, 3, 128);
    ctx.fillStyle = 'rgba(255,179,0,0.8)';
    ctx.fillRect(x - 4, g - 132, 12, 5);
    ctx.fillStyle = 'rgba(255,179,0,0.07)';
    ctx.beginPath();
    ctx.moveTo(x + 1.5, g - 126);
    ctx.lineTo(x - 26, g);
    ctx.lineTo(x + 30, g);
    ctx.closePath();
    ctx.fill();
  }

  // --- items ---------------------------------------------------------------
  for (let i = 0; i < s.items.length; i++) {
    const it = s.items[i];
    if (!it.active) continue;
    switch (it.kind) {
      case 'bottle': {
        const bob = Math.sin(frame * 0.12 + it.phase) * 2;
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = AMBER;
        ctx.beginPath();
        ctx.arc(it.x, it.y + bob, 15, 0, Math.PI * 2);
        ctx.globalAlpha = 0.12;
        ctx.fill();
        ctx.globalAlpha = 1;
        drawGlyph(ctx, 'bottle', it.x, it.y + bob, 27, Math.sin(frame * 0.06 + it.phase) * 0.25);
        break;
      }
      case 'roller':
        drawGlyph(ctx, 'roller', it.x, it.y - 2, 38);
        break;
      case 'hund':
        drawGlyph(ctx, 'hund', it.x, it.y, 24);
        break;
      case 'zaun':
        drawFence(ctx, it.x, it.y, it.w, it.h);
        break;
    }
  }

  drawRunner(ctx, s, g, frame);
  vignette(ctx, h, 0.42);
}

/** Baustellenzaun: hand-drawn, because a fence has to read as "jump this". */
function drawFence(ctx: CanvasRenderingContext2D, cx: number, cy: number, w: number, h: number): void {
  const x = cx - w / 2;
  const y = cy - h / 2;
  ctx.fillStyle = '#2A2550';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = AMBER;
  ctx.fillRect(x, y, w, 4);
  ctx.fillRect(x, y + h - 4, w, 4);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y + 4, w, h - 8);
  ctx.clip();
  ctx.strokeStyle = 'rgba(255,179,0,0.85)';
  ctx.lineWidth = 5;
  for (let i = -h; i < w + h; i += 13) {
    ctx.beginPath();
    ctx.moveTo(x + i, y + h);
    ctx.lineTo(x + i + h, y);
    ctx.stroke();
  }
  ctx.restore();
}

/** The Pfandpirat: a vector figure, so he looks the same on every phone. */
function drawRunner(ctx: CanvasRenderingContext2D, s: PfandState, g: number, frame: number): void {
  const x = T.playerX;
  const feet = s.py;
  const blink = s.invuln > 0 && Math.floor(frame / 4) % 2 === 0;
  ctx.globalAlpha = blink ? 0.35 : 1;

  // Shadow, tied to height so the jump arc is readable.
  const height = Math.max(0, g - feet);
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.beginPath();
  ctx.ellipse(x + T.hitW / 2, g + 3, 16 - height * 0.05, 4 - height * 0.012, 0, 0, Math.PI * 2);
  ctx.fill();

  const cx = x + T.hitW / 2;
  const top = feet - T.hitH;

  // Bag of bottles on the back — the whole premise in one shape.
  ctx.fillStyle = '#241F4A';
  ctx.fillRect(cx - 20, top + 12, 12, 20);
  ctx.fillStyle = AMBER;
  ctx.fillRect(cx - 18, top + 8, 3, 7);
  ctx.fillRect(cx - 13, top + 6, 3, 9);

  // Body
  ctx.fillStyle = CHALK;
  ctx.fillRect(cx - 7, top + 12, 14, 20);
  // Head
  ctx.fillStyle = CHALK;
  ctx.beginPath();
  ctx.arc(cx, top + 6, 7, 0, Math.PI * 2);
  ctx.fill();
  // Cap, because it is 7 a.m.
  ctx.fillStyle = PINK;
  ctx.fillRect(cx - 8, top - 1, 16, 4);
  ctx.fillRect(cx + 2, top + 1, 9, 3);

  // Legs: a two-frame run cycle on the ground, a tuck in the air.
  ctx.strokeStyle = CHALK;
  ctx.lineWidth = 3.5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  if (s.onGround) {
    const phase = Math.sin(frame * 0.4);
    ctx.moveTo(cx - 2, top + 32);
    ctx.lineTo(cx - 2 + phase * 8, feet);
    ctx.moveTo(cx + 2, top + 32);
    ctx.lineTo(cx + 2 - phase * 8, feet);
  } else {
    ctx.moveTo(cx - 2, top + 32);
    ctx.lineTo(cx - 9, feet - 6);
    ctx.moveTo(cx + 2, top + 32);
    ctx.lineTo(cx + 8, feet - 3);
  }
  ctx.stroke();

  // Arms
  ctx.strokeStyle = HAZE;
  ctx.lineWidth = 3;
  ctx.beginPath();
  const arm = s.onGround ? Math.sin(frame * 0.4 + Math.PI) * 7 : -9;
  ctx.moveTo(cx + 4, top + 16);
  ctx.lineTo(cx + 10, top + 22 + arm * 0.4);
  ctx.stroke();

  ctx.globalAlpha = 1;
  ctx.lineCap = 'butt';

  // At 5,00 € the Pfandautomat spits out the Bon.
  if (s.status === 'win') {
    ctx.fillStyle = INK;
    drawGlyph(ctx, 'receipt', W / 2, s.h * 0.42, 64);
  }
}
