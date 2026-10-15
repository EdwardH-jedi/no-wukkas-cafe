import { describe, expect, it } from 'vitest';
import { STEP } from '../../src/core/clock';
import {
  atCounter,
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
import { clipFor } from '../../src/data/voice';
import { controlsAt, OWNER_DEMO } from '../../src/sim/latte/demo';
import { orderTier, type Difficulty } from '../../src/sim/listening';
import type { Utterance } from '../../src/core/speech';
import type { Order } from '../../src/sim/rush';

interface BotOpts {
  /** Seconds to dawdle before starting each drink (a slower human). */
  delay?: number;
  /** Never takes an order. */
  idle?: boolean;
  /** Serve the first drink to the wrong customer, then fix it. */
  wrongFirst?: boolean;
  /** Bin the first drink and remake it. */
  binFirst?: boolean;
  /** Ring this customer (or the first flat-white customer) up wrong: the wrong milk for a flat
   *  white, the wrong drink otherwise. */
  mishear?: CustomerId | 'firstFlatWhite';
  /** Use every listening aid once per customer before ringing up. */
  aids?: boolean;
  difficulty?: Difficulty;
}

interface BotMemory {
  target: RushCustomer | null;
  idleFor: number;
  wrongDone: boolean;
  binDone: boolean;
  step: number;
  misheard: string | null;
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
  const counter = atCounter(r);
  if (counter?.state === 'deciding') {
    const l = counter.listen;
    // A replay while their own line is still queued is ignored (nothing new to hear), so a
    // sensible player waits for it to play before asking again.
    const queued = r.speech.queue.some((q) => q.listen && q.speaker === counter.def.id);
    if (o.aids && l.replays === 0) i.action = queued ? null : { type: 'replay' };
    else if (o.aids && l.repeats === 0 && counter.stateTime > 0.5) i.action = { type: 'repeat' };
    else if (o.aids && l.clarified.length === 0 && counter.stateTime > 0.5)
      i.action = { type: 'clarify', field: 'milk' };
    else if (!o.aids || counter.stateTime > 0.5) {
      const t = counter.order;
      const wrong: Order =
        t.type === 'flatWhite'
          ? { ...t, milk: t.milk === 'oat' ? 'soy' : 'oat' }
          : { type: 'flatWhite', milk: 'full', extraHot: false, heart: false };
      const id = counter.def.id;
      if (o.mishear === 'firstFlatWhite' && !m.misheard && t.type === 'flatWhite') m.misheard = id;
      const mis = o.mishear === id || (o.mishear === 'firstFlatWhite' && m.misheard === id);
      i.action = { type: 'ringUp', order: mis ? wrong : t };
    }
    if (i.action) return i;
  }
  switch (b.phase) {
    case 'idle': {
      m.idleFor += STEP;
      const queue = waitingCustomers(r).sort((a, c) => (a.ticket ?? 0) - (c.ticket ?? 0));
      const next = queue[0];
      if (next && m.idleFor >= (o.delay ?? 0)) {
        m.target = next;
        m.idleFor = 0;
        const h = next.heard!;
        i.action = { type: 'make', drink: h.type, milk: h.milk ?? 'full' };
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
      const hot = m.target?.heard?.extraHot ? 71 : 60;
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
        const other = waitingCustomers(r).find((c) => c.heard?.type === b.ready?.type);
        i.action = other ? { type: 'serve', customer: other.def.id } : { type: 'bin' };
        break;
      }
      // Handed back and the ticket corrected? This drink is no good to them: bin it, remake.
      const h = target.heard;
      const d = b.ready;
      if (
        target.rejected > 0 &&
        h &&
        d &&
        (d.type !== h.type || (d.type === 'flatWhite' && d.milkType !== h.milk))
      ) {
        i.action = { type: 'bin' };
        break;
      }
      if (o.wrongFirst && !m.wrongDone) {
        const wrong = waitingCustomers(r).find((c) => c.heard?.type !== b.ready?.type);
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
  const r = createRush(seed, o.difficulty ?? 'normal');
  const m: BotMemory = {
    target: null,
    idleFor: 0,
    wrongDone: false,
    binDone: false,
    step: 0,
    misheard: null,
  };
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
        leftAtServe[c.def.id] = c.patience / c.def.patience;
      }
    }
    r.events.length = 0;
    if (r.phase === 'summary') break;
  }
  return { r, events, said, leftAtServe };
}

describe('Day 2 rush, played headless', () => {
  it('a competent barista serves all six, correctly, with patience to spare', () => {
    const { r, said, leftAtServe } = play();
    expect(r.phase).toBe('summary');
    const s = r.summary!;
    expect(s.ordersCompleted).toBe(6);
    expect(s.walkouts).toBe(0);
    expect(s.correctOrders).toBe(6);
    expect(s.satisfaction).toBeGreaterThanOrEqual(75);
    expect(['excellent', 'good']).toContain(s.grade);
    expect(s.tipsCents).toBeGreaterThan(0);
    for (const left of Object.values(leftAtServe)) expect(left).toBeGreaterThanOrEqual(0.2);
    expect(said).toContain('rush.intro.0');
    // Each customer said one of their curated orders.
    for (const id of ['dazza', 'priya', 'beryl', 'mei', 'jiwoo', 'karen'])
      expect(
        said.some((k) => new RegExp(`^${id}\\.\\d+$`).test(k)),
        id,
      ).toBe(true);
    expect(said.some((k) => k.startsWith('rush.end.'))).toBe(true);
  });

  it('a barista 10 s slower per drink loses at most one customer', () => {
    const { r } = play({ delay: 10 });
    expect(r.summary!.walkouts).toBeLessThanOrEqual(1);
  });

  it('an idle barista loses everyone, and Gaz notices', () => {
    const { r, said } = play({ idle: true });
    const s = r.summary!;
    expect(s.walkouts).toBe(6);
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

  it('every line anyone says has a voice recording', () => {
    const missing = new Set<string>();
    for (const o of [
      {},
      { idle: true },
      { wrongFirst: true },
      { binFirst: true },
      { delay: 10 },
      { aids: true },
      { mishear: 'firstFlatWhite' },
      { difficulty: 'easy' },
      { difficulty: 'hard' },
    ] as BotOpts[])
      for (const e of play(o).events)
        if (e.type === 'say') {
          const clip = clipFor(e.line.speaker, e.line.text, e.line.delivery);
          if (!clip) missing.add(`${e.line.speaker}: ${e.line.text}`);
          // Subtitle timing follows the recording: the line holds the floor for the whole clip.
          else expect(e.line.duration).toBeGreaterThan(clip.duration);
        }
    expect([...missing]).toEqual([]);
  }, 60_000);

  it('every customer ends up gone and the summary matches the records', () => {
    const { r } = play({ delay: 10 });
    expect(r.customers.every((c) => c.state === 'gone')).toBe(true);
    const s = r.summary!;
    expect(s.ordersCompleted + s.walkouts).toBe(6);
    expect(s.tipsCents).toBe(r.records.reduce((t, x) => t + x.tipCents, 0));
  });

  it('is deterministic for a seed', () => {
    const a = play({ delay: 5 }, 11);
    const b = play({ delay: 5 }, 11);
    expect(a.said).toEqual(b.said);
    expect(a.r.summary).toEqual(b.r.summary);
  });

  it('a misheard ticket is made as rung up, handed back, corrected, then served right', () => {
    // Someone patient enough to wait for the remake.
    const patient = createRush(3).customers.find(
      (c) => c.order.type === 'flatWhite' && c.def.patience >= 105,
    )!.def.id;
    const { r, said, events } = play({ mishear: patient });
    const rec = r.listening.find((x) => x.wrong.length > 0);
    expect(rec?.wrong).toEqual(['milk']);
    const c = r.customers.find((x) => x.def.id === rec?.customer)!;
    expect(said).toContain(`${c.def.id}.rejectedMilk`);
    expect(said).toContain(`${c.def.id}.answer.milk`); // they say which milk at the pass
    expect(said).toContain('rush.misheard');
    expect(events.some((e) => e.type === 'ticketFixed' && e.customer === c.def.id)).toBe(true);
    expect(c.outcome).toBe('served');
    expect(c.heard).toEqual(c.order);
    expect(r.listening.filter((x) => x.wrong.length === 0)).toHaveLength(5);
  });

  it('replay, repeat and clarify are counted, cost patience, and use the right recordings', () => {
    const plain = play();
    const aided = play({ aids: true });
    expect(aided.r.listening).toHaveLength(6);
    for (const x of aided.r.listening) {
      expect(x.replays).toBe(1);
      expect(x.repeats).toBe(1);
      expect(x.clarified).toEqual(['milk']);
      expect(x.wrong).toEqual([]);
    }
    const says = aided.events
      .filter((e) => e.type === 'say')
      .map((e) => (e as { line: Utterance }).line);
    expect(says.filter((u) => u.delivery === 'slow')).toHaveLength(6);
    expect(says.filter((u) => u.key.endsWith('.answer.milk'))).toHaveLength(6);
    expect(aided.events.filter((e) => e.type === 'ask')).toHaveLength(12);
    // Listening aids aren't free: customers end up less patient.
    const left = (p: Played): number =>
      Object.values(p.leftAtServe).reduce((a, b) => a + (b ?? 0), 0);
    expect(left(aided)).toBeLessThan(left(plain));
  });

  it('"could you repeat that?" works twice per customer; Replay plays what they said last', () => {
    const r = createRush(5);
    const go = (a: RushInput['action']): void => {
      const i = emptyRushInput();
      i.action = a;
      stepRush(r, i, STEP);
    };
    for (let n = 0; n < 60 / STEP && !atCounter(r); n++) {
      const i = emptyRushInput();
      i.pressed = n % 20 === 0;
      if (atRegister(r)) i.action = { type: 'takeOrder' };
      stepRush(r, i, STEP);
    }
    const c = atCounter(r)!;
    expect(c).toBeTruthy();
    go({ type: 'repeat' });
    go({ type: 'repeat' });
    go({ type: 'repeat' });
    expect(c.listen.repeats).toBe(2);
    go({ type: 'clarify', field: 'drink' });
    go({ type: 'replay' });
    expect(r.speech.current?.key).toBe(`${c.def.id}.answer.drink`);
    expect(c.listen.replays).toBe(1);
  });

  it('difficulty picks the order tiers, and the same seed gives the same orders', () => {
    const tiers = (d: Difficulty, seed: number): number[] =>
      createRush(seed, d).customers.map((c) => orderTier(c.line));
    for (let seed = 1; seed < 8; seed++) {
      expect(tiers('easy', seed).every((t) => t === 1)).toBe(true);
      expect(tiers('normal', seed).every((t) => t <= 2)).toBe(true);
      expect(tiers('hard', seed).every((t) => t >= 2)).toBe(true);
      expect(createRush(seed, 'hard').customers.map((c) => c.line.id)).toEqual(
        createRush(seed, 'hard').customers.map((c) => c.line.id),
      );
    }
  });

  it('a competent listener gets through a hard shift too', () => {
    const { r } = play({ difficulty: 'hard' });
    expect(r.summary?.ordersCompleted).toBe(6);
    expect(r.listening.every((x) => x.wrong.length === 0)).toBe(true);
  });

  it('restart mid-shift goes back to the intro with a fresh queue', () => {
    const r = createRush(1);
    const m: BotMemory = {
      target: null,
      idleFor: 0,
      wrongDone: false,
      binDone: false,
      step: 0,
      misheard: null,
    };
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
