// Day 2 listening, played headless: every curated order end to end, answer keys, corrections,
// the cost of each listening aid, dialogue that never talks over another customer, rapid
// switching at the register, and shifts that still finish after corrections.

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
import { CUSTOMERS, type CustomerId } from '../../src/data/customers';
import {
  LISTEN_COST,
  MAX_REPEATS,
  normaliseOrder,
  ORDER_FIELDS,
  wrongFields,
  type OrderField,
} from '../../src/sim/listening';
import type { Order } from '../../src/sim/rush';
import { playRush } from '../helpers/rushBot';

const says = (events: ReturnType<typeof playRush>['events']) =>
  events.filter((e) => e.type === 'say') as Array<{ type: 'say'; line: Utterance; at: number }>;

/** A single-field mistake for this order (what a player might mishear). */
function mishear(o: Order, field: OrderField): Order {
  const t = normaliseOrder(o);
  switch (field) {
    case 'drink':
      return t.type === 'flatWhite'
        ? { type: 'longBlack', milk: null, extraHot: false, heart: false }
        : { type: 'flatWhite', milk: 'full', extraHot: false, heart: false };
    case 'milk':
      return { ...t, milk: t.milk === 'oat' ? 'soy' : 'oat' };
    case 'temp':
      return { ...t, extraHot: !t.extraHot };
    case 'heart':
      return { ...t, heart: !t.heart };
  }
}

describe('every curated order, end to end', () => {
  // 7 shifts cover all 30 lines: shift k gives each customer their k-th line (wrapping).
  const most = Math.max(...CUSTOMERS.map((c) => c.orders.length));
  for (let k = 0; k < most; k++) {
    const lines = Object.fromEntries(
      CUSTOMERS.map((c) => [c.id, (c.orders[k % c.orders.length] as { id: string }).id]),
    ) as Partial<Record<CustomerId, string>>;
    it(`shift ${k + 1}: ${Object.values(lines).join(', ')}`, () => {
      const { r } = playRush({ lines });
      expect(r.phase).toBe('summary');
      for (const c of r.customers) {
        expect(c.line.id).toBe(lines[c.def.id]);
        // Rung up from the answer key, made from the ticket, accepted and right.
        expect(c.heard, c.def.id).toEqual(normaliseOrder(c.line.order));
        expect(c.outcome, `${c.def.id} ${c.line.id}`).toBe('served');
        expect(c.result?.correct, `${c.def.id} ${c.line.id}`).toBe(true);
      }
      expect(r.listening.every((x) => x.wrong.length === 0)).toBe(true);
    });
  }
});

describe('answer keys', () => {
  it('each single-field mishearing of each order is caught as exactly that field', () => {
    for (const c of CUSTOMERS)
      for (const line of c.orders) {
        const truth = normaliseOrder(line.order);
        expect(wrongFields(truth, truth), line.id).toEqual([]);
        for (const f of ORDER_FIELDS) {
          const heard = mishear(truth, f);
          const got = wrongFields(heard, truth);
          // Modifiers rung up on a long black can't be made, so they don't count against it.
          if (truth.type === 'longBlack' && f !== 'drink')
            expect(got, `${line.id} ${f}`).toEqual([]);
          else expect(got, `${line.id} ${f}`).toEqual([f]);
        }
      }
  });

  it('the ticket keeps what was rung up and the answer key keeps what was said', () => {
    const { r } = playRush({ heard: (c) => mishear(c.order, 'drink') });
    for (const x of r.listening) {
      const c = r.customers.find((k) => k.def.id === x.customer) as RushCustomer;
      expect(x.truth).toEqual(normaliseOrder(c.line.order));
      expect(x.heard?.type).not.toBe(x.truth.type);
      expect(x.wrong).toEqual(['drink']);
    }
  });
});

describe('correcting a misheard order', () => {
  const firstWith = (pred: (o: Order) => boolean): { id: CustomerId; line: string } => {
    for (const c of CUSTOMERS) {
      const l = c.orders.find((o) => pred(normaliseOrder(o.order)));
      // Patient enough to wait for the remake.
      if (l && c.patience >= 110) return { id: c.id, line: l.id };
    }
    throw new Error('no such order');
  };

  it('wrong milk: handed back, they name the milk, ticket fixed, remade, served right', () => {
    const t = firstWith((o) => o.type === 'flatWhite' && o.milk !== 'full');
    const { r, said, events } = playRush({
      lines: { [t.id]: t.line },
      heard: (c) => (c.def.id === t.id ? mishear(c.order, 'milk') : c.order),
    });
    const c = r.customers.find((k) => k.def.id === t.id) as RushCustomer;
    expect(c.rejected).toBe(1);
    expect(said).toContain(`${t.id}.rejectedMilk`);
    expect(said).toContain(`${t.id}.answer.milk`);
    expect(said).toContain('rush.misheard');
    expect(events.filter((e) => e.type === 'ticketFixed')).toHaveLength(1);
    expect(c.heard).toEqual(c.order);
    expect(c.outcome).toBe('served');
    expect(c.result?.correct).toBe(true);
  });

  it('wrong drink: handed back, ticket fixed, remade, served right', () => {
    const t = firstWith((o) => o.type === 'longBlack');
    const { r, said } = playRush({
      lines: { [t.id]: t.line },
      heard: (c) => (c.def.id === t.id ? mishear(c.order, 'drink') : c.order),
    });
    const c = r.customers.find((k) => k.def.id === t.id) as RushCustomer;
    expect(said).toContain(`${t.id}.rejected`);
    expect(said).toContain('rush.misheard');
    expect(c.heard).toEqual(c.order);
    expect(c.outcome).toBe('served');
  });

  it('missed "extra hot": they take it but it is wrong, and nothing is "corrected"', () => {
    const t = firstWith((o) => o.type === 'flatWhite' && o.extraHot);
    const { r, events, said } = playRush({
      lines: { [t.id]: t.line },
      heard: (c) => (c.def.id === t.id ? mishear(c.order, 'temp') : c.order),
    });
    const c = r.customers.find((k) => k.def.id === t.id) as RushCustomer;
    expect(c.outcome).toBe('served');
    expect(c.result?.correct).toBe(false);
    expect(c.result?.complaints).toContain('notHotEnough');
    expect(said).toContain('rush.notHotEnough');
    expect(events.some((e) => e.type === 'ticketFixed')).toBe(false);
    expect(r.listening.find((x) => x.customer === t.id)?.wrong).toEqual(['temp']);
  });

  it('extra hot rung up for a normal order: counted as misheard, and they like it less', () => {
    const t = firstWith((o) => o.type === 'flatWhite' && !o.extraHot);
    const lines = { [t.id]: t.line };
    const right = playRush({ lines }).r.customers.find((k) => k.def.id === t.id) as RushCustomer;
    const { r } = playRush({
      lines,
      heard: (c) => (c.def.id === t.id ? mishear(c.order, 'temp') : c.order),
    });
    const c = r.customers.find((k) => k.def.id === t.id) as RushCustomer;
    expect(r.listening.find((x) => x.customer === t.id)?.wrong).toEqual(['temp']);
    // Steamed to 71 °C instead of ~60: outside their temperature band, so the drink scores lower
    // (satisfaction can still cap at 100 for a forgiving regular).
    expect(c.result!.quality).toBeLessThan(right.result!.quality);
  });
});

describe('what listening aids cost', () => {
  it('replay, repeat and clarify each cost exactly their patience, on top of the clock', () => {
    const { patienceLog } = playRush({
      aids: () => [
        { type: 'replay' },
        { type: 'repeat' },
        { type: 'clarify', field: 'milk' },
        { type: 'clarify', field: 'milk' }, // asking twice costs twice, counts once
      ],
    });
    const cost: Record<string, number> = {
      replay: LISTEN_COST.replay,
      repeat: LISTEN_COST.repeat,
      clarify: LISTEN_COST.clarify,
    };
    expect(patienceLog).toHaveLength(6 * 4);
    for (const p of patienceLog)
      // The register drains 1 s of patience per second while they wait for their ticket.
      expect(p.before - p.after, `${p.id} ${p.action}`).toBeCloseTo(cost[p.action]! + STEP, 9);
  });

  it('a third "repeat that?" is refused and free; the second earns a remark from Gaz', () => {
    const { r, patienceLog, said } = playRush({
      aids: () => [{ type: 'repeat' }, { type: 'repeat' }, { type: 'repeat' }],
    });
    for (const x of r.listening) expect(x.repeats).toBe(MAX_REPEATS);
    const third = patienceLog.filter((_, i) => i % 3 === 2);
    for (const p of third) expect(p.before - p.after).toBeCloseTo(STEP, 9);
    expect(said).toContain('rush.askedTwice');
  });

  it('clarified fields are recorded once each, in the order asked', () => {
    const { r } = playRush({
      aids: () => [
        { type: 'clarify', field: 'temp' },
        { type: 'clarify', field: 'drink' },
        { type: 'clarify', field: 'temp' },
      ],
    });
    for (const x of r.listening) expect(x.clarified).toEqual(['temp', 'drink']);
  });
});

describe('dialogue never talks over another customer', () => {
  it('with every aid used on every customer, customers never cut each other off', () => {
    const { events } = playRush({
      aids: () => [
        { type: 'replay' },
        { type: 'clarify', field: 'drink' },
        { type: 'clarify', field: 'milk' },
        { type: 'clarify', field: 'temp' },
        { type: 'clarify', field: 'heart' },
        { type: 'repeat' },
        { type: 'replay' },
        { type: 'repeat' },
      ],
    });
    const lines = says(events);
    for (let k = 0; k + 1 < lines.length; k++) {
      const a = lines[k]!;
      const b = lines[k + 1]!;
      if (a.line.speaker === 'gaz' || b.line.speaker === a.line.speaker) continue;
      // A different customer only speaks once this one has finished.
      expect(b.at - a.at, `${a.line.key} → ${b.line.key}`).toBeGreaterThanOrEqual(
        a.line.duration - 1e-6,
      );
    }
  });

  it('asking a question cuts Gaz off, and a customer may cut themselves off, never another', () => {
    const r = createRush(4);
    const step = (a: RushAction | null = null, pressed = false): void => {
      const i = emptyRushInput();
      i.action = a;
      i.pressed = pressed;
      stepRush(r, i, STEP);
    };
    for (let n = 0; n < 60 / STEP && !atRegister(r); n++) step(null, n % 20 === 0);
    step({ type: 'takeOrder' });
    const c = atCounter(r) as RushCustomer;
    expect(r.speech.current?.speaker).toBe(c.def.id);
    step({ type: 'clarify', field: 'milk' }); // cut themselves off: the answer starts now
    expect(r.speech.current?.key).toBe(`${c.def.id}.answer.milk`);
    // Another customer is mid-sentence: the answer waits its turn.
    const other: Utterance = {
      speaker: 'priya',
      key: 'priya.impatient',
      text: 'Sorry… is mine nearly ready?',
      mood: 'annoyed',
      gesture: 'none',
      duration: 3,
      priority: 'react',
    };
    r.speech.current = other;
    r.speech.started = r.time;
    step({ type: 'clarify', field: 'drink' });
    expect(r.speech.current).toBe(other);
    expect(r.speech.queue.some((u) => u.key === `${c.def.id}.answer.drink`)).toBe(true);
  });
});

describe('rapid switching at the register', () => {
  it('ringing up and taking the next order in back-to-back steps keeps every ticket with its customer', () => {
    const { r } = playRush({ hurry: true, aids: () => [{ type: 'replay' }] });
    expect(r.listening).toHaveLength(6);
    for (const x of r.listening) {
      const c = r.customers.find((k) => k.def.id === x.customer) as RushCustomer;
      expect(x.lineId).toBe(c.line.id);
      expect(x.replays).toBe(1);
      expect(c.heard).toEqual(c.order);
    }
  });

  it('aids after a ticket prints go to the next customer, not the last one', () => {
    const r = createRush(6);
    const step = (a: RushAction | null = null, skip = false, pressed = false): void => {
      const i = emptyRushInput();
      i.action = a;
      i.skip = skip;
      i.pressed = pressed;
      stepRush(r, i, STEP);
    };
    // Let two customers arrive, then work the register as fast as inputs allow.
    for (let n = 0; n < 120 / STEP; n++) {
      step(null, false, n % 20 === 0);
      if (r.customers.filter((c) => c.state === 'register' || c.state === 'queue').length >= 2)
        break;
    }
    const a = atRegister(r) as RushCustomer;
    step({ type: 'takeOrder' });
    step(null, true); // they've said enough
    step({ type: 'ringUp', order: a.order });
    expect(a.state).toBe('waiting');
    const aBefore = { ...a.listen, lastListen: a.lastListen };
    for (let n = 0; n < 10 && !atRegister(r); n++) step();
    const b = atRegister(r) as RushCustomer;
    expect(b).not.toBe(a);
    step({ type: 'takeOrder' });
    step({ type: 'replay' });
    step({ type: 'repeat' });
    expect(b.listen.replays).toBe(1);
    expect(b.listen.repeats).toBe(1);
    expect(a.listen.replays).toBe(aBefore.replays);
    expect(a.listen.repeats).toBe(aBefore.repeats);
    expect(a.lastListen).toEqual(aBefore.lastListen);
    // With nobody at the register, aids do nothing.
    step(null, true);
    for (let n = 0; n < 5 / STEP && b.state !== 'deciding'; n++) step(null, true);
    step({ type: 'ringUp', order: b.order });
    const snapshot = JSON.stringify(r.customers.map((c) => c.listen));
    if (!atCounter(r)) {
      step({ type: 'replay' });
      step({ type: 'clarify', field: 'milk' });
      expect(JSON.stringify(r.customers.map((c) => c.listen))).toBe(snapshot);
    }
  });

  it('ringing up while they are still talking is ignored until they finish', () => {
    const r = createRush(2);
    const step = (a: RushAction | null = null, pressed = false): void => {
      const i = emptyRushInput();
      i.action = a;
      i.pressed = pressed;
      stepRush(r, i, STEP);
    };
    for (let n = 0; n < 60 / STEP && !atRegister(r); n++) step(null, n % 20 === 0);
    const c = atRegister(r) as RushCustomer;
    step({ type: 'takeOrder' });
    expect(c.state).toBe('ordering');
    step({ type: 'ringUp', order: c.order });
    expect(c.state).toBe('ordering');
    expect(c.ticket).toBeNull();
  });
});

describe('shifts finish after corrections', () => {
  it('every order misheard (drinks and milks): all corrected, the shift still reaches the report', () => {
    let flip = false;
    const { r, events } = playRush({
      heard: (c) => {
        flip = !flip;
        return mishear(c.order, c.order.type === 'flatWhite' && flip ? 'milk' : 'drink');
      },
    });
    expect(r.phase).toBe('summary');
    const s = r.summary!;
    expect(s.ordersCompleted + s.walkouts).toBe(6);
    expect(r.listening).toHaveLength(6);
    expect(r.listening.every((x) => x.wrong.length === 1)).toBe(true);
    const fixed = events.filter((e) => e.type === 'ticketFixed').length;
    const rejected = events.filter((e) => e.type === 'rejected').length;
    expect(fixed).toBe(rejected);
    for (const c of r.customers) {
      expect(c.state).toBe('gone');
      if (c.rejected > 0) expect(c.heard).toEqual(c.order);
    }
  });

  it('a restart mid-shift keeps forced order lines and difficulty', () => {
    const lines = { mei: 'mei.7' } as const;
    const r: Rush = createRush(3, 'hard', lines);
    const i = emptyRushInput();
    i.action = { type: 'restart' };
    stepRush(r, i, STEP);
    expect(r.difficulty).toBe('hard');
    expect(r.customers.find((c) => c.def.id === 'mei')?.line.id).toBe('mei.7');
  });
});
