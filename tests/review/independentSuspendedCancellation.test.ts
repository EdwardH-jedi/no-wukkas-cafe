// Cancellation must suppress both the caption and the queued audio. The existing fakes apply
// future gain ramps immediately, hiding a 60 ms fade that only begins AFTER a suspended context
// resumes. Record the real graph's automation instead; sample its source-to-destination gain.
// This proves scheduling, not hardware audibility or the loudness of a particular recording.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { VOICE_MANIFEST } from '../../src/data/voice';
import { segmentFile } from '../../src/data/voice/manifest';
import type { VoiceRequest } from '../../src/audio/manager';
import { createRush } from '../../src/core/rush';
import { createRushFrame } from '../../src/app/rushView';
import { createHarness, FakeCtx, FakeNode, FakeParam, type FakeSource } from './harness';

type Automation = { kind: 'set' | 'linear'; at: number; value: number };

class TimelineParam extends FakeParam {
  readonly events: Automation[] = [];

  override setValueAtTime(value: number, at = 0): void {
    this.events.push({ kind: 'set', at, value });
  }

  override linearRampToValueAtTime(value: number, at = 0): void {
    this.events.push({ kind: 'linear', at, value });
  }

  override cancelScheduledValues(at = 0): void {
    const kept = this.events.filter((e) => e.at < at);
    this.events.splice(0, this.events.length, ...kept);
  }

  at(time: number): number {
    let previous = { at: 0, value: this.value };
    for (const event of this.events) {
      if (event.at > time) {
        if (event.kind === 'linear')
          return (
            previous.value +
            ((time - previous.at) / (event.at - previous.at)) * (event.value - previous.value)
          );
        break;
      }
      previous = event;
    }
    return previous.value;
  }
}

class TimelineCtx extends FakeCtx {
  override createGain() {
    const node = Object.assign(new FakeNode('gain'), { gain: new TimelineParam(1) });
    this.nodes.push(node);
    return node;
  }
}

// Follow the actual connections, including bus and master gains. This accepts fixes that stop
// the source, disconnect it, or mute its path; it does not prescribe a particular implementation.
function pathGain(node: FakeNode, destination: FakeNode, time: number): number {
  if (node === destination) return 1;
  const gain = 'gain' in node && node.gain instanceof TimelineParam ? node.gain.at(time) : 1;
  return (
    gain *
    node.outs.reduce<number>(
      (sum, out) => sum + (out instanceof FakeNode ? pathGain(out, destination, time) : 0),
      0,
    )
  );
}

function signalGain(source: FakeSource, ctx: FakeCtx, time: number): number {
  const end = Math.min(
    source.stopAt,
    source.startedAt + (source.buffer?.duration ?? 0) / source.playbackRate.value,
  );
  if (source.ended || time < source.startedAt || time >= end) return 0;
  return pathGain(source, ctx.destination, time);
}

const clip = VOICE_MANIFEST.clips.find((c) => c.characterId === 'dazza')!;
const line: VoiceRequest = { speaker: clip.characterId, text: clip.transcript };
const nextClip = VOICE_MANIFEST.clips.find((c) => c.characterId !== 'dazza')!;
const nextLine: VoiceRequest = { speaker: nextClip.characterId, text: nextClip.transcript };
const segments: VoiceRequest = {
  speaker: 'dazza',
  text: 'Morning, mate. Flat white, cheers.',
  segments: ['dazza.greet.1', 'dazza.core.flatWhite.full.1', 'dazza.closeSay.2'],
};

async function queued(kind: 'clip' | 'segments', browser: boolean) {
  const h = createHarness();
  vi.stubGlobal('window', { AudioContext: TimelineCtx, innerWidth: 1280, innerHeight: 720 });
  // Decode a one-second signal for either path. Segments are dev-served without a release
  // manifest. No playback, generation, cancellation, or hook implementation is mocked.
  const oldFiles = new Set([clip.file, ...segments.segments!.map(segmentFile)]);
  vi.stubGlobal('fetch', async (url: string) => ({
    ok: true,
    status: 200,
    headers: { get: () => 'audio/mpeg' },
    arrayBuffer: async () =>
      new Float64Array([oldFiles.has(url.replace(/^\//, '')) ? 1 : 2, -1]).buffer,
  }));
  h.audio.unlock();
  const onStart = vi.fn();
  const onStop = vi.fn();
  h.audio.say(kind === 'clip' ? line : segments, { onStart, onStop });
  if (browser) await h.ctx().suspend();
  else {
    h.app.clock.paused = true;
    h.audio.setPaused(true);
  }
  await h.run(0.1);
  expect(h.ctx().state).toBe('suspended');
  expect(onStart).not.toHaveBeenCalled();
  // A fixed implementation may defer source creation until resume. Accept that as well.
  const oldSources = () => h.ctx().sources.filter((s) => s.buffer?.duration === 1);
  const oldGain = (time: number) =>
    oldSources().reduce((sum, source) => sum + signalGain(source, h.ctx(), time), 0);
  return { h, oldGain, onStart, onStop };
}

afterEach(() => vi.unstubAllGlobals());

describe('independent suspended audio cancellation', () => {
  it('quitting to title while a decoded line waits must not emit the old game on resume', async () => {
    const { h, oldGain, onStart, onStop } = await queued('clip', false);
    h.app.mode = 'rush';
    h.app.rush = createRush(7);
    const resumedAt = h.ctx().currentTime;
    h.app.nav.toTitle(); // Production stopVoice({ forget: true }) followed by resumeAll.
    await h.frame(0.001);
    expect(h.audio.lastLine).toBeNull();
    expect(h.ctx().state).toBe('running');
    expect(h.app.trial.phase).toBe('title');
    expect(onStop).toHaveBeenCalledTimes(1);
    expect(onStart).not.toHaveBeenCalled();
    expect(oldGain(resumedAt + 0.03), 'the quit game still has an output path on the title').toBe(
      0,
    );
  });

  it('a gone customer whose segments decoded during suspension must stay silent on resume', async () => {
    const { h, oldGain, onStart, onStop } = await queued('segments', true);
    const r = createRush(7);
    const customer = r.customers.find((c) => c.def.id === line.speaker)!;
    customer.state = 'gone';
    r.events.length = 0;
    r.events.push({ type: 'gone', customer: customer.key });
    createRushFrame(h.app)(r, 0); // Production gone -> stopSpeaker -> stopVoice.
    expect(onStop).toHaveBeenCalledTimes(1);
    const resumedAt = h.ctx().currentTime;
    h.audio.unlock();
    await h.frame(0.001);
    expect(onStart).not.toHaveBeenCalled();
    expect(oldGain(resumedAt + 0.03), 'the departed customer still has an output path').toBe(0);
  });

  for (const kind of ['clip', 'segments'] as const) {
    it(`${kind}: stopVoice while paused must not emit the cancelled line on resume`, async () => {
      const { h, oldGain, onStart, onStop } = await queued(kind, false);
      h.audio.stopVoice();
      expect(onStop).toHaveBeenCalledTimes(1);
      const resumedAt = h.ctx().currentTime;
      h.app.resumeAll();
      await h.frame(0.001);
      expect(onStart).not.toHaveBeenCalled();
      const gains = [0.001, 0.03, 0.059, 0.08].map((dt) => oldGain(resumedAt + dt));
      console.log(`${kind} stopVoice cancelled-source gains: ${JSON.stringify(gains)}`);
      expect(gains, 'cancelled queued audio must have no signal path after resume').toEqual([
        0, 0, 0, 0,
      ]);
    });

    it(`${kind}: a newer line while browser-suspended must not leak the old line on resume`, async () => {
      const { h, oldGain, onStart, onStop } = await queued(kind, true);
      const nextStart = vi.fn();
      h.audio.say(nextLine, { onStart: nextStart });
      await h.run(0.1);
      expect(onStop).toHaveBeenCalledTimes(1);
      expect(nextStart).not.toHaveBeenCalled();
      const resumedAt = h.ctx().currentTime;
      h.audio.unlock();
      await h.frame(0.001);
      expect(onStart).not.toHaveBeenCalled();
      expect(nextStart).toHaveBeenCalledTimes(1);
      const gains = [0.001, 0.03, 0.059, 0.08].map((dt) => oldGain(resumedAt + dt));
      console.log(`${kind} replaced-source gains: ${JSON.stringify(gains)}`);
      expect(gains, 'replaced queued audio must not overlap the new line after resume').toEqual([
        0, 0, 0, 0,
      ]);
    });

    it(`${kind}: an uncancelled suspended line starts once and remains connected on resume`, async () => {
      const { h, oldGain, onStart, onStop } = await queued(kind, false);
      const resumedAt = h.ctx().currentTime;
      h.app.resumeAll();
      await h.frame(0.001);
      expect(onStart).toHaveBeenCalledTimes(1);
      expect(onStop).not.toHaveBeenCalled();
      expect(oldGain(resumedAt + 0.03)).toBeGreaterThan(0);
      await h.run(0.1);
      expect(onStart).toHaveBeenCalledTimes(1);
    });
  }
});
