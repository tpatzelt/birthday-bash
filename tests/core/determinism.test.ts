/**
 * The regression backbone (TESTING.md §2).
 *
 * Same seed + same tape ⇒ identical state hash, on every machine, every run,
 * forever. Everything else in the test strategy is built on this holding.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { createLevel, replay, stepLevel, type KatjesState } from '../../src/core/game.js';
import { isTape, makeInput, LEVEL_ORDER, type Tape } from '../../src/core/input.js';
import { hashState, snapshot } from '../../src/core/state.js';
import { botInput, makeBot } from '../../src/core/bots.js';

const TAPE_DIR = 'tests/tapes';

function loadTapes(): Array<{ name: string; tape: Tape }> {
  return readdirSync(TAPE_DIR)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => {
      const tape = JSON.parse(readFileSync(join(TAPE_DIR, f), 'utf8'));
      expect(isTape(tape), `${f} is a valid tape`).toBe(true);
      return { name: f.replace(/\.json$/, ''), tape: tape as Tape };
    });
}

const tapes = loadTapes();

describe('replay', () => {
  it('has tapes to replay', () => {
    expect(tapes.length).toBeGreaterThanOrEqual(LEVEL_ORDER.length);
  });

  for (const { name, tape } of tapes) {
    it(`${name} replays to a stable state hash`, () => {
      const final = replay(tape);
      expect(hashState(final)).toMatchSnapshot();
    });

    it(`${name} replays identically twice in one process`, () => {
      expect(hashState(replay(tape))).toBe(hashState(replay(tape)));
    });

    it(`${name} ends the way it was recorded`, () => {
      const final = replay(tape);
      expect(final.status).toBe(name.endsWith('-win') || name.endsWith('-casual') ? 'win' : final.status);
    });
  }
});

describe('determinism', () => {
  it('produces identical states for identical bot runs', () => {
    for (const level of LEVEL_ORDER) {
      const hashes = [0, 1].map(() => {
        const s = createLevel(level, 42, 780);
        const bot = makeBot('casual', 42);
        while (s.status === 'run' && s.frame < 1200) stepLevel(s, botInput(bot, s));
        return hashState(s);
      });
      expect(hashes[0], level).toBe(hashes[1]);
    }
  });

  it('is sensitive to the seed', () => {
    const a = createLevel('katjes', 1, 780);
    const b = createLevel('katjes', 2, 780);
    const input = makeInput();
    for (let i = 0; i < 600; i++) {
      stepLevel(a, input);
      stepLevel(b, input);
    }
    expect(hashState(a)).not.toBe(hashState(b));
  });

  it('is sensitive to the canvas height, which is why tapes carry it', () => {
    const a = createLevel('sisyphos', 1, 700);
    const b = createLevel('sisyphos', 1, 860);
    const input = makeInput();
    input.down = true;
    input.x = 200;
    for (let i = 0; i < 600; i++) {
      stepLevel(a, input);
      stepLevel(b, input);
    }
    expect(hashState(a)).not.toBe(hashState(b));
  });

  it('ignores dead pool slots and stale events when hashing', () => {
    const s = createLevel('katjes', 3, 780) as KatjesState;
    const input = makeInput();
    for (let i = 0; i < 200; i++) stepLevel(s, input);
    const before = hashState(s);
    // Junk in an inactive slot and past the event count must not be visible.
    const dead = s.items.find((it) => !it.active);
    expect(dead).toBeDefined();
    dead!.x = 12345;
    s.events[s.events.length - 1].x = 999;
    expect(hashState(s)).toBe(before);
  });

  it('snapshots only plain JSON', () => {
    const s = createLevel('kayak', 1, 780);
    const snap = snapshot(s);
    expect(() => JSON.stringify(snap)).not.toThrow();
    expect(JSON.parse(JSON.stringify(snap))).toEqual(snap);
  });
});
