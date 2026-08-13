/**
 * WebAudio engine: master bus, the L4 filter, and the gesture unlock.
 *
 * Fully synthesised — no audio files, so the whole game stays a few hundred KB
 * and works offline (DESIGN.md §6). iOS blocks AudioContext until a user
 * gesture: the title screen's start button is that gesture, and every failure
 * here is silent and non-blocking. The game must be fully playable muted.
 */

import { TUNING } from '../config/tuning.js';

export type Engine = {
  ctx: AudioContext | null;
  master: GainNode | null;
  /** Opens as Ruhe rises in L4 — the only place a meter drives the mix. */
  filter: BiquadFilterNode | null;
  music: GainNode | null;
  sfx: GainNode | null;
  noise: AudioBuffer | null;
  muted: boolean;
  started: boolean;
  failed: boolean;
};

export function makeEngine(muted: boolean): Engine {
  return {
    ctx: null,
    master: null,
    filter: null,
    music: null,
    sfx: null,
    noise: null,
    muted,
    started: false,
    failed: false,
  };
}

type AudioCtor = typeof AudioContext;

function audioCtor(): AudioCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { AudioContext?: AudioCtor; webkitAudioContext?: AudioCtor };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

/** Call from a real user gesture. Never throws; a silent game is not a crash. */
export function start(e: Engine): void {
  if (e.started || e.failed) {
    void resume(e);
    return;
  }
  const Ctor = audioCtor();
  if (!Ctor) {
    e.failed = true;
    return;
  }
  try {
    const ctx = new Ctor();
    const master = ctx.createGain();
    master.gain.value = e.muted ? 0 : TUNING.audio.masterGain;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 20000;
    filter.Q.value = 0.7;

    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    comp.attack.value = 0.004;
    comp.release.value = 0.18;

    const music = ctx.createGain();
    music.gain.value = 1;
    const sfx = ctx.createGain();
    sfx.gain.value = 0.9;

    music.connect(filter);
    filter.connect(master);
    // SFX bypass the filter: a coin must still tick when the mix is closed down.
    sfx.connect(master);
    master.connect(comp);
    comp.connect(ctx.destination);

    e.ctx = ctx;
    e.master = master;
    e.filter = filter;
    e.music = music;
    e.sfx = sfx;
    e.noise = makeNoise(ctx);
    e.started = true;
    void resume(e);
  } catch {
    e.failed = true;
  }
}

export async function resume(e: Engine): Promise<void> {
  try {
    if (e.ctx && e.ctx.state === 'suspended') await e.ctx.resume();
  } catch {
    /* an audio resume failure must never block the game */
  }
}

export async function suspend(e: Engine): Promise<void> {
  try {
    if (e.ctx && e.ctx.state === 'running') await e.ctx.suspend();
  } catch {
    /* ignored */
  }
}

export function setMuted(e: Engine, muted: boolean): void {
  e.muted = muted;
  if (!e.master || !e.ctx) return;
  const now = e.ctx.currentTime;
  e.master.gain.cancelScheduledValues(now);
  e.master.gain.setTargetAtTime(muted ? 0 : TUNING.audio.masterGain, now, 0.05);
}

/** Filter cutoff in Hz. Calm literally sounds brighter. */
export function setBrightness(e: Engine, t: number): void {
  if (!e.filter || !e.ctx) return;
  const clamped = Math.max(0, Math.min(1, t));
  const hz = 320 * Math.pow(20000 / 320, clamped);
  e.filter.frequency.setTargetAtTime(hz, e.ctx.currentTime, 0.12);
}

export function now(e: Engine): number {
  return e.ctx ? e.ctx.currentTime : 0;
}

function makeNoise(ctx: AudioContext): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * 0.6);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  // A fixed LCG, so the noise is the same every boot — one less thing that can
  // differ between one run and the next.
  let x = 22222;
  for (let i = 0; i < len; i++) {
    x = (x * 1664525 + 1013904223) % 4294967296;
    data[i] = (x / 2147483648 - 1) * 0.8;
  }
  return buf;
}
