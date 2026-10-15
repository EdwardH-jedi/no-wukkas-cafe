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
        "aids": "dc4a8660ba02da6386e22a8b8c15469a83fae9ec",
        "easy": "723e8c085b8d2e4805886b6a82db03e05ff11293",
        "hard": "c257f42ed4113b840f5840a9b994cf556bd7a842",
        "hurry": "7a038f7f1aa3134c535f2489087469383cfd4365",
        "idle": "27b8289707a6932c9ab6711e2033a89d28f2472d",
        "misheard": "1b0257bea377fdcf2749e3e5900fb222d40676fd",
        "normal": "275a8c8c5de1699446a4e2700cad4284881ec5bd",
      }
    `);
  });
});
