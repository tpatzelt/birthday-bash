/**
 * Fixed-timestep accumulator.
 *
 * Variable dt makes physics frame-rate-dependent and replays unreproducible, so
 * the simulation only ever advances in 1/60 s ticks. At most 5 catch-up ticks
 * run per frame: after a backgrounded tab, the game must resume — not
 * fast-forward through 30 s of accumulated time (TESTING.md §7.4).
 */

import { DT } from '../config/tuning.js';

export const MAX_CATCHUP = 5;

export type Stepper = {
  acc: number;
  /** Ticks executed on the last call — useful for the dev harness graph. */
  last: number;
};

export function makeStepper(): Stepper {
  return { acc: 0, last: 0 };
}

/**
 * Feed wall-clock seconds; `tick` is called once per fixed step.
 * Returns the interpolation alpha for the renderer (0..1).
 */
export function advance(st: Stepper, elapsedSeconds: number, tick: () => void): number {
  // Clamp pathological deltas (tab restore, breakpoint) before they enter the
  // accumulator at all.
  const dt = Math.min(Math.max(elapsedSeconds, 0), DT * MAX_CATCHUP);
  st.acc += dt;
  let n = 0;
  while (st.acc >= DT && n < MAX_CATCHUP) {
    st.acc -= DT;
    n++;
    tick();
  }
  if (n === MAX_CATCHUP) st.acc = 0;
  st.last = n;
  return st.acc / DT;
}

export function resetStepper(st: Stepper): void {
  st.acc = 0;
  st.last = 0;
}
