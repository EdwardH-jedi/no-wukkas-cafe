// Audition lines: 2-3 real lines per character (an order or instruction, a reaction, an answer),
// taken from the game data so they always match what the cast will record. Used by
// `npm run voices:audition` (docs/VOICE_CASTING.md).

import { CUSTOMERS } from '../customers';
import { CLARIFY_ANSWERS, ORDER_LINES } from '../orders';
import { GREETING_OPENERS, OWNER_LINES } from '../ownerLines';

const order = (id: string): string => {
  const who = id.split('.')[0] as string;
  const line = ORDER_LINES[who]?.find((o) => o.id === id);
  if (!line) throw new Error(`no order line ${id}`);
  return line.text;
};
const customer = (id: string) => {
  const c = CUSTOMERS.find((x) => x.id === id);
  if (!c) throw new Error(`no customer ${id}`);
  return c.lines;
};
const owner = (key: string, tier = 0, index = 0): string => {
  const t = OWNER_LINES[key]?.tiers[tier]?.[index]?.text;
  if (!t) throw new Error(`no owner line ${key}`);
  return t;
};

export const AUDITIONS: Record<string, readonly string[]> = {
  gaz: [
    (GREETING_OPENERS[0] as { text: string }).text,
    owner('art.great', 0, 0),
    owner('pour.intro'),
  ],
  dazza: [order('dazza.2'), CLARIFY_ANSWERS.dazza!.milk.oat, customer('dazza').happy],
  beryl: [order('beryl.1'), CLARIFY_ANSWERS.beryl!.milk.soy, customer('beryl').happy],
  karen: [order('karen.3'), customer('karen').rejectedMilk],
  priya: [order('priya.4'), CLARIFY_ANSWERS.priya!.milk.oat],
  jiwoo: [order('jiwoo.1'), customer('jiwoo').happy],
  mei: [order('mei.4'), customer('mei').rejectedMilk],
};
