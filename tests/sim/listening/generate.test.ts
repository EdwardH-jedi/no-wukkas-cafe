import { describe, expect, it } from 'vitest';
import { CUSTOMERS, type CustomerId } from '../../../src/data/customers';
import { ORDER_LINES } from '../../../src/data/orders';
import { dialogueId } from '../../../src/data/voice/ids';
import { SEGMENT_BY_ID } from '../../../src/data/voice/segments';
import { voiceRefIds } from '../../../src/sim/contracts/voice';
import type { OrderSpec } from '../../../src/sim/contracts/order';
import type { DrinkId } from '../../../src/sim/contracts/ticket';
import {
  cueSpans,
  DIFFICULTY,
  modifierCount,
  normaliseOrder,
  orderTier,
  type Difficulty,
} from '../../../src/sim/listening';
import {
  curatedSpec,
  generateOrders,
  ORDER_MIX,
  shiftSeed,
  type GenerateOptions,
} from '../../../src/sim/listening/generate';

const SPEAKERS = CUSTOMERS.map((c) => c.id);
const DIFFS: Difficulty[] = ['easy', 'normal', 'hard'];
const SEEDS = Array.from({ length: 100 }, (_, i) => i * 7919 + 1);
const opts = (d: Difficulty, extra: Partial<GenerateOptions> = {}): GenerateOptions => ({
  shiftIndex: 0,
  difficulty: d,
  count: 10,
  unlockedDrinks: ['flatWhite', 'longBlack'],
  speakers: SPEAKERS,
  ...extra,
});
const all = (d: Difficulty): OrderSpec[] => SEEDS.flatMap((s) => generateOrders(s, opts(d)));

describe('generateOrders', () => {
  it('is deterministic for a seed and options (100 seeds × 3 difficulties)', () => {
    for (const d of DIFFS)
      for (const s of SEEDS) expect(generateOrders(s, opts(d))).toEqual(generateOrders(s, opts(d)));
  });

  it('gives every shift of a save different orders', () => {
    let differ = 0;
    for (const s of SEEDS) {
      const a = generateOrders(s, opts('normal')).map((o) => o.text);
      const b = generateOrders(s, opts('normal', { shiftIndex: 1 })).map((o) => o.text);
      if (a.join('|') !== b.join('|')) differ++;
    }
    expect(differ).toBe(SEEDS.length);
    expect(shiftSeed(1, 0)).not.toBe(shiftSeed(1, 1));
  });

  it('never repeats a transcript within a shift, and cycles speakers in arrival order', () => {
    for (const d of DIFFS)
      for (const s of SEEDS) {
        const shift = generateOrders(s, opts(d));
        expect(shift).toHaveLength(10);
        expect(new Set(shift.map((o) => o.text)).size).toBe(10);
        shift.forEach((o, i) => expect(o.speaker).toBe(SPEAKERS[i % SPEAKERS.length]));
      }
  });

  it('keeps to the difficulty: tiers, modifier cap, changes of mind', () => {
    for (const d of DIFFS) {
      const orders = all(d);
      const inTier = orders.filter((o) => DIFFICULTY[d].tiers.includes(o.tier)).length;
      expect(inTier / orders.length).toBeGreaterThanOrEqual(0.98);
      for (const o of orders) {
        expect(o.tier).toBe(orderTier(o));
        if (o.source === 'generated')
          expect(modifierCount(o.order)).toBeLessThanOrEqual(ORDER_MIX[d].maxMods);
      }
      const changes = orders.filter((o) => o.change).length;
      if (d === 'easy') expect(changes).toBe(0);
      else expect(changes).toBeGreaterThan(0);
    }
  });

  it('mixes curated and generated orders, more generated as it gets harder', () => {
    const share = (d: Difficulty) => {
      const o = all(d);
      return o.filter((x) => x.source === 'curated').length / o.length;
    };
    expect(share('easy')).toBeGreaterThan(share('hard'));
    expect(share('hard')).toBeGreaterThan(0);
    expect(share('easy')).toBeLessThan(1);
  });

  it('only orders unlocked, playable drinks', () => {
    for (const s of SEEDS.slice(0, 30)) {
      const lb = generateOrders(s, opts('hard', { unlockedDrinks: ['longBlack'] }));
      expect(lb.every((o) => o.order.type === 'longBlack')).toBe(true);
      const withFuture: DrinkId[] = ['flatWhite', 'longBlack', 'cappuccino', 'latte'];
      for (const o of generateOrders(s, opts('normal', { unlockedDrinks: withFuture })))
        expect(['flatWhite', 'longBlack']).toContain(o.order.type);
    }
    expect(generateOrders(1, opts('normal', { unlockedDrinks: ['latte'] }))).toEqual([]);
  });

  it('every generated voice resolves to segments whose words are exactly the transcript', () => {
    for (const d of DIFFS)
      for (const o of all(d).filter((x) => x.source === 'generated')) {
        expect(o.voice.kind).toBe('segments');
        const segs = voiceRefIds(o.voice).map((id) => SEGMENT_BY_ID.get(id));
        expect(segs.every(Boolean)).toBe(true);
        expect(segs.map((s) => s!.text).join('')).toBe(o.text);
        if (o.change) {
          expect(o.text).toContain(o.change.transcript);
          for (const id of voiceRefIds(o.change.voice)) expect(SEGMENT_BY_ID.has(id)).toBe(true);
        }
      }
  });

  it('says every non-default part of the order (cues), except the drink in a vague order', () => {
    for (const d of DIFFS)
      for (const o of all(d)) {
        const t = normaliseOrder(o.order);
        const lower = o.text.toLowerCase();
        const has = (f: 'drink' | 'milk' | 'temp' | 'heart') => {
          const cue = o.cues[f];
          expect(cue, `${o.id} ${f}: ${o.text}`).toBeTruthy();
          expect(lower).toContain(cue!.toLowerCase());
        };
        if (o.cues.drink === undefined) {
          // "Just a coffee": the drink must be asked for, so nothing else may be left unsaid.
          expect(o.source).toBe('generated');
          expect(modifierCount(t)).toBe(0);
          expect(o.clarifiable).toContain('drink');
        } else has('drink');
        if (t.milk && t.milk !== 'full') has('milk');
        if (t.extraHot) has('temp');
        if (t.heart) has('heart');
        expect(cueSpans(o).length).toBe(Object.keys(o.cues).length);
      }
  });

  it('curated orders round-trip unchanged as source "curated", voiced as one clip', () => {
    let n = 0;
    for (const [speaker, lines] of Object.entries(ORDER_LINES))
      for (const line of lines) {
        const spec = curatedSpec(speaker as CustomerId, line);
        const { id, text, order, pace, connected, slang, chatter, cues, firstShift } = spec;
        expect({ id, text, order, pace, connected, slang, chatter, cues, firstShift }).toEqual(
          line,
        );
        expect(order).not.toBe(line.order);
        expect(spec.speaker).toBe(speaker);
        expect(spec.source).toBe('curated');
        expect(spec.tier).toBe(orderTier(line));
        expect(spec.voice).toEqual({ kind: 'clip', id: dialogueId(speaker, line.text) });
        n++;
      }
    expect(n).toBe(30);
  });
});
