import { describe, expect, it } from 'vitest';
import { STEP } from '../../src/core/clock';
import { createRng } from '../../src/core/rng';
import { createPour } from '../../src/sim/latte/field';
import {
  AIM_LIMIT,
  applyPourInput,
  createPitcher,
  createPourGate,
  HEIGHT_MAX,
  HEIGHT_MIN,
  HEIGHT_PRESETS,
  limitAim,
  LIP,
  nearestPreset,
  pitcherFlow,
  PULL_TILT_CAP,
  stepPitcher,
  stepPourFrame,
  TILT_DOWN,
  type PitcherControls,
  type PitcherState,
  type PourControlInput,
} from '../../src/sim/latte/pitcher';
import { SILKY_MILK } from '../../src/sim/milk';

const controls = (): PitcherControls => ({
  targetX: 0,
  targetY: -0.2,
  targetHeight: 7,
  holding: false,
});
const input = (over: Partial<PourControlInput> = {}): PourControlInput => ({
  hasCup: true,
  cupX: 0,
  cupY: 0,
  heightDelta: 0,
  heightPreset: null,
  holding: false,
  ...over,
});

describe('pull-through: lifted after drawing low, the stream thins', () => {
  const [HIGH, LIFT, LOW] = HEIGHT_PRESETS;
  const run = (p: PitcherState, c: PitcherControls, seconds: number): void => {
    for (let i = 0; i < Math.round(seconds / STEP); i++) stepPitcher(p, c, STEP);
  };
  /** A jug that has drawn low at full tilt, still held. */
  const drawn = (): { p: PitcherState; c: PitcherControls } => {
    const p = createPitcher();
    const c = { ...controls(), targetHeight: LOW, holding: true };
    run(p, c, 1.5);
    return { p, c };
  };

  it('filling from up high is never thinned (the jug has not been low yet)', () => {
    const p = createPitcher();
    const c: PitcherControls = { ...controls(), targetHeight: HIGH, holding: true };
    run(p, c, 1.5);
    expect(pitcherFlow(p)).toBe(1);
    c.targetHeight = LIFT;
    run(p, c, 0.5);
    expect(pitcherFlow(p)).toBe(1);
  });

  it('lifted to [2] after drawing low, holding pours a thin stream', () => {
    const { p, c } = drawn();
    expect(pitcherFlow(p)).toBe(1);
    c.targetHeight = LIFT;
    run(p, c, 1);
    expect(p.tilt).toBeCloseTo(PULL_TILT_CAP, 9);
    expect(pitcherFlow(p)).toBeGreaterThan(0.3);
    expect(pitcherFlow(p)).toBeLessThan(0.4);
  });

  it('thins at the let-go rate, not all at once', () => {
    const { p, c } = drawn();
    c.targetHeight = LIFT;
    for (let i = 0; i < 60 && p.tilt === 1; i++) stepPitcher(p, c, STEP);
    expect(p.tilt).toBeCloseTo(1 - TILT_DOWN * STEP, 9);
    stepPitcher(p, c, STEP);
    expect(p.tilt).toBeCloseTo(1 - 2 * TILT_DOWN * STEP, 9);
  });

  it('below the lift height nothing changes', () => {
    const { p, c } = drawn();
    c.targetHeight = LIFT - 0.5;
    run(p, c, 1);
    expect(pitcherFlow(p)).toBe(1);
  });

  it('letting go still stops the stream', () => {
    const { p, c } = drawn();
    c.targetHeight = LIFT;
    run(p, c, 1);
    c.holding = false;
    run(p, c, (PULL_TILT_CAP - LIP) / TILT_DOWN + 2 * STEP);
    expect(pitcherFlow(p)).toBe(0);
  });
});

describe('pour controls: boundaries', () => {
  it('aim is limited to AIM_LIMIT from the cup centre, keeping its direction', () => {
    const c = controls();
    c.targetX = 3;
    c.targetY = 4;
    limitAim(c);
    expect(Math.hypot(c.targetX, c.targetY)).toBeCloseTo(AIM_LIMIT, 9);
    expect(c.targetX / c.targetY).toBeCloseTo(3 / 4, 9);
    // Inside the limit (including just past the rim, so a pour can still miss) is untouched.
    c.targetX = 1.25;
    c.targetY = -0.3;
    limitAim(c);
    expect(c.targetX).toBe(1.25);
    expect(c.targetY).toBe(-0.3);
  });

  it('pointer far off the cup still aims at the edge of the limit, not off-screen', () => {
    const c = controls();
    applyPourInput(c, createPourGate(), input({ cupX: -40, cupY: 0 }));
    expect(c.targetX).toBeCloseTo(-AIM_LIMIT, 9);
    expect(c.targetY).toBeCloseTo(0, 9);
  });

  it('keeps the last aim while the pointer is off the pour plane', () => {
    const c = controls();
    applyPourInput(c, createPourGate(), input({ cupX: 0.3, cupY: 0.1 }));
    applyPourInput(c, createPourGate(), input({ hasCup: false, cupX: 9, cupY: 9 }));
    expect(c.targetX).toBe(0.3);
    expect(c.targetY).toBe(0.1);
  });

  it('height stays between HEIGHT_MIN and HEIGHT_MAX for scrolls, keys and presets', () => {
    const c = controls();
    const g = createPourGate();
    applyPourInput(c, g, input({ heightDelta: 500 }));
    expect(c.targetHeight).toBe(HEIGHT_MAX);
    applyPourInput(c, g, input({ heightDelta: -500 }));
    expect(c.targetHeight).toBe(HEIGHT_MIN);
    for (const h of HEIGHT_PRESETS) {
      applyPourInput(c, g, input({ heightPreset: h }));
      expect(c.targetHeight).toBe(h);
    }
    applyPourInput(c, g, input({ heightPreset: 99 }));
    expect(c.targetHeight).toBe(HEIGHT_MAX);
  });

  it('the jug itself never leaves its limits, however wild the input', () => {
    const p = createPitcher();
    const c = controls();
    const rng = createRng(3);
    for (let i = 0; i < 2000; i++) {
      c.targetX = (rng.next() - 0.5) * 6;
      c.targetY = (rng.next() - 0.5) * 6;
      c.targetHeight = (rng.next() - 0.5) * 60;
      c.holding = rng.next() > 0.5;
      limitAim(c);
      stepPitcher(p, c, STEP);
      expect(Math.hypot(p.x, p.y)).toBeLessThanOrEqual(AIM_LIMIT + 1e-9);
      expect(p.height).toBeGreaterThanOrEqual(HEIGHT_MIN);
      expect(p.height).toBeLessThanOrEqual(HEIGHT_MAX);
      expect(p.tilt).toBeGreaterThanOrEqual(0);
      expect(p.tilt).toBeLessThanOrEqual(1);
      expect(pitcherFlow(p)).toBeGreaterThanOrEqual(0);
      expect(pitcherFlow(p)).toBeLessThanOrEqual(1);
    }
  });

  it('nearestPreset names the 1/2/3 key a height is closest to', () => {
    expect(nearestPreset(9)).toBe(0);
    expect(nearestPreset(HEIGHT_PRESETS[0])).toBe(0);
    expect(nearestPreset(3.3)).toBe(1);
    expect(nearestPreset(0.4)).toBe(2);
  });
});

describe('pour controls: no accidental pouring', () => {
  it('a button already held when the pour starts does not pour until let go once', () => {
    const c = controls();
    const g = createPourGate();
    applyPourInput(c, g, input({ holding: true }));
    expect(c.holding).toBe(false);
    applyPourInput(c, g, input({ holding: true }));
    expect(c.holding).toBe(false);
    applyPourInput(c, g, input({ holding: false }));
    expect(c.holding).toBe(false);
    applyPourInput(c, g, input({ holding: true }));
    expect(c.holding).toBe(true);
  });

  it('a press that starts inside the pour pours straight away', () => {
    const c = controls();
    const g = createPourGate();
    applyPourInput(c, g, input({ holding: false }));
    applyPourInput(c, g, input({ holding: true }));
    expect(c.holding).toBe(true);
  });

  it('holding on through the start pours no milk at all', () => {
    const pour = createPour();
    const p = createPitcher();
    const c = controls();
    const g = createPourGate();
    for (let i = 0; i < 120; i++) {
      applyPourInput(c, g, input({ holding: true }));
      stepPourFrame(pour, p, c, SILKY_MILK, STEP);
    }
    expect(pour.poured).toBe(0);
  });

  it('a quick tap (a click to skip a subtitle) tips the jug but spills nothing', () => {
    const pour = createPour();
    const p = createPitcher();
    const c = controls();
    const g = createPourGate();
    for (let i = 0; i < 40; i++) {
      applyPourInput(c, g, input({ holding: i >= 10 && i < 16 })); // 0.1 s press
      stepPourFrame(pour, p, c, SILKY_MILK, STEP);
    }
    expect(pour.poured).toBe(0);
  });
});

describe('deterministic pouring', () => {
  /** A messy, wandering human-like pour from seeded noise, through the real input path. */
  function wander(seed: number) {
    const rng = createRng(seed);
    const pour = createPour();
    const p = createPitcher();
    const c = controls();
    const g = createPourGate();
    let x = 0;
    let y = -0.3;
    let h = 7;
    for (let i = 0; i < 600; i++) {
      x += (rng.next() - 0.5) * 0.05;
      y += (rng.next() - 0.45) * 0.05;
      if (i === 250) h = 0.8;
      if (i === 420) h = 3;
      applyPourInput(
        c,
        g,
        input({ cupX: x, cupY: y, heightPreset: h, holding: i > 20 && i < 450 }),
      );
      stepPourFrame(pour, p, c, SILKY_MILK, STEP);
    }
    return pour;
  }

  it('the same inputs give the same foam, bit for bit', () => {
    const a = wander(11);
    const b = wander(11);
    expect(a.poured).toBeGreaterThan(0.3);
    expect(Array.from(a.foam)).toEqual(Array.from(b.foam));
    expect(a.fill).toBe(b.fill);
    expect(a.spill).toBe(b.spill);
  });

  it('different inputs give a different pattern', () => {
    const a = wander(11);
    const c = wander(12);
    expect(Array.from(a.foam)).not.toEqual(Array.from(c.foam));
  });
});
