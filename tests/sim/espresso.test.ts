import { describe, expect, it } from 'vitest';
import {
  createEspresso,
  GRIND_RATE,
  scoreEspresso,
  shotFlow,
  SHOT_MAX,
  SHOT_TIME_SCALE,
  startShot,
  stepGrind,
  stepShot,
  stopShot,
} from '../../src/sim/espresso';

describe('espresso', () => {
  it('grinds only while held', () => {
    const e = createEspresso();
    stepGrind(e, true, 1);
    expect(e.dose).toBeCloseTo(GRIND_RATE);
    stepGrind(e, false, 1);
    expect(e.dose).toBeCloseTo(GRIND_RATE);
  });

  it('runs the shot timer faster than real time and stops itself at the max', () => {
    const e = createEspresso();
    e.dose = 19;
    startShot(e);
    stepShot(e, 1);
    expect(e.shotTime).toBeCloseTo(SHOT_TIME_SCALE);
    for (let i = 0; i < 100; i++) stepShot(e, 1);
    expect(e.shotTime).toBeGreaterThanOrEqual(SHOT_MAX);
    expect(e.done).toBe(true);
  });

  it('a heavier dose runs slower', () => {
    expect(shotFlow(22)).toBeLessThan(shotFlow(18));
  });

  it('scores a textbook shot fully and names the faults of bad ones', () => {
    const good = { ...createEspresso(), dose: 19, shotTime: 28 };
    expect(scoreEspresso(good).total).toBe(1);
    expect(scoreEspresso(good).faults).toEqual([]);
    const sour = { ...createEspresso(), dose: 14, shotTime: 15 };
    const s = scoreEspresso(sour);
    expect(s.faults).toContain('doseLight');
    expect(s.faults).toContain('shotShort');
    expect(s.total).toBeLessThan(0.3);
    const burnt = { ...createEspresso(), dose: 24, shotTime: 45 };
    expect(scoreEspresso(burnt).faults).toEqual(['doseHeavy', 'shotLong']);
  });

  it('stopShot marks the shot done', () => {
    const e = createEspresso();
    startShot(e);
    stopShot(e);
    expect(e.extracting).toBe(false);
    expect(e.done).toBe(true);
  });
});
