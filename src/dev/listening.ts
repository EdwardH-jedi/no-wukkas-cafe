// The café sound lab (dev/listening.html, dev server only). Plays the game's three music moods
// through the real audio engine (manager + music synth + SFX), with separate voice / music /
// ambience / effects volumes, real dialogue to test the music ducking, pause and resume, live
// output meters, an offline measurement of every mood (loudness, true peak, clipping, DC, speech
// over music) and per-mood listening ratings and notes, saved to disk or exported as JSON.

import '@fontsource/bowlby-one/400.css';
import '@fontsource/figtree/400.css';
import '@fontsource/figtree/600.css';
import '@fontsource/figtree/800.css';
import './dev.css';
import { createAudioManager, DEFAULT_VOLUMES, type Bus } from '../audio/manager';
import { analyse, dbfs, integratedLoudness, type LoudnessReport } from '../audio/meter';
import { mixFindings, type MixFinding, type MoodMeasure } from '../audio/mixCheck';
import { createMusic } from '../audio/music';
import { duckLevel, MOODS, type MusicMood } from '../audio/musicPatterns';
import { createSfx } from '../audio/sfx';
import { clipFor } from '../data/voice';
import { AUDITIONS } from '../data/voice/auditions';
import { CAST_BRIEFS } from '../data/voice/casting';
import { downloadJson, esc, fmt, loadFromDevServer, saveToDevServer, toast } from './devui';
import { channelsFrom, decodeClip, renderMix } from './offlineMix';

const MOOD_LIST: readonly MusicMood[] = ['opening', 'rush', 'afternoon'];
const MOOD_INFO: Record<MusicMood, { title: string; style: string; when: string }> = {
  opening: {
    title: 'Opening',
    style: 'Indie acoustic / light jazz: fingerpicked pluck, soft keys, brushes',
    when: 'Title, Day 1, Day 2 intro',
  },
  rush: {
    title: 'Rush',
    style: 'Upbeat indie / surf / funk: kit, syncopated bass, tremolo surf lead',
    when: 'Day 2 service',
  },
  afternoon: {
    title: 'Afternoon',
    style: 'Neo-soul / relaxed jazz: Rhodes-style keys, swung kit, walking bass',
    when: 'Day 1 verdict, Day 2 wrap-up and report',
  },
};
const BUSES = ['voice', 'music', 'ambience', 'sfx'] as const;
const BUS_LABEL: Record<Bus, string> = {
  voice: 'Voices',
  music: 'Music',
  ambience: 'Café ambience',
  sfx: 'Machine & effects',
};
const RATINGS = {
  fit: 'Fits the café',
  mix: 'Sits under the voices',
  fatigue: 'Easy to hear all shift',
  variety: "Doesn't feel repetitive",
} as const;
type RatingKey = keyof typeof RATINGS;

/** Dialogue for the ducking test: real game lines (their clips are in the voice manifest). */
const LINES = [
  { label: "Dazza's order", speaker: 'dazza', text: AUDITIONS.dazza?.[0] ?? '', listen: true },
  { label: "Karen's order", speaker: 'karen', text: AUDITIONS.karen?.[0] ?? '', listen: true },
  { label: "Priya's order", speaker: 'priya', text: AUDITIONS.priya?.[0] ?? '', listen: true },
  { label: 'Gaz chatting', speaker: 'gaz', text: AUDITIONS.gaz?.[1] ?? '', listen: false },
];

interface Measurement {
  at: string;
  measures: MoodMeasure[];
  speechLufs: number | null;
  speechClips: string[];
  findings: MixFinding[];
}

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
const ratingRow = (m: MusicMood, k: RatingKey): string =>
  `<div class="rate" role="radiogroup" aria-label="${RATINGS[k]}: ${MOOD_INFO[m].title}"><span>${RATINGS[k]}</span>${[
    1, 2, 3, 4, 5,
  ]
    .map(
      (v) =>
        `<label><input type="radio" name="${m}-${k}" value="${v}" data-k="${k}"><i>${v}</i></label>`,
    )
    .join('')}</div>`;

app.innerHTML = `
<header class="top">
  <div>
    <p class="kicker">No Wukkas Café · dev tool</p>
    <h1>Café sound lab</h1>
    <p class="sub">The game's three original music moods through the real audio engine. Switch
    moods, balance the buses, test the duck under real dialogue, measure loudness and clipping,
    and rate what you hear. Volumes here don't change your saved game settings.</p>
  </div>
  <div class="actions">
    <button class="btn" data-act="start">▶ Start sound</button>
    <button class="btn ghost" data-act="pause" disabled>Pause</button>
  </div>
</header>
<p class="toast" role="status" aria-live="polite" data-toast></p>
<div class="lab">
  <div class="labmain">
    <section class="panel" aria-labelledby="h-moods">
      <h2 id="h-moods">Music</h2>
      <div class="moods">
        ${MOOD_LIST.map(
          (m) => `<button class="mood" data-mood="${m}" aria-pressed="false" disabled>
            <b>${MOOD_INFO[m].title}</b><span>${MOODS[m].bpm} bpm${MOODS[m].swing ? ', swung' : ''}</span>
            <small>${MOOD_INFO[m].style}</small><small>In game: ${MOOD_INFO[m].when}</small></button>`,
        ).join('')}
      </div>
      <div class="row"><button class="btn ghost small" data-mood="off" disabled>Music off</button>
        <span class="fine" data-now>Press Start sound: browsers only play audio after a click.</span></div>
    </section>

    <section class="panel" aria-labelledby="h-mix">
      <h2 id="h-mix">Mix</h2>
      <div class="sliders">
        ${BUSES.map(
          (b) =>
            `<label class="slider"><span>${BUS_LABEL[b]}</span><input type="range" min="0" max="100" step="5" data-bus="${b}" aria-label="${BUS_LABEL[b]} volume"><output data-out="${b}"></output></label>`,
        ).join('')}
      </div>
      <div class="row">
        <label class="field"><span>Crowd</span><select data-crowd>
          <option value="0">Empty café</option><option value="1" selected>Normal morning</option><option value="1.7">Packed (Hard)</option></select></label>
        <label class="tick"><input type="checkbox" data-machine> Espresso machine running (grinder, pump, steam, pour)</label>
        <button class="btn ghost small" data-act="defaults">Reset to game defaults</button>
      </div>
    </section>

    <section class="panel" aria-labelledby="h-duck">
      <h2 id="h-duck">Dialogue and ducking</h2>
      <p class="fine">Real game lines. Music drops to ${duckLevel(true, true)} under an order the
      player must hear and ${duckLevel(true, false)} under other talk, then comes back over about a
      second.</p>
      <div class="row">
        ${LINES.map((l, i) => `<button class="btn small" data-line="${i}" disabled>${esc(l.label)}</button>`).join('')}
        <button class="btn ghost small" data-act="rapid" disabled>3 lines, fast</button>
        <button class="btn ghost small" data-act="stopvoice" disabled>Stop voice</button>
      </div>
      <p class="fine" data-speaking>Nobody's talking.</p>
      <div class="meters">
        <div class="meter" data-m="peak"><span>Peak (held)</span><b>−∞</b></div>
        <div class="meter" data-m="rms"><span>RMS</span><b>−∞</b></div>
        <div class="meter" data-m="duck"><span>Music duck</span><b>1.00</b></div>
        <div class="meter" data-m="clips"><span>Clip events</span><b>0</b></div>
        <div class="meter" data-m="voices"><span>Voices at once (max)</span><b>0</b></div>
        <div class="meter" data-m="ctx"><span>Audio</span><b>off</b></div>
      </div>
      <canvas class="scope" data-scope aria-label="Last 12 seconds: output level and music duck"></canvas>
      <p class="legend"><span><i style="background:#e3a55f"></i>output RMS</span><span><i style="background:#f6ede1"></i>output peak</span><span><i style="background:#74a98c"></i>music duck (0–1)</span><span><i style="background:#e0513f"></i>0 dBFS</span></p>
    </section>

    <section class="panel" aria-labelledby="h-measure">
      <h2 id="h-measure">Measure</h2>
      <p class="fine">Renders each mood offline through the game's own synth: 28 s of music alone
      at 100% (its headroom), and 16 s of the worst case: every bus at 100%, a packed café, every
      machine sound at once and an order spoken over the ducked music. Loudness is BS.1770
      integrated (LUFS); peaks are true peaks (4× oversampled).</p>
      <div class="row"><button class="btn" data-act="measure">Measure the three moods</button><span class="fine" data-mstatus></span></div>
      <div class="tablewrap" data-mtable></div>
      <ul class="findings" data-findings></ul>
    </section>
  </div>

  <aside class="panel notes" aria-labelledby="h-notes">
    <h2 id="h-notes">Listening notes</h2>
    <label class="field"><span>Reviewer</span><input data-reviewer placeholder="Your name" autocomplete="name"></label>
    <label class="field"><span>Listening on</span><input data-device placeholder="e.g. MacBook speakers, AirPods"></label>
    ${MOOD_LIST.map(
      (m) => `<fieldset class="review" data-notes-mood="${m}"><legend>${MOOD_INFO[m].title}</legend>
        ${(Object.keys(RATINGS) as RatingKey[]).map((k) => ratingRow(m, k)).join('')}
        <textarea data-mnotes aria-label="Notes on ${MOOD_INFO[m].title}" placeholder="What works, what grates, where it clashes with voices"></textarea>
      </fieldset>`,
    ).join('')}
    <div class="row"><button class="btn" data-act="save">Save to disk</button><button class="btn ghost" data-act="export">Export JSON</button></div>
    <p class="fine">Saves to reports/listening-notes.json with the current mix and the last measurement.</p>
  </aside>
</div>`;

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

const ALL_FULL: Record<Bus, number> = { voice: 1, music: 1, ambience: 1, sfx: 1 };
const MUSIC_ONLY: Record<Bus, number> = { voice: 0, music: 1, ambience: 0, sfx: 0 };

async function measure(): Promise<Measurement> {
  const status = $('[data-mstatus]');
  // Order clips (placeholders in development): their loudness, and the loudest for the worst case.
  const speech: Array<{ id: string; buffer: AudioBuffer; gain: number; lufs: number }> = [];
  for (const l of LINES.filter((x) => x.listen)) {
    const clip = clipFor(l.speaker, l.text);
    if (!clip) continue;
    try {
      const buffer = await decodeClip(import.meta.env.BASE_URL + clip.file);
      const lufs =
        integratedLoudness([buffer.getChannelData(0)], buffer.sampleRate) +
        20 * Math.log10(clip.playback.gain);
      speech.push({ id: clip.file, buffer, gain: clip.playback.gain, lufs });
    } catch {
      /* clip not rendered locally: measure without speech */
    }
  }
  const loudest = speech.reduce<(typeof speech)[number] | null>(
    (a, b) => (!a || b.lufs > a.lufs ? b : a),
    null,
  );
  const measures: MoodMeasure[] = [];
  for (const mood of MOOD_LIST) {
    status.textContent = `Rendering ${MOOD_INFO[mood].title}…`;
    const alone = await renderMix({
      mood,
      seconds: 28,
      volumes: MUSIC_ONLY,
      crowd: null,
      machine: false,
      speech: null,
    });
    const worst = await renderMix({
      mood,
      seconds: 16,
      volumes: ALL_FULL,
      crowd: 1.7,
      machine: true,
      speech: loudest ? { buffer: loudest.buffer, gain: loudest.gain, at: 4, listen: true } : null,
    });
    measures.push({
      mood,
      music: analyse(channelsFrom(alone, 4), alone.sampleRate),
      worst: analyse(channelsFrom(worst, 3), worst.sampleRate),
    });
  }
  // Energy average of the order clips' loudness.
  const speechLufs = speech.length
    ? 10 * Math.log10(speech.reduce((s, x) => s + 10 ** (x.lufs / 10), 0) / speech.length)
    : null;
  status.textContent = speech.length
    ? `Done. Speech: ${speech.length} order clips (placeholder voices).`
    : 'Done. No order clips found locally (run npm run voices): speech checks skipped.';
  return {
    at: new Date().toISOString(),
    measures,
    speechLufs,
    speechClips: speech.map((s) => s.id),
    findings: mixFindings(measures, {
      musicVolume: DEFAULT_VOLUMES.music,
      duckListen: duckLevel(true, true),
      speechLufs,
    }),
  };
}

function showMeasurement(r: Measurement): void {
  const cell = (v: string, bad = false, good = false): string =>
    `<td class="${bad ? 'flag' : good ? 'okv' : ''}">${v}</td>`;
  const row = (m: MoodMeasure): string => {
    const a: LoudnessReport = m.music;
    const atDefault = a.lufs + 20 * Math.log10(DEFAULT_VOLUMES.music);
    const w = m.worst;
    return `<tr><td>${MOOD_INFO[m.mood].title}</td>${cell(fmt(a.lufs))}${cell(fmt(atDefault))}${cell(fmt(a.truePeakDb), a.truePeakDb > -1)}${cell(fmt(a.crestDb))}${cell(a.dc.toFixed(4), a.dc > 0.001)}${cell(String(a.clipped), a.clipped > 0, a.clipped === 0)}${w ? `${cell(fmt(w.truePeakDb), w.truePeakDb > 0)}${cell(String(w.clipped), w.clipped > 0, w.clipped === 0)}` : '<td>–</td><td>–</td>'}</tr>`;
  };
  $('[data-mtable]').innerHTML =
    `<table class="measure"><thead><tr><th>Mood</th><th>LUFS @100%</th><th>LUFS @${Math.round(DEFAULT_VOLUMES.music * 100)}%</th><th>True peak dBTP</th><th>Crest dB</th><th>DC</th><th>Clipped</th><th>Worst-case dBTP</th><th>Worst-case clipped</th></tr></thead><tbody>${r.measures.map(row).join('')}</tbody></table>`;
  $('[data-findings]').innerHTML = r.findings
    .map(
      (f) =>
        `<li class="${f.level}"><b>${f.level === 'defect' ? 'Defect' : f.level === 'warning' ? 'Warning' : 'Info'}:</b> ${esc(f.message)}</li>`,
    )
    .join('');
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
