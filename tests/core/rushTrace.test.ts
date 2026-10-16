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
        "aids": "dbbb564067f0e0c74eb796726e3686f27618ada8",
        "easy": "f4065c58885c4122e4c40ca5652e86af91f89348",
        "hard": "884d6e217f4bd585a5f9b6978bc98a006cf38905",
        "hurry": "d975462d381d8b61e57311db657d280d7a302bff",
        "idle": "90a50992c8d385091bb9c22a3e4455d5d9b93c2f",
        "misheard": "9cb0c12941833c576d9f797b618c271d93ddf528",
        "normal": "c565b78d766c5ba56ecd8392abd023854b279cd1",
      }
    `);
  });
});
