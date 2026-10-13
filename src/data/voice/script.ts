// Every line the game can speak, with templates expanded. The render script records exactly this
// list, and a test checks that whatever the game says at runtime is in it.

import { CUSTOMERS } from '../customers';
import { GREETING, GREETING_OPENERS, OWNER_LINES, RUSH_INTRO } from '../ownerLines';
import { DRINK_NAME } from '../../sim/rush';
import type { Delivery } from './ids';

export interface ScriptLine {
  speaker: string;
  /** Gameplay key, for humans reading the manifest. */
  key: string;
  text: string;
  delivery: Delivery;
}

const fillAll = (text: string): string[] => {
  if (!/\{\w+\}/.test(text)) return [text];
  const names = CUSTOMERS.map((c) => c.callName);
  const drinks = Object.values(DRINK_NAME);
  const out = new Set<string>();
  for (const name of names)
    for (const ordered of drinks)
      for (const drink of drinks) {
        if (text.includes('{drink}') && drink === ordered) continue;
        out.add(
          text.replace(/\{(\w+)\}/g, (_, k: string) =>
            k === 'name' ? name : k === 'ordered' ? ordered : k === 'drink' ? drink : `{${k}}`,
          ),
        );
      }
  return [...out];
};

export function voiceScript(): ScriptLine[] {
  const lines: ScriptLine[] = [];
  const add = (speaker: string, key: string, text: string, delivery: Delivery = 'normal'): void => {
    lines.push({ speaker, key, text, delivery });
  };
  GREETING_OPENERS.forEach((d) => add('gaz', 'greet.open', d.text));
  GREETING.forEach((d, i) => add('gaz', `greet.${i}`, d.text));
  RUSH_INTRO.forEach((d, i) => add('gaz', `rush.intro.${i}`, d.text));
  for (const [key, pool] of Object.entries(OWNER_LINES))
    for (const tier of pool.tiers)
      for (const d of tier) for (const t of fillAll(d.text)) add('gaz', key, t);
  for (const c of CUSTOMERS) {
    const { complaint, ...rest } = c.lines;
    for (const [k, text] of Object.entries(rest)) add(c.id, `${c.id}.${k}`, text);
    for (const [k, text] of Object.entries(complaint))
      if (text) add(c.id, `${c.id}.complaint.${k}`, text);
  }
  // Same speaker, same words, same delivery = one clip.
  const seen = new Set<string>();
  return lines.filter((l) => {
    const k = `${l.speaker}|${l.delivery}|${l.text}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
