/**
 * Pointer → InputFrame, plus visibility and orientation handling.
 *
 * One pointer, no gestures, no multi-touch: everything the game reads is "is a
 * finger down, and where" (DESIGN.md §2). A tape bypasses this file entirely,
 * which is why E2E plays at least one level with genuine touch events.
 */

import type { InputFrame } from '../core/input.js';
import { makeInput } from '../core/input.js';
import { isLandscape, toLogical, type Viewport } from '../render/canvas.js';

export type Controls = {
  /** The live input frame, read once per fixed step. */
  frame: InputFrame;
  /**
   * Call after each fixed step. A tap can be shorter than 1/60 s — a flick with
   * the thumb, or a synthetic touch in a test — and a press that went down and
   * up between two steps would otherwise never be seen by the simulation at
   * all. The press is latched until exactly one step has consumed it.
   */
  consume(): void;
  /** True while the tab is hidden or the phone is sideways. */
  paused: boolean;
  landscape: boolean;
  detach: () => void;
};

export type ControlHooks = {
  onPauseChange?: (paused: boolean) => void;
  onOrientationChange?: (landscape: boolean) => void;
  onFirstGesture?: () => void;
  getViewport: () => Viewport;
};

export function attachControls(canvas: HTMLCanvasElement, hooks: ControlHooks): Controls {
  let activePointer: number | null = null;
  let gestured = false;
  let physicalDown = false;
  let unconsumedPress = false;

  const controls: Controls = {
    frame: makeInput(),
    paused: false,
    landscape: isLandscape(),
    consume: () => {
      if (!unconsumedPress) return;
      unconsumedPress = false;
      if (!physicalDown) controls.frame.down = false;
    },
    detach: () => {},
  };

  const point = (clientX: number, clientY: number) => {
    const rect = canvas.getBoundingClientRect();
    const p = toLogical(hooks.getViewport(), rect, clientX, clientY);
    controls.frame.x = p.x;
    controls.frame.y = p.y;
  };

  const down = (ev: PointerEvent) => {
    if (activePointer !== null) return; // strictly one finger
    activePointer = ev.pointerId;
    physicalDown = true;
    unconsumedPress = true;
    controls.frame.down = true;
    point(ev.clientX, ev.clientY);
    if (!gestured) {
      gestured = true;
      hooks.onFirstGesture?.();
    }
    ev.preventDefault();
  };

  const move = (ev: PointerEvent) => {
    if (ev.pointerId !== activePointer) return;
    point(ev.clientX, ev.clientY);
    ev.preventDefault();
  };

  const up = (ev: PointerEvent) => {
    if (ev.pointerId !== activePointer) return;
    activePointer = null;
    physicalDown = false;
    // Held down until a step has actually seen it.
    if (!unconsumedPress) controls.frame.down = false;
    ev.preventDefault();
  };

  const cancel = () => {
    activePointer = null;
    physicalDown = false;
    unconsumedPress = false;
    controls.frame.down = false;
  };

  const setPaused = (paused: boolean) => {
    if (controls.paused === paused) return;
    controls.paused = paused;
    if (paused) cancel();
    hooks.onPauseChange?.(paused);
  };

  const onVisibility = () => setPaused(document.visibilityState === 'hidden' || controls.landscape);

  const onResize = () => {
    const landscape = isLandscape();
    if (landscape !== controls.landscape) {
      controls.landscape = landscape;
      hooks.onOrientationChange?.(landscape);
    }
    setPaused(document.visibilityState === 'hidden' || landscape);
  };

  canvas.addEventListener('pointerdown', down, { passive: false });
  canvas.addEventListener('pointermove', move, { passive: false });
  window.addEventListener('pointerup', up, { passive: false });
  window.addEventListener('pointercancel', cancel);
  window.addEventListener('blur', cancel);
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', onResize);
  // Two-finger zoom and double-tap zoom are not gestures this game has.
  const stopGesture = (ev: Event) => ev.preventDefault();
  document.addEventListener('gesturestart', stopGesture as EventListener);
  document.addEventListener('dblclick', stopGesture);

  controls.detach = () => {
    canvas.removeEventListener('pointerdown', down);
    canvas.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', cancel);
    window.removeEventListener('blur', cancel);
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('resize', onResize);
    window.removeEventListener('orientationchange', onResize);
    document.removeEventListener('gesturestart', stopGesture as EventListener);
    document.removeEventListener('dblclick', stopGesture);
  };

  return controls;
}
