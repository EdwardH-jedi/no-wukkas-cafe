import { describe, expect, it } from 'vitest';
import { consumeFrame, createClock, STEP, tickStep } from '../../src/core/clock';

describe('clock', () => {
  it('turns frame time into whole fixed steps and keeps the remainder', () => {
    const c = createClock();
    expect(consumeFrame(c, STEP * 2.5)).toBe(2);
    expect(consumeFrame(c, STEP * 0.6)).toBe(1);
  });

  it('runs no steps while paused', () => {
    const c = createClock();
    c.paused = true;
    expect(consumeFrame(c, 1)).toBe(0);
    expect(c.acc).toBe(0);
  });

  it('caps long stalls instead of fast-forwarding', () => {
    const c = createClock();
    expect(consumeFrame(c, 5)).toBeLessThanOrEqual(Math.ceil(0.1 / STEP));
  });

  it('advances game time per step', () => {
    const c = createClock();
    tickStep(c);
    tickStep(c);
    expect(c.time).toBeCloseTo(STEP * 2);
  });
});
