// Deterministic judging of the poured pattern. Works only from the foam field (what is
// actually on the coffee), never from how the player moved.
//
//   shape      IoU against a heart template (best rotation within ±20°, scale and offset),
//              plus two heart features a blob doesn't have: a cleft and a pointed tip
//   symmetry   mirror the white area across the heart's own axis
//   position   how close the pattern's centroid is to the cup centre
//   definition crisp white vs muddy beige

import { band, clamp } from '../math';
import { CELL, GRID } from './field';
import { heartTemplate, inHeart, type HeartTemplate } from './heart';

export const FOAM_THRESHOLD = 0.5;
const MAX_ANGLE = (20 * Math.PI) / 180;
const ANGLES = 9;
const SCALES = [0.9, 0.95, 1, 1.05, 1.1];
const OFFSETS = [-0.06, -0.03, 0, 0.03, 0.06];

export interface PatternScore {
  /** White area / surface area. */
  coverage: number;
  iou: number;
  /** Cleft depth / pattern height. */
  notchDepth: number;
  /** Width near the tip / max width. */
  tipRatio: number;
  /** Cleft depth relative to the template's (1 = textbook). */
  notchRatio: number;
  notch: number;
  tip: number;
  /** Has both a cleft and a tip, 0–1. */
  heartness: number;
  size: number;
  shape: number;
  symmetryIoU: number;
  symmetry: number;
  /** Centroid distance from the cup centre, in surface radii. */
  offCentre: number;
  /** Centroid of the white, field coordinates (+x = the barista's right, +y = far side). */
  cx: number;
  cy: number;
  /** Of the white with no mirror image across the heart's axis, (right − left) / all of it:
   *  + = the right side is the heavier one. */
  balance: number;
  position: number;
  crispRatio: number;
  definition: number;
  /** Overall art quality, 0–1. */
  art: number;
  /** Best-fit heart transform (for the owner's overlay): rotation, centre, scale. */
  fit: { angle: number; x: number; y: number; scale: number };
}

interface Features {
  notchDepth: number;
  tipRatio: number;
}

/** Cleft and tip measurements of a binary mask in a frame aligned with the heart axis. */
function features(
  cells: ArrayLike<number>,
  count: number,
  cx: number,
  cy: number,
  angle: number,
): Features {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  let uMin = Infinity;
  let uMax = -Infinity;
  let vMin = Infinity;
  let vMax = -Infinity;
  const us = new Float32Array(count);
  const vs = new Float32Array(count);
  for (let n = 0; n < count; n++) {
    const k = cells[n] as number;
    const dx = -1 + ((k % GRID) + 0.5) * CELL - cx;
    const dy = -1 + (Math.floor(k / GRID) + 0.5) * CELL - cy;
    const u = dx * cos + dy * sin;
    const v = -dx * sin + dy * cos;
    us[n] = u;
    vs[n] = v;
    if (u < uMin) uMin = u;
    if (u > uMax) uMax = u;
    if (v < vMin) vMin = v;
    if (v > vMax) vMax = v;
  }
  const W = uMax - uMin + CELL;
  const H = vMax - vMin + CELL;
  const bin = CELL * 1.6;
  // Top edge (toward the barista, -v) of the shape across lateral bins.
  const bins = Math.max(3, Math.ceil(W / CELL));
  const top = new Float32Array(bins).fill(Infinity);
  for (let n = 0; n < count; n++) {
    const b = Math.min(bins - 1, Math.floor(((us[n] as number) - uMin) / CELL));
    if ((vs[n] as number) < (top[b] as number)) top[b] = vs[n] as number;
  }
  // Deepest cleft in the middle 40%, measured against the higher lobe on each side.
  // Convex shapes (blobs) come out negative everywhere.
  let notchDepth = -1;
  const c0 = Math.floor(bins * 0.3);
  const c1 = Math.ceil(bins * 0.7);
  for (let c = c0; c <= c1; c++) {
    const here = top[c] as number;
    if (here === Infinity) continue;
    let left = Infinity;
    let right = Infinity;
    for (let b = 0; b < c - 1; b++) if ((top[b] as number) < left) left = top[b] as number;
    for (let b = c + 2; b < bins; b++) if ((top[b] as number) < right) right = top[b] as number;
    if (left === Infinity || right === Infinity) continue;
    const depth = (here - Math.max(left, right)) / H;
    if (depth > notchDepth) notchDepth = depth;
  }
  const widthAt = (v0: number): number => {
    let lo = Infinity;
    let hi = -Infinity;
    for (let n = 0; n < count; n++) {
      if (Math.abs((vs[n] as number) - v0) < bin) {
        const u = us[n] as number;
        if (u < lo) lo = u;
        if (u > hi) hi = u;
      }
    }
    return hi >= lo ? hi - lo + CELL : 0;
  };
  const tipRatio = widthAt(vMin + 0.86 * H) / W;
  return { notchDepth, tipRatio };
}

interface Calibration {
  notchDepth: number;
  tipRatio: number;
}

let calib: Calibration | null = null;
/** Measure the template itself once, so feature scores are relative to a perfect heart. */
function calibration(t: HeartTemplate): Calibration {
  if (calib) return calib;
  const scale = 1.1; // ≈ 38% coverage
  const cells: number[] = [];
  for (let k = 0; k < GRID * GRID; k++) {
    const x = -1 + ((k % GRID) + 0.5) * CELL;
    const y = -1 + (Math.floor(k / GRID) + 0.5) * CELL;
    if (inHeart(t, x / scale, y / scale)) cells.push(k);
  }
  let cx = 0;
  let cy = 0;
  for (const k of cells) {
    cx += -1 + ((k % GRID) + 0.5) * CELL;
    cy += -1 + (Math.floor(k / GRID) + 0.5) * CELL;
  }
  calib = features(cells, cells.length, cx / cells.length, cy / cells.length, 0);
  return calib;
}

const EMPTY_FIT = { angle: 0, x: 0, y: 0, scale: 0 };

export function scorePattern(foam: Float32Array): PatternScore {
  const t = heartTemplate();
  const cal = calibration(t);
  const mask = new Uint8Array(GRID * GRID);
  const cells: number[] = [];
  let disc = 0;
  let soft = 0;
  let crisp = 0;
  let sx = 0;
  let sy = 0;
  for (let j = 0; j < GRID; j++) {
    const y = -1 + (j + 0.5) * CELL;
    for (let i = 0; i < GRID; i++) {
      const x = -1 + (i + 0.5) * CELL;
      if (x * x + y * y > 1) continue;
      disc++;
      const k = j * GRID + i;
      const f = foam[k] as number;
      if (f > 0.12) soft++;
      if (f > 0.7) crisp++;
      if (f > FOAM_THRESHOLD) {
        mask[k] = 1;
        cells.push(k);
        sx += x;
        sy += y;
      }
    }
  }
  const A = cells.length;
  const coverage = A / disc;
  const crispRatio = soft > 0 ? crisp / soft : 0;
  if (A < 12) {
    return {
      coverage,
      iou: 0,
      notchDepth: 0,
      tipRatio: 1,
      notchRatio: 0,
      notch: 0,
      tip: 0,
      heartness: 0,
      size: 0,
      shape: 0,
      symmetryIoU: 0,
      symmetry: 0,
      offCentre: 1,
      cx: A > 0 ? sx / A : 0,
      cy: A > 0 ? sy / A : 0,
      balance: 0,
      position: 0,
      crispRatio,
      definition: 0,
      art: 0,
      fit: EMPTY_FIT,
    };
  }
  const cx = sx / A;
  const cy = sy / A;
  const s0 = Math.sqrt(A * CELL * CELL);

  // Best-fit heart: search rotation, scale and an offset along the heart's axis.
  let best = -1;
  let fit = EMPTY_FIT;
  for (let ai = 0; ai < ANGLES; ai++) {
    const angle = -MAX_ANGLE + (2 * MAX_ANGLE * ai) / (ANGLES - 1);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    for (const sk of SCALES) {
      const s = s0 * sk;
      const reach = s * t.extent * 1.42;
      for (const off of OFFSETS) {
        // Offset along the tip axis (template +y rotated by angle).
        const ox = cx - sin * off * s;
        const oy = cy + cos * off * s;
        const i0 = Math.max(0, Math.floor((ox - reach + 1) / CELL));
        const i1 = Math.min(GRID - 1, Math.ceil((ox + reach + 1) / CELL));
        const j0 = Math.max(0, Math.floor((oy - reach + 1) / CELL));
        const j1 = Math.min(GRID - 1, Math.ceil((oy + reach + 1) / CELL));
        let inter = 0;
        let uni = 0;
        let maskIn = 0;
        for (let j = j0; j <= j1; j++) {
          const dy = -1 + (j + 0.5) * CELL - oy;
          for (let i = i0; i <= i1; i++) {
            const dx = -1 + (i + 0.5) * CELL - ox;
            const m = mask[j * GRID + i] === 1;
            const h = inHeart(t, (dx * cos + dy * sin) / s, (-dx * sin + dy * cos) / s);
            if (m) maskIn++;
            if (m && h) inter++;
            if (m || h) uni++;
          }
        }
        uni += A - maskIn;
        const iou = inter / uni;
        if (iou > best) {
          best = iou;
          fit = { angle, x: ox, y: oy, scale: s };
        }
      }
    }
  }

  const f = features(cells, A, cx, cy, fit.angle);
  // A cleft about as deep as the template's is ideal; none = blob, too deep = cut in half.
  const notchRatio = f.notchDepth / cal.notchDepth;
  const notch = band(notchRatio, 0.55, 1.9, 0.5, 1.6);
  const tip = clamp((0.66 - f.tipRatio) / (0.66 - Math.min(0.6, cal.tipRatio * 1.25)));
  const iouS = clamp((best - 0.68) / (0.9 - 0.68));
  const size = 0.35 + 0.65 * band(coverage, 0.2, 0.55, 0.14, 0.3);
  // A heart needs both a cleft and a tip; a round blob fits a round template well but has neither.
  const heartness = 0.6 * Math.sqrt(notch * tip) + 0.2 * (notch + tip);
  const shape = (0.45 * iouS + 0.55 * heartness) * size;

  // Mirror symmetry across the fitted axis through the centroid.
  const cos = Math.cos(fit.angle);
  const sin = Math.sin(fit.angle);
  let match = 0;
  let unmatched = 0;
  let side = 0;
  for (const k of cells) {
    const dx = -1 + ((k % GRID) + 0.5) * CELL - cx;
    const dy = -1 + (Math.floor(k / GRID) + 0.5) * CELL - cy;
    const lateral = dx * cos + dy * sin;
    const u = -lateral;
    const v = -dx * sin + dy * cos;
    const mx = cx + u * cos - v * sin;
    const my = cy + u * sin + v * cos;
    const mi = Math.floor((mx + 1) / CELL);
    const mj = Math.floor((my + 1) / CELL);
    if (mi >= 0 && mj >= 0 && mi < GRID && mj < GRID && mask[mj * GRID + mi] === 1) match++;
    else {
      // White with nothing opposite it: the side it's on is the heavier one.
      unmatched++;
      if (lateral > 0) side++;
      else side--;
    }
  }
  const symmetryIoU = match / (2 * A - match);
  const symmetry = clamp((symmetryIoU - 0.55) / (0.9 - 0.55));

  const offCentre = Math.hypot(cx, cy);
  const position = clamp(1 - (offCentre - 0.08) / 0.32);
  const definition = clamp((crispRatio - 0.5) / (0.84 - 0.5));

  // Symmetry, centring and crispness only count once it's recognisably a heart.
  const gate = clamp((heartness * size) / 0.6);
  const art = clamp(0.6 * shape + gate * (0.2 * symmetry + 0.1 * position + 0.1 * definition));

  return {
    coverage,
    iou: best,
    notchDepth: f.notchDepth,
    tipRatio: f.tipRatio,
    notchRatio,
    notch,
    tip,
    heartness,
    size,
    shape,
    symmetryIoU,
    symmetry,
    offCentre,
    cx,
    cy,
    balance: unmatched > 0 ? side / unmatched : 0,
    position,
    crispRatio,
    definition,
    art,
    fit,
  };
}
