// Seed fuzz for the order generator (sim/listening/generate.ts + phrase.ts + data/voice/segments.ts):
// 500 seeds × 3 difficulties × the week's ten absolute shifts (weeks 1 and 2) and the Endless batch.
// Every generated order must be a valid recipe whose words are exactly its segments, every segment
// from the speaker's own phrasebook, and whose answer key is what those segments actually say.
// Violations are collected across all seeds (each names its seed) and asserted empty at the end.

import { describe, expect, it } from 'vitest';
import { unlocksFor } from '../../src/core/week/progress';
import { CUSTOMERS, type CustomerId } from '../../src/data/customers';
import { ORDER_LINES } from '../../src/data/orders';
import { dialogueId } from '../../src/data/voice/ids';
import { PHRASEBOOKS, SEGMENT_INVENTORY } from '../../src/data/voice/segments';
import { WEEK } from '../../src/data/week';
import type { OrderSpec } from '../../src/sim/contracts/order';
import { DRINK_IDS, isPlayable, type DrinkId } from '../../src/sim/contracts/ticket';
import {
  modifierCount,
  normaliseOrder,
  ORDER_FIELDS,
  orderTier,
  type Difficulty,
} from '../../src/sim/listening';
import { generateOrders, ORDER_MIX, type GenerateOptions } from '../../src/sim/listening/generate';
import { coreKey, type CoreKey } from '../../src/sim/listening/phrase';
import type { Milk } from '../../src/sim/rush';

/** 500 seeds, spread over the whole u32 range (0 and 2^32 - 1 included). */
const SEEDS = Array.from({ length: 500 }, (_, i) =>
  i === 0 ? 0 : i === 499 ? 0xffffffff : Math.imul(i, 0x9e3779b1) >>> 0,
);
const DIFFS: readonly Difficulty[] = ['easy', 'normal', 'hard'];
const SPEAKERS: readonly CustomerId[] = CUSTOMERS.map((c) => c.id);
const MILKS: readonly Milk[] = ['full', 'oat', 'soy', 'almond'];
const PACES = ['slow', 'normal', 'fast'];
/** Absolute shifts as the rush asks for them: week 1 (0–4) and week 2 (5–9). */
const SHIFTS = Array.from({ length: 10 }, (_, i) => i);
/** The generator's shift number for Endless orders (core/rush/machine.ts ENDLESS_ORDERS). */
const ENDLESS_SHIFT = 100;
const ENDLESS_COUNT = 40;

type Slot =
  | 'greet'
  | 'lead'
  | 'core'
  | 'vague'
  | 'hot'
  | 'heart'
  | 'closeSay'
  | 'closeAsk'
  | 'chatter'
  | 'change';

/** One letter per slot, so a voice's shape can be matched against the order it must have. */
const SHAPE: Record<Slot, string> = {
  greet: 'G',
  lead: 'L',
  core: 'C',
  vague: 'C',
  change: 'X',
  hot: 'H',
  heart: 'R',
  closeSay: 'E',
  closeAsk: 'E',
  chatter: 'T',
};

interface SegInfo {
  slot: Slot;
  text: string;
  slang: number;
  /** Core/vague only: the menu key, and whether this is the "an oat flattie" form. */
  key?: CoreKey | 'vague';
  article?: boolean;
  ask?: boolean;
}

/** Every segment id of a speaker's phrasebook, with the slot it belongs to (no id parsing). */
function segmentIndex(speaker: CustomerId): Map<string, SegInfo> {
  const b = PHRASEBOOKS[speaker];
  const m = new Map<string, SegInfo>();
  const add = (slot: Slot, segs: ReadonlyArray<{ id: string; text: string; slang: number }>) => {
    for (const s of segs) m.set(s.id, { slot, text: s.text, slang: s.slang });
  };
  add('greet', b.greet);
  for (const l of b.lead) m.set(l.id, { slot: 'lead', text: l.text, slang: l.slang, ask: l.ask });
  for (const [key, cs] of Object.entries(b.core) as Array<[CoreKey, typeof b.vague]>)
    for (const c of cs) {
      m.set(c.id, { slot: 'core', text: c.text, slang: c.slang, key, article: false });
      m.set(c.article.id, {
        slot: 'core',
        text: c.article.text,
        slang: c.article.slang,
        key,
        article: true,
      });
    }
  for (const c of b.vague) {
    m.set(c.id, { slot: 'vague', text: c.text, slang: c.slang, key: 'vague', article: false });
    m.set(c.article.id, {
      slot: 'vague',
      text: c.article.text,
      slang: c.article.slang,
      key: 'vague',
      article: true,
    });
  }
  add('hot', b.hot);
  add('heart', b.heart);
  add('closeSay', b.closeSay);
  add('closeAsk', b.closeAsk);
  add('chatter', b.chatter);
  add('change', b.change);
  return m;
}

const INDEX = Object.fromEntries(SPEAKERS.map((s) => [s, segmentIndex(s)])) as Record<
  CustomerId,
  Map<string, SegInfo>
>;

const opts = (
  shiftIndex: number,
  difficulty: Difficulty,
  count: number,
  unlockedDrinks: readonly DrinkId[],
): GenerateOptions => ({ shiftIndex, difficulty, count, unlockedDrinks, speakers: SPEAKERS });

/** Every rule one order must keep. Returns the broken ones. */
function checkSpec(o: OrderSpec, i: number, seed: number, g: GenerateOptions): string[] {
  const v: string[] = [];
  const at = `seed ${seed} ${g.difficulty} shift ${g.shiftIndex} #${i} (${o.id}: "${o.text}")`;
  const bad = (msg: string): void => {
    v.push(`${at}: ${msg}`);
  };
  const drinks = g.unlockedDrinks.filter(isPlayable);
  const book = PHRASEBOOKS[o.speaker];

  // Who says it.
  if (o.speaker !== g.speakers[i % g.speakers.length]) bad(`speaker ${o.speaker} out of turn`);
  if (o.accent !== book.accent) bad(`accent ${o.accent} is not ${o.speaker}'s ${book.accent}`);

  // A valid recipe from the menu.
  const n = normaliseOrder(o.order);
  if (!drinks.includes(o.order.type)) bad(`drink ${o.order.type} is not on the menu`);
  if (typeof o.order.extraHot !== 'boolean' || typeof o.order.heart !== 'boolean')
    bad('extraHot/heart are not booleans');
  if (o.order.type === 'flatWhite' && !MILKS.includes(n.milk as Milk)) bad(`milk ${n.milk}`);
  if (o.order.type === 'longBlack' && (n.milk !== null || n.extraHot || n.heart))
    bad('a long black with milk, temperature or a heart');

  // Difficulty fields.
  const tier = orderTier(o);
  if (o.tier !== tier) bad(`tier ${o.tier} but orderTier says ${tier}`);
  if (![1, 2, 3].includes(o.tier)) bad(`tier ${o.tier} out of range`);
  for (const k of ['connected', 'slang', 'chatter'] as const)
    if (![0, 1, 2].includes(o[k])) bad(`${k} ${o[k]} out of 0–2`);
  if (!PACES.includes(o.pace)) bad(`pace ${o.pace}`);
  if (JSON.stringify(o.clarifiable) !== JSON.stringify(ORDER_FIELDS))
    bad(`clarifiable ${o.clarifiable.join(',')}`);

  // Every non-default part is said, and every cue is in the words.
  const lower = o.text.toLowerCase();
  for (const f of ORDER_FIELDS) {
    const cue = o.cues[f];
    if (cue !== undefined && (cue.length === 0 || !lower.includes(cue.toLowerCase())))
      bad(`cue ${f} "${cue}" is not in the words`);
  }
  if (n.type === 'flatWhite' && n.milk !== 'full' && !o.cues.milk) bad('alt milk never said');
  if (n.extraHot && !o.cues.temp) bad('extra hot never said');
  if (n.heart && !o.cues.heart) bad('heart never said');

  if (o.source === 'curated') {
    const line = (ORDER_LINES[o.speaker] ?? []).find((l) => l.text === o.text);
    if (!line) bad(`curated text is not one of ${o.speaker}'s lines`);
    else if (JSON.stringify(line.order) !== JSON.stringify(o.order))
      bad('curated answer key differs from the line');
    if (o.voice.kind !== 'clip' || o.voice.id !== dialogueId(o.speaker, o.text))
      bad('curated line not voiced as its own clip');
    if (o.change) bad('a curated line with a generated change');
    return v;
  }

  // ---- generated orders
  if (o.id !== `gen-${seed >>> 0}-${g.shiftIndex}-${i}`) bad(`id ${o.id}`);
  if (JSON.stringify(o.order) !== JSON.stringify(n)) bad('answer key is not normalised');
  if (!book.paces.includes(o.pace)) bad(`pace ${o.pace} is not one of ${o.speaker}'s`);
  const mods = modifierCount(o.order);
  if (mods > ORDER_MIX[g.difficulty].maxMods)
    bad(`${mods} modifiers > max ${ORDER_MIX[g.difficulty].maxMods}`);
  if (o.voice.kind !== 'segments') {
    bad('generated order not voiced by segments');
    return v;
  }

  // The voice: every segment from this speaker's phrasebook, and the words are exactly them.
  const index = INDEX[o.speaker];
  const segs: SegInfo[] = [];
  for (const id of o.voice.ids) {
    const s = index.get(id);
    if (!s) bad(`segment ${id} is not in ${o.speaker}'s phrasebook`);
    else segs.push(s);
  }
  if (segs.length !== o.voice.ids.length) return v;
  const own = new Set(SEGMENT_INVENTORY[o.speaker].map((s) => s.id));
  for (const id of o.voice.ids) if (!own.has(id)) bad(`segment ${id} not in the voice inventory`);
  const joined = segs.map((s) => s.text).join('');
  if (joined !== o.text) bad(`words are not the joined segments: "${joined}"`);
  if (/^\s|\s$|\s{2,}/.test(o.text)) bad('stray whitespace');
  if (/^[a-z]/.test(o.text)) bad('starts in lower case');

  // Structure: [greet] [lead] (drink | first drink, change, drink) [hot] [heart] closer [chatter].
  const slots = segs.map((s) => s.slot);
  const count = (s: Slot): number => slots.filter((x) => x === s).length;
  const shape = slots.map((s) => SHAPE[s]).join('');
  if (!/^G?L?(C|CXC)H?R?ET?$/.test(shape)) bad(`segments out of order: ${slots.join(' ')}`);
  const lead = segs.find((s) => s.slot === 'lead');
  if (count('closeAsk') === 1 && !lead?.ask) bad('a question closer without a question lead-in');
  if (count('closeSay') === 1 && lead?.ask) bad('a statement closer after a question lead-in');

  // The drink said last is the answer key's drink (or "just a coffee").
  const drinksSaid = segs.filter((s) => s.slot === 'core' || s.slot === 'vague');
  const final = drinksSaid.at(-1);
  const changed = count('change') === 1;
  if (drinksSaid.length !== (changed ? 2 : 1))
    bad(`${drinksSaid.length} drinks said (${changed ? 'with' : 'without'} a change of mind)`);
  const first = drinksSaid[0];
  if (changed && first && first.article !== (lead !== undefined))
    bad(`first drink said ${first.article ? 'with' : 'without'} "a"`);
  if (final) {
    const wantArticle = lead !== undefined || changed;
    if (final.article !== wantArticle) bad(`drink said ${final.article ? 'with' : 'without'} "a"`);
    if (final.key === 'vague') {
      if (mods !== 0) bad('"just a coffee" with modifiers');
      if (book.vague.length === 0) bad(`${o.speaker} is never vague, but was`);
      if (ORDER_MIX[g.difficulty].vague === 0) bad(`vague on ${g.difficulty}`);
      if (o.cues.drink !== undefined) bad('vague order with a drink cue');
      if (changed) bad('vague order with a change of mind');
    } else {
      const want = coreKey(o.order.type, o.order.milk);
      if (final.key !== want) bad(`said ${final.key} but the ticket is ${want}`);
      if (o.cues.drink === undefined) bad('named drink with no drink cue');
    }
  }
  if ((count('hot') === 1) !== o.order.extraHot) bad('"extra hot" said ⇎ ticket extra hot');
  if ((count('heart') === 1) !== o.order.heart) bad('heart said ⇎ ticket heart');
  if ((o.cues.temp !== undefined) !== o.order.extraHot) bad('temp cue ⇎ extra hot');
  if ((o.cues.heart !== undefined) !== o.order.heart) bad('heart cue ⇎ heart');
  const altMilk = o.order.type === 'flatWhite' && o.order.milk !== 'full';
  if ((o.cues.milk !== undefined) !== altMilk) bad('milk cue ⇎ alternative milk');

  // A change of mind: "<first drink>, actually, make that <the ticket's drink>".
  const wantConnected = changed ? 2 : mods >= 2 ? 1 : 0;
  if (o.connected !== wantConnected) bad(`connected ${o.connected}, want ${wantConnected}`);
  if (changed !== (o.change !== undefined)) bad('change segment ⇎ OrderSpec.change');
  if (changed && ORDER_MIX[g.difficulty].change === 0) bad(`change of mind on ${g.difficulty}`);
  if (o.change && final) {
    const changeSeg = o.voice.ids[slots.indexOf('change')];
    const finalId = o.voice.ids[slots.lastIndexOf(final.slot)];
    if (o.change.atSeconds !== 0) bad(`change at ${o.change.atSeconds} s`);
    if (o.change.patch.type === o.order.type) bad('changed to the same drink');
    if (first && o.change.patch.type) {
      const want = coreKey(
        o.change.patch.type,
        o.change.patch.type === 'flatWhite' ? 'full' : null,
      );
      if (first.key !== want) bad(`first said ${first.key}, patch says ${want}`);
    }
    if (o.change.transcript !== `make that ${final.text}`)
      bad(`change transcript "${o.change.transcript}"`);
    if (!o.text.includes(o.change.transcript)) bad('change transcript not in the words');
    if (o.cues.drink !== o.change.transcript) bad('drink cue is not the correction');
    const cv = o.change.voice;
    if (cv.kind !== 'segments' || cv.ids.join('|') !== [changeSeg, finalId].join('|'))
      bad(`change voice ${JSON.stringify(cv)}`);
  }

  // Slang and chatter are what the segments carry.
  const slang = Math.min(
    2,
    segs.reduce((s, x) => s + x.slang, 0),
  );
  if (o.slang !== slang) bad(`slang ${o.slang}, segments say ${slang}`);
  const chat = count('chatter') === 1;
  const wantChatter = (chat ? 1 : 0) + (chat && count('greet') === 1 ? 1 : 0);
  if (o.chatter !== wantChatter) bad(`chatter ${o.chatter}, want ${wantChatter}`);
  return v;
}

/** One shift's orders: each order's rules plus the shift-level ones. */
function checkShift(
  out: OrderSpec[],
  seed: number,
  g: GenerateOptions,
  uniqueText: boolean,
): string[] {
  const v: string[] = [];
  const at = `seed ${seed} ${g.difficulty} shift ${g.shiftIndex}`;
  if (out.length !== g.count) v.push(`${at}: ${out.length} orders for ${g.count} customers`);
  const ids = out.map((o) => o.id);
  if (new Set(ids).size !== ids.length) v.push(`${at}: duplicate order ids ${ids.join(',')}`);
  if (uniqueText) {
    const seen = new Map<string, number>();
    out.forEach((o, i) => {
      const j = seen.get(o.text);
      if (j !== undefined) v.push(`${at}: #${i} repeats #${j} word for word: "${o.text}"`);
      seen.set(o.text, i);
    });
  }
  out.forEach((o, i) => v.push(...checkSpec(o, i, seed, g)));
  return v;
}

describe('order generator fuzz (500 seeds)', () => {
  it('every week shift (weeks 1–2, 3 difficulties) generates valid, fully-said orders', () => {
    const v: string[] = [];
    const seen = new Set<string>();
    for (const seed of SEEDS)
      for (const d of DIFFS)
        for (const shift of SHIFTS) {
          const row = WEEK[shift % WEEK.length];
          if (!row) throw new Error('empty week table');
          const g = opts(shift, d, row.customers, unlocksFor(Math.min(shift, WEEK.length - 1)));
          const out = generateOrders(seed, g);
          v.push(...checkShift(out, seed, g, true));
          for (const o of out) {
            seen.add(o.source);
            if (o.change) seen.add('change');
            if (o.cues.drink === undefined) seen.add('vague');
            if (o.voice.kind === 'segments')
              for (const id of o.voice.ids) seen.add(INDEX[o.speaker].get(id)?.slot ?? '?');
          }
        }
    expect(v.slice(0, 40), `${v.length} violations`).toEqual([]);
    // The fuzz reaches every path the generator has.
    expect([...seen].sort()).toEqual(
      [
        'curated',
        'generated',
        'change',
        'vague',
        'greet',
        'lead',
        'core',
        'hot',
        'heart',
        'closeSay',
        'closeAsk',
        'chatter',
      ].sort(),
    );
  }, 60_000);

  it('the checker itself catches a broken order (so the fuzz is not vacuous)', () => {
    const g = opts(3, 'hard', 9, unlocksFor(3));
    const seed = SEEDS.find((s) =>
      generateOrders(s, g).some((o) => o.source === 'generated' && o.order.heart),
    ) as number;
    const shift = generateOrders(seed, g);
    const base = shift.find((o) => o.source === 'generated' && o.order.heart) as OrderSpec;
    const i = shift.indexOf(base);
    const ids = base.voice.kind === 'segments' ? base.voice.ids : [];
    const other = SPEAKERS.find((s) => s !== base.speaker) as CustomerId;
    const broken: OrderSpec[] = [
      { ...base, text: `${base.text} ` },
      { ...base, order: { ...base.order, heart: false } },
      { ...base, order: { ...base.order, type: 'longBlack', milk: null } },
      { ...base, voice: { kind: 'segments', ids: [`${other}.greet.1`, ...ids.slice(1)] } },
      { ...base, voice: { kind: 'segments', ids: [...ids].reverse() } },
      { ...base, tier: base.tier === 3 ? 1 : 3 },
      { ...base, slang: base.slang === 2 ? 0 : 2 },
    ];
    expect(checkSpec(base, i, seed, g)).toEqual([]);
    for (const b of broken) expect(checkSpec(b, i, seed, g).length).toBeGreaterThan(0);
  });

  it('the Endless batch (40 customers, every drink id) keeps every per-order rule', () => {
    const v: string[] = [];
    for (const seed of SEEDS)
      for (const d of DIFFS) {
        const g = opts(ENDLESS_SHIFT, d, ENDLESS_COUNT, DRINK_IDS);
        v.push(...checkShift(generateOrders(seed, g), seed, g, false));
      }
    expect(v.slice(0, 40), `${v.length} violations`).toEqual([]);
  }, 60_000);

  it('a one-drink menu (no change of mind possible) still gives valid orders', () => {
    const v: string[] = [];
    for (const seed of SEEDS)
      for (const d of DIFFS)
        for (const menu of [['longBlack'], ['flatWhite']] as DrinkId[][]) {
          const g = opts(seed % 10, d, 10, menu);
          const out = generateOrders(seed, g);
          v.push(...checkShift(out, seed, g, false));
          for (const o of out)
            if (o.change)
              v.push(`seed ${seed} ${d} ${menu[0]}: change of mind on a one-drink menu`);
        }
    expect(v.slice(0, 40), `${v.length} violations`).toEqual([]);
  }, 60_000);

  it('is deterministic: same seed and options → deep-equal, in any call order', () => {
    const v: string[] = [];
    for (const seed of SEEDS)
      for (const d of DIFFS) {
        const gs = SHIFTS.map((s) => opts(s, d, 10, unlocksFor(Math.min(s, 4))));
        const forward = gs.map((g) => generateOrders(seed, g));
        const backward = [...gs].reverse().map((g) => generateOrders(seed, g));
        backward.reverse();
        forward.forEach((a, s) => {
          const b = backward[s];
          if (JSON.stringify(a) !== JSON.stringify(b))
            v.push(`seed ${seed} ${d} shift ${s}: differs between two runs`);
        });
        // Every shift of a save says different things.
        const texts = forward.map((x) => x.map((o) => o.text).join('|'));
        if (new Set(texts).size !== texts.length)
          v.push(`seed ${seed} ${d}: two shifts generated the same orders`);
      }
    expect(v.slice(0, 40), `${v.length} violations`).toEqual([]);
  }, 60_000);
});
