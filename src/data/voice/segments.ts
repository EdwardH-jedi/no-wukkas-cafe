// Every voice segment a generated order can use, per speaker: the finite inventory the voice
// pipeline renders (one clip per segment id) and the phrasebooks sim/listening/generate.ts builds
// orders from. Writing rules as in data/orders.ts: natural speech for the person, standard
// spelling (the accent is in the recording, never in respelt text). Segments join with no
// separator: greetings and lead-ins end with a space, modifiers and closers bring their own
// punctuation, chat starts with a space. Jiwoo code-switches only where her curated lines do.

import type { Pace } from '../../sim/listening';
import type {
  CoreKey,
  CoreSegment,
  LeadSegment,
  Phrasebook,
  Segment,
} from '../../sim/listening/phrase';
import type { CustomerId } from '../customers';
import type { Accent } from './profiles';

/** A segment's text, or [text, slang weight]. */
type Src = string | readonly [string, number];

interface CoreSrc {
  text: string;
  drink: string;
  milk?: string;
  slang?: number;
}

interface BookSrc {
  accent: Accent;
  paces: Pace[];
  leadChance: number;
  greet: Src[];
  lead: Array<{ text: string; ask: boolean; slang?: number }>;
  core: Record<CoreKey, CoreSrc[]>;
  vague: Array<{ text: string; article: string }>;
  hot: Src[];
  heart: Src[];
  closeSay: Src[];
  closeAsk: Src[];
  chatter: Src[];
  change: Src[];
}

const fw = (text: string, milk?: string, slang?: number): CoreSrc => ({
  text,
  drink: /flattie/i.test(text) ? 'flattie' : 'flat white',
  ...(milk ? { milk } : {}),
  ...(slang ? { slang } : {}),
});
const LB: CoreSrc[] = [{ text: 'Long black', drink: 'long black' }];

const BOOKS: Record<CustomerId, BookSrc> = {
  // Tradie: fast, slangy, friendly but in a hurry.
  dazza: {
    accent: 'australian',
    paces: ['normal', 'fast'],
    leadChance: 0.3,
    greet: ['Morning, mate. ', ['Oi mate! ', 1], ["G'day, mate. ", 1]],
    lead: [
      { text: 'Can I grab ', ask: true },
      { text: 'Chuck us ', ask: false, slang: 1 },
    ],
    core: {
      'flatWhite.full': [fw('Flat white'), fw('Flattie', undefined, 1)],
      'flatWhite.oat': [fw('Oat flat white', 'oat'), fw('Oat flattie', 'oat', 1)],
      'flatWhite.soy': [fw('Soy flat white', 'soy'), fw('Soy flattie', 'soy', 1)],
      'flatWhite.almond': [fw('Almond flat white', 'almond'), fw('Almond flattie', 'almond', 1)],
      longBlack: LB,
    },
    vague: [{ text: 'Just a coffee', article: 'a coffee' }],
    hot: [', extra hot', ', extra hot, mate'],
    heart: [[', chuck a heart on it', 1], ', with a heart'],
    closeSay: [[', ta.', 1], ', cheers.', ', thanks, mate.'],
    closeAsk: [[', ta?', 1], ', thanks?'],
    chatter: [
      ' Gotta be on site in ten.',
      ' Big day on the tools.',
      [" Smoko's only fifteen minutes.", 1],
    ],
    change: [', actually, nah, make that ', ', no wait, make that '],
  },
  // A regular since 1987: slow, warm, chats her way to the point.
  beryl: {
    accent: 'australian',
    paces: ['slow'],
    leadChance: 0.9,
    greet: ['Hello, love. ', ['Morning, darl. ', 1], 'Oh, hello there. '],
    lead: [
      { text: 'Could I have ', ask: true },
      { text: "I'd like ", ask: false },
      { text: 'Could you make me ', ask: true },
    ],
    core: {
      'flatWhite.full': [fw('Flat white')],
      'flatWhite.oat': [fw('Flat white with oat milk', 'oat milk')],
      'flatWhite.soy': [fw('Soy flat white', 'soy'), fw('Flat white with soy milk', 'soy milk')],
      'flatWhite.almond': [fw('Flat white with almond milk', 'almond milk')],
      longBlack: LB,
    },
    vague: [{ text: 'Just a nice coffee', article: 'a nice coffee' }],
    hot: [', extra hot', ', nice and extra hot'],
    heart: [', with one of those little hearts', ', and a little heart if you have time'],
    closeSay: [', please, love.', [', thank you, darl.', 1]],
    closeAsk: [', please, love?', ', please?'],
    chatter: [
      ' My knees are playing up again.',
      ' The bus was early for once.',
      " My grandson's coming over this afternoon.",
    ],
    change: [', oh, no, sorry, love, make that ', ', actually, make that '],
  },
  // Wants it exactly right and wants you to know it. Curt, precise, never vague.
  karen: {
    accent: 'australian',
    paces: ['normal', 'fast'],
    leadChance: 0.5,
    greet: ['Hi. ', 'Right. '],
    lead: [
      { text: "I'll have ", ask: false },
      { text: 'I want ', ask: false },
    ],
    core: {
      'flatWhite.full': [fw('Flat white')],
      'flatWhite.oat': [fw('Oat flat white', 'oat')],
      'flatWhite.soy': [fw('Soy flat white', 'soy')],
      'flatWhite.almond': [fw('Almond flat white', 'almond')],
      longBlack: LB,
    },
    vague: [],
    hot: [', extra hot', '. Extra hot. Not warm, extra hot'],
    heart: [', with a heart', ', and a heart on top'],
    closeSay: ['. Quickly, please.', '. Thank you.', ". And I'll be watching."],
    closeAsk: [],
    chatter: [' I have pilates at eight.', ' I have a client call at half past.'],
    change: [', no, actually, make that '],
  },
  // Nurse straight off a night shift. Polite, tired, sometimes changes her mind.
  priya: {
    accent: 'indian',
    paces: ['slow', 'normal'],
    leadChance: 0.75,
    greet: ['Morning. ', 'Hi. ', 'Hello. '],
    lead: [
      { text: 'Could I please get ', ask: true },
      { text: 'Can I get ', ask: true },
    ],
    core: {
      'flatWhite.full': [fw('Flat white')],
      'flatWhite.oat': [fw('Flat white with oat milk', 'oat milk'), fw('Oat flat white', 'oat')],
      'flatWhite.soy': [fw('Soy flat white', 'soy'), fw('Flat white with soy milk', 'soy milk')],
      'flatWhite.almond': [fw('Flat white with almond milk', 'almond milk')],
      longBlack: LB,
    },
    vague: [{ text: 'Just a coffee', article: 'a coffee' }],
    hot: [', extra hot'],
    heart: [', with a heart', ', and a heart if you can'],
    closeSay: [', please.', ', thank you.'],
    closeAsk: [', please?', '? Thank you.'],
    chatter: [' Long night at the hospital.', " I'm still half asleep."],
    change: [', actually, no, sorry, make that '],
  },
  // On a working holiday, cheerful; says hello and thank you in Korean now and then.
  jiwoo: {
    accent: 'korean',
    paces: ['normal'],
    leadChance: 0.6,
    greet: ['Hi! ', ['안녕하세요! Ah, hi! ', 1], 'Hello! '],
    lead: [
      { text: 'Can I get ', ask: true },
      { text: 'Could I have ', ask: true },
    ],
    core: {
      'flatWhite.full': [fw('Flat white')],
      'flatWhite.oat': [fw('Flat white with oat milk', 'oat milk'), fw('Oat flat white', 'oat')],
      'flatWhite.soy': [fw('Soy flat white', 'soy')],
      'flatWhite.almond': [fw('Almond flat white', 'almond'), fw('Almond flattie', 'almond', 1)],
      longBlack: LB,
    },
    vague: [{ text: 'Just a coffee', article: 'a coffee' }],
    hot: [', extra hot'],
    heart: [', with a heart', ', and a heart on top'],
    closeSay: [', please!', [', please. 감사합니다!', 1]],
    closeAsk: [', please?', [', please? 감사합니다!', 1]],
    chatter: [' My shift starts at eight.', " It's my first week here!"],
    change: [', oh, sorry, make that '],
  },
  // Product manager, always on a call, brisk and sure of herself. Never vague.
  mei: {
    accent: 'chinese',
    paces: ['normal', 'fast'],
    leadChance: 0.35,
    greet: ['Hi. ', 'Morning. '],
    lead: [{ text: 'Can I get ', ask: true }],
    core: {
      'flatWhite.full': [fw('Flat white')],
      'flatWhite.oat': [fw('Oat flat white', 'oat')],
      'flatWhite.soy': [fw('Soy flat white', 'soy')],
      'flatWhite.almond': [
        fw('Almond flat white', 'almond'),
        fw('Flat white with almond milk', 'almond milk'),
      ],
      longBlack: LB,
    },
    vague: [],
    hot: [', extra hot'],
    heart: [', with a heart'],
    closeSay: [', please. Thanks.', ', thanks.'],
    closeAsk: [', please?'],
    chatter: [" Sorry, I'm on a call.", " Quick one, I've got a meeting at half past."],
    change: [', no, wait, make that '],
  },
};

const withArticle = (t: string): string =>
  `${/^[aeiou]/i.test(t) ? 'an' : 'a'} ${t.charAt(0).toLowerCase()}${t.slice(1)}`;

function build(speaker: CustomerId, b: BookSrc): Phrasebook {
  const seg = (id: string, s: Src): Segment =>
    typeof s === 'string' ? { id, text: s, slang: 0 } : { id, text: s[0], slang: s[1] };
  const list = (slot: string, xs: readonly Src[]): Segment[] =>
    xs.map((s, i) => seg(`${speaker}.${slot}.${i + 1}`, s));
  const core = (slot: string, c: CoreSrc, i: number, article?: string): CoreSegment => {
    const id = `${speaker}.${slot}.${i + 1}`;
    const slang = c.slang ?? 0;
    return {
      id,
      text: c.text,
      slang,
      drink: c.drink,
      ...(c.milk ? { milk: c.milk } : {}),
      article: { id: `${id}.a`, text: article ?? withArticle(c.text), slang },
    };
  };
  const lead: LeadSegment[] = b.lead.map((l, i) => ({
    id: `${speaker}.lead.${i + 1}`,
    text: l.text,
    slang: l.slang ?? 0,
    ask: l.ask,
  }));
  return {
    speaker,
    accent: b.accent,
    paces: b.paces,
    leadChance: b.leadChance,
    greet: list('greet', b.greet),
    lead,
    core: Object.fromEntries(
      Object.entries(b.core).map(([k, cs]) => [k, cs.map((c, i) => core(`core.${k}`, c, i))]),
    ) as Record<CoreKey, CoreSegment[]>,
    vague: b.vague.map((v, i) => core('vague', { text: v.text, drink: '' }, i, v.article)),
    hot: list('hot', b.hot),
    heart: list('heart', b.heart),
    closeSay: list('closeSay', b.closeSay),
    closeAsk: list('closeAsk', b.closeAsk),
    chatter: list('chatter', b.chatter),
    change: list('change', b.change),
  };
}

export const PHRASEBOOKS: Record<CustomerId, Phrasebook> = Object.fromEntries(
  Object.entries(BOOKS).map(([id, b]) => [id, build(id as CustomerId, b)]),
) as Record<CustomerId, Phrasebook>;

/** Every segment in a phrasebook, article forms included, in a stable order. */
export function bookSegments(b: Phrasebook): Segment[] {
  const cores = [...Object.values(b.core).flat(), ...b.vague].flatMap((c) => [c, c.article]);
  return [
    ...b.greet,
    ...b.lead,
    ...cores,
    ...b.hot,
    ...b.heart,
    ...b.closeSay,
    ...b.closeAsk,
    ...b.chatter,
    ...b.change,
  ].map(({ id, text, slang }) => ({ id, text, slang }));
}

/** What the voice pipeline renders: every segment id and its words, per speaker. */
export const SEGMENT_INVENTORY: Record<CustomerId, Segment[]> = Object.fromEntries(
  Object.entries(PHRASEBOOKS).map(([id, b]) => [id, bookSegments(b)]),
) as Record<CustomerId, Segment[]>;

export const SEGMENT_BY_ID: ReadonlyMap<string, Segment> = new Map(
  Object.values(SEGMENT_INVENTORY)
    .flat()
    .map((s) => [s.id, s]),
);
