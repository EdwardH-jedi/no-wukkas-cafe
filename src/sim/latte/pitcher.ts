// The milk pitcher as the player controls it. Position follows the pointer with a little lag
// (smooth, but responsive), height moves at a finite speed, and holding the pour button tips
// the pitcher progressively: the longer you hold, the heavier the stream. Let go and it tips
// back, so feathering the button gives a thinner stream.

import { clamp } from '../math';
import type { MilkQuality } from '../milk';
import { MAX_FLOW, stepPour, type PourInput, type PourState } from './field';

/** Milk in the pitcher at the start of a pour, in cup volumes. Enough to overfill if careless. */
export const PITCHER_MILK = 1.0;
export const HEIGHT_MIN = 0.4;
export const HEIGHT_MAX = 10;
export const HEIGHT_START = 7;
/** One-key heights (keys 1/2/3): high to fill, a lift for the pull-through, low to draw. Lets a
 *  trackpad player pour with Space and steer with one finger, no click-and-scroll needed. */
export const HEIGHT_PRESETS = [7, 3, 0.8] as const;
/** Tilt per second while held / released. */
export const TILT_UP = 1.0;
export const TILT_DOWN = 2.4;
/** Milk only reaches the spout past this tilt. */
export const LIP = 0.12;
/** The pull-through: once the jug has been down low, lifting it back to the LIFT preset while
 *  still holding thins the stream to this tilt (flow ≈ 0.34), so "lift, keep pouring and sweep"
 *  draws the point without a mouse button having to "ease off". */
export const PULL_TILT_CAP = 0.42;
const LIFT = HEIGHT_PRESETS[1];
/** How far from the cup centre the spout can be aimed, in rim radii: past the rim (a careless pour
 *  still lands on the bench) but never off the mat or out of the close-up. */
export const AIM_LIMIT = 1.6;
const FOLLOW = 0.045; // s, position smoothing time constant
const HEIGHT_SPEED = 28; // cm/s

export interface PitcherControls {
  /** Where the spout should be, in cup-rim coordinates. */
  targetX: number;
  targetY: number;
  /** Desired spout height above the coffee, cm. */
  targetHeight: number;
  /** Pour button held. */
  holding: boolean;
}

export interface PitcherState {
  x: number;
  y: number;
  height: number;
  tilt: number;
  /** Milk left, in cup volumes. */
  milk: number;
  /** The jug has been below the lift height this pour (drawing), so lifting it back up is the
   *  pull-through, not the fill. */
  lowered: boolean;
}

export function createPitcher(): PitcherState {
  return { x: 0, y: -0.2, height: HEIGHT_START, tilt: 0, milk: PITCHER_MILK, lowered: false };
}

/** What one step of player input says about the jug (Day 1's TrialInput and Day 2's RushInput
 *  both carry these fields). */
export interface PourControlInput {
  /** The pointer is over the pour plane: aim at (cupX, cupY), in cup-rim coordinates. */
  hasCup: boolean;
  cupX: number;
  cupY: number;
  /** Height change requested since the last step (scroll/keys), cm. */
  heightDelta: number;
  /** Jump the target height to this preset (cm), or null. */
  heightPreset: number | null;
  /** Pour button held. */
  holding: boolean;
}

/** Guards against accidental pours: a button already held when the pour began (clicking through
 *  Gaz's line, holding on from the demo or the steam) only pours once it has been let go. */
export interface PourGate {
  armed: boolean;
}

export function createPourGate(): PourGate {
  return { armed: false };
}

/** Keep the aim within AIM_LIMIT of the cup centre (radially). */
export function limitAim(c: PitcherControls): void {
  const d = Math.hypot(c.targetX, c.targetY);
  if (d > AIM_LIMIT) {
    c.targetX *= AIM_LIMIT / d;
    c.targetY *= AIM_LIMIT / d;
  }
}

/** Turn one step of player input into pitcher controls, within the jug's limits. */
export function applyPourInput(c: PitcherControls, gate: PourGate, input: PourControlInput): void {
  if (input.hasCup) {
    c.targetX = input.cupX;
    c.targetY = input.cupY;
    limitAim(c);
  }
  if (input.heightPreset !== null) c.targetHeight = input.heightPreset;
  c.targetHeight = clamp(c.targetHeight + input.heightDelta, HEIGHT_MIN, HEIGHT_MAX);
  if (!input.holding) gate.armed = true;
  c.holding = input.holding && gate.armed;
}

/** Index into HEIGHT_PRESETS of the preset nearest a height (what key "1/2/3" it's closest to). */
export function nearestPreset(height: number): number {
  let best = 0;
  for (let i = 1; i < HEIGHT_PRESETS.length; i++)
    if (
      Math.abs((HEIGHT_PRESETS[i] as number) - height) <
      Math.abs((HEIGHT_PRESETS[best] as number) - height)
    )
      best = i;
  return best;
}

export function stepPitcher(p: PitcherState, c: PitcherControls, dt: number): void {
  const k = 1 - Math.exp(-dt / FOLLOW);
  p.x += (c.targetX - p.x) * k;
  p.y += (c.targetY - p.y) * k;
  const th = clamp(c.targetHeight, HEIGHT_MIN, HEIGHT_MAX);
  const dh = th - p.height;
  const maxStep = HEIGHT_SPEED * dt;
  // Lands exactly on the target, so a jug sent to the LIFT preset is at it, not a rounding error
  // under it.
  p.height = Math.abs(dh) <= maxStep ? th : p.height + Math.sign(dh) * maxStep;
  const lifted = p.height >= LIFT;
  if (!lifted) p.lowered = true;
  if (c.holding && p.lowered && lifted)
    p.tilt =
      p.tilt > PULL_TILT_CAP
        ? Math.max(PULL_TILT_CAP, p.tilt - TILT_DOWN * dt)
        : Math.min(PULL_TILT_CAP, p.tilt + TILT_UP * dt);
  else p.tilt = clamp(p.tilt + (c.holding ? TILT_UP : -TILT_DOWN) * dt);
}

/** Stream flow 0–1 from the pitcher's tilt. */
export function pitcherFlow(p: PitcherState): number {
  if (p.milk <= 0) return 0;
  return clamp((p.tilt - LIP) / (1 - LIP));
}

export function pourInput(p: PitcherState): PourInput {
  return { x: p.x, y: p.y, height: p.height, flow: pitcherFlow(p) };
}

/** One fixed step of pouring: move the pitcher, pour, and drain it. */
export function stepPourFrame(
  pour: PourState,
  pitcher: PitcherState,
  controls: PitcherControls,
  milk: MilkQuality,
  dt: number,
): void {
  stepPitcher(pitcher, controls, dt);
  const input = pourInput(pitcher);
  const wanted = input.flow * MAX_FLOW * dt;
  if (wanted > pitcher.milk) input.flow = pitcher.milk / (MAX_FLOW * dt);
  stepPour(pour, input, milk, dt);
  pitcher.milk = Math.max(0, pitcher.milk - input.flow * MAX_FLOW * dt);
}
