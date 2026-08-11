/**
 * Record a bot playthrough as an input tape.
 *
 *   npx tsx scripts/make-tape.ts pfand perfect 0
 *   npx tsx scripts/make-tape.ts --golden      # one winning tape per level
 *
 * A tape recorded by hand in /__dev is dropped into tests/tapes/ the same way;
 * this script exists so the repo has a golden set without needing a phone.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createLevel, stepLevel, frameCap } from '../src/core/game.js';
import { botInput, makeBot, type BotName } from '../src/core/bots.js';
import { encodeFrame, LEVEL_ORDER, type LevelId, type Tape } from '../src/core/input.js';
import { NO_MODS } from '../src/config/tuning.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const TAPE_DIR = resolve(HERE, '../tests/tapes');
const H = 780;

function write(name: string, tape: Tape): void {
  mkdirSync(TAPE_DIR, { recursive: true });
  const file = resolve(TAPE_DIR, `${name}.json`);
  writeFileSync(file, JSON.stringify(tape), 'utf8');
  console.log(`${name}: ${tape.frames.length} frames -> ${file}`);
}

function record(level: LevelId, botName: BotName, seed: number, note?: string): Tape {
  const s = createLevel(level, seed, H, NO_MODS);
  const bot = makeBot(botName, seed);
  const frames: Tape['frames'] = [];
  const cap = frameCap(level);
  while (s.status === 'run' && s.frame < cap) {
    const input = botInput(bot, s);
    frames.push(encodeFrame(input));
    stepLevel(s, input);
  }
  if (s.status !== 'win') throw new Error(`${level}/${botName}/${seed} did not win (${s.status})`);
  const tape: Tape = { v: 1, seed, level, h: H, frames };
  if (note) tape.note = note;
  return tape;
}

const args = process.argv.slice(2);

if (args[0] === '--golden' || args.length === 0) {
  for (const level of LEVEL_ORDER) {
    // The first seed the perfect bot wins on — deterministic, so this is stable.
    let recorded = false;
    for (let seed = 0; seed < 20 && !recorded; seed++) {
      try {
        write(`${level}-win`, record(level, 'perfect', seed, `golden ${level} playthrough`));
        recorded = true;
      } catch {
        /* try the next seed */
      }
    }
    if (!recorded) throw new Error(`no winning tape found for ${level}`);
  }
  // One casual tape too: it exercises hits, near-misses and recovery.
  for (const level of LEVEL_ORDER) {
    for (let seed = 0; seed < 40; seed++) {
      try {
        write(`${level}-casual`, record(level, 'casual', seed, `casual ${level} run`));
        break;
      } catch {
        /* next */
      }
    }
  }
} else {
  const [level, bot = 'perfect', seed = '0'] = args;
  write(`${level}-${bot}-${seed}`, record(level as LevelId, bot as BotName, Number(seed)));
}
