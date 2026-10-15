// Determinism guard for Day 2: the full event log, shift summary and listening records of seven
// seeded headless shifts, hashed. Recorded before core/rush.ts was split into core/rush/*; any
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
        "aids": "6fd5b426c5d3dcd5241792591adffc1fa796cf79",
        "easy": "8298f157025e5997d08dd3e23cd0200b8d07ff29",
        "hard": "e0109eb459a92bb6095152a13f0b8396e372b910",
        "hurry": "777260d557419e7c03b687849088175b6ad461ad",
        "idle": "5ee8bdecf5b2a9608d34e4d46c17494d74072b6d",
        "misheard": "3bfed03616f291d3c36229534bbed08a4d238dfb",
        "normal": "acfaeccc5d087a1de57fa73ab74153caf354a973",
      }
    `);
  });
});
