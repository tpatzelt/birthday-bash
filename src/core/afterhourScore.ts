/**
 * The Afterhour highscore — deliberately NOT part of `SaveData` (progress.ts).
 *
 * That save is the single most safety-critical piece of state in the game
 * (the reveal-must-never-be-blocked guarantee). This is a separate, isolated
 * blob under its own key, sanitised the same way, so a bug here can never put
 * the real save — or the reveal — at risk.
 */

export const AFTERHOUR_SCORE_VERSION = 1;

export type AfterhourScore = {
  v: typeof AFTERHOUR_SCORE_VERSION;
  /** Best full loops survived, ever. */
  bestLoops: number;
  /** Frames (60/s) of the longest run, ever. */
  bestFrames: number;
};

const MAX_LOOPS = 9_999;
const MAX_FRAMES = 999_999_999;

export function defaultAfterhourScore(): AfterhourScore {
  return { v: AFTERHOUR_SCORE_VERSION, bestLoops: 0, bestFrames: 0 };
}

function intIn(v: unknown, lo: number, hi: number, dflt: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.floor(v))) : dflt;
}

/** Never throws, never propagates junk — same contract as sanitizeSave. */
export function sanitizeAfterhourScore(raw: unknown): AfterhourScore {
  const out = defaultAfterhourScore();
  if (!raw || typeof raw !== 'object') return out;
  const r = raw as Partial<AfterhourScore>;
  if (r.v !== AFTERHOUR_SCORE_VERSION) return out;
  out.bestLoops = intIn(r.bestLoops, 0, MAX_LOOPS, 0);
  out.bestFrames = intIn(r.bestFrames, 0, MAX_FRAMES, 0);
  return out;
}

export function recordAfterhourRun(
  score: AfterhourScore,
  loops: number,
  frames: number,
): { score: AfterhourScore; isNewBest: boolean } {
  const isNewBest = loops > score.bestLoops || (loops === score.bestLoops && frames > score.bestFrames);
  if (isNewBest) {
    score.bestLoops = Math.max(score.bestLoops, loops);
    score.bestFrames = Math.max(score.bestFrames, frames);
  }
  return { score, isNewBest };
}
