// Q5: Day 1's subtitles start when Gaz's voice does (the rush's rule), not when the line is asked
// for, and a line stopped before its voice starts never shows. Driven through boot's own frame
// (the review harness) with Gaz's clips arriving late.

import { describe, expect, it } from 'vitest';
import { act } from '../../src/app/trialWiring';
import { CLIP_BY_FILE, createHarness, FAST, type Harness } from '../review/harness';

/** Gaz's clips take `delay` seconds to arrive; everything else is instant. */
const slowGaz = (delay: number) =>
  createHarness({
    plan: (file) => (CLIP_BY_FILE.get(file)?.characterId === 'gaz' ? { status: 200, delay } : FAST),
  });

/** Spy on the Day 1 HUD: lines asked for, subtitles shown (with how many Gaz voices had started
 *  by then), subtitles stopped. */
function watch(h: Harness) {
  const asked: string[] = [];
  const shown: Array<{ text: string; voices: number }> = [];
  let stops = 0;
  h.app.hud = {
    ...h.app.hud,
    onLine: (l) => asked.push(l.text),
    onSay: (l) =>
      shown.push({ text: l.text, voices: h.starts.filter((s) => s.speaker === 'gaz').length }),
    onStop: () => stops++,
  };
  return { asked, shown, stops: () => stops };
}

describe('Day 1 subtitles start with the voice (Q5)', () => {
  it('a slow clip: the words wait for its first sample', async () => {
    const h = slowGaz(3);
    const w = watch(h);
    await h.run(0.5); // the title screen
    act(h.app, 'start');
    await h.run(1);
    expect(w.asked.length, 'Gaz asked for his first line').toBeGreaterThan(0);
    expect(h.audio.loading).toBe(true);
    expect(w.shown, 'no subtitle while the clip loads').toEqual([]);

    expect(await h.until(() => w.shown.length > 0, 6)).toBe(true);
    expect(w.shown[0]!.text).toBe(w.asked[0]);
    expect(w.shown[0]!.voices, 'the voice started first').toBeGreaterThan(0);
  });

  it('a line stopped while it loads never shows', async () => {
    const h = slowGaz(3);
    const w = watch(h);
    await h.run(0.5);
    act(h.app, 'start');
    await h.run(1);
    expect(h.audio.loading).toBe(true);
    h.app.nav.toTitle();
    await h.run(5); // long after the clip lands
    expect(w.shown).toEqual([]);
    expect(w.stops()).toBeGreaterThan(0);
    expect(h.starts.filter((s) => s.speaker === 'gaz')).toEqual([]);
  });

  it('voices off: the words show at once', async () => {
    const h = slowGaz(3);
    h.audio.voiceEnabled = false;
    const w = watch(h);
    await h.run(0.5);
    act(h.app, 'start');
    await h.run(0.2);
    expect(w.asked.length).toBeGreaterThan(0);
    expect(w.shown.map((s) => s.text)).toEqual(w.asked);
  });
});
