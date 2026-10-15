// Slang glossary, ported verbatim from the prototype's SLANG table (prototype/game.html). It's the
// cheat sheet's word list: what a term means when a customer says it. Entries marked 'respelling'
// write down how a word sounds in a strong accent; they stay here as listening notes only and must
// never appear in a transcript (accent lives in the recording, AGENTS.md §6). Tests enforce that.
// Not expanded towards 200 yet: new terms need a native check first (CLAUDE.md, TODO(slang-check)).

export type SlangKind = 'slang' | 'respelling';

export interface SlangEntry {
  term: string;
  meaning: string;
  kind: SlangKind;
}

const RESPELLINGS = new Set(['lahj', 'moite', 'whoite', "g'doy", "c'n oi", 'oil', 'strawng']);

const SLANG_TABLE: Record<string, string> = {
  flattie: 'Flat white',
  flatty: 'Flat white',
  cap: 'Cappuccino',
  cappa: 'Cappuccino',
  LB: 'Long black',
  'iced LB': 'Iced long black',
  'hot chocky': 'Hot chocolate',
  'hot choc': 'Hot chocolate',
  picc: 'Piccolo — small latte, 1 shot',
  'short mac': 'Macchiato — 1 shot + a dash of milk, small',
  'long mac': 'Long macchiato — 2 shots + water + dash of milk',
  magic: 'Small, 2 shots, flat-white milk (Melbourne thing)',
  'dirty chai': 'Chai latte + 1 espresso shot',
  babycino: 'Frothy milk + choc, NO coffee, small — for kids',
  strong: '+1 extra shot',
  'extra shot': '+1 extra shot',
  'double shot': '2 shots total',
  'extra extra strong': '+2 extra shots',
  skinny: 'Skim milk',
  trim: 'Skim milk',
  LF: 'Lactose-free milk',
  'lacto-free': 'Lactose-free milk',
  sugs: 'Sugars',
  sug: 'Sugar',
  coupla: 'Couple = two',
  reg: 'Regular size',
  lahj: '"Large" in a thick accent',
  moite: '"Mate"',
  whoite: '"White"',
  "g'doy": '"G\'day" — hello',
  "c'n oi": '"Can I"',
  oil: '"I\'ll"',
  strawng: '"Strong"',
  'yeah nah': 'No',
  'nah yeah': 'Yes',
  'no wukkas': 'No worries',
  ta: 'Thanks',
  'cheers big ears': 'Thanks (cheeky)',
  legend: 'Great person / thanks heaps',
  arvo: 'Afternoon',
  servo: 'Petrol station',
  brekkie: 'Breakfast',
  maccas: "McDonald's",
  sunnies: 'Sunglasses',
  ute: 'Pickup truck',
  heaps: 'Very / a lot',
  reckon: 'Think',
  stoked: 'Really happy',
  strewth: 'Wow / oh no',
  deadset: 'Seriously',
  'chuck us': 'Give me',
  darl: 'Darling (friendly)',
  'bloody oath': 'Absolutely yes',
  suss: 'Suspicious',
  'servo pie': 'Petrol station meat pie',
  thongs: 'Flip-flops',
  "how ya goin'": 'How are you?',
  'sweet as': 'Great / no problem',
  'fair dinkum': 'Genuine / seriously',
  smoko: 'Tradie tea break',
  아아: 'Korean slang: 아이스 아메리카노 → here = Iced long black',
  'topped up': 'Extra milk',
};

export const SLANG: readonly SlangEntry[] = Object.entries(SLANG_TABLE).map(([term, meaning]) => ({
  term,
  meaning,
  kind: RESPELLINGS.has(term) ? 'respelling' : 'slang',
}));

/** Words that sound alike in a busy café: what was said and what it's easily heard as. */
export const MISHEARINGS: ReadonlyArray<{ said: string; heardAs: string }> = [
  { said: 'soy', heardAs: 'sorry' },
  { said: 'flat', heardAs: 'black' },
  { said: 'oat', heardAs: 'no' },
];
