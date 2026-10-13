import { describe, expect, it } from 'vitest';
import { STEP } from '../../src/core/clock';
import {
  createIbis,
  IBIS,
  ibisPresent,
  scheduleIbis,
  stepIbis,
  type Ibis,
  type IbisEvent,
  type IbisInput,
} from '../../src/sim/ibis';

const input = (o: Partial<IbisInput> = {}): IbisInput => ({
  serviceTime: 100,
  doorOpen: false,
  shoo: false,
  noticed: false,
  ...o,
});

/** Run `seconds`, collecting events; `each` can change the input per step. */
function run(b: Ibis, seconds: number, each: (t: number) => Partial<IbisInput> = () => ({})) {
  const events: IbisEvent[] = [];
  for (let t = 0; t < seconds; t += STEP) {
    b.events.length = 0;
    stepIbis(b, input({ serviceTime: 100 + t, ...each(t) }), STEP);
    events.push(...b.events);
  }
  return events;
}

const arrived = (): Ibis => {
  const b = createIbis(1, true);
  run(b, 0.1, () => ({ doorOpen: true }));
  run(b, 4);
  expect(b.state).toBe('foraging');
  return b;
};

describe('when a bin chicken turns up', () => {
  it('is rare, deterministic per seed, and inside the window', () => {
    let shifts = 0;
    for (let seed = 0; seed < 1000; seed++) {
      const at = scheduleIbis(seed);
      expect(at).toBe(scheduleIbis(seed));
      if (at !== null) {
        shifts++;
        expect(at).toBeGreaterThanOrEqual(IBIS.earliest);
        expect(at).toBeLessThanOrEqual(IBIS.latest);
      }
    }
    expect(shifts / 1000).toBeGreaterThan(0.25);
    expect(shifts / 1000).toBeLessThan(0.35);
  });

  it('only comes in through an open door', () => {
    const b = createIbis(1, true);
    run(b, 5); // door shut
    expect(b.state).toBe('absent');
    const ev = run(b, 0.1, () => ({ doorOpen: true }));
    expect(b.state).toBe('entering');
    expect(ev).toContainEqual({ type: 'enter' });
  });
});

describe('the encounter', () => {
  it('walks to the bin, honks now and then, looks up once when the player looks at it', () => {
    const b = createIbis(1, true);
    run(b, 0.1, () => ({ doorOpen: true }));
    const ev = run(b, 12, () => ({ noticed: true }));
    expect(ev.filter((e) => e.type === 'atBin')).toHaveLength(1);
    expect(ev.filter((e) => e.type === 'alert')).toHaveLength(1);
    expect(ev.filter((e) => e.type === 'honk').length).toBeGreaterThanOrEqual(1);
    expect(b.pos).toBe(1);
  });

  it('three shoos see it out the door, safely, on its own feet', () => {
    const b = arrived();
    const ev: IbisEvent[] = [];
    for (let k = 0; k < 3; k++) ev.push(...run(b, 0.5, (t) => ({ shoo: t === 0 })));
    expect(
      ev.filter((e) => e.type === 'shooed').map((e) => (e as { shoos: number }).shoos),
    ).toEqual([1, 2, 3]);
    expect(ev).toContainEqual({ type: 'leave', how: 'shooed' });
    run(b, 5);
    expect(b.state).toBe('gone');
    expect(b.pos).toBe(0);
    expect(b.binRaided).toBe(false);
  });

  it('frantic clicking counts as one shoo per cooldown', () => {
    const b = arrived();
    run(b, 0.3, () => ({ shoo: true })); // shoo held every step for 0.3 s
    expect(b.shoos).toBe(1);
  });

  it('left alone after a shoo, it goes back to the bin', () => {
    const b = arrived();
    run(b, 0.1, (t) => ({ shoo: t === 0 }));
    expect(b.state).toBe('herded');
    run(b, IBIS.herdTimeout + 4);
    expect(b.state).toBe('foraging');
    expect(b.pos).toBe(1);
  });

  it('ignored, it raids the bin and wanders off by itself', () => {
    const b = arrived();
    const ev = run(b, IBIS.forageMax + 5);
    expect(ev).toContainEqual({ type: 'leave', how: 'ignored' });
    expect(b.binRaided).toBe(true);
    expect(b.state).toBe('gone');
  });

  it('never gets stuck: every visit ends with the bird gone, whatever the player does', () => {
    for (let seed = 0; seed < 40; seed++) {
      const b = createIbis(seed, true);
      // A player who shoos at random-ish moments.
      run(b, 120, (t) => ({ doorOpen: true, shoo: Math.floor(t * 7 + seed) % 97 === 0 }));
      expect(b.state, `seed ${seed}`).toBe('gone');
      expect(ibisPresent(b)).toBe(false);
      const after = run(b, 5, () => ({ shoo: true, doorOpen: true }));
      expect(after).toEqual([]);
    }
  });
});
