import { describe, expect, it } from 'vitest';
import { createRng, parseSeed } from '../../src/core/rng';

describe('createRng', () => {
  it('gives the same sequence for the same seed', () => {
    const a = createRng(42);
    const b = createRng(42);
    for (let i = 0; i < 50; i++) expect(a.next()).toBe(b.next());
  });

  it('differs between seeds and stays in [0, 1)', () => {
    const a = createRng(1);
    const b = createRng(2);
    let same = 0;
    for (let i = 0; i < 100; i++) {
      const x = a.next();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
      if (x === b.next()) same++;
    }
    expect(same).toBeLessThan(3);
  });

  it('int and pick stay in range', () => {
    const r = createRng(7);
    for (let i = 0; i < 200; i++) {
      const n = r.int(5);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(5);
      expect(['a', 'b', 'c']).toContain(r.pick(['a', 'b', 'c']));
    }
    expect(() => r.pick([])).toThrow();
  });
});

describe('parseSeed', () => {
  it('parses numbers and falls back otherwise', () => {
    expect(parseSeed('123')).toBe(123);
    expect(parseSeed(null, 9)).toBe(9);
    expect(parseSeed('nope', 9)).toBe(9);
  });
});
