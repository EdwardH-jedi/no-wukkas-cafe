import { describe, expect, it } from 'vitest';
import { STEP } from '../../src/core/clock';
import { atCounter, atRegister, createRush, emptyRushInput, stepRush } from '../../src/core/rush';
import { doorOpen, stepRushIbis } from '../../src/core/rushIbis';
import type { Utterance } from '../../src/core/speech';
import { clipFor } from '../../src/data/voice';
import { createIbis, IBIS, type Ibis } from '../../src/sim/ibis';
import { BOT_IDEAL, playRush } from '../helpers/rushBot';

describe('the bin chicken during a shift', () => {
  it('comes in with a customer, gets shooed out, and Gaz has a (recorded) line for each beat', () => {
    const r = createRush(7);
    const b = createIbis(7, true);
    const said: Utterance[] = [];
    let shoos = 0;
    let goneAt = -1;
    for (let n = 0; n < 200 / STEP; n++) {
      const i = emptyRushInput();
      i.pressed = n % 20 === 0;
      if (atRegister(r)) i.action = { type: 'takeOrder' };
      const c = atCounter(r);
      if (c?.state === 'deciding') i.action = { type: 'ringUp', order: c.order };
      stepRush(r, i, STEP);
      const shoo = b.state === 'foraging' && b.stateTime > 3 && shoos < 3;
      if (shoo) shoos++;
      stepRushIbis(r, b, { shoo, noticed: false }, STEP);
      for (const e of r.events) if (e.type === 'say') said.push(e.line);
      r.events.length = 0;
      // Gaz's line queues behind whoever is talking: give it time after the bird has gone.
      if (b.state === 'gone' && goneAt < 0) goneAt = r.time;
      if (goneAt >= 0 && r.time - goneAt > 15) break;
    }
    expect(b.state).toBe('gone');
    const keys = said.map((u) => u.key);
    expect(keys).toContain('ibis.enter');
    expect(keys).toContain('ibis.out');
    for (const u of said.filter((x) => x.key.startsWith('ibis.')))
      expect(clipFor(u.speaker, u.text), u.text).not.toBeNull();
  });

  it('never cuts off a customer: Gaz waits until they have finished', () => {
    const r = createRush(3);
    const b = createIbis(3, true);
    const lines: Array<{ u: Utterance; at: number }> = [];
    for (let n = 0; n < 160 / STEP; n++) {
      const i = emptyRushInput();
      i.pressed = n % 20 === 0;
      if (atRegister(r)) i.action = { type: 'takeOrder' };
      stepRush(r, i, STEP);
      stepRushIbis(r, b, { shoo: false, noticed: false }, STEP);
      for (const e of r.events) if (e.type === 'say') lines.push({ u: e.line, at: r.time });
      r.events.length = 0;
    }
    const ibis = lines.filter((l) => l.u.key.startsWith('ibis.'));
    expect(ibis.length).toBeGreaterThan(0);
    for (const l of ibis) {
      const k = lines.indexOf(l);
      const before = lines[k - 1];
      if (before && before.u.speaker !== 'gaz')
        expect(l.at - before.at).toBeGreaterThanOrEqual(before.u.duration - 1e-6);
    }
  });

  it('does nothing outside service, and the door is shut when nobody is coming or going', () => {
    const r = createRush(7);
    const b = createIbis(7, true);
    expect(stepRushIbis(r, b, { shoo: true, noticed: false }, STEP)).toEqual([]);
    expect(b.state).toBe('absent');
    expect(doorOpen(r)).toBe(false);
  });

  it('a shift without the bird is untouched (no RNG shared with the rush)', () => {
    const a = createRush(11);
    const c = createRush(11);
    const bird = createIbis(11); // scheduled or not, the rush's own RNG is separate
    for (let n = 0; n < 30 / STEP; n++) {
      const i = emptyRushInput();
      i.pressed = n % 20 === 0;
      stepRush(a, i, STEP);
      stepRush(c, i, STEP);
      if (bird.scheduledAt === null) stepRushIbis(c, bird, { shoo: false, noticed: false }, STEP);
    }
    expect(JSON.stringify(a.events)).toBe(JSON.stringify(c.events));
    expect(a.rng.next()).toBe(c.rng.next());
  });
});

describe('the bin chicken interrupts, the player deals with it, service carries on', () => {
  /** A whole Day 2 with the ideal bot at the counter and the bird running alongside it. `shoo`
   *  decides, each step, whether the player claps at it. */
  function shiftWithBird(seed: number, shoo: (b: Ibis, t: number) => boolean) {
    const b = createIbis(seed, true);
    const timeline: Array<{ at: number; what: string }> = [];
    const played = playRush({
      seed,
      ...BOT_IDEAL,
      each: (r) => {
        for (const e of stepRushIbis(r, b, { shoo: shoo(b, r.time), noticed: false }, STEP))
          timeline.push({ at: r.time, what: `bird:${e.type}` });
        for (const e of r.events)
          if (e.type === 'served' || e.type === 'ticket')
            timeline.push({ at: r.time, what: e.type });
      },
    });
    return { ...played, b, timeline };
  }

  it('shooed out (three claps): it leaves, and every customer is still served right', () => {
    const plain = playRush({ seed: 7, ...BOT_IDEAL });
    let last = -1;
    const { r, b, timeline, said } = shiftWithBird(7, (bird, t) => {
      const go = bird.state === 'foraging' || bird.state === 'herded';
      if (!go || t - last < 1) return false;
      last = t;
      return true;
    });
    expect(b.state).toBe('gone');
    expect(b.shoos).toBe(IBIS.shoosToLeave);
    expect(b.binRaided).toBe(false);
    expect(said).toContain('ibis.enter');
    expect(said).toContain('ibis.out');
    // It came in during service and the shift went on around it, then after it.
    const enter = timeline.find((x) => x.what === 'bird:enter')!.at;
    const gone = timeline.find((x) => x.what === 'bird:leave')!.at;
    expect(timeline.some((x) => x.what === 'served' && x.at > gone)).toBe(true);
    expect(timeline.some((x) => x.what === 'ticket' && x.at > enter)).toBe(true);
    // The normal flow recovered: the same customers served and served right as without the bird.
    expect(r.phase).toBe('summary');
    const outcome = (x: typeof r) => x.customers.map((c) => [c.key, c.outcome, c.result?.correct]);
    expect(outcome(r)).toEqual(outcome(plain.r));
    expect(r.summary?.walkouts).toBe(0);
  });

  it('ignored: it raids the bin, leaves on its own after IBIS.forageMax, and the shift finishes', () => {
    const { r, b, said } = shiftWithBird(7, () => false);
    expect(b.state).toBe('gone');
    expect(b.binRaided).toBe(true);
    expect(b.shoos).toBe(0);
    expect(said).toContain('ibis.ignored');
    expect(r.phase).toBe('summary');
    expect(r.customers.every((c) => c.outcome === 'served')).toBe(true);
  });
});
