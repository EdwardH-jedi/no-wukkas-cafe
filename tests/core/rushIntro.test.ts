// Gaz's opening for each kind of shift (TODO 1.5.3): only the first paid shift (Day 2, or the
// week's first Monday) is "your first paid shift"; later shifts and Endless have their own lines.

import { describe, expect, it } from 'vitest';
import { STEP } from '../../src/core/clock';
import { createRush, emptyRushInput, stepRush, type RushWeek } from '../../src/core/rush';
import { introLines } from '../../src/core/rush/machine';
import { ENDLESS_INTRO, OWNER_LINES, RUSH_INTRO, WEEK_INTRO } from '../../src/data/ownerLines';
import { voiceScript } from '../../src/data/voice/script';
import { WEEK } from '../../src/data/week';
import { DRINK_IDS, DRINKS, isPlayable } from '../../src/sim/contracts/ticket';

const week = (shiftIndex: number, extra: Partial<RushWeek> = {}): RushWeek => ({
  shiftIndex,
  unlockedDrinks: ['flatWhite', 'longBlack'],
  ...extra,
});

/** The keys Gaz says before service starts. */
function introSaid(w?: RushWeek): string[] {
  const r = createRush(7, 'normal', {}, w);
  const said: string[] = [];
  const input = emptyRushInput();
  for (let n = 0; n < 60 / STEP && r.phase === 'intro'; n++) {
    stepRush(r, input, STEP);
    for (const e of r.events) if (e.type === 'say') said.push(e.line.key);
    r.events.length = 0;
  }
  return said;
}

const FIRST = /first paid shift/i;

describe("Gaz's shift intro", () => {
  it('Day 2 and the first Monday are the first paid shift', () => {
    const keys = RUSH_INTRO.map((_, i) => `rush.intro.${i}`);
    expect(introSaid()).toEqual(keys);
    expect(introSaid(week(0))).toEqual(keys);
    expect(introSaid(week(0, { week: 1 }))).toEqual(keys);
  });

  it('later week shifts never say "first paid shift" and use their own lines', () => {
    for (let i = 1; i < WEEK.length; i++) {
      const said = introSaid(week(i));
      expect(said, WEEK[i]!.day).toEqual(WEEK_INTRO[i]!.map((_, j) => `rush.intro.shift${i}.${j}`));
      for (const l of introLines(week(i))) expect(l.def.text, WEEK[i]!.day).not.toMatch(FIRST);
    }
  });

  it("week 2's Monday isn't a first shift either", () => {
    const lines = introLines(week(0, { week: 2 }));
    expect(lines.map((l) => l.key)).toEqual(WEEK_INTRO[0]!.map((_, j) => `rush.intro.shift0.${j}`));
    for (const l of lines) expect(l.def.text).not.toMatch(FIRST);
  });

  it('Endless has its own intro', () => {
    const said = introSaid(week(WEEK.length - 1, { endless: true }));
    expect(said).toEqual(ENDLESS_INTRO.map((_, j) => `rush.intro.endless.${j}`));
  });

  it("one intro per row of the week table, never naming a drink the station can't make", () => {
    expect(WEEK_INTRO).toHaveLength(WEEK.length);
    const future = DRINK_IDS.filter((d) => !isPlayable(d)).map((d) => DRINKS[d].name);
    expect(future.length).toBeGreaterThan(0);
    for (const def of [...WEEK_INTRO.flat(), ...ENDLESS_INTRO])
      for (const name of future) expect(def.text.toLowerCase()).not.toContain(name);
  });

  it('every intro line is in the voice script under the key the rush says', () => {
    const script = new Set(voiceScript().map((l) => `${l.key}|${l.text}`));
    const all = [
      ...WEEK_INTRO.flatMap((lines, i) =>
        lines.map((d, j) => [`rush.intro.shift${i}.${j}`, d.text]),
      ),
      ...ENDLESS_INTRO.map((d, j) => [`rush.intro.endless.${j}`, d.text]),
    ];
    for (const [k, t] of all) expect(script.has(`${k}|${t}`), k).toBe(true);
  });
});

describe('end-of-shift lines', () => {
  it("the excellent line doesn't count customers (shifts serve 6 to 10)", () => {
    const text = OWNER_LINES['rush.end.excellent']!.tiers.flat()
      .map((d) => d.text)
      .join(' ');
    expect(text).not.toMatch(/\b(one|two|three|four|five|six|seven|eight|nine|ten)\s+for\s+\w+/i);
  });
});
