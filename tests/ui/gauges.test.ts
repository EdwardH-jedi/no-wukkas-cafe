import { describe, expect, it } from 'vitest';
import { STEP } from '../../src/core/clock';
import { createRush, emptyRushInput, stepRush } from '../../src/core/rush';
import { createEspresso } from '../../src/sim/espresso';
import { EXTRA_HOT, MILK_NAME, type Milk } from '../../src/sim/rush';
import { createSteam, TARGET_TEMP } from '../../src/sim/steam';
import {
  HANDS_TEXT,
  handsState,
  MILK_ICON,
  milkTag,
  milkTarget,
  milkTargetLabel,
} from '../../src/ui/gauges';

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

describe('the milk target (Q4)', () => {
  it('follows an extra-hot ticket: 68–74 °C, otherwise 55–65 °C', () => {
    expect(milkTargetLabel(true)).toBe('68–74 °C');
    expect(milkTargetLabel(false)).toBe('55–65 °C');
    expect(milkTargetLabel(undefined)).toBe('55–65 °C'); // Day 1 and practice
    expect(milkTarget(true)).toEqual(EXTRA_HOT);
    expect(milkTarget(false)).toEqual(TARGET_TEMP);
  });

  it("reaches the station from the ticket's make action (flat whites only)", () => {
    const make = (drink: 'flatWhite' | 'longBlack', extraHot?: boolean): boolean => {
      const r = createRush(3);
      const i = emptyRushInput();
      for (let s = 0; s < 2000 && r.phase !== 'service'; s++) stepRush(r, i, STEP);
      expect(r.phase).toBe('service');
      i.action = { type: 'make', drink, milk: 'full', extraHot };
      stepRush(r, i, STEP);
      expect(r.barista.drink).toBe(drink);
      return r.barista.extraHot;
    };
    expect(make('flatWhite', true)).toBe(true);
    expect(make('flatWhite', false)).toBe(false);
    expect(make('flatWhite')).toBe(false);
    expect(make('longBlack', true)).toBe(false);
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
