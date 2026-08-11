/**
 * The layer table from DESIGN.md §6, and the voices that play it.
 *
 * 126 BPM, A minor, one continuous track across the entire game. Levels add and
 * remove *layers*; the track never restarts. That is why the level order and
 * the music are one design decision, not two.
 */

import type { Engine } from './engine.js';

export type LayerName = 'hats' | 'kick' | 'clap' | 'bass' | 'arp' | 'pads' | 'stabs';

export type SceneId = 'title' | 'pfand' | 'sisyphos' | 'katjes' | 'kayak' | 'reveal';

export const LAYERS: Record<SceneId, LayerName[]> = {
  title: ['hats'],
  pfand: ['hats', 'kick', 'clap'],
  sisyphos: ['hats', 'kick', 'clap', 'bass'],
  katjes: ['hats', 'kick', 'clap', 'bass', 'arp'],
  // The kick drops out. He goes quiet, the music strips down to pads, he floats.
  kayak: ['pads'],
  reveal: ['hats', 'kick', 'clap', 'bass', 'arp', 'pads', 'stabs'],
};

/** A minor: i — VI — VII — v, one chord per bar. */
const CHORDS: number[][] = [
  [220.0, 261.63, 329.63], // Am
  [174.61, 220.0, 261.63], // F
  [196.0, 246.94, 293.66], // G
  [164.81, 196.0, 246.94], // Em
];
const ROOTS = [55.0, 43.65, 49.0, 41.2];

/** 16th-note arp pattern over the bar's chord. */
const ARP = [0, 1, 2, 1, 2, 0, 1, 2, 0, 2, 1, 2, 0, 1, 2, 1];

export function chordOfBar(bar: number): number[] {
  return CHORDS[bar % CHORDS.length];
}

export function rootOfBar(bar: number): number {
  return ROOTS[bar % ROOTS.length];
}

function env(
  e: Engine,
  node: AudioNode,
  at: number,
  attack: number,
  decay: number,
  peak: number,
): GainNode | null {
  if (!e.ctx) return null;
  const g = e.ctx.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), at + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay);
  node.connect(g);
  return g;
}

function noiseSource(e: Engine): AudioBufferSourceNode | null {
  if (!e.ctx || !e.noise) return null;
  const src = e.ctx.createBufferSource();
  src.buffer = e.noise;
  src.loop = true;
  return src;
}

/**
 * Play one 16th step of one layer at absolute time `at`.
 * `step` is 0..15 within the bar; `bar` counts from the start of the track.
 */
export function playStep(e: Engine, layer: LayerName, step: number, bar: number, at: number): void {
  if (!e.ctx || !e.music) return;
  const ctx = e.ctx;
  const out = e.music;

  switch (layer) {
    case 'kick': {
      // Four on the floor.
      if (step % 4 !== 0) return;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(125, at);
      osc.frequency.exponentialRampToValueAtTime(44, at + 0.11);
      const g = env(e, osc, at, 0.004, 0.24, 0.95);
      if (!g) return;
      g.connect(out);
      osc.start(at);
      osc.stop(at + 0.3);
      break;
    }
    case 'hats': {
      // Offbeat 8ths — the thing that makes it house rather than techno.
      if (step % 4 !== 2) return;
      const src = noiseSource(e);
      if (!src) return;
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 7800;
      const g = env(e, hp, at, 0.002, 0.055, 0.16);
      if (!g) return;
      src.connect(hp);
      g.connect(out);
      src.start(at);
      src.stop(at + 0.09);
      break;
    }
    case 'clap': {
      // 2 & 4.
      if (step !== 4 && step !== 12) return;
      const src = noiseSource(e);
      if (!src) return;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 1750;
      bp.Q.value = 1.1;
      const g = env(e, bp, at, 0.004, 0.16, 0.3);
      if (!g) return;
      src.connect(bp);
      g.connect(out);
      src.start(at);
      src.stop(at + 0.2);
      break;
    }
    case 'bass': {
      // Offbeat 8ths, one octave under the chord root.
      if (step % 4 !== 2) return;
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(rootOfBar(bar), at);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(420, at);
      lp.Q.value = 6;
      const g = env(e, lp, at, 0.006, 0.2, 0.34);
      if (!g) return;
      osc.connect(lp);
      g.connect(out);
      osc.start(at);
      osc.stop(at + 0.26);
      break;
    }
    case 'arp': {
      const chord = chordOfBar(bar);
      const note = chord[ARP[step] % chord.length] * 2;
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(note, at);
      const g = env(e, osc, at, 0.003, 0.13, 0.12);
      if (!g) return;
      g.connect(out);
      osc.start(at);
      osc.stop(at + 0.16);
      break;
    }
    case 'pads': {
      // One long, slow chord per bar. This is the whole of L4.
      if (step !== 0) return;
      const chord = chordOfBar(bar);
      for (let i = 0; i < chord.length; i++) {
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(chord[i] / 2, at);
        osc.detune.value = (i - 1) * 6;
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 1400;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, at);
        g.gain.exponentialRampToValueAtTime(0.075, at + 0.55);
        g.gain.exponentialRampToValueAtTime(0.0001, at + 1.9);
        osc.connect(lp);
        lp.connect(g);
        g.connect(out);
        osc.start(at);
        osc.stop(at + 2.0);
      }
      break;
    }
    case 'stabs': {
      if (step !== 0 && step !== 6 && step !== 10) return;
      const chord = chordOfBar(bar);
      for (const f of chord) {
        const osc = ctx.createOscillator();
        osc.type = 'square';
        osc.frequency.setValueAtTime(f, at);
        const g = env(e, osc, at, 0.004, 0.22, 0.07);
        if (!g) continue;
        g.connect(out);
        osc.start(at);
        osc.stop(at + 0.28);
      }
      break;
    }
  }
}
