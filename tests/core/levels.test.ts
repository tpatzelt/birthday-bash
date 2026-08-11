/**
 * The cases from TESTING.md §1: easy to get wrong, expensive to discover at the
 * party.
 */

import { describe, expect, it } from 'vitest';

import { createLevel, stepLevel } from '../../src/core/game.js';
import { makeInput } from '../../src/core/input.js';
import { TUNING, DT, W, NO_MODS, canvasHeight } from '../../src/config/tuning.js';
import * as pfand from '../../src/core/levels/pfand.js';
import * as sisyphos from '../../src/core/levels/sisyphos.js';
import * as katjes from '../../src/core/levels/katjes.js';
import * as kayak from '../../src/core/levels/kayak.js';

const H = 780;

function press(down: boolean, x = 0, y = 0) {
  const i = makeInput();
  i.down = down;
  i.x = x;
  i.y = y;
  return i;
}

describe('canvas height', () => {
  it('is clamped to the design range', () => {
    expect(canvasHeight(390, 844)).toBe(844);
    expect(canvasHeight(390, 2000)).toBe(900);
    expect(canvasHeight(390, 400)).toBe(620);
    expect(canvasHeight(0, 0)).toBe(780);
  });
});

describe('L1 pfand — coyote time and jump buffer', () => {
  it('jumps from the ground on a tap', () => {
    const s = pfand.create(1, H, NO_MODS);
    pfand.step(s, press(true));
    expect(s.vy).toBeLessThan(0);
    expect(s.onGround).toBe(false);
  });

  it('does not double-jump while the button is held', () => {
    const s = pfand.create(1, H, NO_MODS);
    pfand.step(s, press(true));
    const vyAfterJump = s.vy;
    for (let i = 0; i < 5; i++) pfand.step(s, press(true));
    // Falling only: no second impulse.
    expect(s.vy).toBeGreaterThan(vyAfterJump);
  });

  it('still jumps within the coyote window after walking off the ground', () => {
    const coyote = Math.round((TUNING.pfand.coyoteMs * 60) / 1000);
    const s = pfand.create(1, H, NO_MODS);
    // Force the player just off the ground without a jump.
    s.py -= 40;
    s.onGround = false;
    s.coyote = coyote;
    for (let i = 0; i < coyote - 1; i++) pfand.step(s, press(false));
    pfand.step(s, press(true));
    expect(s.vy).toBeLessThan(0);
  });

  it('does not jump one frame past the coyote window', () => {
    const s = pfand.create(1, H, NO_MODS);
    s.py -= 40;
    s.onGround = false;
    s.coyote = 1;
    pfand.step(s, press(false)); // consumes the last coyote frame
    const before = s.vy;
    pfand.step(s, press(true));
    expect(s.vy).toBeGreaterThan(before); // gravity only
  });

  it('buffers a tap made just before landing', () => {
    const buffer = Math.round((TUNING.pfand.bufferMs * 60) / 1000);
    const s = pfand.create(1, H, NO_MODS);
    s.items.forEach((i) => (i.active = false));
    pfand.step(s, press(true)); // jump

    // Fly until landing is `buffer - 1` frames away, then tap: the tap happens
    // in mid-air and must survive until the feet touch down.
    for (let i = 0; i < 30 && !(s.py > pfand.groundY(H) - 60 && s.vy > 0); i++) {
      pfand.step(s, press(false));
    }
    expect(s.onGround).toBe(false);
    pfand.step(s, press(true)); // the buffered tap
    let landed = false;
    for (let i = 0; i < buffer; i++) {
      pfand.step(s, press(false));
      if (s.onGround) landed = true;
    }
    expect(landed).toBe(true);
    // It fired: the player is airborne again, moving up.
    expect(s.vy).toBeLessThan(0);
    expect(s.onGround).toBe(false);
  });

  it('never costs collected bottles on a hit', () => {
    const s = pfand.create(3, H, NO_MODS);
    s.bottles = 7;
    s.cents = 175;
    // Park an obstacle right on the player.
    const it = s.items[0];
    it.active = true;
    it.kind = 'zaun';
    it.x = TUNING.pfand.playerX + 10;
    it.y = pfand.groundY(H) - 27;
    it.w = 30;
    it.h = 54;
    pfand.step(s, press(false));
    expect(s.lives).toBe(TUNING.pfand.lives - 1);
    expect(s.bottles).toBe(7);
    expect(s.cents).toBe(175);
    expect(s.invuln).toBeGreaterThan(0);
  });

  it('formats euros with a comma', () => {
    expect(pfand.euros(0)).toBe('0,00');
    expect(pfand.euros(325)).toBe('3,25');
    expect(pfand.euros(500)).toBe('5,00');
    expect(pfand.euros(105)).toBe('1,05');
  });
});

describe('L2 sisyphos — push-back', () => {
  it('cannot push the player to negative progress', () => {
    const s = sisyphos.create(2, H, NO_MODS);
    s.progress_px = 40;
    const b = s.bouncers.find((x) => !x.active)!;
    b.active = true;
    b.x = s.x;
    b.wy = s.progress_px + 0; // exactly on the player row
    b.vx = 0;
    sisyphos.step(s, press(false));
    expect(s.progress_px).toBeGreaterThanOrEqual(0);
    expect(s.lives).toBe(TUNING.sisyphos.lives - 1);
  });

  it('is ignored by bouncers while wearing the Sonnenbrille', () => {
    const s = sisyphos.create(2, H, NO_MODS);
    s.shadesLeft = 60;
    const b = s.bouncers.find((x) => !x.active)!;
    b.active = true;
    b.x = s.x;
    b.wy = s.progress_px;
    b.vx = 0;
    sisyphos.step(s, press(false));
    expect(s.lives).toBe(TUNING.sisyphos.lives);
  });

  it('wins on reaching the gate', () => {
    const s = sisyphos.create(2, H, NO_MODS);
    s.progress_px = TUNING.sisyphos.goalPx - 1;
    sisyphos.step(s, press(false));
    expect(s.status).toBe('win');
    expect(s.stamped).toBe(true);
  });
});

describe('L3 katjes — vegetables', () => {
  it('does not cost a life when a vegetable lands uncaught', () => {
    const s = katjes.create(4, H, NO_MODS);
    const it = s.items[0];
    it.active = true;
    it.kind = 'veg';
    it.x = 10; // far from the bag
    it.y = H - 30;
    it.vy = 300;
    s.x = W - 40;
    s.targetX = W - 40;
    for (let i = 0; i < 30; i++) katjes.step(s, press(false));
    expect(s.lives).toBe(TUNING.katjes.lives);
  });

  it('costs a life when a vegetable is caught', () => {
    const s = katjes.create(4, H, NO_MODS);
    const it = s.items[0];
    it.active = true;
    it.kind = 'veg';
    it.x = s.x;
    it.y = katjes.playerY(H) - 4;
    it.vy = 200;
    katjes.step(s, press(false));
    expect(s.lives).toBe(TUNING.katjes.lives - 1);
  });

  it('counts the Lakritz bonus as three Heringe', () => {
    const s = katjes.create(4, H, NO_MODS);
    const it = s.items[0];
    it.active = true;
    it.kind = 'bonus';
    it.x = s.x;
    it.y = katjes.playerY(H) - 4;
    it.vy = 200;
    katjes.step(s, press(false));
    expect(s.fish).toBe(TUNING.katjes.bonusValue);
  });
});

describe('L4 kayak — the Ruhe formula', () => {
  it('clamps at both ends', () => {
    const s = kayak.create(5, H, NO_MODS);
    s.ruhe = TUNING.kayak.ruheMax;
    // Sitting still, inside the channel: regen must not exceed the cap.
    for (let i = 0; i < 120; i++) kayak.step(s, press(false));
    expect(s.ruhe).toBeLessThanOrEqual(TUNING.kayak.ruheMax);

    const t = kayak.create(5, H, NO_MODS);
    t.ruhe = 0.01;
    t.x = 0; // far outside the channel
    t.targetX = 0;
    kayak.step(t, press(false));
    expect(t.ruhe).toBeGreaterThanOrEqual(0);
    expect(t.status).toBe('fail');
  });

  it('does not panic at exactly the |vx| = 55 threshold', () => {
    const s = kayak.create(5, H, NO_MODS);
    const k = 1 - Math.exp(-TUNING.kayak.lerpRate * DT);
    // Choose a target that produces |vx| exactly at the threshold.
    const dx = (TUNING.kayak.panicThreshold * DT) / k;
    s.ruhe = 50;
    s.x = kayak.channelCentre(0);
    s.targetX = s.x;
    kayak.step(s, press(true, s.x + dx, 0));
    expect(Math.abs(s.vx)).toBeCloseTo(TUNING.kayak.panicThreshold, 6);
    // At exactly the threshold panic is zero, so Ruhe must not have dropped
    // from panic (it may have regained, since |vx| > calmThreshold means no
    // regen either — so it should be unchanged).
    expect(s.ruhe).toBe(50);
  });

  it('drains outside the channel and regains when calm inside it', () => {
    const s = kayak.create(5, H, NO_MODS);
    s.ruhe = 50;
    s.x = kayak.channelCentre(0) + kayak.channelHalfWidth(0) + 40;
    s.targetX = s.x;
    kayak.step(s, press(false));
    expect(s.inside).toBe(false);
    expect(s.ruhe).toBeLessThan(50);

    const t = kayak.create(5, H, NO_MODS);
    t.ruhe = 50;
    t.x = kayak.channelCentre(0);
    t.targetX = t.x;
    kayak.step(t, press(false));
    expect(t.inside).toBe(true);
    expect(t.ruhe).toBeGreaterThan(50);
  });

  it('drifts slower outside the channel than inside it', () => {
    const inside = kayak.create(5, H, NO_MODS);
    kayak.step(inside, press(false));
    const outside = kayak.create(5, H, NO_MODS);
    outside.x = 5;
    outside.targetX = 5;
    kayak.step(outside, press(false));
    expect(outside.travel).toBeLessThan(inside.travel);
  });
});

describe('all levels', () => {
  it('emit nothing before the first step and clear events between frames', () => {
    for (const level of ['pfand', 'sisyphos', 'katjes', 'kayak'] as const) {
      const s = createLevel(level, 1, H);
      expect(s.eventCount).toBe(0);
      stepLevel(s, press(false));
      stepLevel(s, press(false));
      expect(s.eventCount).toBeLessThanOrEqual(s.events.length);
    }
  });

  it('ignore input once the level is over', () => {
    const s = createLevel('katjes', 1, H) as katjes.KatjesState;
    s.status = 'win';
    const frame = s.frame;
    stepLevel(s, press(true, 100, 100));
    expect(s.frame).toBe(frame);
  });
});
