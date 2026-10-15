// Audition takes on the casting page: decode and measure a file (waveform, loudness, peaks), draw
// its waveform, and play takes through ONE shared <audio> element, so two takes can never overlap:
// starting one stops the other.

import { analyse, waveformPeaks, type LoudnessReport } from '../audio/meter';

export interface TakeInfo {
  duration: number;
  peaks: Float32Array;
  report: LoudnessReport;
}

const decoded = new Map<string, Promise<TakeInfo>>();

/** Fetch, decode and measure a take (cached). Rejects if the file is missing or undecodable. */
export function measureTake(url: string, buckets = 160): Promise<TakeInfo> {
  let p = decoded.get(url);
  if (!p) {
    p = (async () => {
      const r = await fetch(url);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const bytes = await r.arrayBuffer();
      // An offline context decodes without a user gesture and without touching the speakers.
      const ctx = new OfflineAudioContext(1, 1, 48000);
      const buf = await ctx.decodeAudioData(bytes);
      const channels = Array.from({ length: buf.numberOfChannels }, (_, i) =>
        buf.getChannelData(i),
      );
      const first = channels[0] ?? new Float32Array(0);
      return {
        duration: buf.duration,
        peaks: waveformPeaks(first, buckets),
        report: analyse(channels, buf.sampleRate),
      };
    })();
    p.catch(() => decoded.delete(url));
    decoded.set(url, p);
  }
  return p;
}

/** Draw a mirrored peak waveform; `progress` 0..1 colours the played part. */
export function drawWaveform(
  canvas: HTMLCanvasElement,
  peaks: Float32Array,
  progress: number,
): void {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = canvas.clientWidth || 240;
  const h = canvas.clientHeight || 44;
  if (canvas.width !== Math.round(w * dpr)) canvas.width = Math.round(w * dpr);
  if (canvas.height !== Math.round(h * dpr)) canvas.height = Math.round(h * dpr);
  const g = canvas.getContext('2d');
  if (!g) return;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);
  const css = getComputedStyle(canvas);
  const played = css.getPropertyValue('--wave-played').trim() || '#e3a55f';
  const rest = css.getPropertyValue('--wave').trim() || '#8a7d6e';
  const bar = w / Math.max(1, peaks.length);
  for (let i = 0; i < peaks.length; i++) {
    const a = Math.min(1, (peaks[i] as number) * 1.15);
    const bh = Math.max(1, a * (h - 4));
    g.fillStyle = i / peaks.length <= progress ? played : rest;
    g.fillRect(i * bar, (h - bh) / 2, Math.max(1, bar - 1), bh);
  }
}

export interface PlayLog {
  url: string;
  startedAt: number;
  endedAt: number | null;
  /** Stopped by another take (or Stop) before the end. */
  cut: boolean;
}

export interface Player {
  /** Play one take; stops anything playing. */
  play(url: string): void;
  /** Play takes back to back (for A/B comparisons), a short gap between them. */
  sequence(urls: readonly string[]): void;
  stop(): void;
  readonly url: string | null;
  /** 0..1 of the current take. */
  progress(): number;
  /** Called whenever what's playing changes. */
  onChange(cb: () => void): void;
  /** Test evidence: every take played, and the most ever audible at once. */
  readonly log: readonly PlayLog[];
  readonly maxAudible: number;
}

export function createPlayer(): Player {
  const el = new Audio();
  el.preload = 'auto';
  let url: string | null = null;
  let queue: string[] = [];
  let gap: number | null = null;
  const log: PlayLog[] = [];
  let audible = 0;
  let maxAudible = 0;
  const listeners: Array<() => void> = [];
  const emit = (): void => {
    for (const l of listeners) l();
  };
  const current = (): PlayLog | undefined => log[log.length - 1];

  const finish = (cut: boolean): void => {
    const r = current();
    if (r && r.endedAt === null) {
      r.endedAt = performance.now();
      r.cut = cut;
      audible = Math.max(0, audible - 1);
    }
  };

  const start = (u: string): void => {
    finish(true);
    url = u;
    el.src = u;
    el.currentTime = 0;
    log.push({ url: u, startedAt: performance.now(), endedAt: null, cut: false });
    if (log.length > 200) log.shift();
    audible++;
    maxAudible = Math.max(maxAudible, audible);
    void el.play().catch(() => {
      finish(true);
      url = null;
      emit();
    });
    emit();
  };

  el.addEventListener('ended', () => {
    finish(false);
    url = null;
    const next = queue.shift();
    // A short breath between takes in a comparison (UI timing only, not gameplay).
    if (next) gap = window.setTimeout(() => start(next), 450);
    emit();
  });

  const clearQueue = (): void => {
    queue = [];
    if (gap !== null) window.clearTimeout(gap);
    gap = null;
  };

  return {
    play(u) {
      clearQueue();
      start(u);
    },
    sequence(urls) {
      clearQueue();
      const [first, ...rest] = urls;
      if (!first) return;
      queue = rest;
      start(first);
    },
    stop() {
      clearQueue();
      el.pause();
      finish(true);
      url = null;
      emit();
    },
    get url() {
      return url;
    },
    progress() {
      return url && el.duration > 0 ? Math.min(1, el.currentTime / el.duration) : 0;
    },
    onChange(cb) {
      listeners.push(cb);
    },
    get log() {
      return log;
    },
    get maxAudible() {
      return maxAudible;
    },
  };
}
