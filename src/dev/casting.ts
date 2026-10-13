// The voice-casting page (dev/casting.html, dev server only). Reads the audition index written by
// `npm run voices:audition`, shows each character's identity card and every candidate's takes side
// by side (waveform, duration, loudness), collects ratings and a casting decision per character,
// and exports them as JSON. Candidates without audio are shown as missing, with what they need.
// No audio is invented: only files in voice-auditions/ are played; provider pages are linked.
// The HTML lives in castingView.ts.

import '@fontsource/bowlby-one/400.css';
import '@fontsource/figtree/400.css';
import '@fontsource/figtree/600.css';
import '@fontsource/figtree/800.css';
import './dev.css';
import {
  auditionCoverage,
  buildAuditionIndex,
  type AuditionIndex,
  type IndexedCandidate,
} from '../data/voice/auditionIndex';
import { AUDITIONS } from '../data/voice/auditions';
import { CAST_BRIEFS, CASTING } from '../data/voice/casting';
import {
  averageRating,
  decisionIssues,
  emptyDecision,
  emptyDecisions,
  emptyReview,
  parseDecisions,
  STATUS_LABELS,
  type CastingDecisions,
  type DecisionStatus,
  type RatingKey,
} from '../data/voice/decision';
import { VOICE_PROFILES } from '../data/voice/profiles';
import {
  AUDITIONS_ROOT,
  chip,
  decisionChip,
  idCard,
  navCard,
  SHELL_HTML,
  takesGrid,
  takeUrl,
} from './castingView';
import { downloadJson, esc, fmt, loadFromDevServer, saveToDevServer, toast } from './devui';
import { createPlayer, drawWaveform, measureTake, type TakeInfo } from './takes';

const STORE = 'nwc.casting.v1';
const CAST = Object.keys(AUDITIONS);
/** Accents a native or heritage speaker must judge. */
const ACCENT_REVIEW = new Set(CAST.filter((c) => VOICE_PROFILES[c]?.accent !== 'australian'));

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

function renderShell(): void {
  app.innerHTML = SHELL_HTML;
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
  nav.innerHTML = CAST.map((who) =>
    navCard(who, who === selected, decisionOf(who), cov[who]?.real ?? 0),
  ).join('');
  nav.querySelectorAll<HTMLButtonElement>('[data-who]').forEach((btn) =>
    btn.addEventListener('click', () => {
      selected = btn.dataset.who as string;
      history.replaceState(null, '', `#${selected}`);
      renderNav();
      renderMain();
    }),
  );
}

function renderMain(): void {
  player.stop();
  const who = selected;
  const cands = index.candidates.filter((c) => c.character === who);
  const castable = cands.filter((c) => !c.pipelineTestOnly);
  const main = app.querySelector('[data-main]') as HTMLElement;
  main.innerHTML =
    idCard(who, decisionOf(who), castable, ACCENT_REVIEW.has(who)) +
    takesGrid(index.lines[who] ?? [], cands, (c) =>
      c.pipelineTestOnly ? null : reviewOf(who, c.slug),
    );
  wireMain(who, cands);
  for (const c of cands) for (const t of c.takes) void loadTake(takeUrl(t));
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
      player.sequence(cands.flatMap((c) => c.takes.filter((t) => t.line === line).map(takeUrl)));
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
    const r = await fetch(`${AUDITIONS_ROOT}index.json`, { cache: 'no-store' });
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
