// Game clock (AGENTS.md §4 rule 3). Gameplay advances in fixed steps so the latte-art
// simulation is deterministic, and pausing freezes everything that reads this clock.

export const STEP = 1 / 60;
const MAX_FRAME = 0.1; // ignore long stalls (tab switch) instead of fast-forwarding

export interface Clock {
  /** Game seconds elapsed (only advances while running). */
  time: number;
  paused: boolean;
  /** Leftover real time not yet consumed by a fixed step. */
  acc: number;
}

export function createClock(): Clock {
  return { time: 0, paused: false, acc: 0 };
}

/**
 * Feed real frame time; returns how many fixed steps to run this frame.
 * The caller runs `step()` that many times and advances `clock.time` via `tickStep`.
 */
export function consumeFrame(clock: Clock, frameSeconds: number): number {
  if (clock.paused) return 0;
  clock.acc += Math.min(Math.max(frameSeconds, 0), MAX_FRAME);
  const steps = Math.floor(clock.acc / STEP);
  clock.acc -= steps * STEP;
  return steps;
}

export function tickStep(clock: Clock): void {
  clock.time += STEP;
}

/** Fraction of the next step already elapsed, for smooth rendering between steps. */
export function alpha(clock: Clock): number {
  return clock.acc / STEP;
}
