import { describe, expect, it } from 'vitest';
import { createRush } from '../../src/core/rush';
import { endlessFor, weekFor } from '../../src/core/week/session';
import { ENDLESS, WEEK } from '../../src/data/week';
import { newSave } from '../../src/sim/contracts/save';
import { clockText, dayChip, servedText, walkoutCount, walkoutText } from '../../src/ui/rushTopbar';

const save = newSave({ seed: 7 });

describe('the top chips', () => {
  it('say which shift it is: Day 2, a day of the week, or Endless', () => {
    expect(dayChip(createRush(7))).toEqual(['Day 2', 'Morning rush']);
    const tue = createRush(7, 'normal', {}, weekFor({ ...save, shift: 1 }));
    expect(dayChip(tue)).toEqual(['Week 1', WEEK[1]?.day]);
    const wk2 = createRush(7, 'normal', {}, weekFor({ ...save, week: 2, shift: 4 }));
    expect(dayChip(wk2)).toEqual(['Week 2', 'Friday']);
    expect(dayChip(createRush(7, 'normal', {}, endlessFor(save)))).toEqual(['Endless', 'Rush']);
  });

  it('runs the clock from 7:00, past the hour too', () => {
    expect(clockText(0)).toBe('7:00');
    expect(clockText(95)).toBe('7:09');
    expect(clockText(599)).toBe('7:59');
    expect(clockText(600)).toBe('8:00');
    expect(clockText(1234)).toBe('9:03');
  });

  it('counts served out of the shift, and walk-outs (out of three in Endless)', () => {
    const r = createRush(7);
    expect(servedText(r, 2)).toBe(`2/${r.customers.length}`);
    expect(walkoutCount(r)).toBe(0);
    const [a, b] = r.customers;
    if (!a || !b) throw new Error('Day 2 has customers');
    a.outcome = 'walkout';
    b.outcome = 'served';
    expect(walkoutCount(r)).toBe(1);
    expect(walkoutText(r, 1)).toBe('1');
    const e = createRush(7, 'normal', {}, endlessFor(save));
    expect(servedText(e, 12)).toBe('12');
    expect(walkoutText(e, 2)).toBe(`2/${ENDLESS.maxWalkouts}`);
  });
});
