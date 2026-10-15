import { describe, expect, it } from 'vitest';
import {
  cancelPress,
  createBarista,
  startDrink,
  stepBarista,
  CARRIED_GRACE,
  stepPress,
  TAP_MAX,
  type Barista,
  type BaristaEvent,
  type BaristaInput,
} from '../../src/core/barista';
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
  type RushWeek,
} from '../../src/core/rush';
import type { CustomerId } from '../../src/data/customers';
import { OWNER_LINES } from '../../src/data/ownerLines';
import { clipFor } from '../../src/data/voice';
import { awaitingRender } from '../../src/data/voice/script';
import { controlsAt, OWNER_DEMO } from '../../src/sim/latte/demo';
import { orderTier, type Difficulty } from '../../src/sim/listening';
import type { Utterance } from '../../src/core/speech';
import { SHOT_MAX, SHOT_TARGET } from '../../src/sim/espresso';
import { createPourGate } from '../../src/sim/latte/pitcher';
import { SCALD_TEMP, scoreMilk } from '../../src/sim/steam';
import { createEspresso, scoreEspresso } from '../../src/sim/espresso';
import { scorePattern } from '../../src/sim/latte/score';
import { runTrack } from '../../src/sim/latte/demo';
import { SILKY_MILK } from '../../src/sim/milk';
import { REJECT_PENALTY } from '../../src/sim/rush';
import type { DrinkType, Order } from '../../src/sim/rush';

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
        // Whoever it was for has gone: hand it to anyone who ordered this drink (with this
        // milk: the wrong milk is handed straight back), or bin it.
        const d = b.ready;
        const other = waitingCustomers(r).find(
          (c) =>
            c.heard?.type === d?.type && (d?.type !== 'flatWhite' || c.heard?.milk === d.milkType),
        );
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
    // A dawdling barista, so a second ticket is on the rail when the first drink is ready.
    const { r, said, events } = play({ wrongFirst: true, delay: 30 });
    expect(events.some((e) => e.type === 'rejected')).toBe(true);
    expect(said).toContain('rush.wrongDrink');
    expect(said.some((k) => k.endsWith('.rejected'))).toBe(true);
    // Recovered: the same drink then went to the right person.
    expect(r.summary!.ordersCompleted).toBeGreaterThanOrEqual(4);
  });

  describe('handing back the wrong milk', () => {
    /** A flat-white customer waiting on the rail, and their drink made with the wrong milk. */
    function wrongMilkAtThePass(patience: number, seed = 3, week: RushWeek | null = null) {
      const r = createRush(seed, 'normal', {}, week);
      while (r.phase !== 'service') stepRush(r, emptyRushInput(), STEP);
      const c = r.customers.find((x) => x.order.type === 'flatWhite') as RushCustomer;
      c.state = 'waiting';
      c.heard = { ...c.order };
      c.ticket = 1;
      c.registerAt = r.time;
      c.patience = patience;
      const b = r.barista;
      b.ready = {
        type: 'flatWhite',
        milkType: c.order.milk === 'oat' ? 'soy' : 'oat',
        espresso: scoreEspresso({ ...createEspresso(), dose: 19, shotTime: 28, done: true }),
        milk: scoreMilk(SILKY_MILK),
        pattern: scorePattern(runTrack(OWNER_DEMO, SILKY_MILK).pour.foam),
        fill: 0.95,
        spill: 0,
        water: 0,
        temp: 62,
        madeAt: r.time,
      };
      b.drink = 'flatWhite';
      b.phase = 'ready';
      const serve = (): RushEvent[] => {
        const i = emptyRushInput();
        i.action = { type: 'serve', customer: c.key };
        stepRush(r, i, STEP);
        const ev = [...r.events];
        r.events.length = 0;
        return ev;
      };
      return { r, c, serve };
    }

    it('a week shift raises no wrong-milk event for a hand-back that sends them out', () => {
      const week: RushWeek = { shiftIndex: 2, unlockedDrinks: ['flatWhite', 'longBlack'] };
      const handBack = (seed: number, share: number) => {
        const { r, c, serve } = wrongMilkAtThePass(0, seed, week);
        c.patience = c.maxPatience * share;
        const wrongMilk = (): number =>
          r.shiftEvents.log.fired.filter((f) => f.id === 'WRONG_MILK').length;
        const before = wrongMilk();
        const ev = serve();
        return { c, ev, fired: wrongMilk() - before };
      };
      // A seed where the same hand-back, with patience to spare, does bring up WRONG_MILK.
      const seed = Array.from({ length: 40 }, (_, i) => i + 1).find(
        (s) => handBack(s, 1).fired > 0,
      );
      expect(seed).toBeDefined();
      const out = handBack(seed as number, REJECT_PENALTY * 0.5);
      expect(out.c.outcome).toBe('walkout');
      expect(out.fired).toBe(0);
      expect(out.ev.some((e) => e.type === 'shiftEvent' && e.event === 'WRONG_MILK')).toBe(false);
    });

    it('each hand-back costs patience; never tops it back up', () => {
      const { c, serve } = wrongMilkAtThePass(60);
      const before = c.patience;
      serve();
      expect(c.rejected).toBe(1);
      expect(c.patience).toBeLessThan(before - c.def.patience * REJECT_PENALTY + 0.01);
    });

    it('three wrong-milk hand-backs use up the last of their patience: they walk out', () => {
      // REJECT_PENALTY of their patience per hand-back; start with a bit under three of those.
      const { c, serve } = wrongMilkAtThePass(0);
      c.patience = c.def.patience * REJECT_PENALTY * 2.9;
      const events = [...serve(), ...serve()];
      expect(c.state).toBe('waiting');
      events.push(...serve());
      expect(c.rejected).toBe(3);
      expect(c.outcome).toBe('walkout');
      expect(c.reaction).toBe('furious');
      expect(events.some((e) => e.type === 'walkout' && e.customer === c.def.id)).toBe(true);
    });

    it('spamming Serve on a nearly-gone customer does not hold them at the counter', () => {
      const { c, serve } = wrongMilkAtThePass(1);
      serve();
      expect(c.outcome).toBe('walkout');
    });
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
          if (!clip) {
            if (!awaitingRender(e.line.key)) missing.add(`${e.line.speaker}: ${e.line.text}`);
          }
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
    // First-shift lines (Dazza's long black) are said on every difficulty; the rest follow it.
    const tiers = (d: Difficulty, seed: number): number[] =>
      createRush(seed, d)
        .customers.filter((c) => !c.line.firstShift)
        .map((c) => orderTier(c.line));
    for (let seed = 1; seed < 8; seed++) {
      for (const d of ['easy', 'normal', 'hard'] as const)
        expect(createRush(seed, d).customers[0]?.line.id).toBe('dazza.3');
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

describe('two hands: steaming the milk while the shot runs', () => {
  const IN: BaristaInput = {
    holding: false,
    pressed: false,
    cupX: 0,
    cupY: 0,
    hasCup: false,
    jugDepth: 0.2,
    heightDelta: 0,
    heightPreset: null,
    next: false,
  };
  /** Step the station for `seconds` with this input (pressed only on the first step). */
  const hold = (b: Barista, out: BaristaEvent[], seconds: number, i: Partial<BaristaInput>) => {
    for (let n = 0; n < Math.round(seconds / STEP); n++)
      stepBarista(b, { ...IN, ...i, pressed: n === 0 && i.pressed === true }, STEP, 0, out);
  };
  const click = (b: Barista, out: BaristaEvent[]) =>
    stepBarista(b, { ...IN, pressed: true }, STEP, 0, out);
  const said = (out: BaristaEvent[]): string[] =>
    out.flatMap((e) => (e.type === 'line' ? [e.key] : []));

  /** A drink ground, locked in and its pump just started (with a key tap). */
  function pumping(drink: DrinkType): { b: Barista; out: BaristaEvent[] } {
    const b = createBarista();
    const out: BaristaEvent[] = [];
    startDrink(b, drink, out);
    while (b.espresso.dose < 19) hold(b, out, STEP, { holding: true });
    stepBarista(b, { ...IN, next: true }, STEP, 0, out);
    hold(b, out, 1.6, {});
    if (drink === 'longBlack') {
      hold(b, out, 5.4, { holding: true });
      hold(b, out, STEP, {});
    }
    expect(b.phase).toBe('shot');
    click(b, out);
    expect(b.espresso.extracting).toBe(true);
    return { b, out };
  }

  it('a click is a press let go within 0.25 s; a longer hold steams', () => {
    const p = { gate: createPourGate(), held: 0 };
    p.gate.armed = true;
    const step = (holding: boolean, pressed = false) => stepPress(p, { holding, pressed }, STEP);
    for (let n = 0; n < 6; n++) expect(step(true, n === 0)).toEqual({ click: false, steam: false });
    expect(step(false)).toEqual({ click: true, steam: false }); // 0.1 s: a click
    let last = { click: false, steam: false };
    for (let n = 0; n < Math.ceil(TAP_MAX / STEP) + 1; n++) last = step(true, n === 0);
    expect(last).toEqual({ click: false, steam: true });
    expect(step(false)).toEqual({ click: false, steam: false }); // let go of a hold: no click
    expect(step(false, true)).toEqual({ click: true, steam: false }); // a key tap inside one step
    // A second button pressed while one is held (mouse held, Space pressed) is just more holding.
    for (let n = 0; n < 20; n++) step(true, n === 0);
    expect(step(true, true)).toEqual({ click: false, steam: true });
  });

  it('the click that started the pump never turns into steam until it is let go', () => {
    const p = { gate: createPourGate(), held: 0 };
    for (let n = 0; n < 60; n++)
      expect(stepPress(p, { holding: true, pressed: n === 0 }, STEP).steam).toBe(false);
    stepPress(p, { holding: false, pressed: false }, STEP);
    let s = false;
    for (let n = 0; n < 20; n++) s = stepPress(p, { holding: true, pressed: n === 0 }, STEP).steam;
    expect(s).toBe(true);
  });

  it('flat white: hold during the shot steams fresh milk, a click stops the shot, the milk carries on', () => {
    const { b, out } = pumping('flatWhite');
    hold(b, out, 0.1, {}); // let go of the click that started the pump
    hold(b, out, 0.2, { holding: true, pressed: true });
    expect(b.phase).toBe('shot'); // not yet a hold
    expect(b.steam.valveOpen).toBe(false);
    hold(b, out, 0.1, { holding: true });
    expect(b.phase).toBe('shotSteam');
    expect(said(out)).toContain('shot.overlap');
    while (b.espresso.shotTime < 26) hold(b, out, STEP, { holding: true, jugDepth: 0.2 });
    expect(b.steam.temp).toBeGreaterThan(40);
    expect(b.steam.aeration).toBeGreaterThan(0.2);
    click(b, out); // let go and click: the shot stops, the milk only pauses
    expect(b.espresso.done).toBe(true);
    expect(b.steam.done).toBe(false);
    expect(said(out)).not.toContain('steam.tooEarly');
    hold(b, out, 0.01, {});
    // Same scoring as one step at a time: stopped in the window, no faults.
    expect(b.espressoScore?.faults).toEqual([]);
    expect(b.espresso.shotTime).toBeGreaterThanOrEqual(SHOT_TARGET[0]);
    expect(b.espresso.shotTime).toBeLessThanOrEqual(SHOT_TARGET[1]);
    const warm = b.steam.temp;
    hold(b, out, 0.4, { holding: true, pressed: true, jugDepth: 2.5 });
    hold(b, out, 0.4, { holding: true, jugDepth: 2.5 });
    expect(b.phase).toBe('steam');
    expect(b.steam.temp).toBeGreaterThan(warm); // the same jug, not a fresh one
    while (b.steam.temp < 60) hold(b, out, STEP, { holding: true, jugDepth: 2.5 });
    hold(b, out, STEP, {});
    expect(b.steam.done).toBe(true);
    expect(b.milkScore?.faults).toEqual([]);
    hold(b, out, 0.7, {});
    expect(b.phase).toBe('pour');
  });

  it('while steaming, Enter stops the shot and the milk keeps going', () => {
    const { b, out } = pumping('flatWhite');
    hold(b, out, 0.1, {});
    hold(b, out, 0.3, { holding: true, pressed: true });
    while (b.espresso.shotTime < 26) hold(b, out, STEP, { holding: true, jugDepth: 0.2 });
    stepBarista(b, { ...IN, holding: true, jugDepth: 0.2, next: true }, STEP, 0, out);
    expect(b.espresso.done).toBe(true);
    expect(b.steam.valveOpen).toBe(true);
    hold(b, out, 0.1, { holding: true, jugDepth: 0.2 });
    expect(b.espressoScore?.faults).toEqual([]);
  });

  it('while steaming, a quick click is just steam: it never stops the shot', () => {
    const { b, out } = pumping('flatWhite');
    hold(b, out, 0.1, {});
    hold(b, out, 1, { holding: true, pressed: true });
    expect(b.phase).toBe('shotSteam');
    hold(b, out, 0.2, {}); // let go: the valve pauses
    hold(b, out, 0.1, { holding: true, pressed: true }); // a 0.1 s click
    hold(b, out, 0.2, {});
    expect(b.espresso.extracting).toBe(true);
    expect(b.steam.valveOpen).toBe(false);
  });

  it('pausing cancels a press: a release first seen on resume is never a click', () => {
    // Serial shot: pump on, let go, press again for 0.1 s, Esc, let go while paused, resume.
    const serial = pumping('flatWhite');
    hold(serial.b, serial.out, 0.1, {});
    hold(serial.b, serial.out, 0.1, { holding: true, pressed: true });
    expect(serial.b.phase).toBe('shot');
    cancelPress(serial.b);
    hold(serial.b, serial.out, 0.1, {});
    expect(serial.b.espresso.extracting).toBe(true);
    expect(serial.b.espresso.done).toBe(false);
    // The same while already steaming: the valve closes, the shot runs on.
    const { b, out } = pumping('flatWhite');
    hold(b, out, 0.1, {});
    hold(b, out, 1, { holding: true, pressed: true });
    hold(b, out, 0.2, {});
    hold(b, out, 0.1, { holding: true, pressed: true });
    expect(b.steam.valveOpen).toBe(true);
    cancelPress(b);
    hold(b, out, 0.1, {});
    expect(b.steam.valveOpen).toBe(false);
    expect(b.espresso.extracting).toBe(true);
  });

  it('a second device pressed while steaming is just more holding, in either order', () => {
    // The sim sees holding = mouse || Space, so "mouse, then Space" and "Space, then mouse" both
    // arrive as: held, a fresh press while still held, one let go (still held), the other let go.
    for (const order of ['mouse then Space', 'Space then mouse']) {
      const { b, out } = pumping('flatWhite');
      hold(b, out, 0.1, {});
      hold(b, out, 1, { holding: true, pressed: true, jugDepth: 0.2 }); // first device
      expect(b.phase, order).toBe('shotSteam');
      hold(b, out, 0.5, { holding: true, pressed: true, jugDepth: 0.2 }); // second device
      expect(b.espresso.extracting, order).toBe(true);
      expect(b.steam.valveOpen, order).toBe(true);
      hold(b, out, 0.5, { holding: true, jugDepth: 0.2 }); // first let go, second still down
      expect(b.espresso.extracting, order).toBe(true);
      expect(b.steam.valveOpen, order).toBe(true);
      hold(b, out, 0.1, {}); // second let go
      expect(b.espresso.extracting, order).toBe(true);
      expect(b.steam.valveOpen, order).toBe(false);
    }
  });

  it('when the shot stops and the milk finishes in the same step, the shot is done first', () => {
    const { b, out } = pumping('flatWhite');
    hold(b, out, 0.1, {});
    hold(b, out, 0.3, { holding: true, pressed: true });
    while (b.espresso.shotTime < 26) hold(b, out, STEP, { holding: true, jugDepth: 2.5 });
    b.steam.temp = SCALD_TEMP - 0.01; // the milk finishes (scalds) on this step
    out.length = 0;
    stepBarista(b, { ...IN, holding: true, jugDepth: 2.5, next: true }, STEP, 0, out);
    const kinds = out.map((e) => e.type);
    expect(b.espresso.done).toBe(true);
    expect(b.steam.done).toBe(true);
    expect(kinds).toContain('shotDone');
    expect(kinds).toContain('milkDone');
    expect(kinds.indexOf('shotDone')).toBeLessThan(kinds.indexOf('milkDone'));
    // The lines follow the same order: the shot's verdict, then the milk's.
    const lines = said(out);
    expect(lines.indexOf('shot.short')).toBeLessThan(lines.indexOf('steam.scalded'));
  });

  it('warm milk left alone once the shot is off counts as finished, after a short grace', () => {
    const { b, out } = pumping('flatWhite');
    hold(b, out, 0.1, {});
    hold(b, out, 0.3, { holding: true, pressed: true });
    while (b.steam.temp < 58) hold(b, out, STEP, { holding: true, jugDepth: 0.2 });
    hold(b, out, 0.2, {}); // done steaming; the shot is still running
    expect(b.steam.done).toBe(false);
    while (b.espresso.shotTime < 26) hold(b, out, STEP, {});
    click(b, out);
    hold(b, out, 0.7, {}); // the shot settles: same jug, steam step
    expect(b.phase).toBe('steam');
    expect(b.steam.done).toBe(false); // still time to grab it again
    hold(b, out, CARRIED_GRACE, {});
    expect(b.steam.done).toBe(true);
    expect(said(out)).not.toContain('steam.tooEarly');
    hold(b, out, 0.7, {});
    expect(b.phase).toBe('pour');
  });

  it('let go to click the shot off, then grab the jug again: the milk keeps heating', () => {
    const { b, out } = pumping('flatWhite');
    hold(b, out, 0.1, {});
    hold(b, out, 0.3, { holding: true, pressed: true });
    while (b.espresso.shotTime < 26) hold(b, out, STEP, { holding: true, jugDepth: 0.2 });
    click(b, out);
    hold(b, out, 0.5, {}); // a slow hand: release, click, a moment's thought
    hold(b, out, 0.3, { holding: true, pressed: true });
    hold(b, out, 0.6, { holding: true, jugDepth: 2.5 });
    expect(b.phase).toBe('steam');
    expect(b.steam.done).toBe(false);
    expect(b.steam.valveOpen).toBe(true);
  });

  it('Gaz praises the two hands once a shift, not every drink', () => {
    const lines: string[] = [];
    for (let k = 0; k < 2; k++) {
      const { b, out } = pumping('flatWhite');
      if (k === 1) b.overlaps = 1; // a second drink in the same shift
      hold(b, out, 0.1, {});
      hold(b, out, 0.5, { holding: true, pressed: true });
      expect(b.phase).toBe('shotSteam');
      lines.push(...said(out));
    }
    expect(lines.filter((k) => k === 'shot.overlap')).toHaveLength(1);
  });

  it('a shot left running to the limit while steaming goes in the bin, and Gaz says why', () => {
    const { b, out } = pumping('flatWhite');
    hold(b, out, 0.1, {});
    hold(b, out, 0.3, { holding: true, pressed: true });
    while (b.phase === 'shotSteam') hold(b, out, STEP, { holding: true, jugDepth: 2.5 });
    expect(b.espresso.shotTime).toBeGreaterThanOrEqual(SHOT_MAX);
    expect(b.phase).toBe('idle');
    expect(b.binned).toBe(1);
    expect(said(out)).toContain('shot.over');
  });

  it('long black: no milk, so nothing changes: a press stops the shot at once, never steams', () => {
    const { b, out } = pumping('longBlack');
    hold(b, out, 0.1, {});
    while (b.espresso.shotTime < 26) hold(b, out, STEP, {});
    const at = b.espresso.shotTime;
    hold(b, out, 0.5, { holding: true, pressed: true });
    expect(b.espresso.done).toBe(true);
    expect(b.espresso.shotTime).toBeCloseTo(at, 5); // stopped on the press, not the release
    expect(out.some((e) => e.type === 'phase' && e.phase === 'shotSteam')).toBe(false);
    expect(b.steam.valveOpen).toBe(false);
  });

  it('every flat white starts with a cold jug (the milk gauge shows during its shot)', () => {
    const b = createBarista();
    b.steam.temp = 60;
    b.steam.done = true;
    startDrink(b, 'flatWhite', []);
    expect(b.steam.temp).toBe(5);
    expect(b.steam.done).toBe(false);
  });
});
