// HTML for the café sound lab (dev/listening.html): the moods, buses and rating labels, the page
// itself, and the measurement table. Strings only; src/dev/listening.ts runs the engine and wires
// the events.

import { DEFAULT_VOLUMES, type Bus } from '../audio/manager';
import type { LoudnessReport } from '../audio/meter';
import type { MoodMeasure } from '../audio/mixCheck';
import { duckLevel, MOODS, type MusicMood } from '../audio/musicPatterns';
import { esc, fmt } from './devui';
import type { Measurement } from './offlineMix';

export const MOOD_LIST: readonly MusicMood[] = ['opening', 'rush', 'afternoon'];
export const MOOD_INFO: Record<MusicMood, { title: string; style: string; when: string }> = {
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
export const BUSES = ['voice', 'music', 'ambience', 'sfx'] as const;
export const BUS_LABEL: Record<Bus, string> = {
  voice: 'Voices',
  music: 'Music',
  ambience: 'Café ambience',
  sfx: 'Machine & effects',
};
export const RATINGS = {
  fit: 'Fits the café',
  mix: 'Sits under the voices',
  fatigue: 'Easy to hear all shift',
  variety: "Doesn't feel repetitive",
} as const;
export type RatingKey = keyof typeof RATINGS;

const ratingRow = (m: MusicMood, k: RatingKey): string =>
  `<div class="rate" role="radiogroup" aria-label="${RATINGS[k]}: ${MOOD_INFO[m].title}"><span>${RATINGS[k]}</span>${[
    1, 2, 3, 4, 5,
  ]
    .map(
      (v) =>
        `<label><input type="radio" name="${m}-${k}" value="${v}" data-k="${k}"><i>${v}</i></label>`,
    )
    .join('')}</div>`;

/** The whole page; `lines` are the dialogue buttons for the ducking test. */
export const labHtml = (lines: ReadonlyArray<{ label: string }>): string => `<header class="top">
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
        ${lines.map((l, i) => `<button class="btn small" data-line="${i}" disabled>${esc(l.label)}</button>`).join('')}
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

/** The measurement table and the findings list. */
export function measurementHtml(r: Measurement): { table: string; findings: string } {
  const cell = (v: string, bad = false, good = false): string =>
    `<td class="${bad ? 'flag' : good ? 'okv' : ''}">${v}</td>`;
  const row = (m: MoodMeasure): string => {
    const a: LoudnessReport = m.music;
    const atDefault = a.lufs + 20 * Math.log10(DEFAULT_VOLUMES.music);
    const w = m.worst;
    return `<tr><td>${MOOD_INFO[m.mood].title}</td>${cell(fmt(a.lufs))}${cell(fmt(atDefault))}${cell(fmt(a.truePeakDb), a.truePeakDb > -1)}${cell(fmt(a.crestDb))}${cell(a.dc.toFixed(4), a.dc > 0.001)}${cell(String(a.clipped), a.clipped > 0, a.clipped === 0)}${w ? `${cell(fmt(w.truePeakDb), w.truePeakDb > 0)}${cell(String(w.clipped), w.clipped > 0, w.clipped === 0)}` : '<td>–</td><td>–</td>'}</tr>`;
  };
  const table = `<table class="measure"><thead><tr><th>Mood</th><th>LUFS @100%</th><th>LUFS @${Math.round(DEFAULT_VOLUMES.music * 100)}%</th><th>True peak dBTP</th><th>Crest dB</th><th>DC</th><th>Clipped</th><th>Worst-case dBTP</th><th>Worst-case clipped</th></tr></thead><tbody>${r.measures.map(row).join('')}</tbody></table>`;
  const findings = r.findings
    .map(
      (f) =>
        `<li class="${f.level}"><b>${f.level === 'defect' ? 'Defect' : f.level === 'warning' ? 'Warning' : 'Info'}:</b> ${esc(f.message)}</li>`,
    )
    .join('');
  return { table, findings };
}
