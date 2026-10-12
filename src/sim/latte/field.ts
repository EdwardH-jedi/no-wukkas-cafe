// Latte-art pour simulation.
//
// The coffee surface is a GRID² field of foam coverage (0 = crema, 1 = white microfoam) over
// the unit disc, in coordinates normalised to the current surface radius. Each fixed step:
//   1. milk leaves the pitcher at `flow`; it lands in the cup, on the rim, or on the counter;
//   2. the stream pushes the surface outward from the impact point (a 2D source flow), drags it
//      along when the pitcher moves, and nudges it forward (the pour's momentum);
//   3. the field is advected semi-Lagrangian along that velocity;
//   4. if the spout is low enough, foam surfaces at the impact point (white); if it is high, the
//      milk dives under the crema and only fills the cup.
// No randomness: the same inputs always produce the same pattern.

import { clamp, smoothstep } from '../math';
import type { MilkQuality } from '../milk';

export const GRID = 128;
export const CELL = 2 / GRID;
/** Cup fill after the espresso shot, in cup volumes. */
export const ESPRESSO_FILL = 0.22;
/** Cup volumes per second at full tilt. */
export const MAX_FLOW = 0.12;
/** Below this height (cm above the surface) foam floats; above SURF_HIGH it sinks. */
export const SURF_LOW = 1.1;
export const SURF_HIGH = 4.6;

/** Physics tuning (field units are surface radii). */
export const PHYSICS = {
  /** Area pushed outward per second at full flow. */
  source: 0.5,
  /** How much of the pitcher's motion the surface follows near the stream. */
  drag: 1.2,
  /** Forward push from the stream's momentum (+y): foam rolls away from the spout. */
  jet: 0.45,
  jetWidth: 0.4,
  /** Length of the stream's wake: foam behind a moving stream follows it (makes the cleft). */
  wake: 0.4,
  /** Half-width of the drag channel either side of the stream. */
  dragWidth: 0.09,
  /** The surface slows to a stop over this distance from the cup wall. */
  wallBand: 0.14,
};

export interface PourInput {
  /** Spout position in cup-rim coordinates: centre (0,0), rim at radius 1, +y = far side. */
  x: number;
  y: number;
  /** Spout height above the coffee surface, cm. */
  height: number;
  /** Stream flow, 0–1 of MAX_FLOW. */
  flow: number;
}

export interface PourState {
  foam: Float32Array;
  tmp: Float32Array;
  tmp2: Float32Array;
  ux: Float32Array;
  uy: Float32Array;
  /** Cup fill in cup volumes (1 = brim). */
  fill: number;
  /** Milk that ended up in the cup. */
  milkIn: number;
  /** Milk that missed the cup or ran over the brim. */
  spill: number;
  /** Part of `spill` that came from overfilling. */
  overflow: number;
  /** Total milk out of the pitcher. */
  poured: number;
  time: number;
  /** Seconds spent pouring with the spout high (milk sinking) after the cup was already 70% full. */
  lateHighTime: number;
  /** Seconds spent pouring outside the cup. */
  missTime: number;
  /** Live flags from the last step, for reactions and sound. */
  missing: boolean;
  overflowing: boolean;
  drawing: boolean;
  pouring: boolean;
  /** Increments whenever the foam field changes. */
  version: number;
  lastFx: number;
  lastFy: number;
  hasLast: boolean;
  vx: number;
  vy: number;
}

export function createPour(): PourState {
  return {
    foam: new Float32Array(GRID * GRID),
    tmp: new Float32Array(GRID * GRID),
    tmp2: new Float32Array(GRID * GRID),
    ux: new Float32Array(GRID * GRID),
    uy: new Float32Array(GRID * GRID),
    fill: ESPRESSO_FILL,
    milkIn: 0,
    spill: 0,
    overflow: 0,
    poured: 0,
    time: 0,
    lateHighTime: 0,
    missTime: 0,
    missing: false,
    overflowing: false,
    drawing: false,
    pouring: false,
    version: 0,
    lastFx: 0,
    lastFy: 0,
    hasLast: false,
    vx: 0,
    vy: 0,
  };
}

/** Radius of the liquid surface (in rim radii) at a given fill; the cup tapers toward the base. */
export function surfaceRadius(fill: number): number {
  return 0.66 + 0.34 * clamp(fill);
}

/** 0 = milk sinks under the crema, 1 = foam floats and draws. */
export function surfacing(height: number): number {
  return 1 - smoothstep(SURF_LOW, SURF_HIGH, height);
}

/** How much white the milk can make, from its texture. */
export function foamAbility(milk: MilkQuality): number {
  return clamp(milk.aeration / 0.26) * (1 - 0.4 * clamp(milk.bubbles));
}

/** Stiff, over-aerated foam piles up instead of flowing. */
function spreadAbility(milk: MilkQuality): number {
  return 1 - 0.55 * clamp((milk.aeration - 0.62) / 0.35);
}

function sample(f: Float32Array, x: number, y: number): number {
  // Field coords → continuous cell index.
  let gx = (x + 1) / CELL - 0.5;
  let gy = (y + 1) / CELL - 0.5;
  if (gx < 0) gx = 0;
  else if (gx > GRID - 1.001) gx = GRID - 1.001;
  if (gy < 0) gy = 0;
  else if (gy > GRID - 1.001) gy = GRID - 1.001;
  const i = gx | 0;
  const j = gy | 0;
  const tx = gx - i;
  const ty = gy - j;
  const k = j * GRID + i;
  const a = f[k] as number;
  const b = f[k + 1] as number;
  const c = f[k + GRID] as number;
  const d = f[k + GRID + 1] as number;
  return (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
}

let cornerMax = 0;
/** Min of the four cells a bilinear sample at (x, y) reads; also sets `cornerMax`. */
function cornerMin(f: Float32Array, x: number, y: number): number {
  let gx = (x + 1) / CELL - 0.5;
  let gy = (y + 1) / CELL - 0.5;
  if (gx < 0) gx = 0;
  else if (gx > GRID - 1.001) gx = GRID - 1.001;
  if (gy < 0) gy = 0;
  else if (gy > GRID - 1.001) gy = GRID - 1.001;
  const k = (gy | 0) * GRID + (gx | 0);
  const a = f[k] as number;
  const b = f[k + 1] as number;
  const c = f[k + GRID] as number;
  const d = f[k + GRID + 1] as number;
  cornerMax = Math.max(a, b, c, d);
  return Math.min(a, b, c, d);
}

/** Advance the pour by `dt` seconds. Mutates `s` in place (typed arrays, no allocation). */
export function stepPour(s: PourState, input: PourInput, milk: MilkQuality, dt: number): void {
  s.time += dt;
  const flow = clamp(input.flow);
  const amount = flow * MAX_FLOW * dt;
  s.pouring = amount > 0;
  s.missing = false;
  s.overflowing = false;
  s.drawing = false;

  const rs = surfaceRadius(s.fill);
  const fx = input.x / rs;
  const fy = input.y / rs;
  // Impact velocity in field units/s (drives the drag); reset when the stream starts.
  if (s.hasLast && s.pouring) {
    const rvx = (fx - s.lastFx) / dt;
    const rvy = (fy - s.lastFy) / dt;
    s.vx += (rvx - s.vx) * 0.5;
    s.vy += (rvy - s.vy) * 0.5;
  } else {
    s.vx = 0;
    s.vy = 0;
  }
  s.lastFx = fx;
  s.lastFy = fy;
  s.hasLast = s.pouring;

  if (!s.pouring) return;

  // Where does the milk land? Inside the rim → cup. Near the rim → partly splashes out.
  const rimDist = Math.hypot(input.x, input.y);
  const inCup = 1 - smoothstep(0.95, 1.04, rimDist);
  const inAmount = amount * inCup;
  s.poured += amount;
  s.spill += amount - inAmount;
  if (inCup < 0.5) {
    s.missing = true;
    s.missTime += dt;
  }
  if (inAmount <= 0) return;

  s.milkIn += inAmount;
  s.fill += inAmount;
  if (s.fill > 1) {
    const over = s.fill - 1;
    s.fill = 1;
    s.overflow += over;
    s.spill += over;
    s.overflowing = true;
  }

  const surf = surfacing(input.height);
  if (surf < 0.3 && s.fill > 0.7) s.lateHighTime += dt;

  // The stream only shapes the surface where it actually lands on it (not on the cup wall).
  const fd = Math.hypot(fx, fy);
  if (fd > 0.985) return;
  const effFlow = flow * inCup;
  const ability = foamAbility(milk);
  const deposit = surf * ability;
  const spread = spreadAbility(milk);
  const r = (0.032 + 0.07 * Math.sqrt(effFlow)) / rs;
  const Q = PHYSICS.source * effFlow * spread * (0.3 + 0.7 * surf);
  const sig = r * 1.7 + 0.03;
  const dragK = PHYSICS.drag * Math.sqrt(effFlow) * spread;
  const jetK = PHYSICS.jet * effFlow;
  const jw2 = PHYSICS.jetWidth * PHYSICS.jetWidth;
  const twoPi = Math.PI * 2;
  const vx = s.vx;
  const vy = s.vy;
  const vlen = Math.hypot(vx, vy);
  const moving = vlen > 0.05;
  const tx = moving ? vx / vlen : 0;
  const ty = moving ? vy / vlen : 0;
  const wake = PHYSICS.wake;
  const dw = PHYSICS.dragWidth + r * 0.5;
  const dw2 = dw * dw;

  // 2. Surface velocity: radial source + drag along the pitcher's motion + forward jet.
  const ux = s.ux;
  const uy = s.uy;
  for (let j = 0; j < GRID; j++) {
    const cy = -1 + (j + 0.5) * CELL;
    for (let i = 0; i < GRID; i++) {
      const k = j * GRID + i;
      const cx = -1 + (i + 0.5) * CELL;
      const rr = cx * cx + cy * cy;
      if (rr > 1) {
        ux[k] = 0;
        uy[k] = 0;
        continue;
      }
      const dx = cx - fx;
      const dy = cy - fy;
      const d2 = dx * dx + dy * dy;
      const d = Math.sqrt(d2) + 1e-6;
      const speed = d < r ? (Q / (twoPi * r)) * (d / r) : Q / (twoPi * d);
      let vxk = (dx / d) * speed;
      let vyk = (dy / d) * speed;
      if (moving) {
        // Anisotropic drag: short reach ahead of the stream, a long wake behind it.
        const along = dx * tx + dy * ty;
        const across = dx * ty - dy * tx;
        const sl = along >= 0 ? sig : wake;
        const e = (along * along) / (sl * sl) + (across * across) / dw2;
        if (e < 9) {
          const g = Math.exp(-e);
          vxk += vx * dragK * g;
          vyk += vy * dragK * g;
        }
      }
      // The jet only pushes what's ahead of (and beside) the spout.
      if (dy > -2 * sig) vyk += jetK * Math.exp(-d2 / jw2);
      const wall = clamp((1 - Math.sqrt(rr)) / PHYSICS.wallBand);
      ux[k] = vxk * wall * dt;
      uy[k] = vyk * wall * dt;
    }
  }

  // 3. MacCormack advection (semi-Lagrangian + error correction, clamped): keeps edges crisp.
  const phi = s.foam;
  const fwd = s.tmp;
  const back = s.tmp2;
  for (let k = 0; k < phi.length; k++) {
    const cx = -1 + ((k % GRID) + 0.5) * CELL;
    const cy = -1 + (((k / GRID) | 0) + 0.5) * CELL;
    fwd[k] =
      cx * cx + cy * cy > 1 ? 0 : sample(phi, cx - (ux[k] as number), cy - (uy[k] as number));
  }
  for (let k = 0; k < phi.length; k++) {
    const cx = -1 + ((k % GRID) + 0.5) * CELL;
    const cy = -1 + (((k / GRID) | 0) + 0.5) * CELL;
    back[k] =
      cx * cx + cy * cy > 1 ? 0 : sample(fwd, cx + (ux[k] as number), cy + (uy[k] as number));
  }
  for (let k = 0; k < phi.length; k++) {
    const cx = -1 + ((k % GRID) + 0.5) * CELL;
    const cy = -1 + (((k / GRID) | 0) + 0.5) * CELL;
    if (cx * cx + cy * cy > 1) {
      back[k] = 0;
      continue;
    }
    let v = (fwd[k] as number) + 0.5 * ((phi[k] as number) - (back[k] as number));
    // Limiter: stay within the values the backtrace interpolated from.
    const lo = cornerMin(phi, cx - (ux[k] as number), cy - (uy[k] as number));
    const hi = cornerMax;
    if (v < lo) v = lo;
    else if (v > hi) v = hi;
    back[k] = v;
  }
  s.foam = back;
  s.tmp2 = phi;
  const foam = s.foam;

  // 4. Foam surfaces (or the stream drowns what is already there).
  const reach = r * 1.6;
  const i0 = Math.max(0, Math.floor((fx - reach + 1) / CELL));
  const i1 = Math.min(GRID - 1, Math.ceil((fx + reach + 1) / CELL));
  const j0 = Math.max(0, Math.floor((fy - reach + 1) / CELL));
  const j1 = Math.min(GRID - 1, Math.ceil((fy + reach + 1) / CELL));
  const rate = 1 - Math.exp(-28 * dt * (0.35 + effFlow));
  const drown = surf < 0.2 ? 3.5 * dt * effFlow * (1 - surf / 0.2) : 0;
  for (let j = j0; j <= j1; j++) {
    const cy = -1 + (j + 0.5) * CELL;
    for (let i = i0; i <= i1; i++) {
      const cx = -1 + (i + 0.5) * CELL;
      if (cx * cx + cy * cy > 1) continue;
      const d = Math.hypot(cx - fx, cy - fy);
      if (d > reach) continue;
      const w = 1 - smoothstep(r * 0.55, reach, d);
      const k = j * GRID + i;
      const cur = foam[k] as number;
      if (deposit > cur) {
        foam[k] = cur + (deposit - cur) * rate * w;
        if (deposit > 0.5) s.drawing = true;
      } else if (drown > 0) {
        foam[k] = cur * (1 - drown * w);
      }
    }
  }

  // Thin, under-aerated milk can't hold its shape: white slowly sinks back.
  const decay = clamp((0.2 - milk.aeration) / 0.2) * 0.5 * dt;
  if (decay > 0) for (let k = 0; k < foam.length; k++) foam[k] = (foam[k] as number) * (1 - decay);

  s.version++;
}

/** Foam coverage at field point (x, y); handy for tests and the inspection overlay. */
export function foamAt(s: PourState, x: number, y: number): number {
  return sample(s.foam, x, y);
}
