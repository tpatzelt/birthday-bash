/**
 * One frame of input, and the tape format that makes a bug reproducible.
 *
 * The whole game reads exactly this: a pointer that is down or not, at a
 * position in logical canvas coordinates. Nothing else — no key codes, no
 * gestures, no multi-touch (DESIGN.md §2).
 */

export type InputFrame = {
  down: boolean;
  x: number;
  y: number;
};

export const EMPTY_INPUT: InputFrame = { down: false, x: 0, y: 0 };

export function makeInput(): InputFrame {
  return { down: false, x: 0, y: 0 };
}

export function copyInput(dst: InputFrame, src: InputFrame): InputFrame {
  dst.down = src.down;
  dst.x = src.x;
  dst.y = src.y;
  return dst;
}

export type LevelId = 'pfand' | 'sisyphos' | 'katjes' | 'kayak';

export const LEVEL_ORDER: LevelId[] = ['pfand', 'sisyphos', 'katjes', 'kayak'];

/**
 * A recorded session. `h` is part of the tape because the logical canvas height
 * is derived from the device aspect ratio — a tape recorded on a tall phone
 * only replays identically at that height.
 *
 * Frames are stored as [down, x, y] tuples: a 90-second tape is 5400 frames and
 * the object form triples the file size for no gain.
 */
export type Tape = {
  v: 1;
  seed: number;
  level: LevelId;
  h: number;
  /** Optional difficulty mods in force when recorded (mercy auto-ease). */
  mods?: { densityMul: number; speedMul: number; extraLives: number };
  frames: Array<[0 | 1, number, number]>;
  /** Free-text note: what felt wrong when this was recorded. */
  note?: string;
};

export function encodeFrame(f: InputFrame): [0 | 1, number, number] {
  // Round to 0.1 px: sub-pixel pointer noise is not information, and it makes
  // the JSON three times larger.
  return [f.down ? 1 : 0, Math.round(f.x * 10) / 10, Math.round(f.y * 10) / 10];
}

export function decodeFrame(t: [0 | 1, number, number], into: InputFrame): InputFrame {
  into.down = t[0] === 1;
  into.x = t[1];
  into.y = t[2];
  return into;
}

export class TapeRecorder {
  readonly frames: Array<[0 | 1, number, number]> = [];
  constructor(
    readonly seed: number,
    readonly level: LevelId,
    readonly h: number,
  ) {}

  push(f: InputFrame): void {
    this.frames.push(encodeFrame(f));
  }

  toTape(note?: string): Tape {
    const t: Tape = { v: 1, seed: this.seed, level: this.level, h: this.h, frames: this.frames };
    if (note) t.note = note;
    return t;
  }
}

export function isTape(x: unknown): x is Tape {
  if (!x || typeof x !== 'object') return false;
  const t = x as Partial<Tape>;
  return t.v === 1 && typeof t.seed === 'number' && typeof t.h === 'number' && Array.isArray(t.frames);
}
