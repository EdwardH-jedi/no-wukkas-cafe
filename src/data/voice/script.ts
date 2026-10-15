// Every line the game can speak, with templates expanded. The render script records exactly this
// list, and a test checks that whatever the game says at runtime is in it.

import { CUSTOMERS } from '../customers';
import { GREETING, GREETING_OPENERS, OWNER_LINES, RUSH_INTRO } from '../ownerLines';
import { PACE_RATE, type Pace } from '../../sim/listening';
import { DRINK_NAME } from '../../sim/rush';
import type { Delivery } from './ids';

export interface ScriptLine {
  speaker: string;
  /** Gameplay key, for humans reading the manifest. */
  key: string;
  text: string;
  delivery: Delivery;
  /** Speaking-rate multiplier on top of the speaker's own (order pace; slower for repeats). */
  rate: number;
}

/** "Could you repeat that?": the same words, noticeably slower. */
export const SLOW_RATE = 0.8;

/**
 * Script keys whose words are new or changed and haven't been recorded yet. The next
 * `npm run voices` (macOS) renders them; until then the game falls back to browser speech for
 * these lines only, and the coverage tests allow exactly these to be missing (plus the old clips
 * they replace, including a line split into per-drink keys). Empty this once they're rendered.
 */
export const AWAITING_RENDER: ReadonlySet<string> = new Set([
  'dazza.3', // "Morning." (was "Mornin'."), normal and slow
  'beryl.happy.flatWhite',
  'beryl.happy.longBlack',
  'jiwoo.happy', // "와, perfect!" (was "Wah, perfect!"), the same for every drink
  'shot.overlap', // Gaz: "Two hands. Now you're a barista."
]);

/** Is this line (a script or runtime key, or the manifest key of a clip it replaces) awaiting a
 *  render? An entry covers its own key and the keys under it ('dazza.3' covers 'dazza.3.slow',
 *  'jiwoo.happy' each drink's variant), and the clip of a line that was split into per-drink
 *  keys ('beryl.happy'). */
export function awaitingRender(key: string): boolean {
  for (const k of AWAITING_RENDER)
    if (key === k || key.startsWith(`${k}.`) || k.startsWith(`${key}.`)) return true;
  return false;
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
  const add = (
    speaker: string,
    key: string,
    text: string,
    delivery: Delivery = 'normal',
    pace: Pace = 'normal',
  ): void => {
    const rate = PACE_RATE[pace] * (delivery === 'slow' ? SLOW_RATE : 1);
    lines.push({ speaker, key, text, delivery, rate: Math.round(rate * 1000) / 1000 });
  };
  GREETING_OPENERS.forEach((d) => add('gaz', 'greet.open', d.text));
  GREETING.forEach((d, i) => add('gaz', `greet.${i}`, d.text));
  RUSH_INTRO.forEach((d, i) => add('gaz', `rush.intro.${i}`, d.text));
  for (const [key, pool] of Object.entries(OWNER_LINES))
    for (const tier of pool.tiers)
      for (const d of tier) for (const t of fillAll(d.text)) add('gaz', key, t);
  for (const c of CUSTOMERS) {
    for (const o of c.orders) {
      add(c.id, o.id, o.text, 'normal', o.pace);
      add(c.id, `${o.id}.slow`, o.text, 'slow', o.pace);
    }
    const a = c.answers;
    for (const [field, group] of Object.entries({
      drink: a.drink,
      milk: a.milk,
      temp: a.temp,
      heart: a.heart,
    }))
      for (const [k, text] of Object.entries(group))
        add(c.id, `${c.id}.answer.${field}.${k}`, text);
    const { complaint, rejected, happy, ...rest } = c.lines;
    for (const [k, text] of Object.entries(rest)) add(c.id, `${c.id}.${k}`, text);
    for (const [k, text] of Object.entries(happy)) add(c.id, `${c.id}.happy.${k}`, text);
    for (const [k, text] of Object.entries(rejected)) add(c.id, `${c.id}.rejected.${k}`, text);
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
