// Generated orders: a seed and a shift become what the customers say, mixing the curated lines
// (data/orders.ts) with orders assembled from each speaker's phrasebook (data/voice/segments.ts),
// so two shifts never play the same and listening stays listening rather than memorisation.
// Deterministic for a given seed and options; the seeded RNG is the only randomness.

import { createRng, type Rng } from '../../core/rng';
import type { CustomerId } from '../../data/customers';
import { ORDER_LINES } from '../../data/orders';
import { dialogueId } from '../../data/voice/ids';
import { PHRASEBOOKS } from '../../data/voice/segments';
import type { OrderSpec } from '../contracts/order';
import { isPlayable, type DrinkId, type Ticket } from '../contracts/ticket';
import {
  DIFFICULTY,
  modifierCount,
  ORDER_FIELDS,
  orderTier,
  type Difficulty,
  type OrderLine,
  type Tier,
} from '../listening';
import type { DrinkType, Milk, Order } from '../rush';
import { assemble, coreKey, type Phrasebook } from './phrase';

export interface GenerateOptions {
  /** 0-based across the week: the same seed gives every shift different orders. */
  shiftIndex: number;
  difficulty: Difficulty;
  count: number;
  unlockedDrinks: readonly DrinkId[];
  /** Who comes in, in arrival order; cycled when `count` is larger. */
  speakers: readonly CustomerId[];
}

/** How a difficulty shapes the orders (chances are per order). */
export interface OrderMix {
  /** Share of curated lines (the rest are generated). */
  curated: number;
  /** Most modifiers (milk, extra hot, heart) on one order. */
  maxMods: number;
  altMilk: number;
  hot: number;
  heart: number;
  /** Changes their mind mid-order ("Long black, actually, no, make that …"). */
  change: number;
  /** Doesn't name the drink at all ("Just a coffee"): the player must ask. */
  vague: number;
  greet: number;
  chatter: number;
}

export const ORDER_MIX: Record<Difficulty, OrderMix> = {
  easy: {
    curated: 0.5,
    maxMods: 1,
    altMilk: 0.3,
    hot: 0.2,
    heart: 0.2,
    change: 0,
    vague: 0,
    greet: 0.4,
    chatter: 0,
  },
  normal: {
    curated: 0.35,
    maxMods: 2,
    altMilk: 0.45,
    hot: 0.3,
    heart: 0.3,
    change: 0.1,
    vague: 0.05,
    greet: 0.6,
    chatter: 0.3,
  },
  hard: {
    curated: 0.2,
    maxMods: 3,
    altMilk: 0.6,
    hot: 0.45,
    heart: 0.4,
    change: 0.25,
    vague: 0.12,
    greet: 0.7,
    chatter: 0.6,
  },
};

const ALT_MILKS: readonly Milk[] = ['oat', 'soy', 'almond'];
/** Tries per order within the difficulty's tiers, then as many again with any tier. */
const ATTEMPTS = 64;

/** A shift's own seed, so shifts of one save never share orders. */
export function shiftSeed(seed: number, shiftIndex: number): number {
  return (Math.imul(seed >>> 0, 0x9e3779b1) ^ Math.imul(shiftIndex + 1, 0x85ebca6b)) >>> 0;
}

/** A curated line as an OrderSpec (unchanged words, answer key and cues; voiced as one clip). */
export function curatedSpec(speaker: CustomerId, line: OrderLine): OrderSpec {
  return {
    ...line,
    order: { ...line.order },
    cues: { ...line.cues },
    speaker,
    accent: PHRASEBOOKS[speaker].accent,
    tier: orderTier(line),
    voice: { kind: 'clip', id: dialogueId(speaker, line.text) },
    clarifiable: [...ORDER_FIELDS],
    source: 'curated',
  };
}

function pickCurated(
  speaker: CustomerId,
  drinks: readonly DrinkType[],
  tiers: readonly Tier[],
  used: ReadonlySet<string>,
  rng: Rng,
): OrderSpec | null {
  const pool = (ORDER_LINES[speaker] ?? []).filter(
    (l) => drinks.includes(l.order.type) && !used.has(l.text) && tiers.includes(orderTier(l)),
  );
  return pool.length > 0 ? curatedSpec(speaker, rng.pick(pool)) : null;
}

function randomTicket(drinks: readonly DrinkType[], mix: OrderMix, rng: Rng): Order {
  const type = rng.pick(drinks);
  if (type === 'longBlack') return { type, milk: null, extraHot: false, heart: false };
  let milk: Milk = rng.next() < mix.altMilk ? rng.pick(ALT_MILKS) : 'full';
  let extraHot = rng.next() < mix.hot;
  let heart = rng.next() < mix.heart;
  const o = (): Order => ({ type, milk, extraHot, heart });
  if (modifierCount(o()) > mix.maxMods) heart = false;
  if (modifierCount(o()) > mix.maxMods) extraHot = false;
  if (modifierCount(o()) > mix.maxMods) milk = 'full';
  return o();
}

function build(
  id: string,
  book: Phrasebook,
  drinks: readonly DrinkType[],
  mix: OrderMix,
  rng: Rng,
): OrderSpec {
  const truth = randomTicket(drinks, mix, rng);
  const vague = modifierCount(truth) === 0 && book.vague.length > 0 && rng.next() < mix.vague;
  const other = drinks.find((d) => d !== truth.type);
  const changing = !vague && other !== undefined && rng.next() < mix.change;
  const lead =
    book.lead.length > 0 && rng.next() < book.leadChance ? rng.pick(book.lead) : undefined;
  const greet = rng.next() < mix.greet ? rng.pick(book.greet) : undefined;
  const chatter = rng.next() < mix.chatter ? rng.pick(book.chatter) : undefined;
  const pace = rng.pick(book.paces);
  const core = vague ? rng.pick(book.vague) : rng.pick(book.core[coreKey(truth.type, truth.milk)]);
  const first =
    changing && other
      ? rng.pick(book.core[coreKey(other, other === 'flatWhite' ? 'full' : null)])
      : undefined;
  const change = changing ? rng.pick(book.change) : undefined;
  const close = rng.pick(lead?.ask ? book.closeAsk : book.closeSay);
  const hot = truth.extraHot ? rng.pick(book.hot) : undefined;
  const heart = truth.heart ? rng.pick(book.heart) : undefined;
  const said = assemble({ greet, lead, first, change, core, hot, heart, close, chatter });

  const mods = modifierCount(truth);
  const line: OrderLine = {
    id,
    text: said.text,
    order: truth,
    pace,
    connected: changing ? 2 : mods >= 2 ? 1 : 0,
    slang: Math.min(2, said.slang) as 0 | 1 | 2,
    chatter: ((chatter ? 1 : 0) + (chatter && greet ? 1 : 0)) as 0 | 1 | 2,
    cues: said.cues,
  };
  const firstSaid: Partial<Ticket> =
    other === 'longBlack' ? { type: 'longBlack', milk: null } : { type: 'flatWhite', milk: 'full' };
  const spec: OrderSpec = {
    ...line,
    speaker: book.speaker,
    accent: book.accent,
    tier: orderTier(line),
    voice: { kind: 'segments', ids: said.ids },
    clarifiable: [...ORDER_FIELDS],
    source: 'generated',
  };
  if (change && said.changeText)
    spec.change = {
      atSeconds: 0,
      patch: firstSaid,
      transcript: said.changeText,
      voice: { kind: 'segments', ids: [change.id, core.article.id] },
    };
  return spec;
}

function generateOne(
  id: string,
  speaker: CustomerId,
  drinks: readonly DrinkType[],
  tiers: readonly Tier[],
  mix: OrderMix,
  used: ReadonlySet<string>,
  rng: Rng,
): OrderSpec {
  const book = PHRASEBOOKS[speaker];
  let last = build(id, book, drinks, mix, rng);
  for (let a = 1; a <= ATTEMPTS * 2; a++) {
    if (!used.has(last.text) && (a > ATTEMPTS || tiers.includes(last.tier))) return last;
    last = build(id, book, drinks, mix, rng);
  }
  return last;
}

/** The orders for one shift, in arrival order. Deterministic for (seed, options). */
export function generateOrders(seed: number, o: GenerateOptions): OrderSpec[] {
  const drinks = o.unlockedDrinks.filter(isPlayable);
  if (drinks.length === 0 || o.speakers.length === 0) return [];
  const rng = createRng(shiftSeed(seed, o.shiftIndex));
  const mix = ORDER_MIX[o.difficulty];
  const tiers = DIFFICULTY[o.difficulty].tiers;
  const used = new Set<string>();
  const out: OrderSpec[] = [];
  for (let i = 0; i < o.count; i++) {
    const speaker = o.speakers[i % o.speakers.length] as CustomerId;
    const curated =
      rng.next() < mix.curated ? pickCurated(speaker, drinks, tiers, used, rng) : null;
    const id = `gen-${seed >>> 0}-${o.shiftIndex}-${i}`;
    const spec = curated ?? generateOne(id, speaker, drinks, tiers, mix, used, rng);
    used.add(spec.text);
    out.push(spec);
  }
  return out;
}
