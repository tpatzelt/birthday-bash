/**
 * The debug harness at /__dev — the developer's half of the closed loop.
 *
 * Play until something feels wrong → hit Record → the failure becomes a
 * regression test. That is the loop (ARCHITECTURE.md, TESTING.md).
 *
 * Guarded behind a route check and stripped from the production bundle by the
 * `__DEV_HARNESS__` define, so it costs the shipped game nothing.
 */

import { LEVEL_ORDER, type InputFrame, type LevelId, type Tape } from '../core/input.js';
import type { AnyLevelState } from '../core/game.js';
import { encodeFrame } from '../core/input.js';
import { glyphReport } from '../render/atlas.js';
import type { Viewport } from '../render/canvas.js';
import type { Controls } from './controls.js';

export type DevHooks = {
  getSim: () => AnyLevelState | null;
  startLevel: (level: LevelId, seed?: number) => void;
  setFrozen: (v: boolean) => void;
  stepOnce: () => void;
  getControls: () => Controls;
  getPhase: () => string;
  goReveal: () => void;
  setTimeScale: (v: number) => void;
  setStepListener: (fn: ((input: InputFrame, s: AnyLevelState) => void) | null) => void;
  setDebugDraw: (v: boolean) => void;
  loadTape: (t: unknown) => boolean;
  getViewport: () => Viewport;
};

const STYLE = `
#devbar{position:fixed;left:0;right:0;bottom:0;z-index:50;background:rgba(7,6,15,.94);
  border-top:1px solid #2A2550;color:#B9B4D6;font:11px/1.4 ui-monospace,monospace;
  padding:8px 10px calc(8px + env(safe-area-inset-bottom,0px));display:grid;gap:6px}
#devbar .row{display:flex;gap:6px;align-items:center;flex-wrap:wrap}
#devbar button,#devbar select,#devbar input{background:#12102A;color:#F3F0FF;border:1px solid #2A2550;
  font:11px ui-monospace,monospace;padding:5px 8px;border-radius:0;margin:0;width:auto}
#devbar button.on{background:#FF2D6F;color:#07060F;border-color:#FF2D6F}
#devbar input[type=number]{width:78px}
#devbar pre{margin:0;max-height:84px;overflow:auto;color:#8f8ab0;white-space:pre-wrap}
#devgraph{width:100%;height:26px;display:block;background:#0B0A18;border:1px solid #2A2550}
`;

export function mountDevHarness(hooks: DevHooks): void {
  // Route check: the harness only exists at /__dev (or with ?dev=1 for a phone,
  // where typing a path is worse than tapping a link).
  const wanted = location.pathname.replace(/\/+$/, '').endsWith('/__dev') || location.search.includes('dev=1');
  if (!wanted) return;

  const style = document.createElement('style');
  style.textContent = STYLE;
  document.head.append(style);

  const bar = document.createElement('div');
  bar.id = 'devbar';
  document.body.append(bar);

  const rowA = row(bar);
  const levelSel = document.createElement('select');
  for (const l of LEVEL_ORDER) {
    const o = document.createElement('option');
    o.value = l;
    o.textContent = l;
    levelSel.append(o);
  }
  const seedInput = document.createElement('input');
  seedInput.type = 'number';
  seedInput.value = '1';
  rowA.append(levelSel, seedInput);
  rowA.append(btn('start', () => hooks.startLevel(levelSel.value as LevelId, Number(seedInput.value) | 0)));
  rowA.append(btn('reveal', () => hooks.goReveal()));
  // The real-device glyph check from PLAN.md M2: what this phone's font can
  // actually draw, and what fell back to a hand-drawn vector.
  rowA.append(
    btn('glyphs', () => {
      const r = glyphReport();
      log(r.map((g) => `${g.name}=${g.source}`).join(' '));
    }),
  );

  const rowB = row(bar);
  let frozen = false;
  const freezeBtn = btn('freeze', () => {
    frozen = !frozen;
    hooks.setFrozen(frozen);
    freezeBtn.classList.toggle('on', frozen);
  });
  rowB.append(freezeBtn);
  rowB.append(btn('step', () => hooks.stepOnce()));
  for (const scale of [0, 0.25, 1, 2, 4]) {
    rowB.append(btn(`${scale}×`, () => hooks.setTimeScale(scale)));
  }
  let debug = false;
  const debugBtn = btn('hitboxes', () => {
    debug = !debug;
    hooks.setDebugDraw(debug);
    debugBtn.classList.toggle('on', debug);
  });
  rowB.append(debugBtn);

  // --- Record → tape.json --------------------------------------------------
  const rowC = row(bar);
  let recording: { seed: number; level: LevelId; h: number; frames: Tape['frames'] } | null = null;
  const recBtn = btn('● record', () => {
    if (recording) {
      downloadTape(recording);
      recording = null;
      hooks.setStepListener(null);
      recBtn.textContent = '● record';
      recBtn.classList.remove('on');
      return;
    }
    const sim = hooks.getSim();
    if (!sim) return;
    recording = { seed: sim.seed, level: sim.level, h: sim.h, frames: [] };
    recBtn.textContent = '■ stop + save';
    recBtn.classList.add('on');
    hooks.setStepListener((input) => {
      recording?.frames.push(encodeFrame(input));
    });
  });
  rowC.append(recBtn);

  const file = document.createElement('input');
  file.type = 'file';
  file.accept = 'application/json';
  file.style.display = 'none';
  file.addEventListener('change', async () => {
    const f = file.files?.[0];
    if (!f) return;
    try {
      const t = JSON.parse(await f.text());
      if (!hooks.loadTape(t)) log('not a tape');
    } catch {
      log('bad json');
    }
  });
  rowC.append(btn('replay…', () => file.click()), file);

  const graph = document.createElement('canvas');
  graph.id = 'devgraph';
  graph.width = 360;
  graph.height = 26;
  bar.append(graph);
  const gctx = graph.getContext('2d');

  const out = document.createElement('pre');
  bar.append(out);

  // The inspector rewrites `out` every frame, so a logged message is pinned and
  // reprinted with it rather than being overwritten a frame later.
  let pinned = '';
  function log(msg: string): void {
    pinned = msg;
  }

  // --- inspector + frame-time graph ---------------------------------------
  const times: number[] = new Array(120).fill(0);
  let ti = 0;
  let prev = performance.now();

  const tick = () => {
    const now = performance.now();
    times[ti] = now - prev;
    ti = (ti + 1) % times.length;
    prev = now;

    if (gctx) {
      gctx.fillStyle = '#0B0A18';
      gctx.fillRect(0, 0, graph.width, graph.height);
      gctx.fillStyle = '#2A2550';
      gctx.fillRect(0, graph.height - 16.7 * 0.6, graph.width, 1); // 16.7 ms line
      for (let i = 0; i < times.length; i++) {
        const v = times[(ti + i) % times.length];
        const hgt = Math.min(graph.height, v * 0.6);
        gctx.fillStyle = v > 20 ? '#FF2D6F' : '#23D3C4';
        gctx.fillRect((i / times.length) * graph.width, graph.height - hgt, 2, hgt);
      }
    }

    const sim = hooks.getSim();
    const c = hooks.getControls();
    const vp = hooks.getViewport();
    const p95 = [...times].sort((a, b) => a - b)[Math.floor(times.length * 0.95)];
    out.textContent =
      `phase=${hooks.getPhase()} p95=${p95.toFixed(1)}ms vp=${vp.w}×${vp.h}@${vp.dpr}\n` +
      `input down=${c.frame.down ? 1 : 0} x=${c.frame.x.toFixed(0)} y=${c.frame.y.toFixed(0)} paused=${c.paused}\n` +
      (sim
        ? `${sim.level} f=${sim.frame} seed=${sim.seed} lives=${sim.lives} prog=${(sim.progress * 100).toFixed(0)}% ` +
          `${summary(sim)}` + (recording ? `\nREC ${recording.frames.length}f` : '')
        : 'no sim') + (pinned ? `\n${pinned}` : '');
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function summary(s: AnyLevelState): string {
  switch (s.level) {
    case 'pfand':
      return `bottles=${s.bottles} speed=${s.speed.toFixed(0)} onGround=${s.onGround ? 1 : 0}`;
    case 'sisyphos':
      return `px=${s.progress_px.toFixed(0)} shades=${s.shadesLeft}`;
    case 'katjes':
      return `fish=${s.fish} spawnIn=${s.spawnIn.toFixed(2)}`;
    case 'kayak':
      return `ruhe=${s.ruhe.toFixed(1)} inside=${s.inside ? 1 : 0} vx=${s.vx.toFixed(0)}`;
  }
}

function row(parent: HTMLElement): HTMLElement {
  const r = document.createElement('div');
  r.className = 'row';
  parent.append(r);
  return r;
}

function btn(label: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = label;
  b.addEventListener('click', (e) => {
    e.preventDefault();
    onClick();
  });
  return b;
}

/** Downloads a tape ready to drop straight into tests/tapes/. */
function downloadTape(rec: { seed: number; level: LevelId; h: number; frames: Tape['frames'] }): void {
  const tape: Tape = { v: 1, seed: rec.seed, level: rec.level, h: rec.h, frames: rec.frames };
  const blob = new Blob([JSON.stringify(tape)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `tape-${rec.level}-${rec.seed}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
