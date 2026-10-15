import { describe, expect, it } from 'vitest';
import { CUSTOMERS } from '../../../src/data/customers';
import { MISHEARINGS, SLANG } from '../../../src/data/slang';
import { VOICE_PROFILES } from '../../../src/data/voice/profiles';
import { PHRASEBOOKS, SEGMENT_BY_ID, SEGMENT_INVENTORY } from '../../../src/data/voice/segments';
import { generateOrders } from '../../../src/sim/listening/generate';

const respellings = SLANG.filter((s) => s.kind === 'respelling').map((s) => s.term);
const wordRe = (t: string) =>
  new RegExp(`(^|[^a-z'])${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^a-z'])`, 'i');

describe('segment inventory', () => {
  it('covers every Day 2 customer, with the accent their voice profile has', () => {
    for (const c of CUSTOMERS) {
      expect(PHRASEBOOKS[c.id].speaker).toBe(c.id);
      expect(PHRASEBOOKS[c.id].accent).toBe(VOICE_PROFILES[c.id]?.accent);
      expect(SEGMENT_INVENTORY[c.id].length).toBeGreaterThan(20);
    }
  });

  it('segment ids are unique and every segment has words', () => {
    const ids = Object.values(SEGMENT_INVENTORY)
      .flat()
      .map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(SEGMENT_BY_ID.size).toBe(ids.length);
    for (const s of SEGMENT_BY_ID.values()) expect(s.text.trim().length).toBeGreaterThan(0);
  });

  it('segments join cleanly and carry the words the cues rely on', () => {
    for (const b of Object.values(PHRASEBOOKS)) {
      for (const s of [...b.greet, ...b.lead]) expect(s.text).toMatch(/ $/);
      for (const s of b.chatter) expect(s.text).toMatch(/^ \S/);
      for (const s of [...b.hot, ...b.heart, ...b.closeSay, ...b.closeAsk, ...b.change])
        expect(s.text).toMatch(/^[,.?]/);
      for (const s of b.hot) expect(s.text.toLowerCase()).toContain('extra hot');
      for (const s of b.heart) expect(s.text.toLowerCase()).toContain('heart');
      for (const s of b.change) expect(s.text).toMatch(/make that $/);
      for (const cs of Object.values(b.core))
        for (const c of cs) {
          expect(c.text.toLowerCase()).toContain(c.drink);
          if (c.milk) expect(c.text.toLowerCase()).toContain(c.milk);
          expect(c.article.text).toMatch(/^an? [a-z]/);
        }
      if (b.lead.some((l) => l.ask)) expect(b.closeAsk.length).toBeGreaterThan(0);
    }
  });

  it('accent is never written as respelt words: not in segments, not in any transcript', () => {
    expect(respellings.length).toBeGreaterThan(0);
    for (const s of SEGMENT_BY_ID.values())
      for (const r of respellings) expect(s.text, s.id).not.toMatch(wordRe(r));
    for (const d of ['easy', 'normal', 'hard'] as const)
      for (let seed = 1; seed <= 100; seed++)
        for (const o of generateOrders(seed, {
          shiftIndex: seed % 5,
          difficulty: d,
          count: 10,
          unlockedDrinks: ['flatWhite', 'longBlack'],
          speakers: CUSTOMERS.map((c) => c.id),
        }))
          for (const r of respellings) expect(o.text).not.toMatch(wordRe(r));
  });
});

describe('slang glossary', () => {
  it('keeps the prototype table, terms unique, every entry explained', () => {
    expect(SLANG.length).toBeGreaterThanOrEqual(60);
    expect(new Set(SLANG.map((s) => s.term)).size).toBe(SLANG.length);
    for (const s of SLANG) expect(s.meaning.length).toBeGreaterThan(0);
  });

  it('explains the slang the phrasebooks use', () => {
    const terms = new Set(SLANG.map((s) => s.term));
    for (const t of ['flattie', 'ta', 'smoko', 'darl', 'chuck us', '아아'])
      expect(terms).toContain(t);
  });

  it('lists the mishearing pairs', () => {
    expect(MISHEARINGS).toContainEqual({ said: 'soy', heardAs: 'sorry' });
    expect(MISHEARINGS).toContainEqual({ said: 'flat', heardAs: 'black' });
    expect(MISHEARINGS).toContainEqual({ said: 'oat', heardAs: 'no' });
  });
});
