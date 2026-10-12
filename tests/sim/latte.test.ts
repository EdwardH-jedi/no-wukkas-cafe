import { describe, expect, it } from 'vitest';
import { STEP } from '../../src/core/clock';
import { scoreAttempt } from '../../src/sim/attempt';
import { scoreEspresso, createEspresso } from '../../src/sim/espresso';
import { CELL, createPour, GRID, stepPour, surfacing } from '../../src/sim/latte/field';
import { controlsAt, OWNER_DEMO, runTrack, type TrackKey } from '../../src/sim/latte/demo';
import { heartTemplate, inHeart } from '../../src/sim/latte/heart';
import {
  createPitcher,
  HEIGHT_PRESETS,
  pitcherFlow,
  stepPitcher,
  stepPourFrame,
} from '../../src/sim/latte/pitcher';
import { scorePattern } from '../../src/sim/latte/score';
import { SILKY_MILK } from '../../src/sim/milk';
import { scoreMilk } from '../../src/sim/steam';

const cellXY = (k: number): [number, number] => [
  -1 + ((k % GRID) + 0.5) * CELL,
  -1 + (Math.floor(k / GRID) + 0.5) * CELL,
];

function field(fn: (x: number, y: number) => number): Float32Array {
  const f = new Float32Array(GRID * GRID);
  for (let k = 0; k < f.length; k++) {
    const [x, y] = cellXY(k);
    f[k] = x * x + y * y <= 1 ? fn(x, y) : 0;
  }
  return f;
}

const demo = runTrack(OWNER_DEMO, SILKY_MILK);
const demoScore = scorePattern(demo.pour.foam);

function perfectEspresso() {
  const e = createEspresso();
  e.dose = 19;
  e.shotTime = 28;
  return scoreEspresso(e);
}

describe('owner demo track (same physics as the player)', () => {
  it('pours a heart that scores as one', () => {
    expect(demoScore.heartness).toBeGreaterThan(0.85);
    expect(demoScore.art).toBeGreaterThanOrEqual(0.85);
    expect(demoScore.coverage).toBeGreaterThan(0.25);
    expect(demoScore.coverage).toBeLessThan(0.5);
  });

  it('proves "Hired" (85+) is reachable with the real controls', () => {
    const r = scoreAttempt(demoScore, demo.pour, scoreMilk(SILKY_MILK), perfectEspresso());
    expect(r.valid).toBe(true);
    expect(r.total).toBeGreaterThanOrEqual(85);
    expect(r.band).toBe('hired');
  });

  it('fills the cup without spilling', () => {
    expect(demo.pour.fill).toBeGreaterThan(0.88);
    expect(demo.pour.spill).toBe(0);
  });

  it('is deterministic: the same inputs give the same pattern and score', () => {
    const again = runTrack(OWNER_DEMO, SILKY_MILK);
    expect(Array.from(again.pour.foam)).toEqual(Array.from(demo.pour.foam));
    expect(scorePattern(again.pour.foam)).toEqual(demoScore);
  });
});

describe('scorePattern', () => {
  it('scores the template heart itself near 100%', () => {
    const t = heartTemplate();
    const s = scorePattern(field((x, y) => (inHeart(t, x / 1.1, y / 1.1) ? 1 : 0)));
    expect(s.iou).toBeGreaterThan(0.95);
    expect(s.art).toBeGreaterThan(0.95);
  });

  it('gives a blank cup nothing', () => {
    const s = scorePattern(new Float32Array(GRID * GRID));
    expect(s.art).toBe(0);
    expect(s.coverage).toBe(0);
  });

  it('does not reward a crisp, centred round blob as a heart', () => {
    const s = scorePattern(field((x, y) => (x * x + y * y < 0.36 ? 1 : 0)));
    expect(s.heartness).toBeLessThan(0.2);
    expect(s.art).toBeLessThan(0.45);
  });

  it('does not reward whiting out the whole cup', () => {
    const s = scorePattern(field(() => 1));
    expect(s.art).toBeLessThan(0.3);
  });

  it('marks a heart poured near the rim as off centre', () => {
    const shifted: TrackKey[] = OWNER_DEMO.map((k) => ({ ...k, x: k.x + 0.45 }));
    const s = scorePattern(runTrack(shifted, SILKY_MILK).pour.foam);
    expect(s.position).toBeLessThan(0.3);
    expect(s.art).toBeLessThan(demoScore.art);
  });

  it('loses symmetry when one lobe is missing', () => {
    const half = demo.pour.foam.slice();
    for (let k = 0; k < half.length; k++) {
      const [x, y] = cellXY(k);
      if (x > 0.05 && y < 0) half[k] = 0;
    }
    const s = scorePattern(half);
    expect(s.symmetry).toBeLessThan(demoScore.symmetry - 0.3);
  });

  it('treats beige (half-mixed) foam as muddy', () => {
    const mud = demo.pour.foam.map((v) => v * 0.6);
    const s = scorePattern(mud);
    expect(s.definition).toBeLessThan(0.3);
  });
});

describe('pour physics', () => {
  it('sinks milk poured from high up: the cup fills but no white appears', () => {
    const high: TrackKey[] = OWNER_DEMO.map((k) => ({ ...k, h: Math.max(k.h, 6.5) }));
    const { pour } = runTrack(high, SILKY_MILK);
    expect(pour.fill).toBeGreaterThan(0.85);
    expect(scorePattern(pour.foam).coverage).toBeLessThan(0.02);
    expect(surfacing(6.5)).toBe(0);
    expect(surfacing(0.5)).toBe(1);
  });

  it('counts milk poured outside the rim as spill', () => {
    const pour = createPour();
    for (let i = 0; i < 60; i++)
      stepPour(pour, { x: 1.4, y: 0, height: 3, flow: 1 }, SILKY_MILK, STEP);
    expect(pour.spill).toBeGreaterThan(0.1);
    expect(pour.milkIn).toBe(0);
    expect(pour.missing).toBe(true);
    expect(pour.missTime).toBeGreaterThan(0.9);
  });

  it('overflows past the brim', () => {
    const pour = createPour();
    for (let i = 0; i < 60 * 9; i++)
      stepPour(pour, { x: 0, y: 0, height: 6, flow: 1 }, SILKY_MILK, STEP);
    expect(pour.fill).toBe(1);
    expect(pour.overflow).toBeGreaterThan(0.1);
  });

  it('flat (unstretched) milk cannot draw', () => {
    const flat = { temp: 60, aeration: 0.03, bubbles: 0 };
    const { pour } = runTrack(OWNER_DEMO, flat);
    expect(scorePattern(pour.foam).art).toBeLessThan(0.3);
  });

  it('a pull-through that stops short leaves no tip', () => {
    const short: TrackKey[] = OWNER_DEMO.map((k) =>
      k.t >= 6.7 ? { ...k, y: Math.min(k.y, 0.15) } : { ...k },
    );
    const s = scorePattern(runTrack(short, SILKY_MILK).pour.foam);
    expect(s.tip).toBeLessThan(0.5);
  });

  it('no pull-through at all leaves a blob', () => {
    const blob: TrackKey[] = OWNER_DEMO.map((k) =>
      k.t >= 6.4 ? { ...k, x: 0, y: -0.35, h: k.hold ? 0.7 : 8 } : { ...k },
    );
    const s = scorePattern(runTrack(blob, SILKY_MILK).pour.foam);
    expect(s.heartness).toBeLessThan(0.4);
    expect(s.art).toBeLessThan(0.5);
  });
});

describe('trackpad-style pour (Space to tip, height only from the 1/2/3 presets)', () => {
  // Height jumps between presets (the jug then moves there at its own speed); position moves in a
  // straight line, as a one-finger trackpad drag would. No simultaneous click-and-scroll needed.
  const [HIGH, LIFT, LOW] = HEIGHT_PRESETS;
  const track: TrackKey[] = [
    { t: 0.0, x: 0, y: -0.3, h: HIGH, hold: false },
    { t: 0.5, x: 0, y: -0.3, h: HIGH, hold: true },
    { t: 3.6, x: 0, y: -0.35, h: HIGH, hold: true },
    { t: 3.6001, x: 0, y: -0.35, h: LOW, hold: true },
    { t: 6.4, x: 0, y: -0.35, h: LOW, hold: true },
    { t: 6.4001, x: 0, y: -0.38, h: LIFT, hold: true },
    { t: 6.6, x: 0, y: 0.1, h: LIFT, hold: false },
    { t: 6.95, x: 0, y: 0.85, h: LIFT, hold: false },
    { t: 7.4, x: 0, y: 0.6, h: HIGH, hold: false },
  ];

  it('still pours a recognisable heart', () => {
    const { pour } = runTrack(track, SILKY_MILK);
    const s = scorePattern(pour.foam);
    expect(s.heartness).toBeGreaterThan(0.7);
    expect(s.art).toBeGreaterThan(0.75);
    expect(pour.spill).toBe(0);
  });
});

describe('pitcher controls', () => {
  it('tips progressively while held and back when released', () => {
    const p = createPitcher();
    const c = { targetX: 0, targetY: 0, targetHeight: 5, holding: true };
    stepPitcher(p, c, 0.1);
    expect(pitcherFlow(p)).toBe(0); // milk hasn't reached the lip yet
    for (let i = 0; i < 60; i++) stepPitcher(p, c, STEP);
    expect(pitcherFlow(p)).toBeGreaterThan(0.9);
    c.holding = false;
    for (let i = 0; i < 30; i++) stepPitcher(p, c, STEP);
    expect(pitcherFlow(p)).toBe(0);
  });

  it('follows the pointer smoothly rather than teleporting', () => {
    const p = createPitcher();
    const c = { targetX: 0.6, targetY: 0.4, targetHeight: 5, holding: false };
    stepPitcher(p, c, STEP);
    expect(p.x).toBeGreaterThan(0);
    expect(p.x).toBeLessThan(0.6);
    for (let i = 0; i < 60; i++) stepPitcher(p, c, STEP);
    expect(p.x).toBeCloseTo(0.6, 2);
  });

  it('runs dry and stops pouring', () => {
    const pour = createPour();
    const p = createPitcher();
    const c = { targetX: 0, targetY: 0, targetHeight: 6, holding: true };
    for (let i = 0; i < 60 * 14; i++) stepPourFrame(pour, p, c, SILKY_MILK, STEP);
    expect(p.milk).toBe(0);
    expect(pour.poured).toBeCloseTo(1, 2);
  });

  it('controlsAt interpolates position and steps the hold flag', () => {
    const c = controlsAt(OWNER_DEMO, 0.25);
    expect(c.holding).toBe(false);
    expect(controlsAt(OWNER_DEMO, 1).holding).toBe(true);
  });
});
