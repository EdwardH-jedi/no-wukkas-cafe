// Generated orders: the phrasebook types and how one order's segments become the exact words a
// customer says. A generated order is a run of segments (greeting, lead-in, the drink, modifiers,
// closer, chat, a change of mind), each its own voice clip, so `text` is always the segments joined
// and the audio can be assembled from a finite inventory (data/voice/segments.ts). Accent lives in
// word choice, slang and sentence shape only: never in respelt words.

import type { CustomerId } from '../../data/customers';
import type { Accent } from '../../data/voice/profiles';
import type { OrderField, Pace } from '../listening';
import type { DrinkType, Milk } from '../rush';

export interface Segment {
  id: string;
  text: string;
  /** Slang or another language's words the player must know (adds to OrderLine.slang). */
  slang: number;
}

/** The drink, said bare ("Oat flattie") or after a lead-in (`article`: "an oat flattie"). */
export interface CoreSegment extends Segment {
  article: Segment;
  /** The words carrying the drink and the milk, as in `text` (matched case-insensitively).
   *  An empty `drink` names no drink at all ("Just a coffee"): the player has to ask. */
  drink: string;
  milk?: string;
}

export interface LeadSegment extends Segment {
  /** A question ("Can I get …") takes a question closer; otherwise a statement closer. */
  ask: boolean;
}

export type CoreKey =
  'flatWhite.full' | 'flatWhite.oat' | 'flatWhite.soy' | 'flatWhite.almond' | 'longBlack';

export const coreKey = (type: DrinkType, milk: Milk | null): CoreKey =>
  type === 'longBlack' ? 'longBlack' : `flatWhite.${milk ?? 'full'}`;

export interface Phrasebook {
  speaker: CustomerId;
  accent: Accent;
  paces: readonly Pace[];
  /** Chance they open with a lead-in ("Could I get …") rather than just naming the drink. */
  leadChance: number;
  /** End with a space. */
  greet: Segment[];
  /** End with a space; followed by the drink with its article. */
  lead: LeadSegment[];
  core: Record<CoreKey, CoreSegment[]>;
  /** Names no drink ("Just a coffee"). Empty: this customer is never vague. */
  vague: CoreSegment[];
  /** Each contains "extra hot". */
  hot: Segment[];
  /** Each contains "heart". */
  heart: Segment[];
  closeSay: Segment[];
  closeAsk: Segment[];
  /** Start with a space. */
  chatter: Segment[];
  /** Each ends with "make that ", followed by the corrected drink with its article. */
  change: Segment[];
}

export interface PhrasePlan {
  greet?: Segment;
  lead?: LeadSegment;
  /** What they say first when they change their mind (needs `change`). */
  first?: CoreSegment;
  change?: Segment;
  core: CoreSegment;
  hot?: Segment;
  heart?: Segment;
  close: Segment;
  chatter?: Segment;
}

export interface Phrased {
  text: string;
  /** Segment ids in play order: the voice. */
  ids: string[];
  cues: Partial<Record<OrderField, string>>;
  /** Sum of the segments' slang weights. */
  slang: number;
  /** The correction as said ("make that an oat flattie"), when they change their mind. */
  changeText?: string;
}

/** Join a plan's segments into what the customer says, with the cue words for each field. */
export function assemble(p: PhrasePlan): Phrased {
  const withLead = p.lead !== undefined;
  const parts: Segment[] = [];
  if (p.greet) parts.push(p.greet);
  if (p.lead) parts.push(p.lead);
  const first = p.change ? p.first : undefined;
  if (first && p.change) parts.push(withLead ? first.article : first, p.change, p.core.article);
  else parts.push(withLead ? p.core.article : p.core);
  if (p.hot) parts.push(p.hot);
  if (p.heart) parts.push(p.heart);
  parts.push(p.close);
  if (p.chatter) parts.push(p.chatter);

  const cues: Partial<Record<OrderField, string>> = {};
  const changeText = first ? `make that ${p.core.article.text}` : undefined;
  if (p.core.drink) cues.drink = changeText ?? p.core.drink;
  if (p.core.milk) cues.milk = changeText ?? p.core.milk;
  if (p.hot) cues.temp = 'extra hot';
  if (p.heart) cues.heart = 'heart';
  return {
    text: parts.map((s) => s.text).join(''),
    ids: parts.map((s) => s.id),
    cues,
    slang: parts.reduce((n, s) => n + s.slang, 0),
    ...(changeText ? { changeText } : {}),
  };
}
