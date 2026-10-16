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
        "aids": "2064e3244eed6ac1463a189d3a3b71db87f58c11",
        "easy": "64d49eace62cce87f5edf631e79ae54763a335de",
        "hard": "da02a0ad1aff4acf553a0d461828c9c5b3a059b4",
        "hurry": "6b078721a604e3957c2de5c1573d9d347c8b15b1",
        "idle": "90a50992c8d385091bb9c22a3e4455d5d9b93c2f",
        "misheard": "9cb0c12941833c576d9f797b618c271d93ddf528",
        "normal": "f02f00d8dad5dc8af92fd21f2a03ec8e04ebb00d",
      }
    `);
  });
});
