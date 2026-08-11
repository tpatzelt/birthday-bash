/**
 * L2 — Sisyphos, 6 Uhr früh. Top-down, looking at the yard.
 *
 * The fairy lights are the only on-beat visual in the game, which is what makes
 * it read as "the music is coming from inside" (DESIGN.md §4).
 */

import { TUNING, W } from '../../config/tuning.js';
import { playerY, screenY, type SisyphosState } from '../../core/levels/sisyphos.js';
import { drawGlyph } from '../atlas.js';
import { CHALK, HAZE, PINK, TEAL } from '../palette.js';
import { hash01, verticalGradient, vignette } from './shared.js';

const T = TUNING.sisyphos;

export function drawSisyphos(
  ctx: CanvasRenderingContext2D,
  s: SisyphosState,
  frame: number,
  beatPhase: number,
): void {
  const h = s.h;
  const py = playerY(h);

  ctx.fillStyle = verticalGradient(ctx, 'sisy-ground', 0, h, [
    [0, '#150E2B'],
    [0.45, '#0C0A1E'],
    [1, '#080714'],
  ]);
  ctx.fillRect(0, 0, W, h);

  drawYard(ctx, s, h, beatPhase);

  // The queue: a worn track up the middle of the yard.
  ctx.fillStyle = 'rgba(185,180,214,0.05)';
  ctx.fillRect(W / 2 - 96, 0, 192, h);

  // The gate, once it is close enough to see.
  const gateY = screenY(s.goal, s.progress_px, h);
  if (gateY > -160) drawGate(ctx, gateY, s.status === 'win', frame);

  // --- Sonnenbrille --------------------------------------------------------
  for (let i = 0; i < s.shades.length; i++) {
    const p = s.shades[i];
    if (!p.active) continue;
    const sy = screenY(p.wy, s.progress_px, h);
    if (sy < -40 || sy > h + 40) continue;
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = TEAL;
    ctx.beginPath();
    ctx.arc(p.x, sy, 20 + Math.sin(frame * 0.14) * 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    drawGlyph(ctx, 'shades', p.x, sy, 30);
  }

  // --- Türsteher -----------------------------------------------------------
  for (let i = 0; i < s.bouncers.length; i++) {
    const b = s.bouncers[i];
    if (!b.active) continue;
    const sy = screenY(b.wy, s.progress_px, h);
    if (sy < -60 || sy > h + 60) continue;
    drawBouncer(ctx, b.x, sy, b.vx, s.shadesLeft > 0);
  }

  drawQueuer(ctx, s, py, frame);
  vignette(ctx, h, 0.5);
}

/** Trees, the chimney, silhouettes, and fairy lights that pulse on the beat. */
function drawYard(ctx: CanvasRenderingContext2D, s: SisyphosState, h: number, beatPhase: number): void {
  // Parallax scenery keyed to world position, so it drifts with the queue.
  const off = (s.progress_px * 0.35) % 260;

  ctx.fillStyle = '#0A0819';
  for (let i = -1; i < Math.ceil(h / 260) + 2; i++) {
    const y = i * 260 + off;
    // Trees at the edges.
    tree(ctx, 26, y, 34);
    tree(ctx, W - 30, y + 120, 28);
    // The chimney: the one landmark you can actually name.
    ctx.fillStyle = '#0E0B22';
    ctx.fillRect(W - 74, y - 190, 16, 190);
    ctx.fillStyle = '#0A0819';
  }

  // Fairy lights: two catenary strings across the yard.
  for (let row = 0; row < 3; row++) {
    const y = ((row * 300 + s.progress_px * 0.5) % (h + 300)) - 60;
    ctx.strokeStyle = 'rgba(185,180,214,0.18)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= W; x += 8) {
      const sag = Math.sin((x / W) * Math.PI) * 22;
      if (x === 0) ctx.moveTo(x, y + sag);
      else ctx.lineTo(x, y + sag);
    }
    ctx.stroke();
    for (let x = 12; x < W; x += 26) {
      const sag = Math.sin((x / W) * Math.PI) * 22;
      // Alternate bulbs pulse in antiphase, on the beat.
      const k = Math.floor(x / 26) % 2;
      const pulse = 0.35 + 0.65 * Math.max(0, 1 - ((beatPhase + k * 0.5) % 1) * 2.6);
      ctx.globalAlpha = pulse;
      ctx.fillStyle = k ? '#FFD27A' : PINK;
      ctx.beginPath();
      ctx.arc(x, y + sag + 4, 2.6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}

function tree(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.arc(x + r * 0.5, y + r * 0.4, r * 0.7, 0, Math.PI * 2);
  ctx.fill();
}

function drawBouncer(ctx: CanvasRenderingContext2D, x: number, y: number, vx: number, ignored: boolean): void {
  ctx.globalAlpha = ignored ? 0.32 : 1;
  // Shoulders first: the silhouette is the whole character.
  ctx.fillStyle = ignored ? '#3A3560' : '#1B1740';
  ctx.beginPath();
  ctx.ellipse(x, y + 6, T.bouncerR, T.bouncerR * 0.78, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = ignored ? '#4A4472' : '#241F52';
  ctx.beginPath();
  ctx.arc(x, y - 6, 10, 0, Math.PI * 2);
  ctx.fill();

  // A hint of a face turned the way he is walking, and the torch.
  ctx.fillStyle = ignored ? 'rgba(243,240,255,0.35)' : CHALK;
  ctx.fillRect(x + (vx > 0 ? 3 : -7), y - 9, 4, 2);
  ctx.fillStyle = 'rgba(255,45,111,0.5)';
  ctx.fillRect(x - 2, y + 14, 4, 4);
  ctx.globalAlpha = 1;
}

function drawQueuer(ctx: CanvasRenderingContext2D, s: SisyphosState, py: number, frame: number): void {
  const blink = s.invuln > 0 && Math.floor(frame / 4) % 2 === 0;
  ctx.globalAlpha = blink ? 0.4 : 1;

  if (s.shadesLeft > 0) {
    ctx.strokeStyle = TEAL;
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = 0.5 + 0.25 * Math.sin(frame * 0.2);
    ctx.beginPath();
    ctx.arc(s.x, py, T.playerR + 8, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = blink ? 0.4 : 1;
  }

  ctx.fillStyle = CHALK;
  ctx.beginPath();
  ctx.ellipse(s.x, py + 4, T.playerR * 0.95, T.playerR * 0.8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = HAZE;
  ctx.beginPath();
  ctx.arc(s.x, py - 6, 8, 0, Math.PI * 2);
  ctx.fill();
  if (s.shadesLeft > 0) {
    ctx.fillStyle = '#0A0819';
    ctx.fillRect(s.x - 7, py - 8, 14, 4);
  }
  ctx.globalAlpha = 1;
}

/** Gate + hand-stamp. Stempel drauf. */
function drawGate(ctx: CanvasRenderingContext2D, y: number, won: boolean, frame: number): void {
  ctx.fillStyle = '#0B0918';
  ctx.fillRect(0, y - 44, W, 44);
  ctx.fillStyle = PINK;
  ctx.fillRect(0, y - 3, W, 3);
  ctx.fillStyle = 'rgba(255,45,111,0.14)';
  ctx.fillRect(0, y, W, 40);

  ctx.fillStyle = CHALK;
  ctx.font = '800 13px ui-sans-serif, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('E I N G A N G', W / 2, y - 18);
  ctx.textAlign = 'left';

  if (won) {
    // The stamp thumps down.
    const k = Math.min(1, (frame % 60) / 12);
    const scale = 2.4 - 1.4 * k;
    ctx.save();
    ctx.translate(W / 2, y + 90);
    ctx.rotate(-0.22);
    ctx.scale(scale, scale);
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = PINK;
    ctx.lineWidth = 2.5;
    ctx.strokeRect(-42, -16, 84, 32);
    ctx.fillStyle = PINK;
    ctx.font = '800 15px ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('DRIN', 0, 6);
    ctx.restore();
    ctx.textAlign = 'left';
    ctx.globalAlpha = 1;
  }
}

/** Static-ish scenery layout is deterministic, so nothing jitters between runs. */
export const yardSeed = hash01;
