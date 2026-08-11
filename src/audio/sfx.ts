/**
 * One-shots, driven by state.events. The core stays pure; this reads.
 *
 * Everything here is optional by construction: if the AudioContext never
 * started, each call is a no-op and the game is exactly as playable.
 */

import { forEachEvent, type BaseState } from '../core/state.js';
import type { Engine } from './engine.js';

function blip(
  e: Engine,
  freq: number,
  to: number,
  dur: number,
  peak: number,
  type: OscillatorType = 'triangle',
): void {
  const ctx = e.ctx;
  if (!ctx || !e.sfx) return;
  const at = ctx.currentTime;
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, at);
  if (to !== freq) osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), at + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(peak, at + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  osc.connect(g);
  g.connect(e.sfx);
  osc.start(at);
  osc.stop(at + dur + 0.02);
}

function noiseHit(e: Engine, freq: number, dur: number, peak: number, type: BiquadFilterType = 'bandpass'): void {
  const ctx = e.ctx;
  if (!ctx || !e.sfx || !e.noise) return;
  const at = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = e.noise;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = 1.4;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(peak, at + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  src.connect(f);
  f.connect(g);
  g.connect(e.sfx);
  src.start(at);
  src.stop(at + dur + 0.02);
}

/** Read this frame's events and make the noises. Never mutates state. */
export function playEvents(e: Engine, s: BaseState): void {
  if (!e.ctx || e.muted) return;
  forEachEvent(s, (ev) => {
    switch (ev.type) {
      case 'bottle':
        // Bottles clink, and the clink rises as the Bon fills up.
        blip(e, 900 + Math.min(12, ev.a) * 45, 1500, 0.09, 0.16);
        break;
      case 'bonus':
        blip(e, 660, 1320, 0.22, 0.2, 'square');
        break;
      case 'fish':
        blip(e, 720, 980, 0.07, 0.12);
        break;
      case 'veg':
        blip(e, 190, 70, 0.28, 0.24, 'sawtooth');
        break;
      case 'jump':
        blip(e, 380, 720, 0.08, 0.09, 'sine');
        break;
      case 'land':
        noiseHit(e, 320, 0.06, 0.07, 'lowpass');
        break;
      case 'hit':
        blip(e, 160, 55, 0.32, 0.28, 'square');
        noiseHit(e, 700, 0.12, 0.14);
        break;
      case 'shades':
        blip(e, 300, 1400, 0.3, 0.14, 'sine');
        break;
      case 'stamp':
        noiseHit(e, 240, 0.18, 0.34, 'lowpass');
        blip(e, 120, 70, 0.24, 0.22, 'sine');
        break;
      case 'rock':
        noiseHit(e, 180, 0.22, 0.26, 'lowpass');
        break;
      case 'calm':
        blip(e, 1180, 1180, 0.5, 0.03, 'sine');
        break;
      case 'whale':
        blip(e, 90, 42, 1.6, 0.3, 'sine');
        noiseHit(e, 520, 1.1, 0.16, 'lowpass');
        break;
      case 'win':
        blip(e, 523.25, 523.25, 0.5, 0.14);
        blip(e, 659.25, 659.25, 0.6, 0.12);
        blip(e, 783.99, 783.99, 0.7, 0.1);
        break;
      case 'fail':
        blip(e, 300, 90, 0.6, 0.2, 'sawtooth');
        break;
      case 'bounce':
        blip(e, 220, 160, 0.05, 0.05, 'sine');
        break;
    }
  });
}

/** The drop: everything at once, on the reveal. */
export function playDrop(e: Engine): void {
  if (!e.ctx || e.muted) return;
  blip(e, 55, 55, 1.2, 0.34, 'sine');
  noiseHit(e, 900, 0.9, 0.2, 'highpass');
  for (const f of [261.63, 329.63, 392.0, 523.25]) blip(e, f, f, 1.1, 0.1, 'square');
}

/** A short riser under the type-on lines, before the drop. */
export function playRiser(e: Engine, seconds: number): void {
  const ctx = e.ctx;
  if (!ctx || !e.sfx || e.muted || !e.noise) return;
  const at = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = e.noise;
  src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.setValueAtTime(300, at);
  f.frequency.exponentialRampToValueAtTime(6000, at + seconds);
  f.Q.value = 2;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(0.14, at + seconds * 0.9);
  g.gain.exponentialRampToValueAtTime(0.0001, at + seconds);
  src.connect(f);
  f.connect(g);
  g.connect(e.sfx);
  src.start(at);
  src.stop(at + seconds + 0.05);
}
