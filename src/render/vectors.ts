/**
 * Hand-drawn fallbacks for every prop in the emoji atlas.
 *
 * DESIGN.md §7 plans for "hand-draw the 3–4 glyphs that read badly". This is
 * that mitigation, generalised: the atlas detects at boot whether a glyph
 * actually rendered, and anything missing or ambiguous is drawn from here
 * instead. On a phone with a full emoji font nothing changes; on one without —
 * or in a headless browser with no emoji font at all — the game still reads.
 *
 * Everything is drawn into a 1×1 box centred on the origin and scaled by the
 * caller, so a fallback drops in wherever `drawGlyph` is called.
 */

import { AMBER, CHALK, HAZE, PINK, TEAL, VEG_GREEN, VEG_ORANGE, VEG_PURPLE } from './palette.js';
import type { GlyphName } from './atlas.js';

type Draw = (ctx: CanvasRenderingContext2D) => void;

const bottle: Draw = (ctx) => {
  ctx.fillStyle = AMBER;
  ctx.beginPath();
  ctx.moveTo(-0.16, 0.5);
  ctx.lineTo(0.16, 0.5);
  ctx.lineTo(0.16, -0.02);
  ctx.lineTo(0.07, -0.2);
  ctx.lineTo(0.07, -0.46);
  ctx.lineTo(-0.07, -0.46);
  ctx.lineTo(-0.07, -0.2);
  ctx.lineTo(-0.16, -0.02);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.fillRect(-0.1, 0.02, 0.05, 0.36);
  ctx.fillStyle = PINK;
  ctx.fillRect(-0.09, -0.5, 0.18, 0.07);
};

const roller: Draw = (ctx) => {
  ctx.strokeStyle = CHALK;
  ctx.lineWidth = 0.07;
  ctx.lineCap = 'round';
  // Deck, stem and handlebar of an e-scooter, side on.
  ctx.beginPath();
  ctx.moveTo(-0.4, 0.34);
  ctx.lineTo(0.28, 0.34);
  ctx.moveTo(0.28, 0.34);
  ctx.lineTo(0.36, -0.34);
  ctx.moveTo(0.18, -0.36);
  ctx.lineTo(0.46, -0.32);
  ctx.stroke();
  ctx.fillStyle = TEAL;
  ctx.fillRect(-0.34, 0.24, 0.5, 0.1);
  ctx.fillStyle = '#241F4A';
  for (const wx of [-0.34, 0.32]) {
    ctx.beginPath();
    ctx.arc(wx, 0.42, 0.12, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.lineCap = 'butt';
};

const hund: Draw = (ctx) => {
  ctx.fillStyle = '#6B4A2F';
  ctx.beginPath();
  ctx.ellipse(0, 0.3, 0.46, 0.18, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(0.02, 0.06, 0.3, 0.16, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(-0.02, -0.16, 0.17, 0.12, 0, 0, Math.PI * 2);
  ctx.fill();
};

const shades: Draw = (ctx) => {
  ctx.fillStyle = '#0A0819';
  ctx.strokeStyle = TEAL;
  ctx.lineWidth = 0.05;
  for (const lx of [-0.24, 0.24]) {
    ctx.beginPath();
    ctx.ellipse(lx, 0, 0.2, 0.16, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(-0.06, -0.02);
  ctx.lineTo(0.06, -0.02);
  ctx.moveTo(-0.44, -0.06);
  ctx.lineTo(-0.5, -0.14);
  ctx.moveTo(0.44, -0.06);
  ctx.lineTo(0.5, -0.14);
  ctx.stroke();
};

const broccoli: Draw = (ctx) => {
  ctx.fillStyle = '#2F7A45';
  ctx.fillRect(-0.08, 0.02, 0.16, 0.42);
  ctx.fillStyle = VEG_GREEN;
  for (const [cx, cy, r] of [
    [0, -0.2, 0.26],
    [-0.26, -0.06, 0.2],
    [0.26, -0.06, 0.2],
    [-0.12, -0.34, 0.16],
    [0.14, -0.32, 0.16],
  ] as const) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }
};

const carrot: Draw = (ctx) => {
  ctx.fillStyle = VEG_ORANGE;
  ctx.beginPath();
  ctx.moveTo(-0.22, -0.18);
  ctx.lineTo(0.22, -0.18);
  ctx.lineTo(0.02, 0.5);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  for (let i = 0; i < 3; i++) ctx.fillRect(-0.16 + i * 0.02, -0.06 + i * 0.14, 0.28 - i * 0.08, 0.03);
  ctx.fillStyle = VEG_GREEN;
  for (const a of [-0.5, 0, 0.5]) {
    ctx.save();
    ctx.rotate(a);
    ctx.fillRect(-0.05, -0.5, 0.1, 0.34);
    ctx.restore();
  }
};

const aubergine: Draw = (ctx) => {
  ctx.fillStyle = VEG_PURPLE;
  ctx.beginPath();
  ctx.ellipse(0, 0.12, 0.28, 0.36, 0.18, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.beginPath();
  ctx.ellipse(-0.1, 0.06, 0.06, 0.14, 0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#2F7A45';
  ctx.beginPath();
  ctx.moveTo(-0.16, -0.26);
  ctx.lineTo(0.2, -0.34);
  ctx.lineTo(0.12, -0.1);
  ctx.closePath();
  ctx.fill();
  ctx.fillRect(0.1, -0.5, 0.06, 0.2);
};

const rock: Draw = (ctx) => {
  ctx.fillStyle = '#3C4A52';
  ctx.beginPath();
  ctx.moveTo(-0.46, 0.28);
  ctx.lineTo(-0.3, -0.22);
  ctx.lineTo(0.06, -0.44);
  ctx.lineTo(0.4, -0.14);
  ctx.lineTo(0.44, 0.24);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#55666F';
  ctx.beginPath();
  ctx.moveTo(-0.3, -0.22);
  ctx.lineTo(0.06, -0.44);
  ctx.lineTo(0.1, -0.06);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.14)';
  ctx.fillRect(-0.24, 0.02, 0.2, 0.04);
};

const whale: Draw = (ctx) => {
  ctx.fillStyle = '#1F4E6B';
  ctx.beginPath();
  ctx.moveTo(-0.5, 0.06);
  ctx.quadraticCurveTo(-0.2, -0.36, 0.22, -0.2);
  ctx.quadraticCurveTo(0.44, -0.12, 0.5, 0.04);
  ctx.quadraticCurveTo(0.2, 0.3, -0.2, 0.24);
  ctx.closePath();
  ctx.fill();
  // Tail fluke
  ctx.beginPath();
  ctx.moveTo(-0.44, 0.06);
  ctx.lineTo(-0.62, -0.14);
  ctx.lineTo(-0.6, 0.2);
  ctx.closePath();
  ctx.fill();
  // Belly + eye + spout
  ctx.fillStyle = '#9FC7D8';
  ctx.beginPath();
  ctx.moveTo(-0.2, 0.24);
  ctx.quadraticCurveTo(0.16, 0.28, 0.48, 0.04);
  ctx.quadraticCurveTo(0.1, 0.12, -0.2, 0.1);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#07060F';
  ctx.beginPath();
  ctx.arc(0.3, -0.06, 0.03, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(243,240,255,0.7)';
  ctx.lineWidth = 0.035;
  ctx.beginPath();
  ctx.moveTo(0.02, -0.26);
  ctx.lineTo(-0.02, -0.48);
  ctx.moveTo(0.06, -0.26);
  ctx.lineTo(0.14, -0.46);
  ctx.stroke();
};

const receipt: Draw = (ctx) => {
  ctx.fillStyle = CHALK;
  ctx.beginPath();
  ctx.moveTo(-0.3, -0.46);
  ctx.lineTo(0.3, -0.46);
  ctx.lineTo(0.3, 0.4);
  for (let i = 0; i < 6; i++) {
    ctx.lineTo(0.3 - (i + 0.5) * 0.1, 0.46);
    ctx.lineTo(0.3 - (i + 1) * 0.1, 0.4);
  }
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#12102A';
  for (let i = 0; i < 4; i++) ctx.fillRect(-0.2, -0.32 + i * 0.14, 0.4 - (i % 2) * 0.14, 0.045);
};

const stamp: Draw = (ctx) => {
  ctx.strokeStyle = PINK;
  ctx.lineWidth = 0.06;
  ctx.strokeRect(-0.42, -0.22, 0.84, 0.44);
  ctx.fillStyle = PINK;
  ctx.fillRect(-0.3, -0.06, 0.6, 0.05);
  ctx.fillStyle = HAZE;
  ctx.fillRect(-0.3, 0.06, 0.36, 0.04);
};

export const VECTORS: Record<GlyphName, Draw> = {
  bottle,
  roller,
  hund,
  shades,
  broccoli,
  carrot,
  aubergine,
  rock,
  whale,
  receipt,
  stamp,
};

export function drawVector(
  ctx: CanvasRenderingContext2D,
  name: GlyphName,
  x: number,
  y: number,
  size: number,
  rotation = 0,
): void {
  const draw = VECTORS[name];
  if (!draw) return;
  ctx.save();
  ctx.translate(x, y);
  if (rotation) ctx.rotate(rotation);
  ctx.scale(size, size);
  draw(ctx);
  ctx.restore();
}
