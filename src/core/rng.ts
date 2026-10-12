// The only source of randomness in the game (AGENTS.md §4 rule 2).
// mulberry32: tiny, fast, and good enough for gameplay. Same seed → same sequence.

export interface Rng {
  /** Float in [0, 1). */
  next(): number;
  /** Float in [min, max). */
  range(min: number, max: number): number;
  /** Integer in [0, n). */
  int(n: number): number;
  pick<T>(items: readonly T[]): T;
  /** Current internal state, so a run can be resumed or inspected. */
  state(): number;
}

export function createRng(seed: number): Rng {
  let s = seed >>> 0;
  const next = (): number => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    range: (min, max) => min + (max - min) * next(),
    int: (n) => Math.floor(next() * n),
    pick: (items) => {
      if (items.length === 0) throw new Error('pick() from an empty list');
      return items[Math.floor(next() * items.length)] as (typeof items)[number];
    },
    state: () => s,
  };
}

/** Parse a `?seed=` style value; falls back to a fixed default so runs are reproducible. */
export function parseSeed(raw: string | null | undefined, fallback = 20261012): number {
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n >>> 0 : fallback;
}
