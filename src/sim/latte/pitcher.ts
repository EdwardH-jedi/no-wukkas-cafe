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
/** Tilt per second while held / released. */
export const TILT_UP = 1.0;
export const TILT_DOWN = 2.4;
/** Milk only reaches the spout past this tilt. */
export const LIP = 0.12;
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
}

export function createPitcher(): PitcherState {
  return { x: 0, y: -0.2, height: HEIGHT_START, tilt: 0, milk: PITCHER_MILK };
}

export function stepPitcher(p: PitcherState, c: PitcherControls, dt: number): void {
  const k = 1 - Math.exp(-dt / FOLLOW);
  p.x += (c.targetX - p.x) * k;
  p.y += (c.targetY - p.y) * k;
  const th = clamp(c.targetHeight, HEIGHT_MIN, HEIGHT_MAX);
  const dh = th - p.height;
  const maxStep = HEIGHT_SPEED * dt;
  p.height += Math.abs(dh) <= maxStep ? dh : Math.sign(dh) * maxStep;
  p.tilt = clamp(p.tilt + (c.holding ? TILT_UP : -TILT_DOWN) * dt);
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
