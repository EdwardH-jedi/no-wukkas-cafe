// Fairness of the order bank: every part of every order is actually said, every accent group has
// easy and hard orders (accent alone never sets difficulty), and answers match the answer key.

import { describe, expect, it } from 'vitest';
import { CUSTOMERS } from '../../src/data/customers';
import { CLARIFY_ANSWERS, ORDER_LINES } from '../../src/data/orders';
import { VOICE_PROFILES } from '../../src/data/voice/profiles';
import { DIFFICULTY, normaliseOrder, orderTier, type Tier } from '../../src/sim/listening';

const DRINK_WORDS = { flatWhite: /flat white|flattie/i, longBlack: /long black/i };
const all = CUSTOMERS.flatMap((c) => c.orders.map((o) => ({ c, o })));

describe('order bank', () => {
  it('every customer has orders; ids are unique and theirs', () => {
    const ids = new Set<string>();
    for (const c of CUSTOMERS) {
      expect(c.orders.length, c.id).toBeGreaterThanOrEqual(3);
      expect(ORDER_LINES[c.id]).toBe(c.orders);
      for (const o of c.orders) {
        expect(o.id.startsWith(`${c.id}.`), o.id).toBe(true);
        expect(ids.has(o.id), o.id).toBe(false);
        ids.add(o.id);
      }
    }
  });

  it('every part of the order is audible: a cue, in the text, naming the right thing', () => {
    for (const { o } of all) {
      const t = normaliseOrder(o.order);
      const has = (cue: string | undefined): boolean =>
        !!cue && o.text.toLowerCase().includes(cue.toLowerCase());
      expect(has(o.cues.drink), `${o.id} drink cue`).toBe(true);
      expect(o.cues.drink, o.id).toMatch(DRINK_WORDS[t.type]);
      if (t.milk && t.milk !== 'full') {
        expect(has(o.cues.milk), `${o.id} milk cue`).toBe(true);
        expect(o.cues.milk?.toLowerCase(), o.id).toContain(t.milk);
      }
      if (t.extraHot) {
        expect(has(o.cues.temp), `${o.id} temp cue`).toBe(true);
        expect(o.cues.temp, o.id).toMatch(/extra hot/i);
      }
      if (t.heart) {
        expect(has(o.cues.heart), `${o.id} heart cue`).toBe(true);
        expect(o.cues.heart, o.id).toMatch(/heart/i);
      }
      // A long black never asks for something the station can't make.
      if (t.type === 'longBlack') expect(o.text, o.id).not.toMatch(/\b(oat|soy|almond|heart)\b/i);
    }
  });

  it('never fakes an accent with spelling: orders are standard English words', () => {
    for (const { o } of all) {
      expect(o.text, o.id).not.toMatch(/\b(ze|zis|velly|rike|sank you)\b/i);
      // Dropped g's ("Mornin'") too: the accent is in the recording.
      expect(o.text, o.id).not.toMatch(/\w+in'(?!\w)/i);
    }
  });

  it('every accent group has at least six orders, spanning every difficulty tier', () => {
    const groups = new Map<string, Set<Tier>>();
    const counts = new Map<string, number>();
    for (const { c, o } of all) {
      const accent = VOICE_PROFILES[c.id]!.accent;
      if (!groups.has(accent)) groups.set(accent, new Set());
      groups.get(accent)!.add(orderTier(o));
      counts.set(accent, (counts.get(accent) ?? 0) + 1);
    }
    expect([...groups.keys()].sort()).toEqual(['australian', 'chinese', 'indian', 'korean']);
    for (const [accent, tiers] of groups) {
      expect(counts.get(accent), accent).toBeGreaterThanOrEqual(6);
      expect([...tiers].sort(), accent).toEqual([1, 2, 3]);
    }
  });

  it('every customer has an order for every difficulty (no fallback needed)', () => {
    for (const c of CUSTOMERS)
      for (const [d, rules] of Object.entries(DIFFICULTY))
        expect(
          c.orders.some((o) => rules.tiers.includes(orderTier(o))),
          `${c.id} @ ${d}`,
        ).toBe(true);
  });

  it('clarifying answers name what they answer', () => {
    for (const c of CUSTOMERS) {
      const a = CLARIFY_ANSWERS[c.id]!;
      expect(c.answers).toBe(a);
      expect(a.drink.flatWhite).toMatch(/flat white/i);
      expect(a.drink.longBlack).toMatch(/long black/i);
      for (const m of ['oat', 'soy', 'almond'] as const)
        expect(a.milk[m].toLowerCase()).toContain(m);
      expect(a.milk.full).toMatch(/normal|regular|ordinary|full/i);
      expect(a.milk.none).toMatch(/no milk/i);
      expect(a.temp.extraHot).toMatch(/extra hot/i);
      expect(a.temp.normal).toMatch(/normal/i);
      expect(a.heart.yes).toMatch(/heart|yeah|yes/i);
      expect(a.heart.no).toMatch(/\bno\b|nah/i);
    }
  });
});
