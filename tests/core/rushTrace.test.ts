// Determinism guard for Day 2: the full event log, shift summary and listening records of seven
// seeded headless shifts, hashed. Recorded on origin/main's Day 2 (first-shift pacing) after the rush.ts split; any
// behaviour change in the rush machine changes a hash. If a change is intended, re-record.

import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { playRush, type ListenBot } from '../helpers/rushBot';

const PROFILES: Record<string, ListenBot> = {
  normal: { seed: 3 },
  hard: { seed: 11, difficulty: 'hard' },
  easy: { seed: 5, difficulty: 'easy' },
  aids: {
    seed: 9,
    aids: () => [{ type: 'replay' }, { type: 'repeat' }, { type: 'clarify', field: 'milk' }],
  },
  misheard: {
    seed: 4,
    heard: (c) =>
      c.order.type === 'flatWhite'
        ? { type: 'longBlack', milk: null, extraHot: false, heart: false }
        : { type: 'flatWhite', milk: 'oat', extraHot: false, heart: false },
  },
  hurry: { seed: 6, hurry: true },
  idle: { seed: 8, idle: true },
};

function trace(o: ListenBot): string {
  const { r, events } = playRush(o);
  const body = JSON.stringify({ events, summary: r.summary, listening: r.listening });
  return createHash('sha1').update(body).digest('hex');
}

describe('rush trace', () => {
  it('seeded shifts replay byte-for-byte', () => {
    const hashes = Object.fromEntries(Object.entries(PROFILES).map(([k, o]) => [k, trace(o)]));
    expect(hashes).toMatchInlineSnapshot(`
      {
        "aids": "124c2c015b904443aca0ffbc5295cbfdd762625d",
        "easy": "31c58fe4dafb6ee5a80e2520e4fcf788c3821bb4",
        "hard": "8e51462770cc9ba21080a78117038504613a64e1",
        "hurry": "9963e830531f1c2414fad03100ba99dc51b370e1",
        "idle": "27b8289707a6932c9ab6711e2033a89d28f2472d",
        "misheard": "1b0257bea377fdcf2749e3e5900fb222d40676fd",
        "normal": "eaef83a72f956f4c5cbda791dae7c489defe6d00",
      }
    `);
  });
});
