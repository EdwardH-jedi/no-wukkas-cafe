// The owner's demonstration pour: a scripted control track fed through exactly the same
// pitcher and pour simulation the player uses. If this track stops producing a heart, the
// physics changed (tests/sim/latte.test.ts guards it).

import { STEP } from '../../core/clock';
import type { MilkQuality } from '../milk';
import { createPour, type PourState } from './field';
import { createPitcher, stepPourFrame, type PitcherControls, type PitcherState } from './pitcher';

export interface TrackKey {
  t: number;
  x: number;
  y: number;
  /** Spout height above the coffee, cm. */
  h: number;
  /** Pour button held from this key until the next. */
  hold: boolean;
}

/** High to fill, drop low to bloom, then lift, ease forward and pull through. */
export const OWNER_DEMO: readonly TrackKey[] = [
  { t: 0.0, x: 0, y: -0.3, h: 7, hold: false },
  { t: 0.5, x: 0, y: -0.3, h: 7, hold: true },
  { t: 3.6, x: 0, y: -0.3, h: 6, hold: true },
  // Drop right down onto the surface and let the white bloom.
  { t: 4.0, x: 0, y: -0.35, h: 0.7, hold: true },
  { t: 6.4, x: 0, y: -0.35, h: 0.7, hold: true },
  // Lift a touch, ease off, and pull through to the far side.
  { t: 6.5, x: 0, y: -0.4, h: 2.6, hold: true },
  { t: 6.7, x: 0, y: 0.1, h: 3.0, hold: false },
  { t: 7.0, x: 0, y: 0.85, h: 3.6, hold: false },
  { t: 7.6, x: 0, y: 0.6, h: 8, hold: false },
];

export const DEMO_DURATION = 8.2;

/** Narration beats for the demo, as owner line keys. */
export const DEMO_CUES: ReadonlyArray<{ t: number; key: string }> = [
  { t: 0.3, key: 'demo.fill' },
  { t: 3.8, key: 'demo.drop' },
  { t: 6.35, key: 'demo.pull' },
];

/** Controls for track time `t` (linear between keys, holds step-wise). */
export function controlsAt(
  track: readonly TrackKey[],
  t: number,
  out?: PitcherControls,
): PitcherControls {
  const c = out ?? { targetX: 0, targetY: 0, targetHeight: 7, holding: false };
  const first = track[0];
  if (!first) return c;
  let a = first;
  let b = first;
  for (let i = 0; i < track.length; i++) {
    const k = track[i] as TrackKey;
    if (k.t <= t) {
      a = k;
      b = track[i + 1] ?? k;
    }
  }
  const span = b.t - a.t;
  const u = span > 0 ? Math.min(1, Math.max(0, (t - a.t) / span)) : 0;
  c.targetX = a.x + (b.x - a.x) * u;
  c.targetY = a.y + (b.y - a.y) * u;
  c.targetHeight = a.h + (b.h - a.h) * u;
  c.holding = a.hold;
  return c;
}

/** Run a whole track headless. Used by tests and to sanity-check tuning. */
export function runTrack(
  track: readonly TrackKey[],
  milk: MilkQuality,
  duration = DEMO_DURATION,
): { pour: PourState; pitcher: PitcherState } {
  const pour = createPour();
  const pitcher = createPitcher();
  const first = track[0];
  if (first) {
    pitcher.x = first.x;
    pitcher.y = first.y;
    pitcher.height = first.h;
  }
  const c: PitcherControls = { targetX: 0, targetY: 0, targetHeight: 7, holding: false };
  const steps = Math.round(duration / STEP);
  for (let i = 0; i < steps; i++) {
    controlsAt(track, i * STEP, c);
    stepPourFrame(pour, pitcher, c, milk, STEP);
  }
  return { pour, pitcher };
}
