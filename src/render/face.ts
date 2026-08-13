/**
 * Jonas's face, blitted onto every character he is supposed to be.
 *
 * Same contract as `atlas.ts`: the renderer asks for it, and if it is not
 * available — no DOM, decode still in flight, decode failed — the caller draws
 * its own vector head instead. `drawFace` says which happened, so no scene is
 * ever left with a headless body.
 *
 * The sprite is decoded once into an `Image` from a bundled data URI, so this
 * is a decode, not a fetch.
 */

import { HEAD_H, HEAD_W, JONAS_HEAD_PNG } from './faceAsset.js';

/** Sprite aspect: the drawn height for a given face width. */
const ASPECT = HEAD_H / HEAD_W;

let image: HTMLImageElement | null = null;
let ready = false;
let failed = false;

/**
 * Start decoding. Safe to call more than once; a no-op without a DOM, which is
 * what the headless bot and tape tests run in.
 */
export function loadFace(): void {
  if (image || failed || typeof document === 'undefined') return;
  const img = new Image();
  img.onload = () => {
    ready = true;
  };
  img.onerror = () => {
    failed = true;
  };
  img.src = JONAS_HEAD_PNG;
  image = img;
}

export function faceReady(): boolean {
  if (!image && !failed) loadFace();
  return ready;
}

/**
 * Draw the face centred on (x, y) in the current transform, `width` wide.
 *
 * Returns false if the sprite is not up yet — the caller must then draw its
 * own head. Rotation is applied about the centre, so a leaning kayak or a
 * wobbling Tüte carries the head with it.
 */
export function drawFace(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  rotation = 0,
): boolean {
  if (!faceReady() || !image) return false;
  const h = width * ASPECT;
  if (rotation === 0) {
    ctx.drawImage(image, x - width / 2, y - h / 2, width, h);
    return true;
  }
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  ctx.drawImage(image, -width / 2, -h / 2, width, h);
  ctx.restore();
  return true;
}

/** Height the sprite occupies for a given face width — for laying out a hat. */
export function faceHeight(width: number): number {
  return width * ASPECT;
}
