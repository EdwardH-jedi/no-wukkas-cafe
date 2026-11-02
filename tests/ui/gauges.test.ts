import { describe, expect, it } from 'vitest';
import { STEP } from '../../src/core/clock';
import { createRush, emptyRushInput, stepRush } from '../../src/core/rush';
import {
  createEspresso,
  scoreEspresso,
  SHOT_TARGET,
  SHOT_TIME_SCALE,
} from '../../src/sim/espresso';
import { EXTRA_HOT, MILK_NAME, type Milk } from '../../src/sim/rush';
import { createSteam, TARGET_TEMP } from '../../src/sim/steam';
import {
  HANDS_TEXT,
  handsState,
  MILK_ICON,
  milkTag,
  milkTarget,
  milkTargetLabel,
  shotCue,
  shotCueText,
  trainingClockNote,
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

const PRE = 4; // pre-infusion: the cue names it first

describe("Day 1's shot timer (training)", () => {
  const at = (shotTime: number, state: 'ready' | 'running' | 'done' = 'running') => {
    const e = createEspresso();
    e.dose = 19;
    e.shotTime = shotTime;
    e.extracting = state === 'running';
    e.done = state === 'done';
    return e;
  };

  it('says which side of the 25–31 s window the shot is on, in words', () => {
    expect(shotCue(at(0, 'ready'))).toBe('ready');
    expect(shotCue(at(2))).toBe('preinfusion');
    expect(shotCue(at(12))).toBe('approach');
    expect(shotCue(at(24.9))).toBe('approach');
    expect(shotCue(at(SHOT_TARGET[0]))).toBe('inRange');
    expect(shotCue(at(28))).toBe('inRange');
    expect(shotCue(at(SHOT_TARGET[1]))).toBe('inRange');
    // Past 31 s the score starts to drop (Codex review: 31.6 s scored 7.76/8 while it read "in
    // range"), so the words say so too; the timer shows tenths, so it reads "31.6 s".
    expect(shotCue(at(31.6))).toBe('over');
    expect(shotCue(at(32))).toBe('over');
    expect(shotCue(at(40))).toBe('over');
    expect(shotCue(at(27, 'done'))).toBe('stopped');
    expect(shotCueText(at(12), false)).toMatch(/not yet/i);
    expect(shotCueText(at(28), false)).toMatch(/stop now/i);
    expect(shotCueText(at(40), false)).toMatch(/over-extracted/i);
    expect(shotCueText(at(0, 'ready'), true)).toMatch(/tap to start/i);
    expect(shotCueText(at(27.4, 'done'), false)).toBe('Stopped · 27.4 s · in range');
    expect(shotCueText(at(19, 'done'), false)).toBe('Stopped · 19.0 s · too early');
    expect(shotCueText(at(31.6, 'done'), false)).toBe('Stopped · 31.6 s · over-extracted');
    expect(shotCueText(at(37, 'done'), false)).toBe('Stopped · 37.0 s · over-extracted');
  });

  it('says "in range" exactly when stopping now earns full time marks', () => {
    for (let t = PRE + 0.05; t < 45; t += 0.05) {
      const running = at(t);
      const fullMarks = scoreEspresso({ ...running, done: true }).time === 1;
      expect(shotCue(running) === 'inRange', `${t.toFixed(2)} s`).toBe(fullMarks);
      const stopped = shotCueText(at(t, 'done'), false);
      expect(stopped.endsWith('· in range'), `${t.toFixed(2)} s stopped`).toBe(fullMarks);
    }
  });

  it('explains the training clock from the real speed and window (no copied numbers)', () => {
    const note = trainingClockNote();
    expect(note).toContain(`${SHOT_TIME_SCALE}×`);
    expect(note).toContain(`${SHOT_TARGET[0]}–${SHOT_TARGET[1]} s`);
    const lo = Math.round(SHOT_TARGET[0] / SHOT_TIME_SCALE);
    const hi = Math.round(SHOT_TARGET[1] / SHOT_TIME_SCALE);
    expect(note).toContain(`about ${lo}–${hi} real seconds`);
  });
});
