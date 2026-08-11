/**
 * Emoji atlas: every glyph drawn once into an offscreen canvas at boot, then
 * blitted. Zero asset pipeline, which is the right trade at this deadline
 * (DESIGN.md §7).
 *
 * Known risk R2: emoji render differently across iOS/Android and some glyphs
 * are ambiguous — or, on a device without an emoji font, are a tofu box. So the
 * atlas *checks*: each glyph is compared against a known-missing codepoint and
 * against blank, and anything that failed to render is drawn from
 * `vectors.ts` instead. A prop that reads badly on his phone is one line away
 * from being hand-drawn: add it to FORCE_VECTOR.
 */

import { drawVector } from './vectors.js';

export type GlyphName =
  | 'bottle'
  | 'roller'
  | 'hund'
  | 'shades'
  | 'broccoli'
  | 'carrot'
  | 'aubergine'
  | 'rock'
  | 'whale'
  | 'receipt'
  | 'stamp';

const GLYPHS: Record<GlyphName, string> = {
  bottle: '🍾',
  roller: '🛴',
  hund: '💩',
  shades: '🕶️',
  broccoli: '🥦',
  carrot: '🥕',
  aubergine: '🍆',
  rock: '🪨',
  whale: '🐋',
  receipt: '🧾',
  stamp: '🎫',
};

/**
 * Glyphs we never take from the font, whatever it claims to have.
 * (Populate from the real-device check in PLAN.md M2.)
 */
const FORCE_VECTOR: GlyphName[] = [];

const NAMES = Object.keys(GLYPHS) as GlyphName[];

/** Rendered at 3× the on-screen size so it stays crisp on a dense display. */
const CELL = 96;
const FONT = `${Math.round(CELL * 0.76)}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;

export type Atlas = {
  canvas: HTMLCanvasElement | null;
  cell: number;
  index: Record<GlyphName, number>;
  /** Glyphs the font could not draw; these fall back to vectors. */
  missing: Set<GlyphName>;
  ready: boolean;
};

let atlas: Atlas = {
  canvas: null,
  cell: CELL,
  index: {} as Record<GlyphName, number>,
  missing: new Set(NAMES),
  ready: false,
};

/** A checksum of a cell's pixels; two identical glyphs hash the same. */
function cellHash(data: Uint8ClampedArray): number {
  let h = 0x811c9dc5;
  for (let i = 3; i < data.length; i += 4) {
    // Alpha only: colour differs between emoji fonts, presence does not.
    h ^= data[i];
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export function buildAtlas(): Atlas {
  if (atlas.ready) return atlas;
  const index = {} as Record<GlyphName, number>;
  NAMES.forEach((n, i) => (index[n] = i));

  if (typeof document === 'undefined') {
    atlas = { canvas: null, cell: CELL, index, missing: new Set(NAMES), ready: true };
    return atlas;
  }

  const canvas = document.createElement('canvas');
  canvas.width = CELL * NAMES.length;
  canvas.height = CELL;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const missing = new Set<GlyphName>(FORCE_VECTOR);

  if (!ctx) {
    atlas = { canvas: null, cell: CELL, index, missing: new Set(NAMES), ready: true };
    return atlas;
  }

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = FONT;
  NAMES.forEach((n, i) => {
    ctx.fillText(GLYPHS[n], i * CELL + CELL / 2, CELL / 2 + CELL * 0.03);
  });

  // Reference: an unassigned codepoint. Whatever the font draws for *that* is
  // what "missing" looks like on this device.
  const probe = document.createElement('canvas');
  probe.width = CELL;
  probe.height = CELL;
  const pctx = probe.getContext('2d', { willReadFrequently: true });
  let tofu = -1;
  if (pctx) {
    pctx.textAlign = 'center';
    pctx.textBaseline = 'middle';
    pctx.font = FONT;
    pctx.fillText('\u{10FFFD}', CELL / 2, CELL / 2 + CELL * 0.03);
    tofu = cellHash(pctx.getImageData(0, 0, CELL, CELL).data);
  }

  NAMES.forEach((n, i) => {
    const data = ctx.getImageData(i * CELL, 0, CELL, CELL).data;
    let ink = 0;
    for (let p = 3; p < data.length; p += 4) if (data[p] > 8) ink++;
    const h = cellHash(data);
    // Blank, or identical to the missing-glyph box: draw it ourselves.
    if (ink < CELL * 2 || h === tofu) missing.add(n);
  });

  atlas = { canvas, cell: CELL, index, missing, ready: true };
  return atlas;
}

/** Draw a glyph centred on (x, y) at `size` logical px. */
export function drawGlyph(
  ctx: CanvasRenderingContext2D,
  name: GlyphName,
  x: number,
  y: number,
  size: number,
  rotation = 0,
): void {
  const a = atlas.ready ? atlas : buildAtlas();
  if (!a.canvas || a.missing.has(name)) {
    drawVector(ctx, name, x, y, size, rotation);
    return;
  }
  const i = a.index[name];
  const half = size / 2;
  if (rotation === 0) {
    ctx.drawImage(a.canvas, i * a.cell, 0, a.cell, a.cell, x - half, y - half, size, size);
    return;
  }
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  ctx.drawImage(a.canvas, i * a.cell, 0, a.cell, a.cell, -half, -half, size, size);
  ctx.restore();
}

/** Exposed for the dev harness: the real-device glyph check from PLAN.md M2. */
export function glyphReport(): Array<{ name: GlyphName; source: 'emoji' | 'vector' }> {
  const a = atlas.ready ? atlas : buildAtlas();
  return NAMES.map((name) => ({ name, source: a.missing.has(name) ? 'vector' : 'emoji' }));
}
