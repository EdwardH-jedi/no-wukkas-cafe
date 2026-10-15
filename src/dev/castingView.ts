// HTML for the casting page (dev/casting.html): the page shell, a character's nav card and
// identity card, and the lines × candidates grid. Strings only; src/dev/casting.ts owns the state
// and wires the events.

import { CUSTOMERS } from '../data/customers';
import { VOICE_MANIFEST } from '../data/voice';
import type { AuditionTake, IndexedCandidate } from '../data/voice/auditionIndex';
import { CAST_BRIEFS, PROVIDER_INFO } from '../data/voice/casting';
import {
  averageRating,
  RATING_KEYS,
  RATING_LABELS,
  STATUS_LABELS,
  type CandidateReview,
  type CharacterDecision,
  type DecisionStatus,
} from '../data/voice/decision';
import { voiceScript } from '../data/voice/script';
import { esc } from './devui';
import { GAZ_LOOK, portraitSvg } from './portrait';

/** Where audition files are served (scripts/vite-dev-tools.ts). */
export const AUDITIONS_ROOT = '/__auditions/';
export const takeUrl = (t: AuditionTake): string => AUDITIONS_ROOT + t.file;

export const chip = (text: string, kind: string): string =>
  `<span class="chip ${kind}">${esc(text)}</span>`;
export const decisionChip = (s: DecisionStatus): string =>
  s === 'cast' ? 'ok' : s === 'undecided' ? 'muted' : 'info';

const STATUS_CHIP: Record<IndexedCandidate['status'], [string, string]> = {
  ready: ['Audio: all lines', 'ok'],
  partial: ['Audio: some lines missing', 'warn'],
  missing: ['No audio yet', 'bad'],
  placeholder: ['Pipeline test: not a candidate', 'muted'],
};

const lineCounts = new Map<string, number>();
for (const l of voiceScript()) lineCounts.set(l.speaker, (lineCounts.get(l.speaker) ?? 0) + 1);

/** What the game uses for a character today (placeholder voices), and who shares it. */
export function todayVoice(who: string): { label: string; shared: string[]; pitched: boolean } {
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
const nameOf = (who: string): string => CAST_BRIEFS[who]?.name ?? who;

export const SHELL_HTML = `
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

export function navCard(
  who: string,
  on: boolean,
  d: CharacterDecision,
  realCandidates: number,
): string {
  return `<button class="castcard${on ? ' on' : ''}" data-who="${who}" aria-current="${on}">
      <span class="face">${portraitSvg(lookFor(who), nameOf(who))}</span>
      <span class="who"><b>${esc(nameOf(who))}</b><small>${esc(CAST_BRIEFS[who]?.accent ?? '')}</small>
      <span class="chips">${chip(STATUS_LABELS[d.status], decisionChip(d.status))}${chip(realCandidates ? `${realCandidates} with audio` : 'no real audio', realCandidates ? 'ok' : 'bad')}</span></span>
    </button>`;
}

/** The identity card with the decision form, and the "no real audio" banner when it applies. */
export function idCard(
  who: string,
  d: CharacterDecision,
  castable: readonly IndexedCandidate[],
  accentReview: boolean,
): string {
  const b = CAST_BRIEFS[who];
  const today = todayVoice(who);
  const statuses = Object.keys(STATUS_LABELS) as DecisionStatus[];
  return `
  <section class="idcard">
    <div class="portrait">${portraitSvg(lookFor(who), nameOf(who))}</div>
    <div class="brief">
      <h2>${esc(nameOf(who))} <span class="age">${esc(b?.age ?? '')}</span></h2>
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
        ${statuses.map((s) => `<option value="${s}" ${d.status === s ? 'selected' : ''}>${STATUS_LABELS[s]}</option>`).join('')}
      </select></label>
      <label class="field"><span>Candidate</span><select data-chosen>
        <option value="">—</option>
        ${castable.map((c) => `<option value="${c.slug}" ${d.chosen === c.slug ? 'selected' : ''}>${esc(c.voice)} (${c.provider}${c.status === 'ready' ? '' : `, ${c.status}`})</option>`).join('')}
      </select></label>
      ${accentReview ? `<label class="tick"><input type="checkbox" data-speaks ${d.reviewerSpeaksAccent ? 'checked' : ''}> I'm a native or heritage speaker of ${esc(b?.accent.split(' (')[0] ?? 'this accent')}</label>` : ''}
      <textarea data-dnotes aria-label="Decision notes" placeholder="Decision notes">${esc(d.notes)}</textarea>
    </form>
  </section>
  ${castable.every((c) => c.status === 'missing') ? `<p class="banner" data-no-audio>No real audition audio for ${esc(nameOf(who))} yet. Every candidate below is waiting on a recording or an approved render. Use the provider links to listen on their own sites.</p>` : ''}`;
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
      const url = esc(takeUrl(t));
      const name = t.file.split('/').pop() ?? '';
      return `<div class="take" data-url="${url}">
        <button class="play" data-play="${url}" aria-label="Play ${esc(c.voice)} line ${line + 1} (${esc(name)})">▶</button>
        <canvas class="wave" data-wave="${url}" aria-hidden="true"></canvas>
        <p class="stats" data-stats="${url}">measuring…</p>
      </div>`;
    })
    .join('')}</div>`;
}

function reviewForm(c: IndexedCandidate, r: CandidateReview | null): string {
  if (c.pipelineTestOnly || !r)
    return `<div class="review off"><p>Placeholder voice: not rated, can't be cast.</p></div>`;
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

/** Audition lines down, candidates across: headers, takes, reviews. */
export function takesGrid(
  lines: readonly string[],
  cands: readonly IndexedCandidate[],
  reviewOf: (c: IndexedCandidate) => CandidateReview | null,
): string {
  return `<div class="gridwrap" tabindex="0" aria-label="Audition takes, lines by candidate">
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
      ${cands.map((c) => reviewForm(c, reviewOf(c))).join('')}
    </div>
  </div>`;
}
