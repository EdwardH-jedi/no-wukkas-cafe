import { describe, expect, it } from 'vitest';
import type { EspressoScore } from '../../src/sim/espresso';
import type { PatternScore } from '../../src/sim/latte/score';
import {
  drainRate,
  evaluateServe,
  formatCents,
  reactionFor,
  REGISTER_DRAIN,
  REGISTER_DRAIN_BUSY,
  gradeShift,
  orderLabel,
  summariseShift,
  type MadeDrink,
  type Order,
  type ServeContext,
} from '../../src/sim/rush';

const esp: EspressoScore = { dose: 1, time: 1, total: 1, faults: [] };
const heart = { art: 0.9, heartness: 1 } as PatternScore;
const flatWhite = (over: Partial<MadeDrink> = {}): MadeDrink => ({
  type: 'flatWhite',
  milkType: 'full',
  espresso: esp,
  milk: { temp: 1, texture: 1, total: 1, faults: [] },
  pattern: heart,
  fill: 0.95,
  spill: 0,
  water: 0,
  temp: 60,
  madeAt: 0,
  ...over,
});
const longBlack = (over: Partial<MadeDrink> = {}): MadeDrink => ({
  type: 'longBlack',
  milkType: null,
  espresso: esp,
  milk: null,
  pattern: null,
  fill: 0.87,
  spill: 0,
  water: 0.65,
  temp: 70,
  madeAt: 0,
  ...over,
});
const FW: Order = { type: 'flatWhite', milk: 'full', extraHot: false, heart: false };
const ctx = (over: Partial<ServeContext> = {}): ServeContext => ({
  waited: 20,
  patience: 100,
  tolerance: 1,
  tipCents: 200,
  ...over,
});

describe('evaluateServe', () => {
  it('a great, quick drink delights and tips', () => {
    const r = evaluateServe(FW, flatWhite(), ctx());
    expect(r.accepted).toBe(true);
    expect(r.correct).toBe(true);
    expect(r.satisfaction).toBeGreaterThanOrEqual(90);
    expect(r.tipCents).toBeGreaterThan(150);
    expect(r.tipCents % 10).toBe(0);
  });

  it('the wrong drink is handed back', () => {
    const r = evaluateServe(FW, longBlack(), ctx());
    expect(r.accepted).toBe(false);
    expect(r.complaints).toEqual(['wrongDrink']);
    expect(r.tipCents).toBe(0);
  });

  it('extra hot means 68–74 °C', () => {
    const order: Order = { ...FW, extraHot: true };
    expect(evaluateServe(order, flatWhite({ temp: 60 }), ctx()).complaints).toContain(
      'notHotEnough',
    );
    expect(evaluateServe(order, flatWhite({ temp: 60 }), ctx()).correct).toBe(false);
    expect(evaluateServe(order, flatWhite({ temp: 71 }), ctx()).correct).toBe(true);
    expect(evaluateServe(FW, flatWhite({ temp: 72 }), ctx()).complaints).toContain('tooHot');
  });

  it('a requested heart has to actually be a heart', () => {
    const order: Order = { ...FW, heart: true };
    const blob = { art: 0.4, heartness: 0.1 } as PatternScore;
    const r = evaluateServe(order, flatWhite({ pattern: blob }), ctx());
    expect(r.complaints).toContain('noHeart');
    expect(r.correct).toBe(false);
    expect(evaluateServe(order, flatWhite(), ctx()).correct).toBe(true);
  });

  it('drinks left to go cold lose their appeal', () => {
    const hot = evaluateServe(FW, flatWhite({ temp: 60 }), ctx());
    const cold = evaluateServe(FW, flatWhite({ temp: 45 }), ctx());
    expect(cold.complaints).toContain('lukewarm');
    expect(cold.satisfaction).toBeLessThan(hot.satisfaction - 10);
  });

  it('long black strength depends on the hot water', () => {
    expect(
      evaluateServe({ ...FW, type: 'longBlack' }, longBlack({ water: 0.85 }), ctx()).complaints,
    ).toContain('weak');
    expect(
      evaluateServe({ ...FW, type: 'longBlack' }, longBlack({ water: 0.4 }), ctx()).complaints,
    ).toContain('strong');
    expect(evaluateServe({ ...FW, type: 'longBlack' }, longBlack(), ctx()).complaints).toEqual([]);
  });

  it('slow service costs satisfaction and tips', () => {
    const quick = evaluateServe(FW, flatWhite(), ctx({ waited: 20 }));
    const slow = evaluateServe(FW, flatWhite(), ctx({ waited: 90 }));
    expect(slow.complaints).toContain('slow');
    expect(slow.satisfaction).toBeLessThan(quick.satisfaction);
    expect(slow.tipCents).toBeLessThan(quick.tipCents);
  });

  it('a harder-to-please customer scores the same drink lower', () => {
    expect(evaluateServe(FW, flatWhite(), ctx({ tolerance: 0.88 })).satisfaction).toBeLessThan(
      evaluateServe(FW, flatWhite(), ctx()).satisfaction,
    );
  });
});

describe('reactions', () => {
  it('a long black, a flat white, or the heart they asked for', () => {
    expect(reactionFor(longBlack(), { ...FW, type: 'longBlack', milk: null })).toBe('longBlack');
    expect(reactionFor(flatWhite(), FW)).toBe('flatWhite');
    expect(reactionFor(flatWhite(), { ...FW, heart: true })).toBe('heart');
    // A heart nobody asked for is just a flat white to them.
    expect(reactionFor(flatWhite({ pattern: heart }), { ...FW, heart: false })).toBe('flatWhite');
    expect(reactionFor(flatWhite({ pattern: null }), { ...FW, heart: true })).toBe('flatWhite');
  });
});

describe('patience drain', () => {
  it('drains faster at the register, less so while the barista is busy on another drink', () => {
    expect(drainRate(false, 'idle')).toBe(1);
    expect(drainRate(false, 'steam')).toBe(1);
    expect(drainRate(true, 'idle')).toBe(REGISTER_DRAIN);
    expect(drainRate(true, 'ready')).toBe(REGISTER_DRAIN);
    for (const p of ['grind', 'lock', 'water', 'shot', 'steam', 'pour'])
      expect(drainRate(true, p), p).toBe(REGISTER_DRAIN_BUSY);
    expect(REGISTER_DRAIN_BUSY).toBeLessThanOrEqual(1.2);
  });
});

describe('shift summary', () => {
  it('counts walkouts as zero satisfaction and sums tips in cents', () => {
    const s = summariseShift(
      [
        {
          customer: 'a',
          accepted: true,
          correct: true,
          waited: 30,
          satisfaction: 90,
          tipCents: 250,
        },
        {
          customer: 'b',
          accepted: true,
          correct: false,
          waited: 50,
          satisfaction: 60,
          tipCents: 30,
        },
      ],
      3,
      1,
    );
    expect(s.ordersCompleted).toBe(2);
    expect(s.correctOrders).toBe(1);
    expect(s.walkouts).toBe(1);
    expect(s.avgServeSeconds).toBe(40);
    expect(s.satisfaction).toBe(50);
    expect(s.tipsCents).toBe(280);
    expect(s.wasted).toBe(1);
  });

  it('grades the shift', () => {
    expect(gradeShift(90, 0)).toBe('excellent');
    expect(gradeShift(70, 1)).toBe('good');
    expect(gradeShift(50, 2)).toBe('okay');
    expect(gradeShift(30, 2)).toBe('poor');
    expect(gradeShift(80, 3)).toBe('disaster');
  });

  it('labels and money read naturally', () => {
    expect(orderLabel({ type: 'flatWhite', milk: 'full', extraHot: true, heart: false })).toBe(
      'flat white · extra hot (68–74 °C)',
    );
    expect(orderLabel({ type: 'flatWhite', milk: 'oat', extraHot: false, heart: true })).toBe(
      'oat flat white · heart on top',
    );
    expect(orderLabel({ type: 'longBlack', milk: null, extraHot: false, heart: false })).toBe(
      'long black',
    );
    expect(formatCents(730)).toBe('$7.30');
  });
});
