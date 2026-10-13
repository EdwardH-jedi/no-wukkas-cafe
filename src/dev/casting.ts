// The voice-casting page (dev/casting.html, dev server only). Reads the audition index written by
// `npm run voices:audition`, shows each character's identity card and every candidate's takes side
// by side (waveform, duration, loudness), collects ratings and a casting decision per character,
// and exports them as JSON. Candidates without audio are shown as missing, with what they need.
// No audio is invented: only files in voice-auditions/ are played; provider pages are linked.

import '@fontsource/bowlby-one/400.css';
import '@fontsource/figtree/400.css';
import '@fontsource/figtree/600.css';
import '@fontsource/figtree/800.css';
import './dev.css';
import { CUSTOMERS } from '../data/customers';
import { VOICE_MANIFEST } from '../data/voice';
import {
  auditionCoverage,
  buildAuditionIndex,
  type AuditionIndex,
  type IndexedCandidate,
} from '../data/voice/auditionIndex';
import { AUDITIONS } from '../data/voice/auditions';
import { CAST_BRIEFS, CASTING, PROVIDER_INFO } from '../data/voice/casting';
import {
  averageRating,
  decisionIssues,
  emptyDecision,
  emptyDecisions,
  emptyReview,
  parseDecisions,
  RATING_KEYS,
  RATING_LABELS,
  STATUS_LABELS,
  type CastingDecisions,
  type DecisionStatus,
  type RatingKey,
} from '../data/voice/decision';
import { VOICE_PROFILES } from '../data/voice/profiles';
import { voiceScript } from '../data/voice/script';
import { downloadJson, esc, fmt, loadFromDevServer, saveToDevServer, toast } from './devui';
import { GAZ_LOOK, portraitSvg } from './portrait';
import { createPlayer, drawWaveform, measureTake, type TakeInfo } from './takes';

const ROOT = '/__auditions/';
const STORE = 'nwc.casting.v1';
const CAST = Object.keys(AUDITIONS);
/** Accents a native or heritage speaker must judge. */
const ACCENT_REVIEW = new Set(CAST.filter((c) => VOICE_PROFILES[c]?.accent !== 'australian'));

const lineCounts = new Map<string, number>();
for (const l of voiceScript()) lineCounts.set(l.speaker, (lineCounts.get(l.speaker) ?? 0) + 1);

/** What the game uses for each character today (placeholder voices), and who shares it. */
function todayVoice(who: string): { label: string; shared: string[]; pitched: boolean } {
  const clip = VOICE_MANIFEST.clips.find((c) => c.characterId === who);
  if (!clip) return { label: 'no clips', shared: [], pitched: false };
  const voice = clip.source.voice;
  const shared = [
    ...new Set(
      VOICE_MANIFEST.clips
        .filter((c) => c.source.voice === voice && c.characterId !== who)
        .map((c) => c.characterId),
    ),
  ];
  const pitched = clip.source.pitch !== 1;
  const label = `${clip.source.engine} ${voice}${pitched ? `, pitch ×${clip.source.pitch}` : ''}`;
  return { label, shared, pitched };
}

const lookFor = (who: string) =>
  who === 'gaz' ? GAZ_LOOK : (CUSTOMERS.find((c) => c.id === who)?.look ?? GAZ_LOOK);

// --- State ---------------------------------------------------------------------------------------

let index: AuditionIndex = buildAuditionIndex({
  lines: AUDITIONS,
  casting: CASTING,
  found: [],
  generatedAt: '',
});
let indexFromDisk = false;
let decisions: CastingDecisions = emptyDecisions(CAST, new Date().toISOString());
let selected = CAST[0] as string;
const player = createPlayer();
const infos = new Map<string, TakeInfo>();
const failed = new Map<string, string>();

const decisionOf = (who: string) => (decisions.characters[who] ??= emptyDecision());
const reviewOf = (who: string, slug: string) =>
  (decisionOf(who).candidates[slug] ??= emptyReview());

function persist(): void {
  decisions.updatedAt = new Date().toISOString();
  try {
    localStorage.setItem(STORE, JSON.stringify(decisions));
  } catch {
    /* private mode: decisions live until the tab closes; export still works */
  }
  refreshDerived();
}

// --- Rendering -----------------------------------------------------------------------------------

const app = document.getElementById('app') as HTMLElement;
const chip = (text: string, kind: string): string =>
  `<span class="chip ${kind}">${esc(text)}</span>`;
const decisionChip = (s: DecisionStatus): string =>
  s === 'cast' ? 'ok' : s === 'undecided' ? 'muted' : 'info';

const STATUS_CHIP: Record<IndexedCandidate['status'], [string, string]> = {
  ready: ['Audio: all lines', 'ok'],
  partial: ['Audio: some lines missing', 'warn'],
  missing: ['No audio yet', 'bad'],
  placeholder: ['Pipeline test: not a candidate', 'muted'],
};

function renderShell(): void {
  app.innerHTML = `
  <header class="top">
    <div>
      <p class="kicker">No Wukkas Café · dev tool</p>
      <h1>Voice casting</h1>
      <p class="sub" data-summary></p>
    </div>
    <div class="actions">
      <label class="field"><span>Reviewer</span><input data-reviewer placeholder="Your name" autocomplete="name"></label>
      <button class="btn" data-act="save">Save to disk</button>
      <button class="btn ghost" data-act="export">Export JSON</button>
      <label class="btn ghost file">Import JSON<input type="file" accept="application/json,.json" data-import hidden></label>
      <button class="btn ghost" data-act="stop" aria-label="Stop playback">■ Stop</button>
    </div>
  </header>
  <p class="toast" role="status" aria-live="polite" data-toast></p>
  <div class="layout">
    <nav class="cast" aria-label="Characters" data-nav></nav>
    <main data-main></main>
    <aside class="issues" aria-label="Casting checks" data-issues></aside>
  </div>
  <details class="guide"><summary>How auditions get here</summary>
    <ul>
      <li><b>Delivered takes</b> (actors or providers): put them in <code>&lt;dir&gt;/&lt;character&gt;/&lt;voice&gt;/</code>, named by line number (<code>1.wav</code>, <code>2.wav</code>, <code>2b.wav</code> for a second take), with an optional <code>source.json</code> <code>{ "licence", "source", "performer" }</code>. Then run <code>npm run voices:audition -- --import &lt;dir&gt;</code>.</li>
      <li><b>Azure</b>: <code>npm run voices:audition -- --provider azure --allow-paid</code> with credentials, only after Edward approves the spend. <b>Google</b> voices are listed to hear on Google's own page; there's no renderer or account yet.</li>
      <li><b>macOS takes</b> prove the pipeline only. They are not candidates and can't be cast.</li>
      <li>Accent authenticity for Priya, Jiwoo and Mei should be rated by a native or heritage speaker of that accent. Tick the box on the character's card when that's you.</li>
    </ul>
  </details>`;
  const rev = app.querySelector<HTMLInputElement>('[data-reviewer]') as HTMLInputElement;
  rev.value = decisions.reviewer;
  rev.addEventListener('input', () => {
    decisions.reviewer = rev.value;
    persist();
  });
  app.querySelector('[data-act="save"]')?.addEventListener('click', () => {
    void saveToDevServer('casting', decisions);
  });
  app.querySelector('[data-act="export"]')?.addEventListener('click', exportJson);
  app.querySelector('[data-act="stop"]')?.addEventListener('click', () => player.stop());
  app.querySelector<HTMLInputElement>('[data-import]')?.addEventListener('change', (e) => {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (f) void importJson(f);
  });
}

function renderNav(): void {
  const cov = auditionCoverage(index);
  const nav = app.querySelector('[data-nav]') as HTMLElement;
  nav.innerHTML = CAST.map((who) => {
    const b = CAST_BRIEFS[who];
    const c = cov[who] ?? { real: 0, placeholder: 0, missing: 0 };
    const d = decisionOf(who);
    return `<button class="castcard${who === selected ? ' on' : ''}" data-who="${who}" aria-current="${who === selected}">
      <span class="face">${portraitSvg(lookFor(who), b?.name ?? who)}</span>
      <span class="who"><b>${esc(b?.name ?? who)}</b><small>${esc(b?.accent ?? '')}</small>
      <span class="chips">${chip(STATUS_LABELS[d.status], decisionChip(d.status))}${chip(c.real ? `${c.real} with audio` : 'no real audio', c.real ? 'ok' : 'bad')}</span></span>
    </button>`;
  }).join('');
  nav.querySelectorAll<HTMLButtonElement>('[data-who]').forEach((btn) =>
    btn.addEventListener('click', () => {
      selected = btn.dataset.who as string;
      history.replaceState(null, '', `#${selected}`);
      renderNav();
      renderMain();
    }),
  );
}

function candidateHead(c: IndexedCandidate): string {
  const p = PROVIDER_INFO[c.provider];
  const [label, kind] = STATUS_CHIP[c.status];
  const preview =
    p.previewUrl && c.status !== 'ready'
      ? `<a class="preview" href="${p.previewUrl}" target="_blank" rel="noopener noreferrer">Hear it on the provider's page ↗${p.previewNeedsLogin ? ' (may need a login)' : ' (no login)'}</a>`
      : '';
  const licence = c.pipelineTestOnly
    ? `<p class="lic none">${esc(p.licence)}</p>`
    : `<p class="lic ${c.licence ? '' : 'none'}">Licence: ${esc(c.licence ?? 'none recorded')}</p>`;
  return `<div class="chead ${c.status}" data-slug="${c.slug}" data-status="${c.status}">
    <p class="prov">${esc(p.name)}</p>
    <h3>${esc(c.voice)}</h3>
    ${chip(label, kind)}
    ${c.note ? `<p class="note">${esc(c.note)}</p>` : ''}
    ${licence}
    ${c.needs && !c.pipelineTestOnly ? `<p class="needs">${esc(c.needs)}</p>` : ''}
    ${preview}
  </div>`;
}

function takeCell(c: IndexedCandidate, line: number): string {
  const takes = c.takes.filter((t) => t.line === line);
  if (!takes.length)
    return `<div class="cell missing" data-missing="${c.slug}:${line}"><b>No take</b><small>${c.status === 'missing' ? 'Not recorded or rendered' : 'This line is missing'}</small></div>`;
  return `<div class="cell${c.pipelineTestOnly ? ' placeholder' : ''}">${takes
    .map((t) => {
      const url = ROOT + t.file;
      const name = t.file.split('/').pop() ?? '';
      return `<div class="take" data-url="${esc(url)}">
        <button class="play" data-play="${esc(url)}" aria-label="Play ${esc(c.voice)} line ${line + 1} (${esc(name)})">▶</button>
        <canvas class="wave" data-wave="${esc(url)}" aria-hidden="true"></canvas>
        <p class="stats" data-stats="${esc(url)}">measuring…</p>
      </div>`;
    })
    .join('')}</div>`;
}

function reviewForm(who: string, c: IndexedCandidate): string {
  if (c.pipelineTestOnly)
    return `<div class="review off"><p>Placeholder voice: not rated, can't be cast.</p></div>`;
  const r = reviewOf(who, c.slug);
  const off = c.status === 'missing';
  const avg = averageRating(r);
  return `<fieldset class="review" data-review="${c.slug}" ${off ? 'disabled' : ''}>
    <legend>${off ? 'Rate once there is audio' : `Review${avg !== null ? ` · avg ${avg.toFixed(1)}` : ''}`}</legend>
    ${RATING_KEYS.map(
      (
        k,
      ) => `<div class="rate" role="radiogroup" aria-label="${RATING_LABELS[k]} for ${esc(c.voice)}">
        <span>${RATING_LABELS[k]}</span>
        ${[1, 2, 3, 4, 5]
          .map(
            (v) =>
              `<label><input type="radio" name="${c.slug}-${k}" value="${v}" data-k="${k}" ${r.ratings[k] === v ? 'checked' : ''}><i>${v}</i></label>`,
          )
          .join('')}
      </div>`,
    ).join('')}
    <label class="tick"><input type="checkbox" data-flag="caricatureRisk" ${r.caricatureRisk ? 'checked' : ''}> Caricature risk</label>
    <label class="tick"><input type="checkbox" data-flag="licenceCleared" ${r.licenceCleared ? 'checked' : ''}> Licence cleared</label>
    <textarea data-notes aria-label="Notes on ${esc(c.voice)}" placeholder="Notes on ${esc(c.voice)}">${esc(r.notes)}</textarea>
  </fieldset>`;
}

function renderMain(): void {
  player.stop();
  const who = selected;
  const b = CAST_BRIEFS[who];
  const lines = index.lines[who] ?? [];
  const cands = index.candidates.filter((c) => c.character === who);
  const d = decisionOf(who);
  const today = todayVoice(who);
  const castable = cands.filter((c) => !c.pipelineTestOnly);
  const main = app.querySelector('[data-main]') as HTMLElement;
  main.innerHTML = `
  <section class="idcard">
    <div class="portrait">${portraitSvg(lookFor(who), b?.name ?? who)}</div>
    <div class="brief">
      <h2>${esc(b?.name ?? who)} <span class="age">${esc(b?.age ?? '')}</span></h2>
      <p class="role">${esc(b?.role ?? '')}</p>
      <dl>
        <dt>Accent</dt><dd>${esc(b?.accent ?? '')}</dd>
        <dt>Sound</dt><dd>${esc(b?.voice ?? '')}</dd>
        <dt>Lines in game</dt><dd>${lineCounts.get(who) ?? 0}</dd>
        <dt>In game today</dt><dd class="today">${esc(today.label)} · placeholder${today.shared.length ? ` · <b>shares this voice with ${today.shared.map(esc).join(', ')}</b>` : ''}${today.pitched ? ' · <b>pitch-shifted</b>' : ''}</dd>
      </dl>
    </div>
    <form class="decision" data-decision>
      <label class="field"><span>Decision</span><select data-dstatus>
        ${(Object.keys(STATUS_LABELS) as DecisionStatus[]).map((s) => `<option value="${s}" ${d.status === s ? 'selected' : ''}>${STATUS_LABELS[s]}</option>`).join('')}
      </select></label>
      <label class="field"><span>Candidate</span><select data-chosen>
        <option value="">—</option>
        ${castable.map((c) => `<option value="${c.slug}" ${d.chosen === c.slug ? 'selected' : ''}>${esc(c.voice)} (${c.provider}${c.status === 'ready' ? '' : `, ${c.status}`})</option>`).join('')}
      </select></label>
      ${ACCENT_REVIEW.has(who) ? `<label class="tick"><input type="checkbox" data-speaks ${d.reviewerSpeaksAccent ? 'checked' : ''}> I'm a native or heritage speaker of ${esc(b?.accent.split(' (')[0] ?? 'this accent')}</label>` : ''}
      <textarea data-dnotes aria-label="Decision notes" placeholder="Decision notes">${esc(d.notes)}</textarea>
    </form>
  </section>
  ${castable.every((c) => c.status === 'missing') ? `<p class="banner" data-no-audio>No real audition audio for ${esc(b?.name ?? who)} yet. Every candidate below is waiting on a recording or an approved render. Use the provider links to listen on their own sites.</p>` : ''}
  <div class="gridwrap" tabindex="0" aria-label="Audition takes, lines by candidate">
    <div class="grid" style="--cols:${cands.length}">
      <div class="corner">Line</div>
      ${cands.map(candidateHead).join('')}
      ${lines
        .map(
          (text, i) => `<div class="line"><span class="n">${i + 1}</span><q>${esc(text)}</q>
            <button class="btn small" data-compare="${i}" ${cands.some((c) => c.takes.some((t) => t.line === i)) ? '' : 'disabled'}>▶ Compare across candidates</button></div>
            ${cands.map((c) => takeCell(c, i)).join('')}`,
        )
        .join('')}
      <div class="corner">Review</div>
      ${cands.map((c) => reviewForm(who, c)).join('')}
    </div>
  </div>`;
  wireMain(who, cands);
  for (const c of cands) for (const t of c.takes) void loadTake(ROOT + t.file);
}

function wireMain(who: string, cands: IndexedCandidate[]): void {
  const main = app.querySelector('[data-main]') as HTMLElement;
  main.querySelectorAll<HTMLButtonElement>('[data-play]').forEach((b) =>
    b.addEventListener('click', () => {
      const url = b.dataset.play as string;
      if (player.url === url) player.stop();
      else player.play(url);
    }),
  );
  main.querySelectorAll<HTMLButtonElement>('[data-compare]').forEach((b) =>
    b.addEventListener('click', () => {
      const line = Number(b.dataset.compare);
      player.sequence(
        cands.flatMap((c) => c.takes.filter((t) => t.line === line).map((t) => ROOT + t.file)),
      );
    }),
  );
  const d = decisionOf(who);
  main.querySelector('[data-decision]')?.addEventListener('submit', (e) => e.preventDefault());
  const status = main.querySelector<HTMLSelectElement>('[data-dstatus]') as HTMLSelectElement;
  status.addEventListener('change', () => {
    d.status = status.value as DecisionStatus;
    persist();
  });
  const chosen = main.querySelector<HTMLSelectElement>('[data-chosen]') as HTMLSelectElement;
  chosen.addEventListener('change', () => {
    d.chosen = chosen.value || null;
    persist();
  });
  main.querySelector<HTMLInputElement>('[data-speaks]')?.addEventListener('change', (e) => {
    d.reviewerSpeaksAccent = (e.target as HTMLInputElement).checked;
    persist();
  });
  main.querySelector<HTMLTextAreaElement>('[data-dnotes]')?.addEventListener('input', (e) => {
    d.notes = (e.target as HTMLTextAreaElement).value;
    persist();
  });
  main.querySelectorAll<HTMLFieldSetElement>('[data-review]').forEach((fs) => {
    const r = reviewOf(who, fs.dataset.review as string);
    fs.addEventListener('change', (e) => {
      const t = e.target as HTMLInputElement;
      if (t.dataset.k) r.ratings[t.dataset.k as RatingKey] = Number(t.value);
      if (t.dataset.flag === 'caricatureRisk') r.caricatureRisk = t.checked;
      if (t.dataset.flag === 'licenceCleared') r.licenceCleared = t.checked;
      const avg = averageRating(r);
      const legend = fs.querySelector('legend');
      if (legend) legend.textContent = `Review${avg !== null ? ` · avg ${avg.toFixed(1)}` : ''}`;
      persist();
    });
    fs.querySelector<HTMLTextAreaElement>('[data-notes]')?.addEventListener('input', (e) => {
      r.notes = (e.target as HTMLTextAreaElement).value;
      persist();
    });
  });
}

async function loadTake(url: string): Promise<void> {
  const sel = CSS.escape(url);
  try {
    const info = await measureTake(url);
    infos.set(url, info);
    const s = app.querySelector<HTMLElement>(`[data-stats="${sel}"]`);
    if (s) {
      const r = info.report;
      s.innerHTML = `<b>${info.duration.toFixed(2)} s</b> · ${fmt(r.lufs)} LUFS · peak ${fmt(r.truePeakDb)} dBTP${r.clipped ? ` · <span class="bad">${r.clipped} clipped</span>` : ''}`;
    }
    paint(url);
  } catch (e) {
    failed.set(url, (e as Error).message);
    const s = app.querySelector<HTMLElement>(`[data-stats="${sel}"]`);
    if (s)
      s.innerHTML = `<span class="bad">Missing or unreadable file (${esc((e as Error).message)})</span>`;
    app.querySelector(`[data-url="${sel}"]`)?.classList.add('broken');
    refreshDerived();
  }
}

function paint(url: string): void {
  const info = infos.get(url);
  const canvas = app.querySelector<HTMLCanvasElement>(`[data-wave="${CSS.escape(url)}"]`);
  if (info && canvas) drawWaveform(canvas, info.peaks, player.url === url ? player.progress() : 0);
}

let raf = 0;
player.onChange(() => {
  app.querySelectorAll<HTMLElement>('[data-play]').forEach((b) => {
    const on = b.dataset.play === player.url;
    b.textContent = on ? '■' : '▶';
    b.closest('.take')?.classList.toggle('playing', on);
  });
  for (const u of infos.keys()) paint(u);
  cancelAnimationFrame(raf);
  const tick = (): void => {
    if (!player.url) return;
    paint(player.url);
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
});

function refreshDerived(): void {
  const cov = auditionCoverage(index);
  const real = Object.values(cov).filter((c) => c.real > 0).length;
  const placeholders = index.candidates.filter((c) => c.pipelineTestOnly).length;
  const waiting = index.candidates.filter((c) => c.status === 'missing').length;
  const summary = app.querySelector('[data-summary]');
  if (summary)
    summary.innerHTML = `<b>${real} of ${CAST.length}</b> characters have real audition audio · ${placeholders} pipeline-test voice${placeholders === 1 ? '' : 's'} (placeholders) · ${waiting} candidates waiting for audio${failed.size ? ` · <span class="bad">${failed.size} file(s) failed to load</span>` : ''}${indexFromDisk ? '' : ' · <span class="bad">no audition index on disk: run npm run voices:audition</span>'}`;
  const issues = decisionIssues(decisions, index, ACCENT_REVIEW);
  const errs = issues.filter((i) => i.level === 'error').length;
  const warns = issues.length - errs;
  const box = app.querySelector('[data-issues]');
  if (box)
    box.innerHTML = `<h2>Checks</h2>
      <p>${chip(`${errs} error${errs === 1 ? '' : 's'}`, errs ? 'bad' : 'ok')} ${chip(`${warns} warning${warns === 1 ? '' : 's'}`, warns ? 'warn' : 'ok')}</p>
      <ul>${issues.map((i) => `<li class="${i.level}"><b>${esc(CAST_BRIEFS[i.character]?.name ?? i.character)}</b> ${esc(i.message)}</li>`).join('')}</ul>
      <p class="fine">The same rules as the release check: no placeholders, one base voice per character, licence cleared, no caricature.</p>`;
  // Nav chips follow decisions without re-rendering the main panel (keeps focus while typing).
  for (const who of CAST) {
    const el = app.querySelector(`[data-who="${who}"] .chips .chip`);
    if (!el) continue;
    const s = decisionOf(who).status;
    el.textContent = STATUS_LABELS[s];
    el.className = `chip ${decisionChip(s)}`;
  }
}

// --- Export / import / save ----------------------------------------------------------------------

function exportJson(): void {
  downloadJson(`casting-decisions-${decisions.updatedAt.slice(0, 10) || 'draft'}.json`, decisions);
  toast('Exported casting decisions as JSON.');
}

async function importJson(f: File): Promise<void> {
  try {
    const d = parseDecisions(JSON.parse(await f.text()) as unknown);
    if (typeof d === 'string') {
      toast(`Import failed: ${d}`, true);
      return;
    }
    decisions = d;
    for (const who of CAST) decisionOf(who);
    persist();
    renderShell();
    renderNav();
    renderMain();
    refreshDerived();
    toast(`Imported decisions from ${f.name}.`);
  } catch (e) {
    toast(`Import failed: ${(e as Error).message}`, true);
  }
}

// --- Boot ----------------------------------------------------------------------------------------

async function boot(): Promise<void> {
  let stored = false;
  try {
    const raw = localStorage.getItem(STORE);
    const d = raw ? parseDecisions(JSON.parse(raw) as unknown) : null;
    if (d && typeof d !== 'string') {
      decisions = d;
      stored = true;
    }
  } catch {
    /* corrupt or blocked storage: start fresh */
  }
  try {
    const r = await fetch(`${ROOT}index.json`, { cache: 'no-store' });
    if (r.ok) {
      index = (await r.json()) as AuditionIndex;
      indexFromDisk = true;
    }
  } catch {
    /* no index yet: every configured candidate shows as missing */
  }
  if (!stored) {
    // Nothing in this browser yet: pick up decisions saved to disk earlier.
    const saved = await loadFromDevServer('casting');
    const d = saved ? parseDecisions(saved) : null;
    if (d && typeof d !== 'string') decisions = d;
  }
  for (const who of CAST) decisionOf(who);
  const fromHash = location.hash.slice(1);
  if (CAST.includes(fromHash)) selected = fromHash;
  renderShell();
  renderNav();
  renderMain();
  refreshDerived();
}

// Read-only handle for the e2e test (tests/e2e/casting.spec.ts).
(window as unknown as { __casting: unknown }).__casting = {
  get index() {
    return index;
  },
  get decisions() {
    return decisions;
  },
  get issues() {
    return decisionIssues(decisions, index, ACCENT_REVIEW);
  },
  get failed() {
    return [...failed.keys()];
  },
  get measured() {
    return [...infos.entries()].map(([url, i]) => ({ url, duration: i.duration, ...i.report }));
  },
  player,
};

void boot();
