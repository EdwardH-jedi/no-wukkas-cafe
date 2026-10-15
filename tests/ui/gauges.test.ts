import { describe, expect, it } from 'vitest';
import { createEspresso } from '../../src/sim/espresso';
import { MILK_NAME, type Milk } from '../../src/sim/rush';
import { createSteam } from '../../src/sim/steam';
import { HANDS_TEXT, handsState, MILK_ICON, milkTag } from '../../src/ui/gauges';

const MILKS = Object.keys(MILK_NAME) as Milk[];

describe('the milk label', () => {
  it('names the carton in words and an icon, one icon per carton', () => {
    expect(milkTag('oat')).toBe(' · <i aria-hidden="true">🌾</i> Oat');
    expect(milkTag('full')).toBe(` · <i aria-hidden="true">${MILK_ICON.full}</i> Full cream`);
    for (const m of MILKS) expect(milkTag(m)).toContain(MILK_NAME[m].slice(1));
    expect(new Set(MILKS.map((m) => MILK_ICON[m])).size).toBe(MILKS.length);
  });

  it('is empty where no carton is chosen (Day 1, practice)', () => {
    expect(milkTag(undefined)).toBe('');
    expect(milkTag(null)).toBe('');
  });
});

describe('two hands', () => {
  it('follows the shot and the steam', () => {
    const e = createEspresso();
    const s = createSteam();
    expect(handsState(e, s)).toBe('ready');
    e.extracting = true;
    expect(handsState(e, s)).toBe('shot');
    s.valveOpen = true;
    expect(handsState(e, s)).toBe('both');
    e.extracting = false;
    e.done = true;
    expect(handsState(e, s)).toBe('milk');
    for (const t of Object.values(HANDS_TEXT)) expect(t.length).toBeGreaterThan(0);
    expect(HANDS_TEXT.both).toMatch(/shot running \+ steaming/);
  });
});
