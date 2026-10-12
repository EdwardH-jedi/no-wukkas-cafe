// Day 2 customers, in arrival order. Names, looks, voices and personalities come from the
// prototype CAST (prototype/game.html); orders are limited to what the current mechanics can make.
// AGENTS.md §6: difficult behaviour belongs to a personality (Karen), never to a background.

import type { Complaint, Order } from '../sim/rush';

export type CustomerId = 'dazza' | 'priya' | 'beryl' | 'jiwoo' | 'karen';

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
  order: string;
  impatient: string;
  angry: string;
  happy: string;
  okay: string;
  rejected: string;
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
  voice: { pitch: number; rate: number };
  look: CustomerLook;
  order: Order;
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

export const CUSTOMERS: readonly CustomerDef[] = [
  {
    id: 'dazza',
    callName: 'Dazza',
    name: 'Dazza',
    tag: 'Tradie · regular',
    voice: { pitch: 0.7, rate: 1.12 },
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
    order: { type: 'flatWhite', extraHot: false, heart: false },
    arriveAt: 1,
    patience: 75,
    tipCents: 300,
    tolerance: 1,
    lines: {
      order: 'Oi mate! Flattie, ta. Gotta be on site in ten.',
      impatient: "Mate, I've got a crane waiting on me.",
      angry: 'Strewth. Any day now, champ.',
      happy: 'Legend. Cheers, mate.',
      okay: "Yeah, she'll do. Ta.",
      rejected: "Nah mate, that's not mine. Flat white, remember?",
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
    voice: { pitch: 1.0, rate: 0.95 },
    look: {
      skin: '#b98262',
      hair: 'pony',
      hairC: '#18110d',
      top: '#3f8f9a',
      legs: '#3f8f9a',
      build: 0.95,
      height: 0.98,
    },
    order: { type: 'longBlack', extraHot: false, heart: false },
    arriveAt: 14,
    patience: 95,
    tipCents: 200,
    tolerance: 1.05,
    lines: {
      order: 'Morning… a long black, please. Fourteen-hour shift at RPA.',
      impatient: 'Sorry… is mine nearly ready? I might fall asleep standing up.',
      angry: "Please. I'm about to fall asleep on your counter.",
      happy: "Oh, that's perfect. You're a lifesaver.",
      okay: "Thanks. That'll keep me upright.",
      rejected: "Sorry, I think that's someone else's. Mine's the long black.",
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
    voice: { pitch: 1.25, rate: 0.82 },
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
    order: { type: 'flatWhite', extraHot: false, heart: true },
    arriveAt: 40,
    patience: 130,
    tipCents: 100,
    tolerance: 1.12,
    lines: {
      order:
        'Hello love. A flat white, please, with one of those little hearts? My grandson says you do them now.',
      impatient: 'No rush, love. Well… a little rush.',
      angry: "I'm not getting any younger, darl.",
      happy: "Oh, look at that! A proper heart. You're a treasure.",
      okay: 'Thank you, love. Lovely and warm.',
      rejected: "Oh, I don't think that's mine, darl. Mine's the flat white with the heart.",
      walkout: "I'll pop back later, love. That's my bus.",
      complaint: {
        noHeart: 'No heart today? Never mind, love.',
        lukewarm: 'Bit cool, darl, but never mind.',
      },
    },
  },
  {
    id: 'jiwoo',
    callName: 'Jiwoo',
    name: 'Jiwoo 지우',
    tag: 'Working holiday',
    voice: { pitch: 1.2, rate: 1.1 },
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
    order: { type: 'longBlack', extraHot: false, heart: false },
    arriveAt: 68,
    patience: 110,
    tipCents: 100,
    tolerance: 1,
    lines: {
      order:
        "안녕하세요! Ah, hi! A long black, please. Usually I get an 아아, but it's chilly this morning.",
      impatient: 'Um, sorry, is my long black coming soon? My shift starts at eight.',
      angry: 'Sorry, I really have to go soon…',
      happy: 'Wah, perfect! 감사합니다! Thank you!',
      okay: 'Thank you!',
      rejected: 'Oh, sorry, I ordered a long black.',
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
    voice: { pitch: 1.1, rate: 1.05 },
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
    order: { type: 'flatWhite', extraHot: true, heart: false },
    arriveAt: 92,
    patience: 105,
    tipCents: 50,
    tolerance: 0.88,
    lines: {
      order: "Hi. I'll have a flat white. Extra hot. And I'll be watching.",
      impatient: "I'm timing this, you know.",
      angry: 'This is ridiculous. Is there a manager?',
      happy: 'Hm. Acceptable.',
      okay: 'Fine.',
      rejected: 'That is not what I ordered. Flat white. Extra hot.',
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
