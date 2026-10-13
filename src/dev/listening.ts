// The café sound lab (dev/listening.html, dev server only). Plays the game's three music moods
// through the real audio engine (manager + music synth + SFX), with separate voice / music /
// ambience / effects volumes, real dialogue to test the music ducking, pause and resume, live
// output meters, an offline measurement of every mood (loudness, true peak, clipping, DC, speech
// over music) and per-mood listening ratings and notes, saved to disk or exported as JSON.
// The HTML lives in listeningView.ts, the offline measurement in offlineMix.ts.

import '@fontsource/bowlby-one/400.css';
import '@fontsource/figtree/400.css';
import '@fontsource/figtree/600.css';
import '@fontsource/figtree/800.css';
import './dev.css';
import { createAudioManager, DEFAULT_VOLUMES, type Bus } from '../audio/manager';
import { dbfs } from '../audio/meter';
import { createMusic } from '../audio/music';
import type { MusicMood } from '../audio/musicPatterns';
import { createSfx } from '../audio/sfx';
import { AUDITIONS } from '../data/voice/auditions';
import { CAST_BRIEFS } from '../data/voice/casting';
import { downloadJson, fmt, loadFromDevServer, saveToDevServer, toast } from './devui';
import {
  BUSES,
  labHtml,
  measurementHtml,
  MOOD_INFO,
  MOOD_LIST,
  type RatingKey,
} from './listeningView';
import { measureMoods, type Measurement } from './offlineMix';

/** Dialogue for the ducking test: real game lines (their clips are in the voice manifest). */
const LINES = [
  { label: "Dazza's order", speaker: 'dazza', text: AUDITIONS.dazza?.[0] ?? '', listen: true },
  { label: "Karen's order", speaker: 'karen', text: AUDITIONS.karen?.[0] ?? '', listen: true },
  { label: "Priya's order", speaker: 'priya', text: AUDITIONS.priya?.[0] ?? '', listen: true },
  { label: 'Gaz chatting', speaker: 'gaz', text: AUDITIONS.gaz?.[1] ?? '', listen: false },
];

interface ListeningNotes {
  kind: 'nwc-listening-notes';
  version: 1;
  reviewer: string;
  updatedAt: string;
  /** Speakers or headphones used: it changes what you hear. */
  device: string;
  moods: Record<MusicMood, { ratings: Partial<Record<RatingKey, number>>; notes: string }>;
  mix: Record<Bus, number>;
  measurement: Measurement | null;
}

const STORE = 'nwc.listening.v1';
const blankNotes = (): ListeningNotes => ({
  kind: 'nwc-listening-notes',
  version: 1,
  reviewer: '',
  updatedAt: new Date().toISOString(),
  device: '',
  moods: {
    opening: { ratings: {}, notes: '' },
    rush: { ratings: {}, notes: '' },
    afternoon: { ratings: {}, notes: '' },
  },
  mix: { ...DEFAULT_VOLUMES },
  measurement: null,
});

// --- Engine (the game's own) ---------------------------------------------------------------------

const audio = createAudioManager(import.meta.env.BASE_URL, { persist: false });
const sfx = createSfx(audio);
const music = createMusic(audio);
const MACHINE_ON = {
  grind: 1,
  pump: 1,
  steam: 1,
  steamZone: 'whirl',
  pour: 1,
  pourHigh: 1,
} as const;
const MACHINE_OFF = {
  grind: 0,
  pump: 0,
  steam: 0,
  steamZone: 'off',
  pour: 0,
  pourHigh: 0,
} as const;
let crowd = 1;
let machine = false;
let started = false;
const meters = { peakHold: 0, holdAt: 0, clipEvents: 0 };

let notes: ListeningNotes = blankNotes();
const persist = (): void => {
  notes.updatedAt = new Date().toISOString();
  try {
    localStorage.setItem(STORE, JSON.stringify(notes));
  } catch {
    /* private mode: export still works */
  }
};

// --- Page ----------------------------------------------------------------------------------------

const app = document.getElementById('app') as HTMLElement;
app.innerHTML = labHtml(LINES);

const $ = <T extends Element = HTMLElement>(sel: string): T => app.querySelector(sel) as T;
const $$ = <T extends Element = HTMLElement>(sel: string): T[] => [...app.querySelectorAll<T>(sel)];

// Notes form ↔ state.
function fillNotes(): void {
  $<HTMLInputElement>('[data-reviewer]').value = notes.reviewer;
  $<HTMLInputElement>('[data-device]').value = notes.device;
  for (const m of MOOD_LIST) {
    const fs = $(`[data-notes-mood="${m}"]`);
    for (const r of fs.querySelectorAll<HTMLInputElement>('input[data-k]'))
      r.checked = notes.moods[m].ratings[r.dataset.k as RatingKey] === Number(r.value);
    const ta = fs.querySelector<HTMLTextAreaElement>('[data-mnotes]');
    if (ta) ta.value = notes.moods[m].notes;
  }
}
$('[data-reviewer]').addEventListener('input', (e) => {
  notes.reviewer = (e.target as HTMLInputElement).value;
  persist();
});
$('[data-device]').addEventListener('input', (e) => {
  notes.device = (e.target as HTMLInputElement).value;
  persist();
});
for (const m of MOOD_LIST) {
  const fs = $(`[data-notes-mood="${m}"]`);
  fs.addEventListener('change', (e) => {
    const t = e.target as HTMLInputElement;
    if (t.dataset.k) notes.moods[m].ratings[t.dataset.k as RatingKey] = Number(t.value);
    persist();
  });
  fs.querySelector('[data-mnotes]')?.addEventListener('input', (e) => {
    notes.moods[m].notes = (e.target as HTMLTextAreaElement).value;
    persist();
  });
}
const snapshot = (): ListeningNotes => ({
  ...notes,
  mix: {
    voice: audio.volume('voice'),
    music: audio.volume('music'),
    ambience: audio.volume('ambience'),
    sfx: audio.volume('sfx'),
  },
});
$('[data-act="save"]').addEventListener('click', () => {
  void saveToDevServer('listening', snapshot());
});
$('[data-act="export"]').addEventListener('click', () => {
  downloadJson(`listening-notes-${notes.updatedAt.slice(0, 10)}.json`, snapshot());
  toast('Exported listening notes as JSON.');
});

// Mix controls.
function showVolumes(): void {
  for (const b of BUSES) {
    const pct = Math.round(audio.volume(b) * 100);
    $<HTMLInputElement>(`[data-bus="${b}"]`).value = String(pct);
    $(`[data-out="${b}"]`).textContent = `${pct}%`;
  }
}
for (const el of $$<HTMLInputElement>('[data-bus]'))
  el.addEventListener('input', () => {
    audio.setVolume(el.dataset.bus as Bus, Number(el.value) / 100);
    showVolumes();
  });
$('[data-act="defaults"]').addEventListener('click', () => {
  for (const b of BUSES) audio.setVolume(b, DEFAULT_VOLUMES[b]);
  showVolumes();
});
$('[data-crowd]').addEventListener('change', (e) => {
  crowd = Number((e.target as HTMLSelectElement).value);
  sfx.setNoise(crowd);
});
$('[data-machine]').addEventListener('change', (e) => {
  machine = (e.target as HTMLInputElement).checked;
});
showVolumes();

// Start, moods, dialogue, pause.
function setMood(m: MusicMood | null): void {
  music.setMood(m);
  for (const b of $$('[data-mood]')) {
    const on = b.dataset.mood === (m ?? 'off');
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', String(on));
  }
  $('[data-now]').textContent = m ? `Playing: ${MOOD_INFO[m].title}` : 'Music off.';
}
$('[data-act="start"]').addEventListener('click', () => {
  audio.unlock();
  sfx.unlock();
  sfx.setNoise(crowd);
  started = true;
  for (const b of $$<HTMLButtonElement>('button[disabled]')) b.disabled = false;
  $('[data-act="start"]').textContent = 'Sound on';
  if (!music.mood) setMood('opening');
});
for (const b of $$('[data-mood]'))
  b.addEventListener('click', () => {
    const m = b.dataset.mood as MusicMood | 'off';
    setMood(m === 'off' ? null : m);
  });
const say = (l: (typeof LINES)[number]): void =>
  audio.say({ speaker: l.speaker, text: l.text, listen: l.listen });
for (const b of $$('[data-line]'))
  b.addEventListener('click', () => {
    const l = LINES[Number(b.dataset.line)];
    if (l) say(l);
  });
$('[data-act="rapid"]').addEventListener('click', () => {
  // Three lines in quick succession (a UI test, not gameplay): each must cut the one before.
  LINES.slice(0, 3).forEach((l, i) => window.setTimeout(() => say(l), i * 400));
});
$('[data-act="stopvoice"]').addEventListener('click', () => audio.stopVoice());
$('[data-act="pause"]').addEventListener('click', () => {
  audio.setPaused(!audio.paused);
  $('[data-act="pause"]').textContent = audio.paused ? 'Resume' : 'Pause';
});

// --- Live meters (one frame loop, like the game's) -----------------------------------------------

const scope = $<HTMLCanvasElement>('[data-scope]');
const HISTORY = 12 * 30;
const hist = {
  rms: new Float32Array(HISTORY),
  peak: new Float32Array(HISTORY),
  duck: new Float32Array(HISTORY).fill(1),
};
let head = 0;
let lastSample = 0;
let lastDom = 0;

function drawScope(): void {
  const dpr = Math.min(2, devicePixelRatio || 1);
  const w = scope.clientWidth;
  const h = scope.clientHeight;
  if (scope.width !== Math.round(w * dpr)) scope.width = Math.round(w * dpr);
  if (scope.height !== Math.round(h * dpr)) scope.height = Math.round(h * dpr);
  const g = scope.getContext('2d');
  if (!g) return;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);
  // Levels on a -60..+3 dBFS scale; the duck on 0..1.
  const y = (db: number): number => h - ((Math.max(-60, Math.min(3, db)) + 60) / 63) * h;
  g.strokeStyle = '#e0513f';
  g.setLineDash([4, 4]);
  g.beginPath();
  g.moveTo(0, y(0));
  g.lineTo(w, y(0));
  g.stroke();
  g.setLineDash([]);
  const trace = (data: Float32Array, color: string, toY: (v: number) => number, fill: boolean) => {
    g.beginPath();
    for (let i = 0; i < HISTORY; i++) {
      const x = (i / (HISTORY - 1)) * w;
      const v = toY(data[(head + i) % HISTORY] as number);
      if (i === 0) g.moveTo(x, v);
      else g.lineTo(x, v);
    }
    if (fill) {
      g.lineTo(w, h);
      g.lineTo(0, h);
      g.fillStyle = color;
      g.globalAlpha = 0.35;
      g.fill();
      g.globalAlpha = 1;
    } else {
      g.strokeStyle = color;
      g.lineWidth = 1.5;
      g.stroke();
    }
  };
  trace(hist.rms, '#e3a55f', (v) => y(dbfs(v)), true);
  trace(hist.peak, '#f6ede1', (v) => y(dbfs(v)), false);
  trace(hist.duck, '#74a98c', (v) => h - v * (h - 4) - 2, false);
}

function meter(k: string, value: string, alarm = false): void {
  const m = $(`[data-m="${k}"]`);
  const b = m.querySelector('b');
  if (b) b.textContent = value;
  m.classList.toggle('alarm', alarm);
}

function frame(now: number): void {
  requestAnimationFrame(frame);
  if (!started) return;
  audio.update();
  music.update();
  sfx.update(machine ? MACHINE_ON : MACHINE_OFF);
  audio.voiceLevel(); // samples voice and master levels into the play history, as the game does
  const peak = audio.masterPeak();
  if (peak >= 0.999) meters.clipEvents++;
  if (peak >= meters.peakHold || now - meters.holdAt > 1500) {
    meters.peakHold = peak;
    meters.holdAt = now;
  }
  if (now - lastSample > 1000 / 30) {
    lastSample = now;
    hist.rms[head] = audio.masterRms();
    hist.peak[head] = peak;
    hist.duck[head] = audio.musicDuck;
    head = (head + 1) % HISTORY;
    drawScope();
  }
  if (now - lastDom < 120) return;
  lastDom = now;
  meter('peak', `${fmt(dbfs(meters.peakHold))} dB`, meters.peakHold >= 0.999);
  meter('rms', `${fmt(dbfs(audio.masterRms()))} dB`);
  meter('duck', audio.musicDuck.toFixed(2));
  meter('clips', String(meters.clipEvents), meters.clipEvents > 0);
  meter('voices', String(audio.voices.maxAudible), audio.voices.maxAudible > 1);
  meter('ctx', audio.context?.state ?? 'off');
  const last = audio.history.at(-1);
  $('[data-speaking]').textContent =
    audio.speaking && last
      ? `${CAST_BRIEFS[last.speaker]?.name ?? last.speaker}: “${last.text}” (${last.via === 'clip' ? 'recorded clip' : 'browser voice'})`
      : audio.loading
        ? 'Loading the clip…'
        : "Nobody's talking.";
}
requestAnimationFrame(frame);

// --- Offline measurement -------------------------------------------------------------------------

const measure = (): Promise<Measurement> =>
  measureMoods(MOOD_LIST, LINES, (msg) => ($('[data-mstatus]').textContent = msg));

function showMeasurement(r: Measurement): void {
  const { table, findings } = measurementHtml(r);
  $('[data-mtable]').innerHTML = table;
  $('[data-findings]').innerHTML = findings;
}

$('[data-act="measure"]').addEventListener('click', () => {
  const b = $<HTMLButtonElement>('[data-act="measure"]');
  b.disabled = true;
  void measure()
    .then((r) => {
      notes.measurement = r;
      persist();
      showMeasurement(r);
    })
    .catch((e: unknown) => toast(`Measurement failed: ${(e as Error).message}`, true))
    .finally(() => (b.disabled = false));
});

// --- Boot ----------------------------------------------------------------------------------------

void (async () => {
  try {
    const raw = localStorage.getItem(STORE);
    const saved = raw
      ? (JSON.parse(raw) as Partial<ListeningNotes>)
      : ((await loadFromDevServer('listening')) as Partial<ListeningNotes> | null);
    if (saved?.kind === 'nwc-listening-notes') notes = { ...blankNotes(), ...saved };
  } catch {
    /* corrupt storage: start fresh */
  }
  fillNotes();
  if (notes.measurement) showMeasurement(notes.measurement);
})();

// Read-only handle for the e2e test (tests/e2e/listening.spec.ts).
(window as unknown as { __listen: unknown }).__listen = {
  audio,
  music,
  meters,
  measure,
  get notes() {
    return notes;
  },
};
