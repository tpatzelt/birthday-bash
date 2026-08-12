/**
 * Shared level-state shape, the event bus, and the snapshot/hash used by the
 * determinism tests.
 *
 * State is plain, JSON-serialisable data: no class instances, no Maps of
 * objects. That is what lets a whole state be hashed, snapshotted and diffed in
 * a test (ARCHITECTURE.md).
 */

import type { LevelId } from './input.js';
import type { Mods } from '../config/tuning.js';
import { makeRng, type Rng } from './rng.js';

export type EventType =
  | 'jump'
  | 'land'
  | 'bottle'
  | 'bonus'
  | 'hit'
  | 'shades'
  | 'stamp'
  | 'fish'
  | 'veg'
  | 'bounce'
  | 'rock'
  | 'calm'
  | 'whale'
  | 'win'
  | 'fail'
  | 'knapp'
  | 'dosendieb'
  | 'golden'
  | 'flunker'
  | 'wildlife'
  | 'segmentStart'
  | 'loopComplete'
  | 'afterhourFail';

/** Emitted into an array on the state, never dispatched. Audio and particles read them. */
export type GameEvent = { type: EventType; x: number; y: number; a: number };

export type Status = 'run' | 'win' | 'fail';

export type BaseState = {
  level: LevelId;
  /** The only clock in the core. Never Date.now(). */
  frame: number;
  status: Status;
  lives: number;
  livesMax: number;
  /** Invulnerability, in frames. */
  invuln: number;
  /** 0..1, drives the HUD progress strip. */
  progress: number;
  /** Logical canvas height this sim was created for. */
  h: number;
  seed: number;
  mods: Mods;
  rng: Rng;
  events: GameEvent[];
  eventCount: number;
  prevDown: boolean;
  /** Screen shake amplitude in px; the renderer decays its own copy. */
  shake: number;
};

const EVENT_POOL_SIZE = 32;

export function makeBase(level: LevelId, seed: number, h: number, mods: Mods, lives: number): BaseState {
  const events: GameEvent[] = new Array(EVENT_POOL_SIZE);
  for (let i = 0; i < EVENT_POOL_SIZE; i++) events[i] = { type: 'hit', x: 0, y: 0, a: 0 };
  const livesMax = lives + mods.extraLives;
  return {
    level,
    frame: 0,
    status: 'run',
    lives: livesMax,
    livesMax,
    invuln: 0,
    progress: 0,
    h,
    seed,
    mods: { ...mods },
    rng: makeRng(seed),
    events,
    eventCount: 0,
    prevDown: false,
    shake: 0,
  };
}

/** Events are pooled: emitting never allocates, and the pool silently saturates. */
export function emit(s: BaseState, type: EventType, x: number, y: number, a = 0): void {
  if (s.eventCount >= s.events.length) return;
  const e = s.events[s.eventCount++];
  e.type = type;
  e.x = x;
  e.y = y;
  e.a = a;
}

export function clearEvents(s: BaseState): void {
  s.eventCount = 0;
}

/** Iterate this frame's events without allocating an array. */
export function forEachEvent(s: BaseState, fn: (e: GameEvent) => void): void {
  for (let i = 0; i < s.eventCount; i++) fn(s.events[i]);
}

export function hasEvent(s: BaseState, type: EventType): boolean {
  for (let i = 0; i < s.eventCount; i++) if (s.events[i].type === type) return true;
  return false;
}

/**
 * A hit costs a life and grants invulnerability. It never costs collected
 * progress — losing progress feels punitive, losing a life reads as a scratch
 * (DESIGN.md §4 L1).
 */
export function takeHit(s: BaseState, invulnFrames: number, x: number, y: number): boolean {
  if (s.invuln > 0 || s.status !== 'run') return false;
  s.lives--;
  s.invuln = invulnFrames;
  emit(s, 'hit', x, y, s.lives);
  if (s.lives <= 0) {
    s.lives = 0;
    s.status = 'fail';
    emit(s, 'fail', x, y, 0);
  }
  return true;
}

export function win(s: BaseState, x = 0, y = 0): void {
  if (s.status !== 'run') return;
  s.status = 'win';
  s.progress = 1;
  emit(s, 'win', x, y, 0);
}

export function fail(s: BaseState, x = 0, y = 0): void {
  if (s.status !== 'run') return;
  s.status = 'fail';
  emit(s, 'fail', x, y, 0);
}

export function msToFrames(ms: number): number {
  return Math.round((ms * 60) / 1000);
}

// ---------------------------------------------------------------------------
// Snapshot & hash — the determinism backbone (TESTING.md §2)
// ---------------------------------------------------------------------------

type Json = number | string | boolean | null | Json[] | { [k: string]: Json };

/**
 * A canonical, comparable view of a state: pool slots that are inactive and
 * event slots past `eventCount` carry stale data by design and must not
 * influence the hash.
 */
export function snapshot(value: unknown, key?: string, parent?: Record<string, unknown>): Json {
  if (value === null || value === undefined) return null;
  const t = typeof value;
  if (t === 'number' || t === 'string' || t === 'boolean') return value as Json;
  if (Array.isArray(value)) {
    let arr = value as unknown[];
    if (key === 'events' && parent && typeof parent.eventCount === 'number') {
      arr = arr.slice(0, parent.eventCount);
    }
    const out: Json[] = [];
    for (const item of arr) {
      if (item && typeof item === 'object' && (item as { active?: boolean }).active === false) continue;
      out.push(snapshot(item));
    }
    return out;
  }
  if (t === 'object') {
    const obj = value as Record<string, unknown>;
    const out: { [k: string]: Json } = {};
    for (const k of Object.keys(obj).sort()) {
      out[k] = snapshot(obj[k], k, obj);
    }
    return out;
  }
  return null;
}

/** FNV-1a over the canonical snapshot. Stable across machines and runs. */
export function hashState(s: unknown): string {
  const json = JSON.stringify(snapshot(s));
  let h = 0x811c9dc5;
  for (let i = 0; i < json.length; i++) {
    h ^= json.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/** Returns the path of the first non-finite number found, or null. */
export function findNonFinite(value: unknown, path = '$'): string | null {
  if (typeof value === 'number') return Number.isFinite(value) ? null : path;
  if (value === null || typeof value !== 'object') return null;
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const r = findNonFinite(value[i], `${path}[${i}]`);
      if (r) return r;
    }
    return null;
  }
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    const r = findNonFinite(v, `${path}.${k}`);
    if (r) return r;
  }
  return null;
}
