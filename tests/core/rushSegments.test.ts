// A generated order is voiced by its segments: the register hands the order's VoiceRef to the
// utterance (and to Replay), so the audio can play the segment clips back to back. The slow repeat
// has no segment takes, so it goes without (the audio falls back to the browser voice, whole).

import { describe, expect, it } from 'vitest';
import { STEP } from '../../src/core/clock';
import {
  atCounter,
  atRegister,
  createRush,
  emptyRushInput,
  stepRush,
  type Rush,
  type RushAction,
  type RushCustomer,
  type RushWeek,
} from '../../src/core/rush';
import type { Utterance } from '../../src/core/speech';

const WEEK0: RushWeek = { shiftIndex: 0, unlockedDrinks: ['flatWhite', 'longBlack'] };

function drive(r: Rush) {
  const said: Utterance[] = [];
  const step = (a: RushAction | null = null, pressed = false): void => {
    const i = emptyRushInput();
    i.action = a;
    i.pressed = pressed;
    stepRush(r, i, STEP);
    for (const e of r.events) if (e.type === 'say') said.push(e.line);
    r.events.length = 0;
  };
  return { said, step };
}

/** The first seed whose first customer at the register says a generated order. */
function generatedAtCounter(): { r: Rush; c: RushCustomer; d: ReturnType<typeof drive> } {
  for (let seed = 1; seed < 80; seed++) {
    const r = createRush(seed, 'normal', {}, WEEK0);
    const d = drive(r);
    for (let n = 0; n < 90 / STEP && !atRegister(r); n++) d.step(null, n % 20 === 0);
    d.step({ type: 'takeOrder' });
    const c = atCounter(r);
    if (c?.line.voice?.kind === 'segments') return { r, c, d };
  }
  throw new Error('no seed puts a generated order at the register first');
}

describe('generated orders carry their segments to the audio', () => {
  it('the order line, and its replay, are voiced by the order segments', () => {
    const { r, c, d } = generatedAtCounter();
    const order = d.said.at(-1) as Utterance;
    expect(order.text).toBe(c.line.text);
    expect(order.listen).toBe(true);
    expect(order.voice).toEqual(c.line.voice);
    expect(order.voice?.kind === 'segments' && order.voice.ids.length).toBeGreaterThanOrEqual(2);
    for (let n = 0; n < 15 / STEP && c.state !== 'deciding'; n++) d.step();
    expect(c.state).toBe('deciding');
    d.step({ type: 'replay' });
    const again = r.speech.current as Utterance;
    expect(again.text).toBe(c.line.text);
    expect(again.voice).toEqual(c.line.voice);
  });

  it('the slow repeat has no segment takes, so it carries no segments', () => {
    const { r, c, d } = generatedAtCounter();
    for (let n = 0; n < 15 / STEP && c.state !== 'deciding'; n++) d.step();
    d.step({ type: 'repeat' });
    const slow = r.speech.current as Utterance;
    expect(slow.delivery).toBe('slow');
    expect(slow.text).toBe(c.line.text);
    expect(slow.voice).toBeUndefined();
  });

  it('Day 2 curated orders carry none (their clips are found by their words)', () => {
    const r = createRush(7);
    const d = drive(r);
    for (let n = 0; n < 90 / STEP && !atRegister(r); n++) d.step(null, n % 20 === 0);
    d.step({ type: 'takeOrder' });
    expect((d.said.at(-1) as Utterance).voice).toBeUndefined();
  });
});
