// The audio manager playing a generated line as its segment clips, against a fake AudioContext
// whose clock only runs while the context is running (as a suspended context's does).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAudioManager, type AudioManager, type VoiceRequest } from '../../src/audio/manager';
import { segmentFile } from '../../src/data/voice/manifest';

// The committed segment manifest is empty until licensed segment clips exist. Here it lists the
// three segments of LINE as licensed TTS, and one more without a licence (which never ships).
vi.mock('../../src/data/voice/segments.manifest.json', () => {
  const source = (licence: string) => ({
    engine: 'google-tts',
    voice: 'en-AU-Chirp3-HD-Fenrir',
    rate: 1.1,
    pitch: 1,
    placeholder: false,
    deterministic: false,
    licence,
    provenance: 'licensed_tts',
  });
  const clip = (id: string, licence = 'Google Cloud TTS terms') => ({
    id,
    characterId: 'dazza',
    voiceId: 'google-tts:en-AU-Chirp3-HD-Fenrir',
    transcript: id,
    file: `assets/voice/segments/dazza/${id}.mp3`,
    duration: 0.5,
    meanDb: -20,
    source: source(licence),
  });
  return {
    default: {
      version: 1,
      clips: [
        clip('dazza.greet.1'),
        clip('dazza.core.flatWhite.full.1'),
        clip('dazza.closeSay.2'),
        clip('dazza.heart.1', ''),
      ],
    },
  };
});

class Param {
  value = 1;
  setTargetAtTime(v: number): void {
    this.value = v;
  }
  cancelScheduledValues(): void {}
  setValueAtTime(v: number): void {
    this.value = v;
  }
  linearRampToValueAtTime(v: number): void {
    this.value = v;
  }
}

class FakeNode {
  connect<T>(n: T): T {
    return n;
  }
}

class FakeSource extends FakeNode {
  buffer: { duration: number } | null = null;
  playbackRate = new Param();
  onended: (() => void) | null = null;
  startedAt = -1;
  stopAt = Infinity;
  ended = false;
  constructor(private readonly ctx: FakeCtx) {
    super();
  }
  start(): void {
    this.startedAt = this.ctx.currentTime;
    this.ctx.started.push(this);
  }
  stop(when = this.ctx.currentTime): void {
    this.stopAt = when;
  }
}

class FakeCtx {
  currentTime = 0;
  state = 'suspended';
  sampleRate = 48000;
  baseLatency = 0;
  outputLatency = 0;
  destination = { maxChannelCount: 2 };
  onstatechange: (() => void) | null = null;
  started: FakeSource[] = [];
  createGain(): FakeNode & { gain: Param } {
    return Object.assign(new FakeNode(), { gain: new Param() });
  }
  createAnalyser(): FakeNode & { fftSize: number; getFloatTimeDomainData(a: Float32Array): void } {
    return Object.assign(new FakeNode(), {
      fftSize: 512,
      getFloatTimeDomainData: (a: Float32Array) => a.fill(0),
    });
  }
  createBufferSource(): FakeSource {
    return new FakeSource(this);
  }
  createBuffer(): { duration: number } {
    return { duration: 0 };
  }
  /** The fake "encodes" a clip as its duration in seconds. */
  decodeAudioData(bytes: ArrayBuffer): Promise<{ duration: number }> {
    return Promise.resolve({ duration: new Float32Array(bytes)[0] as number });
  }
  resume(): Promise<void> {
    this.state = 'running';
    this.onstatechange?.();
    return Promise.resolve();
  }
  suspend(): Promise<void> {
    this.state = 'suspended';
    return Promise.resolve();
  }
  /** Run the clock (only while running), ending sources whose audio is over. */
  advance(seconds: number): void {
    for (let t = 0; t < seconds - 1e-9; t += 0.01) {
      if (this.state !== 'running') return;
      this.currentTime += 0.01;
      for (let i = 0; i < this.started.length; i++) {
        const s = this.started[i] as FakeSource;
        if (s.ended) continue;
        const end = Math.min(s.startedAt + (s.buffer?.duration ?? 0), s.stopAt);
        if (this.currentTime >= end - 1e-9) {
          s.ended = true;
          s.onended?.();
        }
      }
    }
  }
}

const IDS = ['dazza.greet.1', 'dazza.core.flatWhite.full.1', 'dazza.closeSay.2'];
const LENGTHS = [0.5, 0.7, 0.3];
const LINE: VoiceRequest = {
  speaker: 'dazza',
  text: 'Morning, mate. Flat white, cheers.',
  listen: true,
  segments: IDS,
};

let files: Map<string, number>;
let fetched: string[];
/** Let every pending fetch/decode settle (a macrotask runs after all queued microtasks). */
const flush = (): Promise<void> => new Promise((done) => setTimeout(done, 0));

beforeEach(() => {
  files = new Map(IDS.map((id, i) => [segmentFile(id), LENGTHS[i] as number]));
  fetched = [];
  vi.stubGlobal('window', { AudioContext: FakeCtx });
  vi.stubGlobal('fetch', (url: string) => {
    const file = url.replace(/^\//, '');
    fetched.push(file);
    const d = files.get(file);
    return Promise.resolve({
      ok: d !== undefined,
      status: d === undefined ? 404 : 200,
      headers: { get: () => 'audio/mpeg' },
      arrayBuffer: () => Promise.resolve(new Float32Array([d ?? 0]).buffer),
    });
  });
});
afterEach(() => vi.unstubAllGlobals());

async function started(): Promise<{ m: AudioManager; ctx: FakeCtx }> {
  const m = createAudioManager('/', { persist: false });
  m.unlock();
  await flush();
  const ctx = m.context as unknown as FakeCtx;
  ctx.started.length = 0; // the iOS unlock blip
  return { m, ctx };
}

describe('segmented lines', () => {
  it('play their segment clips back to back, in order, as one line', async () => {
    const { m, ctx } = await started();
    m.say(LINE);
    expect(m.loading).toBe(true); // A3: the line's clock holds until every part is decoded
    await flush();
    expect(m.loading).toBe(false);
    const r = m.history.at(-1);
    expect(r).toMatchObject({ via: 'clip', text: LINE.text, segments: 1, endedAt: null });
    expect(r?.bufferDuration).toBeCloseTo(1.5, 5);
    ctx.advance(0.6);
    expect(m.speaking).toBe(true); // between parts the line is still being said
    expect(r?.segments).toBe(2);
    ctx.advance(1.2);
    const played = ctx.started.map((s) => Math.round((s.buffer?.duration ?? 0) * 100) / 100);
    expect(played).toEqual(LENGTHS);
    expect(r?.segments).toBe(3);
    expect(r?.endedAt).not.toBeNull();
    expect(m.speaking).toBe(false);
    expect(m.voices.maxAudible).toBe(1); // never two parts at once
    expect(m.history.filter((h) => h.text === LINE.text)).toHaveLength(1);
  });

  it('a missing segment sends the WHOLE line to the browser voice, never half and half', async () => {
    files.delete(segmentFile(IDS[1] as string));
    const { m, ctx } = await started();
    m.say(LINE);
    await flush();
    const r = m.history.at(-1);
    expect(r).toMatchObject({ via: 'tts', text: LINE.text });
    expect(ctx.started).toHaveLength(0);
    expect(m.loading).toBe(false);
    // Known missing now: the next line with it falls back at once, without fetching again.
    const before = fetched.length;
    m.say(LINE);
    expect(m.loading).toBe(false);
    expect(fetched.length).toBe(before);
    expect(m.history.at(-1)).toMatchObject({ via: 'tts', text: LINE.text });
  });

  it('pausing mid-list freezes it; resuming carries on from the same part', async () => {
    const { m, ctx } = await started();
    m.say(LINE);
    await flush();
    ctx.advance(0.6); // into the second part
    const r = m.history.at(-1);
    m.setPaused(true);
    await flush();
    ctx.advance(5);
    expect(r?.segments).toBe(2);
    expect(r?.endedAt).toBeNull();
    expect(ctx.started).toHaveLength(2);
    m.setPaused(false);
    await flush();
    ctx.advance(1);
    expect(r?.segments).toBe(3);
    expect(r?.endedAt).not.toBeNull();
  });

  it('a newer line (the customer has gone) drops the parts not yet played', async () => {
    const { m, ctx } = await started();
    m.say(LINE);
    await flush();
    ctx.advance(0.2);
    const r = m.history.at(-1);
    m.stopVoice();
    ctx.advance(3);
    expect(r?.segments).toBe(1);
    expect(r?.interrupted).toBe(true);
    expect(ctx.started).toHaveLength(1);
    expect(m.speaking).toBe(false);
  });

  it('a slow repeat has no segment takes: the browser voice says it whole', async () => {
    const { m, ctx } = await started();
    m.say({ ...LINE, delivery: 'slow' });
    await flush();
    expect(m.history.at(-1)).toMatchObject({ via: 'tts', text: LINE.text });
    expect(ctx.started).toHaveLength(0);
    expect(fetched).toHaveLength(0);
  });
});

describe('segment clips in a production build: only what the segment manifest ships', () => {
  beforeEach(() => vi.stubEnv('DEV', false));
  afterEach(() => vi.unstubAllEnvs());

  it('a line whose segments are all listed as release audio plays its clips', async () => {
    const { m, ctx } = await started();
    m.say(LINE);
    await flush();
    expect(fetched).toEqual(IDS.map(segmentFile));
    expect(m.history.at(-1)).toMatchObject({ via: 'clip', text: LINE.text, segments: 1 });
    ctx.advance(2);
    expect(ctx.started).toHaveLength(3);
  });

  it('a line with an unlisted segment is the browser voice, whole; nothing is fetched', async () => {
    files.set(segmentFile('dazza.hot.1'), 0.4); // even if the server had the file
    const { m, ctx } = await started();
    m.say({ ...LINE, segments: [IDS[0]!, 'dazza.hot.1', IDS[2]!] });
    await flush();
    expect(m.history.at(-1)).toMatchObject({ via: 'tts', text: LINE.text });
    expect(fetched).toEqual([]);
    expect(ctx.started).toHaveLength(0);
  });

  it('a listed segment without a licence is not served either', async () => {
    files.set(segmentFile('dazza.heart.1'), 0.4);
    const { m } = await started();
    m.say({ ...LINE, segments: [...IDS, 'dazza.heart.1'] });
    await flush();
    expect(m.history.at(-1)).toMatchObject({ via: 'tts' });
    expect(fetched).toEqual([]);
  });

  it('a slow repeat stays the browser voice even when every segment ships', async () => {
    const { m, ctx } = await started();
    m.say({ ...LINE, delivery: 'slow' });
    await flush();
    expect(m.history.at(-1)).toMatchObject({ via: 'tts', text: LINE.text });
    expect(fetched).toEqual([]);
    expect(ctx.started).toHaveLength(0);
  });
});

describe('segment clips in development', () => {
  it('every segment is tried, listed or not (placeholders from voice-cache/segments/)', async () => {
    files.set(segmentFile('dazza.hot.1'), 0.4);
    const { m } = await started();
    m.say({ ...LINE, segments: [IDS[0]!, 'dazza.hot.1'] });
    await flush();
    expect(fetched).toEqual([segmentFile(IDS[0]!), segmentFile('dazza.hot.1')]);
    expect(m.history.at(-1)).toMatchObject({ via: 'clip', segments: 1 });
  });
});
