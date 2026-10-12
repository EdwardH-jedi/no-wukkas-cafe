import { describe, expect, it } from 'vitest';
import { STEP } from '../../src/core/clock';
import {
  atRegister,
  createRush,
  emptyRushInput,
  stepRush,
  waitingCustomers,
  type Rush,
  type RushCustomer,
  type RushEvent,
  type RushInput,
} from '../../src/core/rush';
import type { CustomerId } from '../../src/data/customers';
import { OWNER_LINES } from '../../src/data/ownerLines';
import { controlsAt, OWNER_DEMO } from '../../src/sim/latte/demo';

interface BotOpts {
  /** Seconds to dawdle before starting each drink (a slower human). */
  delay?: number;
  /** Never takes an order. */
  idle?: boolean;
  /** Serve the first drink to the wrong customer, then fix it. */
  wrongFirst?: boolean;
  /** Bin the first drink and remake it. */
  binFirst?: boolean;
}

interface BotMemory {
  target: RushCustomer | null;
  idleFor: number;
  wrongDone: boolean;
  binDone: boolean;
  step: number;
}

/** A headless barista: the same inputs the mouse/keyboard produce, decided from state. */
function botInput(r: Rush, o: BotOpts, m: BotMemory): RushInput {
  const i = emptyRushInput();
  m.step++;
  if (r.phase === 'intro') {
    i.pressed = m.step % 20 === 0;
    return i;
  }
  if (r.phase !== 'service' || o.idle) return i;
  const b = r.barista;
  if (atRegister(r)) {
    i.action = { type: 'takeOrder' };
    return i;
  }
  switch (b.phase) {
    case 'idle': {
      m.idleFor += STEP;
      const queue = waitingCustomers(r).sort((a, c) => (a.ticket ?? 0) - (c.ticket ?? 0));
      const next = queue[0];
      if (next && m.idleFor >= (o.delay ?? 0)) {
        m.target = next;
        m.idleFor = 0;
        i.action = { type: 'make', drink: next.def.order.type };
      }
      break;
    }
    case 'grind':
      if (b.espresso.dose < 19) i.holding = true;
      else i.action = { type: 'next' };
      break;
    case 'water':
      i.holding = b.water < 0.65;
      break;
    case 'shot':
      if (!b.espresso.extracting && !b.espresso.done) i.pressed = m.step % 10 === 0;
      if (b.espresso.extracting && b.espresso.shotTime >= 27) i.pressed = true;
      break;
    case 'steam': {
      const hot = m.target?.def.order.extraHot ? 71 : 60;
      i.holding = !b.steam.done && b.steam.temp < hot;
      i.jugDepth = b.steam.aeration < 0.4 ? 0.2 : 2.5;
      break;
    }
    case 'pour': {
      const c = controlsAt(OWNER_DEMO, b.phaseTime);
      i.hasCup = true;
      i.cupX = c.targetX;
      i.cupY = c.targetY;
      i.holding = c.holding;
      i.heightDelta = c.targetHeight - b.controls.targetHeight;
      break;
    }
    case 'ready': {
      if (o.binFirst && !m.binDone) {
        m.binDone = true;
        i.action = { type: 'bin' };
        break;
      }
      const target = m.target;
      if (!target || target.state !== 'waiting') {
        // Whoever it was for has gone: hand it to anyone who ordered this drink, or bin it.
        const other = waitingCustomers(r).find((c) => c.def.order.type === b.ready?.type);
        i.action = other ? { type: 'serve', customer: other.def.id } : { type: 'bin' };
        break;
      }
      if (o.wrongFirst && !m.wrongDone) {
        const wrong = waitingCustomers(r).find((c) => c.def.order.type !== b.ready?.type);
        if (wrong) {
          m.wrongDone = true;
          i.action = { type: 'serve', customer: wrong.def.id };
          break;
        }
      }
      i.action = { type: 'serve', customer: target.def.id };
      break;
    }
    default:
      break;
  }
  return i;
}

interface Played {
  r: Rush;
  events: Array<RushEvent & { at: number }>;
  said: string[];
  /** Patience fraction left when each customer was served. */
  leftAtServe: Partial<Record<CustomerId, number>>;
}

function play(o: BotOpts = {}, seed = 3, maxSeconds = 900): Played {
  const r = createRush(seed);
  const m: BotMemory = { target: null, idleFor: 0, wrongDone: false, binDone: false, step: 0 };
  const events: Played['events'] = [];
  const said: string[] = [];
  const leftAtServe: Played['leftAtServe'] = {};
  for (let n = 0; n < maxSeconds / STEP; n++) {
    stepRush(r, botInput(r, o, m), STEP);
    for (const e of r.events) {
      events.push({ ...e, at: r.time });
      if (e.type === 'say') said.push(e.line.key);
      if (e.type === 'served') {
        const c = r.customers.find((x) => x.def.id === e.customer) as RushCustomer;
        leftAtServe[e.customer] = c.patience / c.def.patience;
      }
    }
    r.events.length = 0;
    if (r.phase === 'summary') break;
  }
  return { r, events, said, leftAtServe };
}

describe('Day 2 rush, played headless', () => {
  it('a competent barista serves all five, correctly, with patience to spare', () => {
    const { r, said, leftAtServe } = play();
    expect(r.phase).toBe('summary');
    const s = r.summary!;
    expect(s.ordersCompleted).toBe(5);
    expect(s.walkouts).toBe(0);
    expect(s.correctOrders).toBe(5);
    expect(s.satisfaction).toBeGreaterThanOrEqual(75);
    expect(['excellent', 'good']).toContain(s.grade);
    expect(s.tipsCents).toBeGreaterThan(0);
    for (const left of Object.values(leftAtServe)) expect(left).toBeGreaterThanOrEqual(0.2);
    expect(said).toContain('rush.intro.0');
    expect(said).toContain('dazza.order');
    expect(said).toContain('karen.order');
    expect(said.some((k) => k.startsWith('rush.end.'))).toBe(true);
  });

  it('a barista 10 s slower per drink loses at most one customer', () => {
    const { r } = play({ delay: 10 });
    expect(r.summary!.walkouts).toBeLessThanOrEqual(1);
  });

  it('an idle barista loses everyone, and Gaz notices', () => {
    const { r, said } = play({ idle: true });
    const s = r.summary!;
    expect(s.walkouts).toBe(5);
    expect(s.ordersCompleted).toBe(0);
    expect(s.grade).toBe('disaster');
    expect(said).toContain('rush.registerNag');
    expect(said).toContain('rush.walkout');
    expect(said).toContain('dazza.walkout');
  });

  it('a wrong drink is handed back, stays on the pass, and Gaz calls it out', () => {
    const { r, said, events } = play({ wrongFirst: true });
    expect(events.some((e) => e.type === 'rejected')).toBe(true);
    expect(said).toContain('rush.wrongDrink');
    expect(said.some((k) => k.endsWith('.rejected'))).toBe(true);
    // Recovered: the same drink then went to the right person.
    expect(r.summary!.ordersCompleted).toBeGreaterThanOrEqual(4);
  });

  it('binning a drink counts as waste and gets a comment', () => {
    const { r, said } = play({ binFirst: true });
    expect(said).toContain('rush.binned');
    expect(r.summary!.wasted).toBeGreaterThanOrEqual(1);
  });

  it('never cuts a customer off mid-sentence', () => {
    for (const o of [{}, { idle: true }, { wrongFirst: true }] as BotOpts[]) {
      const { events } = play(o);
      const says = events.filter(
        (e): e is Extract<RushEvent, { type: 'say' }> & { at: number } => e.type === 'say',
      );
      for (let k = 0; k < says.length - 1; k++) {
        const a = says[k]!;
        if (a.line.speaker === 'gaz') continue;
        // The next line can only start once this customer has finished.
        expect(says[k + 1]!.at - a.at).toBeGreaterThanOrEqual(a.line.duration - 1e-6);
      }
    }
  });

  it('every line key used exists, and nobody says the same thing twice in a row', () => {
    for (const o of [{}, { idle: true }, { wrongFirst: true }, { delay: 10 }] as BotOpts[]) {
      const { said, events } = play(o);
      for (const k of said) {
        if (k.startsWith('rush.intro.')) continue;
        const [speaker] = k.split('.');
        if (speaker === 'rush' || k in OWNER_LINES) expect(OWNER_LINES[k], k).toBeDefined();
      }
      const texts = events
        .filter((e) => e.type === 'say')
        .map((e) => (e as { line: { text: string } }).line.text);
      for (let k = 1; k < texts.length; k++) expect(texts[k]).not.toBe(texts[k - 1]);
    }
  });

  it('every customer ends up gone and the summary matches the records', () => {
    const { r } = play({ delay: 10 });
    expect(r.customers.every((c) => c.state === 'gone')).toBe(true);
    const s = r.summary!;
    expect(s.ordersCompleted + s.walkouts).toBe(5);
    expect(s.tipsCents).toBe(r.records.reduce((t, x) => t + x.tipCents, 0));
  });

  it('is deterministic for a seed', () => {
    const a = play({ delay: 5 }, 11);
    const b = play({ delay: 5 }, 11);
    expect(a.said).toEqual(b.said);
    expect(a.r.summary).toEqual(b.r.summary);
  });

  it('restart mid-shift goes back to the intro with a fresh queue', () => {
    const r = createRush(1);
    const m: BotMemory = { target: null, idleFor: 0, wrongDone: false, binDone: false, step: 0 };
    for (let n = 0; n < 60 / STEP; n++) stepRush(r, botInput(r, {}, m), STEP);
    expect(r.phase).toBe('service');
    const i = emptyRushInput();
    i.action = { type: 'restart' };
    stepRush(r, i, STEP);
    expect(r.phase).toBe('intro');
    expect(r.customers.every((c) => c.state === 'outside')).toBe(true);
    expect(r.records).toHaveLength(0);
    const intro = r.events.filter((e) => e.type === 'say').length;
    expect(intro).toBe(1); // the intro starts once, not twice
  });
});
