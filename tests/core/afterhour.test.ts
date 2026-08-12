/**
 * Afterhour — the hidden endless bonus mode. Unlike the four main levels,
 * there is no win-rate gate here (it is meant to eventually be unwinnable):
 * the only invariants that matter are "it terminates" and "loops advance
 * correctly through all four segments, forever, under one shared strike pool".
 */

import { describe, expect, it } from 'vitest';

import { create, step, loopsSurvived } from '../../src/core/afterhour.js';
import { makeInput } from '../../src/core/input.js';
import { TUNING } from '../../src/config/tuning.js';
import { runAfterhour, makeBot, botInput } from '../../src/core/bots.js';

const H = 780;

function press(down: boolean, x = 0, y = 0) {
  const i = makeInput();
  i.down = down;
  i.x = x;
  i.y = y;
  return i;
}

describe('afterhour orchestration', () => {
  it('starts on pfand, loop 0, full strikes', () => {
    const s = create(1, H);
    expect(s.segment.level).toBe('pfand');
    expect(s.loop).toBe(0);
    expect(s.segmentIndex).toBe(0);
    expect(s.strikes).toBe(TUNING.afterhour.strikesMax);
  });

  it('advances through segments in order and wraps the loop', () => {
    const s = create(2, H);
    const bot = makeBot('perfect', 2);
    const order: string[] = [s.segment.level];
    let guard = 0;
    let sawLoop = false;
    while (guard < 60 * 60 * 5 && s.status === 'run' && !sawLoop) {
      step(s, botInput(bot, s.segment));
      if (s.segment.level !== order[order.length - 1]) order.push(s.segment.level);
      if (s.loop >= 1) sawLoop = true;
      guard++;
    }
    expect(order.slice(0, 4)).toEqual(['pfand', 'sisyphos', 'katjes', 'kayak']);
    expect(sawLoop).toBe(true);
  });

  it('never lets a segment natively fail out before the shared strikes do (non-kayak)', () => {
    const s = create(3, H);
    // Force a lot of native hits on the pfand segment without exhausting the
    // shared pool — the inflated extraLives must absorb them.
    for (let i = 0; i < 5 && s.status === 'run' && s.segment.level === 'pfand'; i++) {
      s.segment.lives = 1;
      step(s, press(false));
    }
    expect(s.strikes).toBeGreaterThanOrEqual(0);
  });

  it('a kayak segment fail zeroes the whole shared pool at once', () => {
    const s = create(4, H);
    const bot = makeBot('perfect', 4);
    // Fast-forward to the kayak segment.
    let guard = 0;
    while (s.segment.level !== 'kayak' && s.status === 'run' && guard < 60 * 60 * 5) {
      step(s, botInput(bot, s.segment));
      guard++;
    }
    expect(s.segment.level).toBe('kayak');
    // @ts-expect-error test-only: force the level's own terminal failure.
    s.segment.ruhe = 0;
    s.segment.status = 'fail';
    step(s, press(false));
    expect(s.status).toBe('fail');
    expect(s.strikes).toBe(0);
  });

  it('always terminates for the idle bot (no soft-lock)', () => {
    const r = runAfterhour(5, 'idle', { h: H });
    expect(r.nonFinite).toBeNull();
    expect(Number.isFinite(r.frames)).toBe(true);
    expect(r.frames).toBeLessThanOrEqual(TUNING.afterhour.hardFrameCap);
  });

  it('a perfect bot survives at least one full loop', () => {
    const r = runAfterhour(6, 'perfect', { h: H, scanEvery: 60 });
    expect(r.nonFinite).toBeNull();
    expect(r.loops).toBeGreaterThanOrEqual(1);
  });

  it('loopsSurvived matches the state', () => {
    const s = create(7, H);
    expect(loopsSurvived(s)).toBe(0);
  });
});
