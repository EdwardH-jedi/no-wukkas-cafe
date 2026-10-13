// The audition index: every casting candidate per character, the takes found on disk for it, and
// what is missing. Written by `npm run voices:audition` to voice-auditions/index.json and read by
// the casting page (dev/casting.html). Pure: the script does the file system, this does the logic.
//
// A candidate configured in CASTING with no takes is still listed, as "missing", so the casting
// page can show what needs recording instead of quietly leaving it out.

import type { Candidate, Provider } from './casting';

export interface AuditionTake {
  /** 0-based audition line, or null when the file name doesn't start with a line number. */
  line: number | null;
  /** Path under voice-auditions/: "<character>/<slug>/<file>". */
  file: string;
  /** Seconds, measured from the file. */
  duration: number;
}

/** Where delivered takes came from, read from candidate.json (or source.json beside imports). */
export interface TakeSource {
  licence?: string;
  /** Contract, order or URL the takes came from. */
  source?: string;
  /** Who performed (actor) or which provider voice. */
  performer?: string;
}

/** A candidate folder found under voice-auditions/<character>/. */
export interface FoundCandidate {
  character: string;
  slug: string;
  info: Partial<Candidate> & TakeSource & { pipelineTestOnly?: boolean };
  takes: AuditionTake[];
}

/** placeholder: macOS pipeline test, never castable; ready: a take for every line; partial: some
 *  lines missing; missing: no audio at all. "ready" says nothing about the licence. */
export type CandidateStatus = 'placeholder' | 'ready' | 'partial' | 'missing';

export interface IndexedCandidate {
  character: string;
  slug: string;
  provider: Provider;
  voice: string;
  note: string;
  /** Listed in CASTING (a real candidate), as opposed to only found on disk. */
  configured: boolean;
  pipelineTestOnly: boolean;
  licence: string | null;
  source: string | null;
  takes: AuditionTake[];
  /** Audition lines (0-based) with no take. */
  missingLines: number[];
  status: CandidateStatus;
  /** What's needed before this candidate can be heard, for the missing-asset indicator. */
  needs: string | null;
  /** The base voice. Two characters may never share one (docs/VOICE_CASTING.md). */
  identity: string;
}

export interface AuditionIndex {
  version: 1;
  generatedAt: string;
  /** Audition lines per character, in order. */
  lines: Record<string, readonly string[]>;
  candidates: IndexedCandidate[];
}

/** Folder name for a candidate's takes. */
export const candidateSlug = (c: Pick<Candidate, 'provider' | 'voice'>): string =>
  `${c.provider}-${c.voice}`.replace(/[^\w.-]+/g, '_');

/** Which audition line a take file belongs to: "2.mp3", "2b.mp3" and "02-take3.wav" are line 2. */
export function lineOfTake(fileName: string, lineCount: number): number | null {
  const m = /^(\d+)/.exec(fileName);
  if (!m) return null;
  const n = Number(m[1]);
  return n >= 1 && n <= lineCount ? n - 1 : null;
}

const PROVIDERS: readonly Provider[] = ['macos', 'files', 'azure', 'google'];
const asProvider = (p: unknown): Provider =>
  PROVIDERS.includes(p as Provider) ? (p as Provider) : 'files';

const NEEDS: Record<Provider, string> = {
  macos: 'Render the pipeline test: npm run voices:audition -- --pipeline-test.',
  files:
    'Awaiting recordings from the actor or provider: import them with npm run voices:audition -- --import <dir>.',
  azure:
    'Not rendered: Azure needs Edward to approve the spend (--allow-paid) and AZURE_SPEECH_KEY / AZURE_SPEECH_REGION.',
  google:
    "Not rendered: no Google Cloud account and no renderer yet. Hear it on Google's public voice list.",
};

const byLineThenFile = (a: AuditionTake, b: AuditionTake): number =>
  (a.line ?? 99) - (b.line ?? 99) || (a.file < b.file ? -1 : a.file > b.file ? 1 : 0);

export function buildAuditionIndex(opts: {
  lines: Record<string, readonly string[]>;
  casting: Record<string, readonly Candidate[]>;
  found: readonly FoundCandidate[];
  generatedAt: string;
}): AuditionIndex {
  const { lines, casting, found } = opts;
  const out: IndexedCandidate[] = [];
  const used = new Set<FoundCandidate>();

  const entry = (
    character: string,
    c: Pick<Candidate, 'provider' | 'voice'> & { note?: string },
    hit: FoundCandidate | undefined,
    configured: boolean,
  ): IndexedCandidate => {
    const count = lines[character]?.length ?? 0;
    const takes = [...(hit?.takes ?? [])].sort(byLineThenFile);
    const heard = new Set(takes.map((t) => t.line));
    const missingLines = Array.from({ length: count }, (_, i) => i).filter((i) => !heard.has(i));
    const pipelineTestOnly = c.provider === 'macos' || hit?.info.pipelineTestOnly === true;
    const status: CandidateStatus = pipelineTestOnly
      ? 'placeholder'
      : takes.length === 0
        ? 'missing'
        : missingLines.length
          ? 'partial'
          : 'ready';
    const needs =
      takes.length === 0
        ? NEEDS[c.provider]
        : missingLines.length
          ? `Missing take(s) for line ${missingLines.map((i) => i + 1).join(', ')}.`
          : null;
    const performer = hit?.info.performer;
    return {
      character,
      slug: hit?.slug ?? candidateSlug(c),
      provider: c.provider,
      voice: c.voice,
      note: c.note ?? hit?.info.note ?? '',
      configured,
      pipelineTestOnly,
      licence: hit?.info.licence ?? null,
      source: hit?.info.source ?? null,
      takes,
      missingLines,
      status,
      needs,
      identity:
        c.provider === 'files' && performer ? `performer:${performer}` : `${c.provider}:${c.voice}`,
    };
  };

  for (const [character, cands] of Object.entries(casting))
    for (const c of cands) {
      const hit = found.find((f) => f.character === character && f.slug === candidateSlug(c));
      if (hit) used.add(hit);
      out.push(entry(character, c, hit, true));
    }
  for (const f of found) {
    if (used.has(f) || !lines[f.character]) continue;
    const provider = asProvider(f.info.provider);
    const voice = f.info.voice ?? f.slug.replace(/^[a-z]+-/, '');
    out.push(entry(f.character, { provider, voice, note: f.info.note ?? '' }, f, false));
  }
  return { version: 1, generatedAt: opts.generatedAt, lines, candidates: out };
}

/** Per character: candidates that can actually be heard, placeholders, and ones with no audio. */
export function auditionCoverage(
  index: AuditionIndex,
): Record<string, { real: number; placeholder: number; missing: number }> {
  const out: Record<string, { real: number; placeholder: number; missing: number }> = {};
  for (const who of Object.keys(index.lines)) out[who] = { real: 0, placeholder: 0, missing: 0 };
  for (const c of index.candidates) {
    const o = out[c.character];
    if (!o) continue;
    if (c.status === 'placeholder') o.placeholder++;
    else if (c.status === 'missing') o.missing++;
    else o.real++;
  }
  return out;
}
