import { describe, expect, it } from 'vitest';
import { STEP } from '../../src/core/clock';
import { createSteam, milkQuality, scoreMilk, stepSteam, tipDepth } from '../../src/sim/steam';

function run(seconds: number, depth: number, s = createSteam()) {
  for (let i = 0; i < Math.round(seconds / STEP); i++) stepSteam(s, true, depth, STEP);
  return s;
}

describe('steaming', () => {
  it('stretches air in only with the tip near the surface', () => {
    expect(run(0.3, 0.3).zone).toBe('chirp');
    const chirp = run(2, 0.3);
    expect(chirp.aeration).toBeGreaterThan(0.2);
    // The foam has lifted the surface past the tip by now, so it spins instead.
    expect(chirp.zone).toBe('whirl');
    const deep = run(2, 3);
    expect(deep.zone).toBe('whirl');
    expect(deep.aeration).toBe(0);
  });

  it('screeches and makes big bubbles with the tip out of the milk', () => {
    const s = run(1.5, -0.5);
    expect(s.zone).toBe('screech');
    expect(s.bubbles).toBeGreaterThan(0.3);
  });

  it('foam lifts the surface, so the tip ends up deeper', () => {
    const s = run(3, 0.3);
    expect(tipDepth(s)).toBeGreaterThan(0.3);
  });

  it('heats while open and stops heating when closed', () => {
    const s = run(4, 2);
    const t = s.temp;
    stepSteam(s, false, 2, 1);
    expect(s.temp).toBeLessThanOrEqual(t);
    expect(s.zone).toBe('off');
  });

  it('a stretch-then-spin technique makes silky milk at the right temperature', () => {
    const s = run(3, 0.3);
    run(5.2, 2.5, s);
    const m = scoreMilk(milkQuality(s));
    expect(s.temp).toBeGreaterThan(55);
    expect(s.temp).toBeLessThan(66);
    expect(m.faults).toEqual([]);
    expect(m.total).toBeGreaterThan(0.85);
  });

  it('names temperature and texture faults', () => {
    expect(scoreMilk({ temp: 40, aeration: 0.4, bubbles: 0 }).faults).toContain('milkCold');
    expect(scoreMilk({ temp: 80, aeration: 0.4, bubbles: 0 }).faults).toContain('scalded');
    expect(scoreMilk({ temp: 60, aeration: 0.05, bubbles: 0 }).faults).toContain('flatMilk');
    expect(scoreMilk({ temp: 60, aeration: 0.9, bubbles: 0 }).faults).toContain('stiffMilk');
    expect(scoreMilk({ temp: 60, aeration: 0.4, bubbles: 0.6 }).faults).toContain('bubbly');
  });
});
