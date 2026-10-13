// Café background music: a small synth that plays the moods in audio/musicPatterns.ts on the
// shared AudioContext, into the manager's music bus (which ducks under speech). Original,
// generated in code: no files, so nothing to license (docs/AUDIO_PROVENANCE.md).
//
// Scheduling runs from the frame loop (update()), a bar at a time, ahead on the audio clock; a
// suspended (paused) context stops the clock, so nothing new is scheduled while paused.

import { createRng } from '../core/rng';
import type { AudioManager } from './manager';
import {
  barEvents,
  barSeconds,
  MOODS,
  type Instrument,
  type MusicMood,
  type NoteEvent,
} from './musicPatterns';

export interface Music {
  /** Change mood (crossfades at the next bar); null fades the music out. */
  setMood(m: MusicMood | null): void;
  /** Call every frame: schedules the next bars ahead of the audio clock. */
  update(): void;
  readonly mood: MusicMood | null;
  /** Notes scheduled since start (debug/tests). */
  readonly scheduled: number;
}

const LOOKAHEAD = 0.8;
const FADE = 1.6;

const hz = (midi: number): number => 440 * 2 ** ((midi - 69) / 12);

export function createMusic(audio: AudioManager): Music {
  let ctx: AudioContext | null = null;
  let out: AudioNode | null = null;
  let reverb: ConvolverNode | null = null;
  let noise: AudioBuffer | null = null;
  let mood: MusicMood | null = null;
  let playing: { mood: MusicMood; gain: GainNode; bar: number; next: number } | null = null;
  let scheduled = 0;

  const init = (): boolean => {
    if (ctx) return true;
    const c = audio.context;
    const o = audio.output('music');
    if (!c || !o) return false;
    ctx = c;
    out = o;
    const rng = createRng(0x6d75);
    noise = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const nd = noise.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = rng.next() * 2 - 1;
    // A small room (and the surf lead's spring): decaying noise impulse.
    reverb = c.createConvolver();
    const len = Math.floor(c.sampleRate * 1.8);
    const ir = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (rng.next() * 2 - 1) * (1 - i / len) ** 3;
    }
    reverb.buffer = ir;
    const wet = c.createGain();
    wet.gain.value = 0.35;
    reverb.connect(wet).connect(o);
    return true;
  };

  /** One note, scheduled at audio time `t` (seconds), `dur` seconds long. */
  const play = (dest: GainNode, n: NoteEvent, t: number, dur: number): void => {
    const c = ctx as AudioContext;
    const amp = c.createGain();
    amp.connect(dest);
    const env = (attack: number, decay: number, peak = n.vel): void => {
      amp.gain.setValueAtTime(0.0001, t);
      amp.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
      amp.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    };
    const osc = (type: OscillatorType, f: number): OscillatorNode => {
      const o = c.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(f, t);
      return o;
    };
    const noiseSrc = (): AudioBufferSourceNode => {
      const s = c.createBufferSource();
      s.buffer = noise;
      return s;
    };
    const send = (node: AudioNode, amount: number): void => {
      if (!reverb || amount <= 0) return;
      const g = c.createGain();
      g.gain.value = amount;
      node.connect(g).connect(reverb);
    };
    const stopAt = t + dur + 0.6;
    switch (n.inst as Instrument) {
      case 'keys': {
        // Electric piano: FM with a decaying modulation index.
        const car = osc('sine', hz(n.midi));
        const mod = osc('sine', hz(n.midi));
        const idx = c.createGain();
        idx.gain.setValueAtTime(hz(n.midi) * 1.2, t);
        idx.gain.exponentialRampToValueAtTime(hz(n.midi) * 0.05, t + 0.6);
        mod.connect(idx).connect(car.frequency);
        car.connect(amp);
        env(0.006, Math.max(0.4, dur), n.vel * 0.35);
        send(amp, 0.4);
        car.start(t);
        mod.start(t);
        car.stop(stopAt);
        mod.stop(stopAt);
        break;
      }
      case 'pluck': {
        // Nylon-ish pluck: bright attack, filter closing fast.
        const o1 = osc('triangle', hz(n.midi));
        const o2 = osc('sawtooth', hz(n.midi));
        const mix2 = c.createGain();
        mix2.gain.value = 0.25;
        const lp = c.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.setValueAtTime(3200, t);
        lp.frequency.exponentialRampToValueAtTime(700, t + 0.35);
        o1.connect(lp);
        o2.connect(mix2).connect(lp);
        lp.connect(amp);
        env(0.003, 0.9, n.vel * 0.35);
        send(amp, 0.3);
        o1.start(t);
        o2.start(t);
        o1.stop(stopAt);
        o2.stop(stopAt);
        break;
      }
      case 'bass': {
        const o1 = osc('sine', hz(n.midi));
        const o2 = osc('triangle', hz(n.midi));
        const lp = c.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 700;
        o1.connect(lp);
        o2.connect(lp);
        lp.connect(amp);
        env(0.01, Math.max(0.25, dur), n.vel * 0.45);
        o1.start(t);
        o2.start(t);
        o1.stop(stopAt);
        o2.stop(stopAt);
        break;
      }
      case 'lead': {
        // Surf-ish lead: saw through a filter, tremolo, lots of spring.
        const o = osc('sawtooth', hz(n.midi));
        const lp = c.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 2200;
        const trem = c.createGain();
        trem.gain.value = 0.7;
        const lfo = osc('sine', 7);
        const depth = c.createGain();
        depth.gain.value = 0.3;
        lfo.connect(depth).connect(trem.gain);
        o.connect(lp).connect(trem).connect(amp);
        env(0.008, Math.max(0.3, dur), n.vel * 0.18);
        send(amp, 0.8);
        o.start(t);
        lfo.start(t);
        o.stop(stopAt);
        lfo.stop(stopAt);
        break;
      }
      case 'kick': {
        const o = osc('sine', 140);
        o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
        o.connect(amp);
        env(0.002, 0.25, n.vel * 0.9);
        o.start(t);
        o.stop(t + 0.4);
        break;
      }
      case 'snare': {
        const s = noiseSrc();
        const bp = c.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = 1900;
        s.connect(bp).connect(amp);
        const body = osc('triangle', 190);
        const bg = c.createGain();
        bg.gain.value = 0.4;
        body.connect(bg).connect(amp);
        env(0.002, 0.16, n.vel * 0.5);
        send(amp, 0.25);
        s.start(t);
        body.start(t);
        s.stop(t + 0.3);
        body.stop(t + 0.3);
        break;
      }
      case 'hat': {
        const s = noiseSrc();
        const hp = c.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = 7000;
        s.connect(hp).connect(amp);
        env(0.001, 0.045, n.vel * 0.25);
        s.start(t);
        s.stop(t + 0.1);
        break;
      }
      case 'brush': {
        const s = noiseSrc();
        const bp = c.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = 3200;
        bp.Q.value = 0.7;
        s.connect(bp).connect(amp);
        env(0.02, 0.22, n.vel * 0.22);
        s.start(t);
        s.stop(t + 0.4);
        break;
      }
    }
    scheduled++;
  };

  const startMood = (m: MusicMood): void => {
    const c = ctx as AudioContext;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, c.currentTime);
    g.gain.exponentialRampToValueAtTime(1, c.currentTime + FADE);
    g.connect(out as AudioNode);
    playing = { mood: m, gain: g, bar: 0, next: c.currentTime + 0.1 };
  };

  const fadeOut = (): void => {
    if (!playing || !ctx) return;
    const g = playing.gain;
    const t = ctx.currentTime;
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(Math.max(0.0001, g.gain.value), t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + FADE);
    disconnectWhenSilent(g, t + FADE + 0.2);
    playing = null;
  };

  // Disconnect a faded mood once it's silent (scheduled on the audio clock, no timers).
  const disconnectWhenSilent = (g: GainNode, at: number): void => {
    const c = ctx as AudioContext;
    const s = c.createConstantSource();
    s.onended = () => g.disconnect();
    s.start(at);
    s.stop(at + 0.01);
  };

  return {
    get mood() {
      return mood;
    },
    get scheduled() {
      return scheduled;
    },
    setMood(m) {
      if (m === mood) return;
      mood = m;
      if (!init()) return;
      fadeOut();
      if (m) startMood(m);
    },
    update() {
      if (!init()) return;
      const c = ctx as AudioContext;
      if (mood && !playing) startMood(mood);
      if (!playing || c.state !== 'running') return;
      const p = playing;
      const beat = 60 / MOODS[p.mood].bpm;
      while (p.next < c.currentTime + LOOKAHEAD) {
        for (const n of barEvents(p.mood, p.bar))
          play(p.gain, n, p.next + n.at * beat, n.len * beat);
        p.bar++;
        p.next += barSeconds(p.mood);
      }
    },
  };
}
