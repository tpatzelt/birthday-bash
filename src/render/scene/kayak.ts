/**
 * L4 — Kayak VR: Mirage. Bleib ruhig. Lass dich treiben.
 *
 * The calmest screen in the game, sitting immediately before the reveal. The
 * channel is drawn honestly — you can always see where the water wants you.
 */

import { W } from '../../config/tuning.js';
import {
  channelCentre,
  channelHalfWidth,
  playerY,
  screenYOf,
  worldYOf,
  type KayakState,
} from '../../core/levels/kayak.js';
import { forEachEvent } from '../../core/state.js';
import { drawGlyph } from '../atlas.js';
import { CHALK, HAZE, PINK, TEAL } from '../palette.js';
import { verticalGradient, vignette } from './shared.js';

// --- renderer-local ambient-cameo pool --------------------------------------
type Cameo = { active: boolean; x: number; y: number; kind: number; life: number };
const CAMEO_POOL = 3;
const cameos: Cameo[] = Array.from({ length: CAMEO_POOL }, () => ({ active: false, x: 0, y: 0, kind: 0, life: 0 }));
let cameoNext = 0;

function spawnCameo(x: number, y: number, kind: number): void {
  const c = cameos[cameoNext];
  cameoNext = (cameoNext + 1) % CAMEO_POOL;
  c.active = true;
  c.x = x;
  c.y = y;
  c.kind = kind;
  c.life = 40;
}

function drawCameos(ctx: CanvasRenderingContext2D): void {
  for (const c of cameos) {
    if (!c.active) continue;
    c.life--;
    if (c.life <= 0) {
      c.active = false;
      continue;
    }
    const t = c.life / 40;
    ctx.globalAlpha = t < 0.6 ? t / 0.6 : 1;
    ctx.strokeStyle = TEAL;
    ctx.fillStyle = TEAL;
    ctx.lineWidth = 2;
    const rise = (1 - t) * 18;
    if (c.kind === 0) {
      // A fish arcing out of the water.
      ctx.beginPath();
      ctx.ellipse(c.x, c.y - rise, 9, 4, -0.4, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // A bird crossing in a shallow V.
      ctx.beginPath();
      ctx.moveTo(c.x - 10, c.y - rise + 4);
      ctx.lineTo(c.x, c.y - rise - 3);
      ctx.lineTo(c.x + 10, c.y - rise + 4);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
}

/** The banks have to read as "not water" at a glance, in a dark room. */
const BANK = '#16333A';

/** Gravel on the banks: enough texture that the edge is unmistakable. */
function bankTexture(ctx: CanvasRenderingContext2D, s: KayakState, h: number): void {
  ctx.fillStyle = 'rgba(9,26,30,0.9)';
  for (let i = 0; i < 60; i++) {
    const y = (i * 61.7 + ((s.travel * 0.6) % 61.7)) % (h + 30);
    const wy = worldYOf(y, s.travel, h);
    const hw = channelHalfWidth(Math.max(0, wy));
    const c = channelCentre(wy);
    const side = i % 2 === 0 ? -1 : 1;
    const x = c + side * (hw + 8 + ((i * 37) % 60));
    if (x < -8 || x > W + 8) continue;
    ctx.fillRect(x, y, 3, 3);
  }
}

export function drawKayak(ctx: CanvasRenderingContext2D, s: KayakState, frame: number): void {
  const h = s.h;
  const py = playerY(h);

  ctx.fillStyle = verticalGradient(ctx, 'kayak-water', 0, h, [
    [0, '#071B22'],
    [0.5, '#06131C'],
    [1, '#040B12'],
  ]);
  ctx.fillRect(0, 0, W, h);

  drawChannel(ctx, s, h);

  // Surface glitter, drifting downstream. Nothing here is on the beat: the
  // level is the breakdown.
  ctx.fillStyle = 'rgba(35,211,196,0.18)';
  for (let i = 0; i < 26; i++) {
    const seedY = (i * 137.5 + s.travel * 0.8) % (h + 40);
    const x = ((i * 91) % W) + Math.sin(frame * 0.02 + i) * 6;
    ctx.fillRect(x, seedY - 20, 9, 1);
  }

  for (let i = 0; i < s.rocks.length; i++) {
    const r = s.rocks[i];
    if (!r.active) continue;
    const sy = screenYOf(r.wy, s.travel, h);
    if (sy < -50 || sy > h + 50) continue;
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = '#0A1A22';
    ctx.beginPath();
    ctx.ellipse(r.x, sy + 8, r.r * 1.1, r.r * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    drawGlyph(ctx, 'rock', r.x, sy, r.r * 2.1, r.phase * 0.2);
  }

  forEachEvent(s, (e) => {
    if (e.type === 'wildlife') spawnCameo(e.x, e.y, e.a);
  });
  drawCameos(ctx);

  drawBoat(ctx, s, py, frame);

  if (s.whale || s.status === 'win') drawWhale(ctx, h, frame);

  vignette(ctx, h, 0.55);
}

/** The channel: banks either side, drawn from the same pure function the sim uses. */
function drawChannel(ctx: CanvasRenderingContext2D, s: KayakState, h: number): void {
  const step = 14;
  ctx.beginPath();
  ctx.moveTo(0, -step);
  // Left bank
  for (let y = -step; y <= h + step; y += step) {
    const wy = worldYOf(y, s.travel, h);
    ctx.lineTo(channelCentre(wy) - channelHalfWidth(Math.max(0, wy)), y);
  }
  ctx.lineTo(0, h + step);
  ctx.closePath();
  ctx.fillStyle = BANK;
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(W, -step);
  for (let y = -step; y <= h + step; y += step) {
    const wy = worldYOf(y, s.travel, h);
    ctx.lineTo(channelCentre(wy) + channelHalfWidth(Math.max(0, wy)), y);
  }
  ctx.lineTo(W, h + step);
  ctx.closePath();
  ctx.fill();

  bankTexture(ctx, s, h);

  // Hairline edges, so "inside" is unambiguous even muted and at low brightness.
  ctx.strokeStyle = 'rgba(35,211,196,0.35)';
  ctx.lineWidth = 1;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    for (let y = -step; y <= h + step; y += step) {
      const wy = worldYOf(y, s.travel, h);
      const x = channelCentre(wy) + side * channelHalfWidth(Math.max(0, wy));
      if (y === -step) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}

function drawBoat(ctx: CanvasRenderingContext2D, s: KayakState, py: number, frame: number): void {
  const lean = Math.max(-0.4, Math.min(0.4, s.vx * 0.004));
  const hit = s.invuln > 0 && Math.floor(frame / 3) % 2 === 0;

  // Wake, longer when moving fast — the visual half of the panic mechanic.
  ctx.strokeStyle = 'rgba(243,240,255,0.16)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(s.x - 6, py + 18);
  ctx.lineTo(s.x - 6 - s.vx * 0.06, py + 44);
  ctx.moveTo(s.x + 6, py + 18);
  ctx.lineTo(s.x + 6 - s.vx * 0.06, py + 44);
  ctx.stroke();

  ctx.save();
  ctx.translate(s.x, py);
  ctx.rotate(lean);
  ctx.globalAlpha = hit ? 0.5 : 1;

  // Hull
  ctx.fillStyle = s.inside ? TEAL : PINK;
  ctx.beginPath();
  ctx.moveTo(0, -26);
  ctx.quadraticCurveTo(13, 0, 0, 26);
  ctx.quadraticCurveTo(-13, 0, 0, -26);
  ctx.fill();
  ctx.fillStyle = '#06131C';
  ctx.beginPath();
  ctx.ellipse(0, 2, 6.5, 10, 0, 0, Math.PI * 2);
  ctx.fill();

  // Paddler + paddle, angled by how hard the thumb is dragging.
  ctx.fillStyle = CHALK;
  ctx.beginPath();
  ctx.arc(0, -2, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = HAZE;
  ctx.lineWidth = 2.5;
  ctx.save();
  ctx.rotate(Math.sin(frame * 0.06) * 0.35 + s.vx * 0.002);
  ctx.beginPath();
  ctx.moveTo(-22, -6);
  ctx.lineTo(22, 6);
  ctx.stroke();
  ctx.restore();

  ctx.globalAlpha = 1;
  ctx.restore();
}

/** At 100 % a whale breaches across the full width, and the screen goes white. */
function drawWhale(ctx: CanvasRenderingContext2D, h: number, frame: number): void {
  const t = Math.min(1, ((frame % 600) - 0) / 90);
  const y = h * 0.42 + (1 - t) * 220;
  ctx.save();
  ctx.globalAlpha = Math.min(1, t * 1.6);
  drawGlyph(ctx, 'whale', W / 2, y, 200, -0.25 + t * 0.3);
  ctx.restore();

  ctx.fillStyle = 'rgba(243,240,255,0.4)';
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    ctx.fillRect(W / 2 + Math.cos(a) * 90 * t, y + Math.sin(a) * 50 * t, 4, 4);
  }
}
