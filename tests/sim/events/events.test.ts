import { describe, expect, it } from 'vitest';
import { createRng } from '../../../src/core/rng';
import { CUSTOMERS } from '../../../src/data/customers';
import { GAZ_EVENT_LINES } from '../../../src/data/dialogue/gazEvents';
import { DIFFICULT_PERSONALITIES, EVENT_DATA, USUAL_AFFINITY } from '../../../src/data/events';
import type { EventContext, EventOutcome, ShiftEventId } from '../../../src/sim/contracts/events';
import { eventDef, SHIFT_EVENTS } from '../../../src/sim/events/defs';
import { ibisForShift } from '../../../src/sim/events/rareBird';
import { scheduleIbis } from '../../../src/sim/ibis';
import { LISTEN_COST } from '../../../src/sim/listening';

const ctx = (o: Partial<EventContext> = {}): EventContext => ({
  shiftIndex: 3,
  secondsIntoService: 60,
  queueLength: 1,
  customer: 'karen',
  affinity: {},
  playerMistake: false,
  rng: createRng(1),
  ...o,
});

/** Every outcome an event can produce: each choice under each context that changes the rules. */
function outcomes(id: ShiftEventId): Array<{ choice: string; o: EventOutcome }> {
  const def = eventDef(id);
  const out: Array<{ choice: string; o: EventOutcome }> = [];
  for (const playerMistake of [false, true])
    for (const queueLength of [0, 1, 4])
      for (const affinity of [{}, { karen: USUAL_AFFINITY + 1 }])
        for (let seed = 1; seed <= 12; seed++)
          for (const c of def.choices)
            out.push({
              choice: c.id,
              o: def.resolve(
                c.id,
                ctx({ playerMistake, queueLength, affinity, rng: createRng(seed) }),
              ),
            });
  return out;
}

describe('shift events', () => {
  it('has the eight events, each with distinct choices', () => {
    expect(SHIFT_EVENTS.map((e) => e.id).sort()).toEqual(
      [
        'CALL_MANAGER',
        'CHANGE_MIND',
        'JUST_COFFEE',
        'QUEUE_JUMP',
        'RARE_BIRD',
        'THE_NAME',
        'THE_USUAL',
        'WRONG_MILK',
      ].sort(),
    );
    for (const e of SHIFT_EVENTS) {
      expect(e.choices.length).toBeGreaterThanOrEqual(2);
      expect(new Set(e.choices.map((c) => c.id)).size).toBe(e.choices.length);
    }
  });

  it('every Gaz line an outcome can emit exists: ≥3 keys per event, ≥3 variants per key', () => {
    const reached = new Set<string>();
    for (const e of SHIFT_EVENTS) {
      const keys = new Set(outcomes(e.id).map(({ o }) => o.gazLineKey));
      expect(keys.has(undefined)).toBe(false);
      expect(keys.size).toBeGreaterThanOrEqual(3);
      for (const k of keys) {
        const pool = GAZ_EVENT_LINES[k as string];
        expect(pool, k).toBeDefined();
        expect(pool?.tiers[0]?.length).toBeGreaterThanOrEqual(3);
        reached.add(k as string);
      }
    }
    expect([...reached].sort()).toEqual(Object.keys(GAZ_EVENT_LINES).sort());
  });

  it("each event's choices lead to different outcomes", () => {
    for (const e of SHIFT_EVENTS) {
      const c = ctx({ customer: 'karen', affinity: { karen: 5 }, rng: createRng(5) });
      const outs = e.choices.map((ch) =>
        JSON.stringify(e.resolve(ch.id, { ...c, rng: createRng(5) })),
      );
      expect(new Set(outs).size, e.id).toBe(outs.length);
    }
  });

  it('a choice that costs time costs at least that much patience; waste is whole cents', () => {
    for (const e of SHIFT_EVENTS)
      for (const { choice, o } of outcomes(e.id)) {
        const cost = e.choices.find((c) => c.id === choice)?.costSeconds ?? 0;
        expect(cost).toBeGreaterThanOrEqual(0);
        expect(o.patienceDelta).toBeLessThanOrEqual(-cost === 0 ? 5 : -cost);
        if (o.wasteCents !== undefined) expect(Number.isInteger(o.wasteCents)).toBe(true);
      }
    expect(EVENT_DATA.JUST_COFFEE.choices.find((c) => c.id === 'ask')?.costSeconds).toBe(
      LISTEN_COST.clarify,
    );
  });

  it('THE_USUAL needs the player to know the regular, and otherwise falls back to a clarify', () => {
    const d = eventDef('THE_USUAL');
    expect(d.canTrigger(ctx({ customer: 'beryl', affinity: {} }))).toBe(false);
    expect(d.canTrigger(ctx({ customer: 'beryl', affinity: { beryl: USUAL_AFFINITY } }))).toBe(
      true,
    );
    const forgot = d.resolve('make', ctx({ customer: 'beryl', affinity: {} }));
    expect(forgot.gazLineKey).toBe('event.theUsual.forgot');
    expect(forgot.patienceDelta).toBe(-LISTEN_COST.clarify);
    const known = d.resolve('make', ctx({ customer: 'beryl', affinity: { beryl: 5 } }));
    expect(known.affinityDelta).toEqual({ beryl: 1 });
  });

  it('fairness: a legitimate complaint is never scored as a difficult customer', () => {
    const d = eventDef('WRONG_MILK');
    for (const c of CUSTOMERS) {
      expect(d.canTrigger(ctx({ customer: c.id, playerMistake: true }))).toBe(true);
      for (const ch of d.choices)
        expect(d.resolve(ch.id, ctx({ customer: c.id, playerMistake: true })).difficult).toBe(
          false,
        );
    }
  });

  it('fairness: difficult behaviour belongs to a personality, never to anyone else', () => {
    expect(DIFFICULT_PERSONALITIES).toEqual(['karen']);
    for (const id of ['WRONG_MILK', 'CALL_MANAGER'] as const)
      for (const c of CUSTOMERS)
        expect(eventDef(id).canTrigger(ctx({ customer: c.id, playerMistake: false }))).toBe(
          DIFFICULT_PERSONALITIES.includes(c.id),
        );
  });

  it('fairness: CALL_MANAGER always backs the staff; abuse ends service without touching the drink', () => {
    for (const { o } of outcomes('CALL_MANAGER')) {
      expect(o.reputationDelta ?? 0).toBeGreaterThanOrEqual(0);
      expect(o.satisfactionDelta).toBeGreaterThanOrEqual(0);
      expect(o.gazLineKey).toBeDefined();
    }
    const refused = eventDef('CALL_MANAGER').resolve('refuse', ctx());
    expect(refused.endsService).toBe(true);
    expect(refused.satisfactionDelta).toBe(0);
    expect(refused.wasteCents ?? 0).toBe(0);
  });

  it('an unknown choice is an error, not a silent outcome', () => {
    expect(() => eventDef('THE_NAME').resolve('shout', ctx())).toThrow();
  });

  it('RARE_BIRD delegates to the ibis state machine', () => {
    for (let s = 1; s <= 50; s++) {
      const picked = ibisForShift(s, true);
      expect(picked.scheduledAt).toBe(scheduleIbis(s, true));
      expect(picked.scheduledAt).not.toBeNull();
      expect(picked.state).toBe('absent');
      expect(ibisForShift(s, false).scheduledAt).toBeNull();
    }
    expect(eventDef('RARE_BIRD').canTrigger(ctx({ customer: null }))).toBe(true);
    expect(eventDef('RARE_BIRD').canTrigger(ctx({ customer: 'dazza' }))).toBe(false);
  });
});
