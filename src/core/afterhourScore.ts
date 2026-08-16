/**
 * The Afterhour highscore board — deliberately NOT part of `SaveData`
 * (progress.ts).
 *
 * That save is the single most safety-critical piece of state in the game
 * (the reveal-must-never-be-blocked guarantee). This is a separate, isolated
 * blob under its own key, sanitised the same way, so a bug here can never put
 * the real save — or the reveal — at risk.
 *
 * The board is local to the device: there is no backend and there will not be
 * one. It is a phone getting passed around a table, not a leaderboard.
 *
 * Wall-clock times are *passed in* by the shell (`at`), never read here —
 * core stays clock-free.
 */

export const AFTERHOUR_SCORE_VERSION = 2;

/** Rows kept. One card on a phone screen, no scrolling. */
export const BOARD_SIZE = 8;

/** Arcade initials: three glyphs, no more. */
export const NAME_MAX = 3;

/** Stands in for a run whose player never typed anything. */
export const ANON_NAME = '???';

export type AfterhourEntry = {
  name: string;
  /** Full loops survived — the headline number. */
  loops: number;
  /** Frames (60/s) the run lasted. */
  frames: number;
  /** Wall-clock ms from the shell; only ever used to break ties, oldest first. */
  at: number;
};

export type AfterhourScore = {
  v: typeof AFTERHOUR_SCORE_VERSION;
  /** Best first, never longer than BOARD_SIZE. */
  entries: AfterhourEntry[];
  /** Pre-fills the next initials prompt. */
  lastName: string;
};

/** The pre-board v1 blob: a single best run, no names. */
type LegacyScoreV1 = { v: 1; bestLoops?: unknown; bestFrames?: unknown };

const MAX_LOOPS = 9_999;
const MAX_FRAMES = 999_999_999;
const MAX_AT = 4_102_444_800_000; // 2100-01-01, well past anything real

export function defaultAfterhourScore(): AfterhourScore {
  return { v: AFTERHOUR_SCORE_VERSION, entries: [], lastName: ANON_NAME };
}

function intIn(v: unknown, lo: number, hi: number, dflt: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.floor(v))) : dflt;
}

/**
 * Uppercase, three glyphs, letters and digits only. Anything else — emoji,
 * markup, a novel pasted into the field — is dropped rather than rejected, so
 * the prompt can never block a run from being recorded.
 */
export function sanitizeName(raw: unknown): string {
  if (typeof raw !== 'string') return ANON_NAME;
  const cleaned = raw.toUpperCase().replace(/[^A-ZÄÖÜ0-9]/g, '').slice(0, NAME_MAX);
  return cleaned || ANON_NAME;
}

/** Better run first: more loops, then longer, then whoever set it earlier. */
export function compareEntries(a: AfterhourEntry, b: AfterhourEntry): number {
  if (a.loops !== b.loops) return b.loops - a.loops;
  if (a.frames !== b.frames) return b.frames - a.frames;
  return a.at - b.at;
}

function sanitizeEntry(raw: unknown): AfterhourEntry | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<AfterhourEntry>;
  return {
    name: sanitizeName(r.name),
    loops: intIn(r.loops, 0, MAX_LOOPS, 0),
    frames: intIn(r.frames, 0, MAX_FRAMES, 0),
    at: intIn(r.at, 0, MAX_AT, 0),
  };
}

/** A v1 blob's single best run becomes the board's first, nameless row. */
function migrateV1(raw: LegacyScoreV1): AfterhourScore {
  const out = defaultAfterhourScore();
  const loops = intIn(raw.bestLoops, 0, MAX_LOOPS, 0);
  const frames = intIn(raw.bestFrames, 0, MAX_FRAMES, 0);
  if (loops > 0 || frames > 0) out.entries.push({ name: ANON_NAME, loops, frames, at: 0 });
  return out;
}

/** Never throws, never propagates junk — same contract as sanitizeSave. */
export function sanitizeAfterhourScore(raw: unknown): AfterhourScore {
  const out = defaultAfterhourScore();
  if (!raw || typeof raw !== 'object') return out;
  const r = raw as { v?: unknown; entries?: unknown; lastName?: unknown };
  if (r.v === 1) return migrateV1(raw as LegacyScoreV1);
  if (r.v !== AFTERHOUR_SCORE_VERSION) return out;
  const rows = Array.isArray(r.entries) ? r.entries : [];
  out.entries = rows
    .map(sanitizeEntry)
    .filter((e): e is AfterhourEntry => e !== null)
    .sort(compareEntries)
    .slice(0, BOARD_SIZE);
  out.lastName = sanitizeName(r.lastName);
  return out;
}

export type AfterhourRun = {
  name: string;
  loops: number;
  frames: number;
  at: number;
};

export type RecordResult = {
  score: AfterhourScore;
  /** 0-based row the run landed on, or null if it missed the board entirely. */
  rank: number | null;
  isNewBest: boolean;
};

/**
 * Files a finished run. The caller records *first* and asks for initials
 * afterwards (see renameEntry) so walking away from the prompt can never lose
 * a run.
 */
export function recordAfterhourRun(score: AfterhourScore, run: AfterhourRun): RecordResult {
  const entry: AfterhourEntry = {
    name: sanitizeName(run.name),
    loops: intIn(run.loops, 0, MAX_LOOPS, 0),
    frames: intIn(run.frames, 0, MAX_FRAMES, 0),
    at: intIn(run.at, 0, MAX_AT, 0),
  };
  score.entries.push(entry);
  score.entries.sort(compareEntries);
  const rank = score.entries.indexOf(entry);
  if (score.entries.length > BOARD_SIZE) score.entries.length = BOARD_SIZE;
  const made = rank < BOARD_SIZE;
  return { score, rank: made ? rank : null, isNewBest: made && rank === 0 };
}

/** Puts the player's initials on a run already on the board. */
export function renameEntry(score: AfterhourScore, rank: number, name: string): AfterhourScore {
  const entry = score.entries[rank];
  if (!entry) return score;
  entry.name = sanitizeName(name);
  if (entry.name !== ANON_NAME) score.lastName = entry.name;
  return score;
}

export function bestEntry(score: AfterhourScore): AfterhourEntry | null {
  return score.entries[0] ?? null;
}
