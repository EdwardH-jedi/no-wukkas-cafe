// Day 2's first order with its clip answered as the test says (404, late, …), played through the
// review harness by a player who waits to hear the order before ringing it up.

import { expect } from 'vitest';
import { createRush } from '../../src/core/rush';
import { clipFor } from '../../src/data/voice';
import { transcriptVisible } from '../../src/sim/listening';
import { subtitleMode } from '../../src/ui/settings';
import { clickThroughIntro, createHarness, FAST, type Reply } from './harness';

export async function orderWith(
  reply: Reply,
  seed = 7,
  timeScale = 1,
  audioClock: 'wall' | 'legacy-scaled' = 'wall',
) {
  const first = [...createRush(seed).customers].sort((a, b) => a.arriveAt - b.arriveAt)[0]!;
  const o = {
    id: first.def.id,
    text: first.line.text,
    file: clipFor(first.def.id, first.line.text)!.file,
  };
  let armed = false;
  const h = createHarness({
    seed,
    audioClock,
    // Day 2 prefetches every clip at the start: make that miss for the order (nothing cached),
    // then answer the request made when they say it as `reply` says.
    plan: (file) => (file === o.file ? (armed ? reply : { status: 503, delay: 0 }) : FAST),
  });
  await h.run(0.5);
  h.app.nav.startDay2();
  const step = { n: 0 };
  h.beforeStep = (app) => clickThroughIntro(app, step);
  const cust = () => h.app.rush!.customers.find((c) => c.def.id === o.id)!;
  expect(await h.until(() => cust().state === 'register', 120)).toBe(true);

  armed = true;
  h.app.timeScale = timeScale;
  h.app.rushAction = { type: 'takeOrder' };
  const asked = h.now;
  const heard = () =>
    h.starts.some((s) => s.speaker === o.id && s.text === o.text && s.at >= asked);
  // Waits to hear the order, then rings it up (giving up waiting after 40 s).
  await h.until(
    () => (heard() && !h.audio.speaking && cust().state === 'deciding') || h.now - asked > 40,
    45,
  );
  const c = cust();
  // On Normal the order's words are hidden ("🔊 Listen…"): only the voice can deliver it.
  const subtitle = transcriptVisible(subtitleMode(h.app.listen), false, 'speaking', 0);
  if (c.state === 'deciding' && heard()) h.app.rushAction = { type: 'ringUp', order: c.order };
  await h.run(1);
  return { h, o, c: cust(), asked, heard: heard(), subtitle };
}
