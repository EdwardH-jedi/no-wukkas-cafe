// Scenario 3: once a customer has been served (or walked out) and left, no voice line of theirs
// starts. With clips that load normally, nothing of theirs is heard after the door shuts; nor when
// their reaction or walk-out clip lands (or fails over to the browser voice) after they've gone:
// the rush's `gone` event stops their line in flight (audio.stopSpeaker).

import { afterEach, describe, expect, it, vi } from 'vitest';
import { afterGone, firstOnTheRail, serveNow, walkOutNow } from './leftCustomerSilent';

afterEach(() => vi.unstubAllGlobals());

describe('S3: nobody speaks after they have left (clips on time)', () => {
  it('served: their reaction is heard while they leave, and nothing of theirs after', async () => {
    const { h, id, cust, arm } = await firstOnTheRail({ status: 200, delay: 0 });
    arm();
    const at = h.now;
    serveNow(h, cust());
    expect(await h.until(() => cust().state === 'gone', 10)).toBe(true);
    await h.run(10);
    expect(cust().outcome).toBe('served');
    const theirs = h.starts.filter((s) => s.speaker === id && s.at >= at);
    expect(theirs).toHaveLength(1);
    expect(theirs[0]!.via).toBe('clip');
    expect(theirs[0]!.customerState).toBe('leaving');
    expect(afterGone(h, id)).toEqual([]);
  }, 15_000);

  it('walked out: their parting shot is heard while they leave, and nothing of theirs after', async () => {
    const { h, id, cust, arm } = await firstOnTheRail({ status: 200, delay: 0 });
    arm();
    const at = h.now;
    walkOutNow(cust());
    expect(await h.until(() => cust().state === 'gone', 10)).toBe(true);
    await h.run(10);
    expect(cust().outcome).toBe('walkout');
    const theirs = h.starts.filter((s) => s.speaker === id && s.at >= at);
    expect(theirs.map((s) => s.text)).toEqual([cust().def.lines.walkout]);
    expect(theirs[0]!.customerState).toBe('leaving');
    expect(afterGone(h, id)).toEqual([]);
  }, 15_000);
});

describe('S3: nobody speaks after they have left (late audio)', () => {
  it('served, reaction clip 5 s late: it does not start once they have gone', async () => {
    const { h, id, cust, arm } = await firstOnTheRail({ status: 200, delay: 5 });
    arm();
    serveNow(h, cust());
    expect(await h.until(() => cust().state === 'gone', 10)).toBe(true);
    await h.run(10);
    expect(afterGone(h, id), `${id}'s reaction starts after they have left`).toEqual([]);
  }, 15_000);

  it('walked out, parting-shot clip 5 s late: it does not start once they have gone', async () => {
    const { h, id, cust, arm } = await firstOnTheRail({ status: 200, delay: 5 });
    arm();
    walkOutNow(cust());
    expect(await h.until(() => cust().state === 'gone', 10)).toBe(true);
    await h.run(10);
    expect(cust().outcome).toBe('walkout');
    expect(afterGone(h, id), `${id}'s walk-out line starts after they have left`).toEqual([]);
  }, 15_000);

  it('served, reaction clip fails after 5 s: the browser voice does not stand in once they have gone', async () => {
    const { h, id, cust, arm } = await firstOnTheRail({ status: 404, delay: 5 });
    arm();
    serveNow(h, cust());
    expect(await h.until(() => cust().state === 'gone', 10)).toBe(true);
    await h.run(10);
    expect(afterGone(h, id), `${id}'s reaction is spoken after they have left`).toEqual([]);
  }, 15_000);
});
