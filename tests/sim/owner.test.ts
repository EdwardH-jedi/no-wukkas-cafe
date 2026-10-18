import { describe, expect, it } from 'vitest';
import { createRng } from '../../src/core/rng';
import type { RushWeek } from '../../src/core/rush';
import { voiceScript } from '../../src/data/voice/script';
import { CUSTOMERS } from '../../src/data/customers';
import { GREETING, GREETING_OPENERS, OWNER_LINES, RUSH_INTRO } from '../../src/data/ownerLines';
import { FAULT_TEXT } from '../../src/data/tips';
import { AWAITING_RENDER } from '../../src/data/voice/script';
import {
  addFrustration,
  createOwner,
  endLines,
  lineDuration,
  ownerTier,
  pickLine,
  type LineBook,
} from '../../src/sim/owner';
import type { ShiftSummary } from '../../src/sim/rush';
import { summaryBeats, type ScoreEntry } from '../../src/sim/scores';
import { playRush } from '../helpers/rushBot';

const book: LineBook = {
  a: { tiers: [[{ text: 'one' }, { text: 'two' }, { text: 'three' }], [{ text: 'cross' }]] },
  cool: { tiers: [[{ text: 'x' }, { text: 'y' }]], cooldown: 5 },
};

describe('pickLine', () => {
  it('never repeats a line until the pool is exhausted', () => {
    const o = createOwner();
    const rng = createRng(1);
    const said = [0, 1, 2].map((i) => pickLine(o, book, 'a', rng, i * 10)?.text);
    expect(new Set(said).size).toBe(3);
  });

  it('does not immediately repeat the last line after starting over', () => {
    for (let seed = 0; seed < 20; seed++) {
      const o = createOwner();
      const rng = createRng(seed);
      const first = [0, 1, 2].map((i) => pickLine(o, book, 'a', rng, i * 10)?.text);
      const next = pickLine(o, book, 'a', rng, 100)?.text;
      expect(next).not.toBe(first[2]);
    }
  });

  it('respects cooldowns', () => {
    const o = createOwner();
    const rng = createRng(2);
    expect(pickLine(o, book, 'cool', rng, 0)).not.toBeNull();
    expect(pickLine(o, book, 'cool', rng, 2)).toBeNull();
    expect(pickLine(o, book, 'cool', rng, 6)).not.toBeNull();
  });

  it('gets crankier as frustration builds', () => {
    const o = createOwner();
    expect(ownerTier(o)).toBe(0);
    addFrustration(o, 2);
    expect(ownerTier(o)).toBe(1);
    expect(pickLine(o, book, 'a', createRng(3), 0)?.text).toBe('cross');
    addFrustration(o, 5);
    expect(ownerTier(o)).toBe(2);
    addFrustration(o, -10);
    expect(o.frustration).toBe(0);
  });

  it('is deterministic for a seed', () => {
    const run = () => {
      const o = createOwner();
      const rng = createRng(99);
      return [0, 1, 2, 3, 4].map((i) => pickLine(o, OWNER_LINES, 'art.blob', rng, i)?.text);
    };
    expect(run()).toEqual(run());
  });

  it('returns null for unknown keys', () => {
    expect(pickLine(createOwner(), book, 'nope', createRng(1), 0)).toBeNull();
  });

  it('gives longer lines more reading time', () => {
    expect(lineDuration('Hmm.')).toBeLessThan(
      lineDuration('This is a much longer line that takes a while to read.'),
    );
  });
});

describe('dialogue content', () => {
  const all = [
    ...GREETING,
    ...GREETING_OPENERS,
    ...RUSH_INTRO,
    ...Object.values(OWNER_LINES).flatMap((p) => p.tiers.flat()),
  ].map((l) => l.text);
  // Everything customers can say: orders, answers, reactions.
  const customerLines = voiceScript()
    .filter((l) => l.speaker !== 'gaz')
    .map((l) => l.text);
  const tips = Object.values(FAULT_TEXT).flatMap((t) => [t.label, t.tip]);

  it('includes the lines from the brief', () => {
    expect(all).toContain('Mate, is that a heart or a dead possum?');
    expect(all).toContain("That's the counter, mate. Cup's over here.");
    expect(all).toContain('My nan could pour better than that.');
    expect(all).toContain("Bloody hell. Alright, you're hired.");
  });

  it('every pool has at least one line and no empty text', () => {
    for (const [key, pool] of Object.entries(OWNER_LINES)) {
      expect(pool.tiers.length, key).toBeGreaterThan(0);
      for (const tier of pool.tiers) {
        expect(tier.length, key).toBeGreaterThan(0);
        for (const l of tier) expect(l.text.trim().length, key).toBeGreaterThan(0);
      }
    }
  });

  it('uses Australian spelling', () => {
    const us = /\b(center|centered|color|flavor|favorite|honor|apologize|realize|mom)\b/i;
    for (const text of [...all, ...tips, ...customerLines]) expect(text).not.toMatch(us);
  });

  it('gives every Day 2 customer a full set of lines', () => {
    for (const c of CUSTOMERS) {
      for (const [k, v] of Object.entries(c.lines))
        if (typeof v === 'string') expect(v.trim().length, `${c.id}.${k}`).toBeGreaterThan(0);
    }
  });

  it('has a coaching tip for every fault', () => {
    for (const t of Object.values(FAULT_TEXT)) expect(t.tip.length).toBeGreaterThan(10);
  });
});

describe('the closing lines and a new best (todo.md M4 T4.5)', () => {
  const best = (o: Partial<ScoreEntry> = {}): ScoreEntry => ({
    mode: 'week',
    week: 1,
    shiftIndex: 0,
    seed: 1,
    difficulty: 'normal',
    grade: 'good',
    served: 5,
    walkouts: 1,
    tipsCents: 500,
    at: '2026-10-19T01:00:00.000Z',
    ...o,
  });
  const summary = (o: Partial<ShiftSummary> = {}): ShiftSummary => ({
    customers: 6,
    ordersCompleted: 5,
    correctOrders: 5,
    walkouts: 1,
    avgServeSeconds: 40,
    satisfaction: 70,
    tipsCents: 500,
    wasted: 0,
    grade: 'good',
    ...o,
  });

  it('the grade line, then "new best" only when there is one', () => {
    expect(endLines('good', false)).toEqual(['rush.end.good']);
    expect(endLines('disaster', true)).toEqual(['rush.end.disaster', 'rush.end.newBest']);
  });

  it('a new best beats the board on its own ranking (grade, served, tips, walk-outs)', () => {
    expect(summaryBeats(summary(), best())).toBe(false);
    expect(summaryBeats(summary({ ordersCompleted: 6 }), best())).toBe(true);
    expect(summaryBeats(summary({ grade: 'excellent', ordersCompleted: 1 }), best())).toBe(true);
    expect(summaryBeats(summary({ grade: 'okay', ordersCompleted: 9 }), best())).toBe(false);
    expect(summaryBeats(summary({ walkouts: 0 }), best())).toBe(true);
  });

  it('the line is count-agnostic Australian copy, waiting for its clip', () => {
    const text = OWNER_LINES['rush.end.newBest']?.tiers[0]?.[0]?.text ?? '';
    expect(text.length).toBeGreaterThan(10);
    expect(text).not.toMatch(/\d/);
    expect(AWAITING_RENDER.has('rush.end.newBest')).toBe(true);
  });

  it('Gaz says it after a week shift that beats the best, never on a first play, Day 2 or Endless', () => {
    const NEW_BEST = OWNER_LINES['rush.end.newBest']!.tiers[0]![0]!.text;
    const monday = {
      week: 1,
      shiftIndex: 0,
      unlockedDrinks: ['flatWhite' as const, 'longBlack' as const],
      affinity: {},
    };
    const saidOn = (week: RushWeek | undefined): boolean => {
      const { events } = playRush({ seed: 3, ...(week ? { week } : {}) });
      return events.some((e) => e.type === 'say' && e.line.text === NEW_BEST);
    };
    expect(saidOn({ ...monday, best: best({ grade: 'disaster', served: 0, tipsCents: 0 }) })).toBe(
      true,
    );
    expect(saidOn({ ...monday, best: best({ grade: 'excellent', served: 99 }) })).toBe(false);
    expect(saidOn({ ...monday, best: null })).toBe(false);
    expect(saidOn(monday)).toBe(false);
    expect(saidOn(undefined)).toBe(false);
    expect(
      saidOn({
        ...monday,
        endless: true,
        best: best({ mode: 'endless', grade: 'disaster', served: 0 }),
      }),
    ).toBe(false);
  });
});
