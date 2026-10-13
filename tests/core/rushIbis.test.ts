import { describe, expect, it } from 'vitest';
import { STEP } from '../../src/core/clock';
import { atCounter, atRegister, createRush, emptyRushInput, stepRush } from '../../src/core/rush';
import { doorOpen, stepRushIbis } from '../../src/core/rushIbis';
import type { Utterance } from '../../src/core/speech';
import { clipFor } from '../../src/data/voice';
import { createIbis } from '../../src/sim/ibis';

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
