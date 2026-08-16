/**
 * Entry point and wiring.
 *
 * Everything deterministic lives under core/; this file is the messy edge —
 * the rAF loop, the phase machine, audio unlocking, storage, and the small
 * deliberate test seam on `window.__bb`.
 */

import '../style.css';

import { DT, W, canvasHeight } from '../config/tuning.js';
import { createLevel, stepLevel, type AnyLevelState } from '../core/game.js';
import {
  decodeFrame,
  isTape,
  LEVEL_ORDER,
  makeInput,
  type InputFrame,
  type LevelId,
  type Tape,
} from '../core/input.js';
import { advance, makeStepper, resetStepper } from '../core/loop.js';
import {
  currentLevel,
  isUnlocked,
  markRevealed,
  modsFor,
  offersSkip,
  recordClear,
  recordFail,
  recordLevelTime,
  totalTimeFrames,
  updateBestTotal,
  type SaveData,
} from '../core/progress.js';
import { hashState } from '../core/state.js';
import { create as createAfterhour, step as stepAfterhour, loopsSurvived, type AfterhourState } from '../core/afterhour.js';
import {
  ANON_NAME,
  bestEntry,
  recordAfterhourRun,
  renameEntry,
  type AfterhourScore,
} from '../core/afterhourScore.js';

import { buildAtlas } from '../render/atlas.js';
import { loadFace } from '../render/face.js';
import { prefersReducedMotion, resizeCanvas, type Viewport } from '../render/canvas.js';
import { renderIdle, renderLevel, renderAfterhour, type RenderContext } from '../render/index.js';
import { clearParticles, confetti, makeParticles } from '../render/particles.js';

import { makeEngine, setBrightness, setMuted, start as startAudio, resume, suspend } from '../audio/engine.js';
import { beatPhase, makeScheduler, setScene, startScheduler } from '../audio/scheduler.js';
import { playDrop, playEvents, playRiser } from '../audio/sfx.js';

import { attachControls } from './controls.js';
import { makeOverlay } from './overlay.js';
import { loadSave, saveSave } from './storage.js';
import { loadAfterhourScore, saveAfterhourScore } from './afterhourStorage.js';

declare const __DEV_HARNESS__: boolean;
declare const __BUILD_SHA__: string;

type Phase =
  | 'title'
  | 'intro'
  | 'play'
  | 'fail'
  | 'win'
  | 'reveal'
  | 'afterhourIntro'
  | 'afterhour'
  | 'afterhourFail'
  | 'afterhourBoard';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const overlayEl = document.getElementById('overlay') as HTMLElement;
const rotateEl = document.getElementById('rotate') as HTMLElement;
const ctx = canvas.getContext('2d', { alpha: false }) as CanvasRenderingContext2D;

buildAtlas();
loadFace();

const reducedMotion = prefersReducedMotion();
const particles = makeParticles(reducedMotion);
const overlay = makeOverlay(overlayEl);
const stepper = makeStepper();

let save: SaveData = loadSave();
let afterhourScore: AfterhourScore = loadAfterhourScore();
const engine = makeEngine(save.muted);
const scheduler = makeScheduler(engine);

let vp: Viewport = resizeCanvas(canvas, ctx);
let phase: Phase = 'title';
let sim: AnyLevelState | null = null;
let simAH: AfterhourState | null = null;
let renderFrame = 0;
let whiteout = 0;
let frozen = false;
let forcedSeed: number | null = null;
let tape: Tape | null = null;
let tapeIndex = 0;
let postWin = 0;
let timeScale = 1;
let stepListener: ((input: InputFrame, s: AnyLevelState) => void) | null = null;

const tapeInput = makeInput();

const rc: RenderContext = {
  ctx,
  vp,
  particles,
  reducedMotion,
  beatPhase: 0,
  whiteout: 0,
};

const controls = attachControls(canvas, {
  getViewport: () => vp,
  onFirstGesture: () => {
    // iOS requires a user gesture before audio; this is the first one we get.
    startAudio(engine);
    startScheduler(scheduler);
  },
  onPauseChange: (paused) => {
    // Resuming must not fast-forward through the time spent away.
    resetStepper(stepper);
    if (paused) void suspend(engine);
    else void resume(engine);
  },
  onOrientationChange: (landscape) => {
    rotateEl.classList.toggle('on', landscape);
    rotateEl.hidden = !landscape;
    vp = resizeCanvas(canvas, ctx);
    rc.vp = vp;
  },
});

window.addEventListener('resize', () => {
  vp = resizeCanvas(canvas, ctx);
  rc.vp = vp;
});

// ---------------------------------------------------------------------------
// Phases
// ---------------------------------------------------------------------------

function persist(): void {
  saveSave(save);
}

function seedFor(): number {
  if (forcedSeed !== null) return forcedSeed;
  // The shell may use wall-clock entropy; the core may not.
  return (Math.random() * 0x7fffffff) | 0;
}

function goTitle(): void {
  phase = 'title';
  sim = null;
  simAH = null;
  tape = null;
  whiteout = 0;
  clearParticles(particles);
  setScene(scheduler, 'title');
  overlay.showTitle({
    revealed: save.revealed,
    muted: save.muted,
    resumeLevel: currentLevel(save),
    hasProgress: save.unlocked > 1,
    onStart: () => goIntro(currentLevel(save)),
    onToggleMute: () => {
      save.muted = !save.muted;
      setMuted(engine, save.muted);
      persist();
      goTitle();
    },
    onGift: () => goReveal(false),
  });
}

/** A first full clear of all four levels (an actual win, not `?skip=1`) unlocks it. */
function afterhourUnlocked(): boolean {
  return totalTimeFrames(save) !== null;
}

function goAfterhourIntro(): void {
  phase = 'afterhourIntro';
  sim = null;
  simAH = null;
  const best = bestEntry(afterhourScore);
  overlay.showAfterhourIntro({
    bestLoops: best?.loops ?? 0,
    bestFrames: best?.frames ?? 0,
    hasBoard: afterhourScore.entries.length > 0,
    onStart: () => startAfterhour(),
    onBack: () => goReveal(false),
    onBoard: () => goAfterhourBoard(null),
  });
}

/** `highlight` marks the run that just happened, when there is one. */
function goAfterhourBoard(highlight: number | null): void {
  phase = 'afterhourBoard';
  sim = null;
  simAH = null;
  overlay.showAfterhourBoard({
    entries: afterhourScore.entries,
    highlight,
    onRetry: () => startAfterhour(),
    onBack: () => goAfterhourIntro(),
  });
}

function startAfterhour(seed = seedFor(), h?: number): void {
  phase = 'afterhour';
  whiteout = 0;
  tape = null;
  clearParticles(particles);
  resetStepper(stepper);
  simAH = createAfterhour(seed, h ?? canvasHeight(vp.cssW, vp.cssH));
  overlay.hide();
  setScene(scheduler, simAH.segment.level);
}

function goAfterhourFail(): void {
  if (!simAH) return;
  phase = 'afterhourFail';
  const loops = loopsSurvived(simAH);
  const frames = simAH.frame;
  // Filed nameless and persisted immediately: the initials prompt is a
  // rename, so quitting the card can never cost him the run.
  const { rank, isNewBest } = recordAfterhourRun(afterhourScore, {
    name: ANON_NAME,
    loops,
    frames,
    at: Date.now(),
  });
  saveAfterhourScore(afterhourScore);
  simAH = null;
  overlay.showAfterhourFail({
    loops,
    frames,
    rank,
    isNewBest,
    bestLoops: bestEntry(afterhourScore)?.loops ?? 0,
    defaultName: afterhourScore.lastName,
    hasBoard: afterhourScore.entries.length > 0,
    onSubmitName: (name) => {
      if (rank !== null) {
        renameEntry(afterhourScore, rank, name);
        saveAfterhourScore(afterhourScore);
      }
      goAfterhourBoard(rank);
    },
    onRetry: () => startAfterhour(),
    onTitle: () => goTitle(),
    onBoard: () => goAfterhourBoard(rank),
  });
}

function goIntro(level: LevelId): void {
  phase = 'intro';
  sim = null;
  overlay.showIntro(level, () => startLevel(level));
}

function startLevel(level: LevelId, seed = seedFor(), h?: number): void {
  phase = 'play';
  postWin = 0;
  whiteout = 0;
  tape = null;
  clearParticles(particles);
  resetStepper(stepper);
  // A tape carries the logical height it was recorded at: replaying it at this
  // device's height would be a different world (see input.ts).
  sim = createLevel(level, seed, h ?? canvasHeight(vp.cssW, vp.cssH), modsFor(save, level));
  overlay.hide();
  setScene(scheduler, level);
}

function goFail(level: LevelId): void {
  phase = 'fail';
  recordFail(save, level);
  persist();
  overlay.showFail({
    level,
    canSkip: offersSkip(save, level),
    onRetry: () => startLevel(level),
    onSkip: () => afterLevel(level),
  });
}

/** Level cleared (or skipped): unlock the next one and move on. */
function afterLevel(level: LevelId): void {
  recordClear(save, level);
  persist();
  const idx = LEVEL_ORDER.indexOf(level);
  const next = LEVEL_ORDER[idx + 1];
  if (!next) goReveal(true);
  else goIntro(next);
}

function goWin(level: LevelId, frames: number): void {
  // Only an actual win sets a time — "Überspringen" leaves it unset, so the
  // total (and the high score) simply doesn't appear rather than punish him
  // for taking the mercy rule (DESIGN.md §8).
  recordLevelTime(save, level, frames);
  if (level === 'kayak') {
    // Straight out of the whale's splash, without a menu in between.
    recordClear(save, level);
    persist();
    goReveal(true);
    return;
  }
  persist();
  phase = 'win';
  overlay.showWin(level, () => afterLevel(level));
}

function goReveal(fresh: boolean): void {
  phase = 'reveal';
  sim = null;
  simAH = null;
  save = markRevealed(save);
  // Still recorded (the save keeps every clear time); simply not shown — the
  // reveal screen is a present, not a scoreboard.
  updateBestTotal(save);
  persist();
  setScene(scheduler, 'reveal', !fresh);
  if (fresh && !reducedMotion) playRiser(engine, 3.2);
  overlay.showReveal({
    unlocked: save.unlocked,
    reducedMotion,
    afterhourUnlocked: afterhourUnlocked(),
    onDrop: () => {
      playDrop(engine);
      confetti(particles, W, canvasHeight(vp.cssW, vp.cssH), reducedMotion ? 30 : 140);
    },
    onPlayAgain: () => goTitle(),
    onSelectLevel: (level) => {
      if (isUnlocked(save, level)) goIntro(level);
    },
    onSelectAfterhour: () => {
      if (afterhourUnlocked()) goAfterhourIntro();
    },
  });
}

// ---------------------------------------------------------------------------
// The loop
// ---------------------------------------------------------------------------

function fixedStep(): void {
  if (!sim || phase !== 'play') return;

  let input = controls.frame;
  if (tape) {
    // A tape drives the sim directly; it bypasses controls.ts entirely, which
    // is exactly why E2E also plays one level with real touch events.
    if (tapeIndex < tape.frames.length) {
      decodeFrame(tape.frames[tapeIndex++], tapeInput);
      input = tapeInput;
    } else {
      tape = null;
    }
  }

  stepListener?.(input, sim);
  stepLevel(sim, input);
  controls.consume();
  playEvents(engine, sim);

  if (sim.level === 'kayak') setBrightness(engine, sim.ruhe / 100);

  if (sim.status === 'fail') {
    const level = sim.level;
    sim = null;
    goFail(level);
  } else if (sim.status === 'win') {
    postWin++;
    // Let the win animation breathe before the card (the whale, the stamp).
    const hold = sim.level === 'kayak' ? 96 : 42;
    if (postWin > hold) {
      const level = sim.level;
      if (level === 'kayak') whiteout = Math.min(1, whiteout + 0.06);
      if (level !== 'kayak' || whiteout >= 1) {
        // `frame` froze the tick the level flipped to 'win' (step() no-ops
        // once status !== 'run'), so this is the real clear time, not the
        // hold-animation padding.
        const frames = sim.frame;
        sim = null;
        goWin(level, frames);
      }
    }
  }
}

function fixedStepAfterhour(): void {
  if (!simAH || phase !== 'afterhour') return;

  const input = controls.frame;
  const prevLevel = simAH.segment.level;
  stepAfterhour(simAH, input);
  controls.consume();
  playEvents(engine, simAH.segment);
  if (simAH.segment.level === 'kayak') setBrightness(engine, simAH.segment.ruhe / 100);
  if (simAH.segment.level !== prevLevel) setScene(scheduler, simAH.segment.level);

  if (simAH.status === 'fail') goAfterhourFail();
}

let last = 0;

function frame(now: number): void {
  requestAnimationFrame(frame);
  if (frozen) return;

  const elapsed = last === 0 ? DT : (now - last) / 1000;
  last = now;

  if (!controls.paused) {
    if (phase === 'afterhour') advance(stepper, elapsed * timeScale, fixedStepAfterhour);
    else advance(stepper, elapsed * timeScale, fixedStep);
  }
  draw();
}

function draw(): void {
  renderFrame++;
  rc.beatPhase = beatPhase(scheduler);
  rc.whiteout = whiteout;
  if (simAH) renderAfterhour(rc, simAH, renderFrame);
  else if (sim) renderLevel(rc, sim, renderFrame);
  else renderIdle(rc, canvasHeight(vp.cssW, vp.cssH), renderFrame);
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

const params = new URLSearchParams(location.search);

// The party escape hatch: jumps straight to the reveal if anything is broken.
if (params.get('skip') === '1') goReveal(true);
else goTitle();

if (controls.landscape) {
  rotateEl.classList.add('on');
  rotateEl.hidden = false;
}

requestAnimationFrame(frame);

// ---------------------------------------------------------------------------
// Test seam (ARCHITECTURE.md "Test hooks in the shipped build")
//
// A deliberate decision, not an oversight: E2E must drive the real production
// bundle, and being able to test the exact artifact that ships is worth more
// than hiding a ~1 KB API on a single-player toy.
// ---------------------------------------------------------------------------

const bb = {
  version: __BUILD_SHA__,
  loadTape(t: unknown): boolean {
    if (!isTape(t)) return false;
    forcedSeed = t.seed;
    startLevel(t.level, t.seed, t.h);
    tape = t;
    tapeIndex = 0;
    return true;
  },
  setSeed(seed: number): void {
    forcedSeed = seed | 0;
  },
  freeze(): void {
    frozen = true;
  },
  unfreeze(): void {
    frozen = false;
    last = 0;
    resetStepper(stepper);
  },
  step(n = 1): void {
    // Dispatch per tick, like the dev harness: the phase can flip mid-run
    // (afterhour → afterhourFail), and stepping the wrong sim silently
    // no-ops, which is worse than useless in a test.
    for (let i = 0; i < n; i++) {
      if (phase === 'afterhour') fixedStepAfterhour();
      else fixedStep();
    }
    draw();
  },
  getState(): unknown {
    if (simAH) return { phase, hash: hashState(simAH.segment), state: simAH };
    return sim ? { phase, hash: hashState(sim), state: sim } : { phase, hash: null, state: null };
  },
  goto(level: LevelId, seed?: number): void {
    if (typeof seed === 'number') forcedSeed = seed | 0;
    startLevel(level, seed ?? seedFor());
  },
  gotoAfterhour(seed?: number): void {
    if (typeof seed === 'number') forcedSeed = seed | 0;
    startAfterhour(seed ?? seedFor());
  },
  reveal(): void {
    goReveal(true);
  },
  save(): SaveData {
    return save;
  },
  afterhourSave(): AfterhourScore {
    return afterhourScore;
  },
};

(window as unknown as { __bb: typeof bb }).__bb = bb;

// ---------------------------------------------------------------------------
// Offline
// ---------------------------------------------------------------------------

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    // The build SHA is in the URL so a new build registers a new worker and a
    // stale cache can never serve a half-updated bundle.
    navigator.serviceWorker.register(`./sw.js?v=${__BUILD_SHA__}`).catch(() => {
      /* offline support is a bonus, never a requirement */
    });
  });
}

if (__DEV_HARNESS__) {
  void import('./dev.js').then((m) =>
    m.mountDevHarness({
      getSim: () => sim,
      startLevel: (level, seed) => startLevel(level, seed),
      startAfterhour: (seed) => startAfterhour(seed),
      setFrozen: (v) => {
        frozen = v;
        if (!v) {
          last = 0;
          resetStepper(stepper);
        }
      },
      stepOnce: () => {
        if (phase === 'afterhour') fixedStepAfterhour();
        else fixedStep();
        draw();
      },
      getControls: () => controls,
      getPhase: () => phase,
      goReveal: () => goReveal(true),
      setTimeScale: (v) => {
        timeScale = v;
      },
      setStepListener: (fn) => {
        stepListener = fn;
      },
      setDebugDraw: (v) => {
        rc.debug = v;
      },
      loadTape: (t) => bb.loadTape(t),
      getViewport: () => vp,
    }),
  );
}
