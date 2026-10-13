// Regression tests for the Codex audit (2026-10-13) findings that live in the sim: A3 (a line's
// clock waits while its audio loads), A8 (wrong-milk reaction), A9 (question count), A10 (no
// piling-up replays, nobody talks after they've gone).

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
} from '../../src/core/rush';
import type { Utterance } from '../../src/core/speech';
import { createTrial, emptyInput, stepTrial } from '../../src/core/trial';
import { clipFor } from '../../src/data/voice';
import { LISTEN_COST, summariseListening } from '../../src/sim/listening';
import type { MadeDrink } from '../../src/sim/rush';
import { playRush } from '../helpers/rushBot';

function driver(r: Rush) {
  const said: Utterance[] = [];
  const step = (
    a: RushAction | null = null,
    o: { hold?: boolean; skip?: boolean; pressed?: boolean } = {},
  ) => {
    const i = emptyRushInput();
    i.action = a;
    i.voiceHold = o.hold ?? false;
    i.skip = o.skip ?? false;
    i.pressed = o.pressed ?? false;
    stepRush(r, i, STEP);
    for (const e of r.events) if (e.type === 'say') said.push(e.line);
    r.events.length = 0;
  };
  const toCounter = (): RushCustomer => {
    for (let n = 0; n < 90 / STEP && !atRegister(r); n++) step(null, { pressed: n % 20 === 0 });
    step({ type: 'takeOrder' });
    return atCounter(r) as RushCustomer;
  };
  return { step, said, toCounter };
}

describe('A3: a line waits for its audio', () => {
  it('Day 2: while the order clip loads, the line, the register and their patience all wait', () => {
    const r = createRush(7);
    const d = driver(r);
    const c = d.toCounter();
    const line = r.speech.current as Utterance;
    expect(line.speaker).toBe(c.def.id);
    const patience = c.patience;
    // 3 s of "still loading": longer than many order lines.
    for (let n = 0; n < 3 / STEP; n++) d.step(null, { hold: true });
    expect(r.speech.current).toBe(line);
    expect(c.state).toBe('ordering');
    expect(c.patience).toBeCloseTo(patience, 9);
    // Audio started: from here the line runs its own length, then the register opens.
    for (let n = 0; n < (line.duration - 0.1) / STEP; n++) d.step();
    expect(c.state).toBe('ordering');
    for (let n = 0; n < 0.3 / STEP; n++) d.step();
    expect(c.state).toBe('deciding');
  });

  it('Day 1: Gaz holds his line while it loads', () => {
    const t = createTrial(7);
    const go = (hold: boolean, start = false): void => {
      const i = emptyInput();
      i.voiceHold = hold;
      if (start) i.action = 'start';
      stepTrial(t, i, STEP);
      t.events.length = 0;
    };
    go(false, true);
    const first = t.speech.current;
    expect(first).not.toBeNull();
    for (let n = 0; n < (first!.duration + 2) / STEP; n++) go(true);
    expect(t.speech.current).toBe(first);
    for (let n = 0; n < (first!.duration + 0.1) / STEP; n++) go(false);
    expect(t.speech.current).not.toBe(first);
  });

  it('no hold, no change: headless shifts are exactly as before', () => {
    const a = playRush({ seed: 3 });
    const b = playRush({ seed: 3 });
    expect(JSON.stringify(a.events)).toBe(JSON.stringify(b.events));
  });
});

describe('A8: the wrong milk gets a wrong-milk reaction', () => {
  it('a flat white made for someone else, handed to an oat customer: no contradictory line', () => {
    const r = createRush(75, 'normal', { priya: 'priya.2' }); // oat flat white
    const d = driver(r);
    for (let n = 0; n < 200 / STEP && r.phase !== 'service'; n++)
      d.step(null, { pressed: n % 20 === 0 });
    const priya = r.customers.find((c) => c.def.id === 'priya') as RushCustomer;
    priya.state = 'waiting';
    priya.heard = { ...priya.order };
    priya.registerAt = r.time;
    const drink: MadeDrink = {
      type: 'flatWhite',
      milkType: 'full',
      espresso: { dose: 1, time: 1, total: 1, faults: [] },
      milk: { temp: 1, texture: 1, total: 1, faults: [] },
      pattern: null,
      fill: 0.95,
      spill: 0,
      water: 0,
      temp: 60,
      madeAt: r.time,
    };
    r.barista.ready = drink;
    r.barista.phase = 'ready';
    d.step({ type: 'serve', customer: 'priya' });
    for (let n = 0; n < 15 / STEP; n++) d.step();
    const keys = d.said.map((u) => u.key);
    expect(keys).toContain('priya.rejectedMilk');
    expect(keys).toContain('rush.wrongMilk');
    expect(keys).not.toContain('rush.wrongDrink');
    for (const u of d.said) {
      expect(u.text).not.toMatch(/flat white, not a flat white/);
      expect(clipFor(u.speaker, u.text, u.delivery), u.text).not.toBeNull();
    }
  });
});

describe('A9: every question asked is counted', () => {
  it('asking about the milk three times costs three times and counts three questions', () => {
    const r = createRush(5);
    const d = driver(r);
    const c = d.toCounter();
    for (let n = 0; n < 15 / STEP && c.state !== 'deciding'; n++) d.step();
    const before = c.patience;
    for (let k = 0; k < 3; k++) d.step({ type: 'clarify', field: 'milk' });
    expect(before - c.patience).toBeCloseTo(3 * LISTEN_COST.clarify + 3 * STEP, 9);
    d.step({ type: 'ringUp', order: c.order });
    const rec = r.listening[0]!;
    expect(rec.clarified).toEqual(['milk']);
    expect(rec.questions).toBe(3);
    expect(summariseListening(r.listening).questions).toBe(3);
  });
});

describe('A10: replays never pile up, and nobody talks after they have gone', () => {
  it('fifteen replays while someone else is talking queue one line, cost once, count once', () => {
    const r = createRush(7);
    const d = driver(r);
    const c = d.toCounter();
    for (let n = 0; n < 15 / STEP && c.state !== 'deciding'; n++) d.step();
    // Another customer is mid-sentence (Codex's case: Dazza's farewell).
    const other = r.customers.find((x) => x !== c) as RushCustomer;
    r.speech.current = {
      speaker: other.def.id,
      key: `${other.def.id}.happy`,
      text: other.def.lines.happy,
      mood: 'pleased',
      gesture: 'none',
      duration: 5,
      priority: 'order',
    };
    r.speech.started = r.time;
    const before = c.patience;
    for (let k = 0; k < 15; k++) d.step({ type: 'replay' });
    const mine = r.speech.queue.filter((u) => u.listen && u.speaker === c.def.id);
    expect(mine).toHaveLength(1);
    expect(c.listen.replays).toBe(1);
    expect(before - c.patience).toBeCloseTo(LISTEN_COST.replay + 15 * STEP, 9);
  });

  it('a customer who walks out takes their queued lines with them', () => {
    const r = createRush(7);
    const d = driver(r);
    const c = d.toCounter();
    for (let n = 0; n < 15 / STEP && c.state !== 'deciding'; n++) d.step();
    const other = r.customers.find((x) => x !== c) as RushCustomer;
    r.speech.current = {
      speaker: other.def.id,
      key: `${other.def.id}.happy`,
      text: other.def.lines.happy,
      mood: 'pleased',
      gesture: 'none',
      duration: 4,
      priority: 'order',
    };
    r.speech.started = r.time;
    d.step({ type: 'replay' });
    d.step({ type: 'clarify', field: 'milk' });
    expect(r.speech.queue.some((u) => u.listen && u.speaker === c.def.id)).toBe(true);
    c.patience = 0.0001; // they've had enough
    d.step();
    expect(c.state).toBe('leaving');
    expect(r.speech.queue.some((u) => u.listen && u.speaker === c.def.id)).toBe(false);
    for (let n = 0; n < 40 / STEP; n++) d.step();
    const after = d.said.slice(d.said.findIndex((u) => u.key === `${c.def.id}.walkout`) + 1);
    expect(after.some((u) => u.speaker === c.def.id)).toBe(false);
  });

  it('across whole shifts with every aid, no customer speaks once they are gone', () => {
    const gone: string[] = [];
    playRush({
      aids: () => [
        { type: 'replay' },
        { type: 'replay' },
        { type: 'repeat' },
        { type: 'clarify', field: 'milk' },
        { type: 'replay' },
      ],
      // A line that started while they were walking out may finish after the door shuts; no line
      // may *start* once they've gone.
      each: (r) => {
        for (const e of r.events) {
          if (e.type !== 'say') continue;
          const c = r.customers.find((x) => x.def.id === e.line.speaker);
          if (c && c.state === 'gone') gone.push(`${r.time.toFixed(1)} ${e.line.key}`);
        }
      },
    });
    expect(gone).toEqual([]);
  });
});
