// One order loop per accent group (Australian, Indian, Korean, Chinese, Japanese): the order the
// customer says has its own recording in their accent (normal and the slow repeat), a generated
// order is assembled only from that speaker's own segments, every clarifying answer is recorded
// and matches the answer key, and the ticket is judged field by field whoever said it. Then the
// newest voice, Kenji (Japanese), plays a real Endless shift: ordered, rung up, made, served, and
// a misheard milk caught at the pass.

import { describe, expect, it } from 'vitest';
import type { RushWeek } from '../../src/core/rush';
import { CUSTOMERS } from '../../src/data/customers';
import { clipFor } from '../../src/data/voice';
import { VOICE_PROFILES, type Accent } from '../../src/data/voice/profiles';
import { AWAITING_RENDER } from '../../src/data/voice/script';
import { SEGMENT_BY_ID } from '../../src/data/voice/segments';
import {
  answerFor,
  normaliseOrder,
  ORDER_FIELDS,
  wrongFields,
  type OrderField,
} from '../../src/sim/listening';
import { generateOrders } from '../../src/sim/listening/generate';
import type { Milk, Order } from '../../src/sim/rush';
import { BOT_IDEAL, playRush } from '../helpers/rushBot';

const ACCENTS: readonly Accent[] = ['australian', 'indian', 'korean', 'chinese', 'japanese'];
const speakersOf = (a: Accent) => CUSTOMERS.filter((c) => VOICE_PROFILES[c.id]?.accent === a);

/** The order with one field rung up wrong (null: that field can't be wrong on this drink). */
function offBy(o: Order, f: OrderField): Order | null {
  const t = normaliseOrder(o);
  if (f === 'drink')
    return t.type === 'flatWhite'
      ? { type: 'longBlack', milk: null, extraHot: false, heart: false }
      : { type: 'flatWhite', milk: 'full', extraHot: false, heart: false };
  if (t.type !== 'flatWhite') return null;
  if (f === 'milk') return { ...t, milk: (t.milk === 'oat' ? 'soy' : 'oat') as Milk };
  if (f === 'temp') return { ...t, extraHot: !t.extraHot };
  return { ...t, heart: !t.heart };
}

describe.each(ACCENTS)('%s orders', (accent) => {
  const speakers = speakersOf(accent);

  it('has at least one speaker, with a fallback voice in that accent', () => {
    expect(speakers.length).toBeGreaterThan(0);
    for (const c of speakers) expect(VOICE_PROFILES[c.id]?.locale, c.id).toBeTruthy();
  });

  it('every curated order, its slow repeat and every answer has its own recording, in that accent', () => {
    expect(AWAITING_RENDER.size).toBe(0);
    for (const c of speakers) {
      const p = VOICE_PROFILES[c.id]!;
      const lines: Array<[string, 'normal' | 'slow']> = c.orders.flatMap(
        (o): Array<[string, 'normal' | 'slow']> => [
          [o.text, 'normal'],
          [o.text, 'slow'],
        ],
      );
      for (const o of c.orders)
        for (const f of ORDER_FIELDS) lines.push([answerFor(c.answers, o.order, f), 'normal']);
      for (const [text, delivery] of lines) {
        const clip = clipFor(c.id, text, delivery);
        expect(clip, `${c.id} ${delivery}: ${text}`).not.toBeNull();
        expect(clip!.characterId).toBe(c.id);
        expect(clip!.accent).toBe(accent);
        expect(clip!.locale).toBe(p.locale);
        expect(clip!.delivery).toBe(delivery);
      }
    }
  });

  it("a generated order is assembled only from the speaker's own segments, word for word", () => {
    for (const c of speakers) {
      const specs = generateOrders(11, {
        shiftIndex: 3,
        difficulty: 'hard',
        count: 24,
        unlockedDrinks: ['flatWhite', 'longBlack'],
        speakers: [c.id],
      });
      let segmented = 0;
      for (const s of specs) {
        expect(s.accent).toBe(accent);
        if (s.voice.kind !== 'segments') continue;
        segmented++;
        const parts = s.voice.ids.map((id) => SEGMENT_BY_ID.get(id));
        for (const [i, seg] of parts.entries())
          expect(seg, `${s.id} part ${s.voice.ids[i]}`).toBeDefined();
        expect(s.voice.ids.every((id) => id.startsWith(`${c.id}.`))).toBe(true);
        expect(parts.map((x) => x!.text).join('')).toBe(s.text);
      }
      expect(segmented, c.id).toBeGreaterThan(0);
    }
  });

  it('the ticket is judged field by field: the answer key is right, one field off is that field', () => {
    for (const c of speakers)
      for (const o of c.orders) {
        expect(wrongFields(o.order, o.order), o.id).toEqual([]);
        // A long black rung up with stray modifiers is still a long black.
        if (o.order.type === 'longBlack')
          expect(wrongFields({ ...o.order, milk: 'oat', heart: true }, o.order)).toEqual([]);
        for (const f of ORDER_FIELDS) {
          const wrong = offBy(o.order, f);
          if (wrong) expect(wrongFields(wrong, o.order), `${o.id} ${f}`).toEqual([f]);
        }
      }
  });
});

describe('Kenji (Japanese) in a real Endless shift', () => {
  const ENDLESS: RushWeek = {
    shiftIndex: 4,
    unlockedDrinks: ['flatWhite', 'longBlack'],
    endless: true,
  };
  const kenjiOf = (r: ReturnType<typeof playRush>['r']) =>
    r.customers.find((c) => c.def.id === 'kenji')!;

  it('says his order, is rung up right, served and recorded like everyone else', () => {
    const { r, said } = playRush({ seed: 5, week: ENDLESS, maxSeconds: 300, ...BOT_IDEAL });
    const k = kenjiOf(r);
    expect(said).toContain(k.line.id);
    expect(k.outcome).toBe('served');
    expect(k.result?.correct).toBe(true);
    expect(r.listening.find((l) => l.customer === 'kenji')?.wrong).toEqual([]);
    expect(r.records.some((x) => x.customer === 'kenji' && x.correct)).toBe(true);
  });

  it('a misheard milk is handed back at the pass, the ticket set straight, then served', () => {
    const { r, events } = playRush({
      seed: 5,
      week: ENDLESS,
      maxSeconds: 300,
      ...BOT_IDEAL,
      heard: (c) =>
        c.def.id === 'kenji' && c.order.type === 'flatWhite'
          ? { ...c.order, milk: c.order.milk === 'oat' ? 'soy' : 'oat' }
          : c.order,
    });
    const k = kenjiOf(r);
    if (k.order.type !== 'flatWhite') throw new Error('seed 5: Kenji should order a flat white');
    expect(r.listening.find((l) => l.customer === 'kenji')?.wrong).toEqual(['milk']);
    const mine = events.filter((e) => 'customer' in e && e.customer === k.key).map((e) => e.type);
    expect(mine).toContain('rejected');
    expect(mine).toContain('ticketFixed');
    expect(k.outcome).toBe('served');
  });
});
