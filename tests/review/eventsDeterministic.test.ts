// Scenario 6: the bin chicken and the shift events are deterministic (same seed, same inputs →
// the same events at the same times), a shift event never starts while a customer's order is
// being said or rung up, and neither the bird's lines nor an event's ever cut an order line off.
// (The bird walking in mid-order: the .failing file.)

import { describe, expect, it } from 'vitest';
import type { RushWeek } from '../../src/core/rush';
import { birdSeeds, shiftWithBird, week, type Shift } from './eventsFlow';

const cache = new Map<string, Shift>();
/** One headless shift per (seed, mode), shared by the tests below (each takes ~0.5 s). */
const shift = (seed: number, w: RushWeek | null): Shift => {
  const k = `${seed}:${w?.shiftIndex ?? 'day2'}`;
  let s = cache.get(k);
  if (!s) cache.set(k, (s = shiftWithBird(seed, w)));
  return s;
};
const BIRD_SEED = birdSeeds(3, 1)[0] as number;
const WEEK_SEEDS = [BIRD_SEED, 1, 2];

describe('S6: the bird and shift events are deterministic', () => {
  it('Day 2 with the bird: the same seed and inputs give the same shift, event for event', () => {
    const a = shift(3, null);
    const b = shiftWithBird(3, null);
    expect(a.bird.state).toBe('gone');
    expect(a.trace.some((t) => t.includes('ibis {"type":"enter"}'))).toBe(true);
    expect(b.trace).toEqual(a.trace);
    expect(b.r.summary).toEqual(a.r.summary);
    expect(shift(4, null).trace).not.toEqual(a.trace); // the trace does depend on the seed
  }, 20_000);

  it('a week shift with RARE_BIRD booked: bird and events at the same times on a replay', () => {
    expect(BIRD_SEED).toBeGreaterThan(0);
    const a = shift(BIRD_SEED, week(3));
    const b = shiftWithBird(BIRD_SEED, week(3));
    expect(a.r.phase).toBe('summary');
    expect(a.trace.some((t) => t.includes('ibis {"type":"enter"}'))).toBe(true);
    expect(b.trace).toEqual(a.trace);
    expect(b.r.shiftEvents.log.fired).toEqual(a.r.shiftEvents.log.fired);
    expect(b.r.summary).toEqual(a.r.summary);
  }, 20_000);
});

describe('S6: events never interrupt an order', () => {
  it('no shift event is asked for while an order is being said or rung up (week shifts)', () => {
    let fired = 0;
    for (const seed of WEEK_SEEDS) {
      const s = shift(seed, week(3));
      fired += s.r.shiftEvents.log.fired.length;
      expect(s.eventInOrder, `seed ${seed}`).toEqual([]);
    }
    expect(fired).toBeGreaterThan(0);
  }, 20_000);

  it("neither the bird's lines nor an event's cut an order or answer short", () => {
    for (const seed of [3, 4]) expect(shift(seed, null).cutShort, `Day 2 ${seed}`).toEqual([]);
    for (const seed of WEEK_SEEDS)
      expect(shift(seed, week(3)).cutShort, `week ${seed}`).toEqual([]);
    const ibisLines = [...cache.values()].flatMap((s) =>
      s.trace.filter((t) => / say ibis\./.test(t)),
    );
    expect(ibisLines.length).toBeGreaterThan(0); // Gaz did talk about the bird
  }, 20_000);
});
