// Day 2 customers, in arrival order. Names, looks and personalities come from the prototype CAST
// (prototype/game.html); Mei is new. What they order is in data/orders.ts, how they sound in
// data/voice/profiles.ts. AGENTS.md §6: difficult behaviour belongs to a personality (Karen), never
// to a background, and pace, politeness and fluency vary by person, not by accent.

import type { ClarifyAnswers, OrderLine } from '../sim/listening';
import type { Complaint, DrinkType, Reaction } from '../sim/rush';
import { CLARIFY_ANSWERS, ORDER_LINES } from './orders';

export type CustomerId = 'dazza' | 'priya' | 'beryl' | 'mei' | 'jiwoo' | 'karen';

export interface CustomerLook {
  skin: string;
  hair: 'short' | 'pony' | 'curly' | 'long' | 'bob' | 'none';
  hairC: string;
  /** Shirt colour, or 'hivis'. */
  top: string;
  legs: string;
  hat?: 'hardhat' | 'cap';
  hatC?: string;
  build: number;
  height: number;
  glasses?: boolean;
  sunnies?: boolean;
  bag?: string;
}

export interface CustomerLines {
  impatient: string;
  angry: string;
  /** Delighted, by what they were handed (a heart is only mentioned when they asked for one). */
  happy: Record<Reaction, string>;
  /** Drink-neutral: "fine, thanks". */
  okay: string;
  /** Handed the wrong drink, by what they actually ordered. */
  rejected: Record<DrinkType, string>;
  /** Handed a flat white with the wrong milk. */
  rejectedMilk: string;
  walkout: string;
  /** Specific grumbles when the drink is accepted but not right. */
  complaint: Partial<Record<Complaint, string>>;
}

export interface CustomerDef {
  id: CustomerId;
  name: string;
  /** What Gaz calls them. */
  callName: string;
  tag: string;
  look: CustomerLook;
  /** Ways they might order today (one is picked per shift). */
  orders: readonly OrderLine[];
  /** Their answers to clarifying questions. */
  answers: ClarifyAnswers;
  /** Seconds after the doors open that they walk in. */
  arriveAt: number;
  /** Seconds of patience from reaching the register. */
  patience: number;
  /** Tip for a perfect, quick drink, cents. */
  tipCents: number;
  /** Satisfaction multiplier: under 1 is harder to please. */
  tolerance: number;
  lines: CustomerLines;
}

/** The same delighted words whatever the drink. */
const anyDrink = (text: string): Record<Reaction, string> => ({
  heart: text,
  flatWhite: text,
  longBlack: text,
});

export const CUSTOMERS: readonly CustomerDef[] = [
  {
    id: 'dazza',
    callName: 'Dazza',
    name: 'Dazza',
    tag: 'Tradie · regular',
    look: {
      skin: '#e3ab86',
      hair: 'short',
      hairC: '#5a3b22',
      top: 'hivis',
      legs: '#394654',
      hat: 'hardhat',
      build: 1.12,
      height: 1.03,
    },
    orders: ORDER_LINES.dazza as readonly OrderLine[],
    answers: CLARIFY_ANSWERS.dazza as ClarifyAnswers,
    arriveAt: 1,
    patience: 120,
    tipCents: 300,
    tolerance: 1,
    lines: {
      impatient: "Mate, I've got a crane waiting on me.",
      angry: 'Strewth. Any day now, champ.',
      happy: anyDrink('Legend. Cheers, mate.'),
      okay: "Yeah, she'll do. Ta.",
      rejected: {
        flatWhite: "Nah mate, that's not mine. Flat white, remember?",
        longBlack: "Nah mate, that's not mine. Long black, remember?",
      },
      rejectedMilk: "Wrong milk, mate. Can't do that one.",
      walkout: "Forget it. I'll grab one from the servo.",
      complaint: {
        lukewarm: 'Bit cold, mate. Whatever, gotta run.',
        badShot: 'Tastes like the bottom of me ute. Ta anyway.',
        messy: 'Half of it went in the saucer, mate.',
      },
    },
  },
  {
    id: 'priya',
    callName: 'Priya',
    name: 'Priya',
    tag: 'Nurse · post night-shift',
    look: {
      skin: '#b98262',
      hair: 'pony',
      hairC: '#18110d',
      top: '#3f8f9a',
      legs: '#3f8f9a',
      build: 0.95,
      height: 0.98,
    },
    orders: ORDER_LINES.priya as readonly OrderLine[],
    answers: CLARIFY_ANSWERS.priya as ClarifyAnswers,
    arriveAt: 36,
    patience: 115,
    tipCents: 200,
    tolerance: 1.05,
    lines: {
      impatient: 'Sorry… is mine nearly ready? I might fall asleep standing up.',
      angry: "Please. I'm about to fall asleep on your counter.",
      happy: anyDrink("Oh, that's perfect. You're a lifesaver."),
      okay: "Thanks. That'll keep me upright.",
      rejected: {
        flatWhite: "Sorry, I think that's someone else's. Mine's a flat white.",
        longBlack: "Sorry, I think that's someone else's. Mine's the long black.",
      },
      rejectedMilk: "Sorry, I think that's the wrong milk. I can't have that one.",
      walkout: "I can't wait any longer. I need my bed.",
      complaint: {
        weak: 'Bit watery… thanks though.',
        strong: "Whoa. That's strong. I'll never sleep now.",
        lukewarm: "It's a bit cold, but honestly, I'll take it.",
      },
    },
  },
  {
    id: 'beryl',
    callName: 'Beryl',
    name: 'Nan Beryl',
    tag: 'Regular since 1987',
    look: {
      skin: '#f1cdb4',
      hair: 'curly',
      hairC: '#d9d6d2',
      top: '#8a6d9a',
      legs: '#5b5566',
      build: 0.92,
      height: 0.93,
      glasses: true,
    },
    orders: ORDER_LINES.beryl as readonly OrderLine[],
    answers: CLARIFY_ANSWERS.beryl as ClarifyAnswers,
    arriveAt: 71,
    patience: 130,
    tipCents: 100,
    tolerance: 1.12,
    lines: {
      impatient: 'No rush, love. Well… a little rush.',
      angry: "I'm not getting any younger, darl.",
      happy: {
        heart: "Oh, look at that! A proper heart. You're a treasure.",
        flatWhite: "Oh, lovely. Just how I like it, darl. You're a treasure.",
        longBlack: "Oh, that's a good strong one, love. My Les would've approved.",
      },
      okay: 'Thank you, love. Lovely and warm.',
      rejected: {
        flatWhite: "Oh, I don't think that's mine, darl. Mine's a flat white.",
        longBlack: "Oh, I don't think that's mine, darl. I asked for a long black.",
      },
      rejectedMilk: "Oh, that's not my milk, love. My tummy won't thank me for that.",
      walkout: "I'll pop back later, love. That's my bus.",
      complaint: {
        noHeart: 'No heart today? Never mind, love.',
        lukewarm: 'Bit cool, darl, but never mind.',
      },
    },
  },
  {
    id: 'mei',
    callName: 'Mei',
    name: 'Mei 美',
    tag: 'Product manager · always on a call',
    look: {
      skin: '#eccaa8',
      hair: 'bob',
      hairC: '#16110f',
      top: '#2e3a4c',
      legs: '#24272d',
      build: 0.94,
      height: 0.99,
      bag: '#8c2f39',
    },
    orders: ORDER_LINES.mei as readonly OrderLine[],
    answers: CLARIFY_ANSWERS.mei as ClarifyAnswers,
    arriveAt: 106,
    patience: 115,
    tipCents: 250,
    tolerance: 1,
    lines: {
      impatient: "Sorry, how long will it be? I've got a meeting in five.",
      angry: "I really can't wait much longer.",
      happy: anyDrink('Perfect, thank you. Lifesaver.'),
      okay: 'Thanks.',
      rejected: {
        flatWhite: "Sorry, that's not mine. I ordered a flat white.",
        longBlack: "Sorry, that's not mine. I ordered a long black.",
      },
      rejectedMilk: 'Sorry, this is the wrong milk.',
      walkout: "Forget it. I'll be late. Bye.",
      complaint: {
        notHotEnough: 'I did say extra hot.',
        lukewarm: "It's a bit cold, but okay.",
        badShot: 'Hm. Tastes a bit burnt.',
        weak: 'Bit watery, but fine.',
      },
    },
  },
  {
    id: 'jiwoo',
    callName: 'Jiwoo',
    name: 'Jiwoo 지우',
    tag: 'Working holiday',
    look: {
      skin: '#f3d4bc',
      hair: 'long',
      hairC: '#1b1512',
      top: '#f2ede2',
      legs: '#6a7fa3',
      build: 0.95,
      height: 0.97,
      bag: '#c5a37a',
    },
    orders: ORDER_LINES.jiwoo as readonly OrderLine[],
    answers: CLARIFY_ANSWERS.jiwoo as ClarifyAnswers,
    arriveAt: 141,
    patience: 120,
    tipCents: 100,
    tolerance: 1,
    lines: {
      impatient: 'Um, sorry, is my coffee coming soon? My shift starts at eight.',
      angry: 'Sorry, I really have to go soon…',
      happy: anyDrink('와, perfect! 감사합니다, thank you!'),
      okay: 'Thank you!',
      rejected: {
        flatWhite: 'Oh, sorry, I ordered a flat white.',
        longBlack: 'Oh, sorry, I ordered a long black.',
      },
      rejectedMilk: "Oh, sorry, I think it's the wrong milk.",
      walkout: "Sorry, I can't wait. I'll be late for work.",
      complaint: {
        weak: 'Hmm, a bit watery, but thank you.',
        lukewarm: "It's a little cold… it's okay.",
      },
    },
  },
  {
    id: 'karen',
    callName: 'Karen',
    name: 'Karen',
    tag: 'Wants the manager',
    look: {
      skin: '#f3cfb6',
      hair: 'bob',
      hairC: '#e6c88a',
      top: '#e9c7cf',
      legs: '#f1efe9',
      build: 1,
      height: 1,
      sunnies: true,
    },
    orders: ORDER_LINES.karen as readonly OrderLine[],
    answers: CLARIFY_ANSWERS.karen as ClarifyAnswers,
    arriveAt: 176,
    patience: 110,
    tipCents: 50,
    tolerance: 0.88,
    lines: {
      impatient: "I'm timing this, you know.",
      angry: 'This is ridiculous. Is there a manager?',
      happy: anyDrink('Hm. Acceptable.'),
      okay: 'Fine.',
      rejected: {
        flatWhite: 'That is not what I ordered. I said a flat white.',
        longBlack: 'That is not what I ordered. I said a long black.',
      },
      rejectedMilk: 'That is the wrong milk. Do you people listen?',
      walkout: "Unbelievable. I'm leaving a review.",
      complaint: {
        notHotEnough: 'This is not extra hot. I said extra hot.',
        lukewarm: "It's lukewarm. Of course it is.",
        badShot: 'This tastes burnt.',
      },
    },
  },
];

export const customerDef = (id: CustomerId): CustomerDef => {
  const d = CUSTOMERS.find((c) => c.id === id);
  if (!d) throw new Error(`unknown customer ${id}`);
  return d;
};
