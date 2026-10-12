// Synthesised café sounds (no files). Continuous machine sounds follow per-frame levels;
// one-shots are fired by trial events. Created on the first user gesture (iOS needs that).

import { createRng } from '../core/rng';
import type { SfxId } from '../core/trial';

export interface LoopLevels {
  grind: number;
  pump: number;
  steam: number;
  steamZone: 'off' | 'chirp' | 'whirl' | 'screech';
  pour: number;
  /** 0 = low pour (soft), 1 = high pour (splashy). */
  pourHigh: number;
}

interface Channel {
  gain: GainNode;
  filter: BiquadFilterNode;
}

export interface Sfx {
  readonly ready: boolean;
  muted: boolean;
  unlock(): void;
  setMuted(m: boolean): void;
  setPaused(p: boolean): void;
  update(l: LoopLevels): void;
  play(id: SfxId | 'click' | 'tick'): void;
}

export function createSfx(): Sfx {
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let noise: AudioBuffer | null = null;
  let brown: AudioBuffer | null = null;
  const ch: Record<string, Channel> = {};
  let chirpDepth: GainNode | null = null;
  let screech: GainNode | null = null;
  let motor: GainNode | null = null;
  let muted = false;

  const loopNoise = (buf: AudioBuffer, type: BiquadFilterType, f: number, q: number): Channel => {
    const c = ctx as AudioContext;
    const src = c.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const filter = c.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = f;
    filter.Q.value = q;
    const gain = c.createGain();
    gain.gain.value = 0;
    src
      .connect(filter)
      .connect(gain)
      .connect(master as GainNode);
    src.start();
    return { gain, filter };
  };

  const init = (): void => {
    const C =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = new C();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.6;
    master.connect(ctx.destination);
    const rng = createRng(0x5f3759df);
    noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = rng.next() * 2 - 1;
    brown = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate);
    const b = brown.getChannelData(0);
    let last = 0;
    for (let i = 0; i < b.length; i++) {
      last = (last + 0.02 * (rng.next() * 2 - 1)) / 1.02;
      b[i] = last * 3.2;
    }
    // Room tone: low murmur of the street and the fridge.
    const room = loopNoise(brown, 'bandpass', 380, 0.5);
    room.gain.gain.value = 0.05;
    ch.grind = loopNoise(noise, 'bandpass', 2300, 0.7);
    ch.pump = loopNoise(brown, 'lowpass', 420, 2);
    ch.steam = loopNoise(noise, 'highpass', 3600, 0.7);
    ch.pour = loopNoise(noise, 'bandpass', 800, 3);
    // Grinder motor buzz.
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 96;
    motor = ctx.createGain();
    motor.gain.value = 0;
    osc.connect(motor).connect(master);
    osc.start();
    // Chirp: tremolo on the steam hiss.
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 13;
    chirpDepth = ctx.createGain();
    chirpDepth.gain.value = 0;
    lfo.connect(chirpDepth).connect(ch.steam.gain.gain);
    lfo.start();
    // Screech: a nasty whistle when the tip comes out of the milk.
    const wh = ctx.createOscillator();
    wh.frequency.value = 2900;
    const vib = ctx.createOscillator();
    vib.frequency.value = 7;
    const vibG = ctx.createGain();
    vibG.gain.value = 60;
    vib.connect(vibG).connect(wh.frequency);
    screech = ctx.createGain();
    screech.gain.value = 0;
    wh.connect(screech).connect(master);
    wh.start();
    vib.start();
  };

  const set = (g: AudioParam | undefined, v: number, tc = 0.05): void => {
    if (!g || !ctx) return;
    g.setTargetAtTime(v, ctx.currentTime, tc);
  };

  const tone = (
    f: number,
    dur: number,
    type: OscillatorType = 'sine',
    vol = 0.2,
    f2?: number,
    delay = 0,
  ): void => {
    if (!ctx || !master || muted) return;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + dur + 0.05);
  };

  const burst = (dur: number, type: BiquadFilterType, f: number, vol: number, delay = 0): void => {
    if (!ctx || !master || !noise || muted) return;
    const t = ctx.currentTime + delay;
    const s = ctx.createBufferSource();
    s.buffer = noise;
    const fl = ctx.createBiquadFilter();
    fl.type = type;
    fl.frequency.value = f;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(fl).connect(g).connect(master);
    s.start(t);
    s.stop(t + dur + 0.05);
  };

  return {
    get ready() {
      return ctx !== null;
    },
    get muted() {
      return muted;
    },
    set muted(m: boolean) {
      muted = m;
    },
    unlock() {
      try {
        if (!ctx) init();
        if (ctx && ctx.state === 'suspended') void ctx.resume();
      } catch {
        ctx = null; // audio is optional
      }
    },
    setMuted(m) {
      muted = m;
      if (master && ctx) master.gain.setTargetAtTime(m ? 0 : 0.6, ctx.currentTime, 0.05);
    },
    setPaused(p) {
      if (!ctx) return;
      if (p) void ctx.suspend();
      else void ctx.resume();
    },
    update(l) {
      if (!ctx) return;
      set(ch.grind?.gain.gain, l.grind * 0.22);
      set(motor?.gain, l.grind * 0.035);
      set(ch.pump?.gain.gain, l.pump * 0.32);
      const chirp = l.steamZone === 'chirp';
      const base = l.steam * (l.steamZone === 'whirl' ? 0.16 : 0.13);
      set(ch.steam?.gain.gain, base);
      set(chirpDepth?.gain, chirp ? base * 0.9 : 0);
      set(ch.steam?.filter.frequency, l.steamZone === 'whirl' ? 2800 : 4200, 0.1);
      set(screech?.gain, l.steamZone === 'screech' ? l.steam * 0.05 : 0);
      set(ch.pour?.gain.gain, l.pour * (0.08 + 0.12 * l.pourHigh));
      set(ch.pour?.filter.frequency, 520 + 900 * l.pourHigh, 0.08);
    },
    play(id) {
      switch (id) {
        case 'tamp':
          tone(110, 0.18, 'sine', 0.35, 50);
          burst(0.08, 'lowpass', 600, 0.25);
          break;
        case 'lock':
          tone(190, 0.09, 'square', 0.06);
          burst(0.12, 'highpass', 2500, 0.12);
          tone(140, 0.12, 'triangle', 0.08, undefined, 0.08);
          break;
        case 'clink':
          tone(2400, 0.18, 'sine', 0.08);
          tone(3150, 0.14, 'sine', 0.05, undefined, 0.02);
          break;
        case 'good':
          tone(660, 0.12, 'triangle', 0.1);
          tone(990, 0.22, 'triangle', 0.1, undefined, 0.1);
          break;
        case 'bad':
          tone(220, 0.35, 'square', 0.05, 150);
          break;
        case 'sting':
          tone(523, 0.18, 'triangle', 0.1);
          tone(659, 0.18, 'triangle', 0.1, undefined, 0.14);
          tone(587, 0.4, 'triangle', 0.1, undefined, 0.28);
          break;
        case 'fanfare':
          [523, 659, 784, 1047].forEach((f, i) =>
            tone(f, i === 3 ? 0.7 : 0.2, 'triangle', 0.12, undefined, i * 0.13),
          );
          tone(1568, 0.6, 'sine', 0.05, undefined, 0.52);
          break;
        case 'sad':
          [392, 370, 349, 262].forEach((f, i) =>
            tone(f, i === 3 ? 0.9 : 0.32, 'sawtooth', 0.05, i === 3 ? 220 : undefined, i * 0.34),
          );
          break;
        case 'click':
          tone(900, 0.04, 'square', 0.03);
          break;
        case 'tick':
          tone(1800, 0.03, 'sine', 0.02);
          break;
      }
    },
  };
}
