// Casting decisions: the ratings Edward and reviewers give each audition candidate, the choice per
// character, and the rules a decision must pass (docs/VOICE_CASTING.md). Exported from the casting
// page (dev/casting.html) as JSON; this module is pure so the rules are unit-tested.
//
// The rules mirror the release validator: no placeholders, one base voice per character, licence
// cleared, no caricature, and accents judged by people who speak that way.

import type { AuditionIndex, IndexedCandidate } from './auditionIndex';

export const RATING_KEYS = ['naturalness', 'accent', 'acting', 'intelligibility', 'fit'] as const;
export type RatingKey = (typeof RATING_KEYS)[number];

export const RATING_LABELS: Record<RatingKey, string> = {
  naturalness: 'Naturalness',
  accent: 'Accent authenticity',
  acting: 'Acting and emotion',
  intelligibility: 'Intelligibility',
  fit: 'Fit to the brief',
};

export interface CandidateReview {
  /** 1–5; absent = not rated yet. */
  ratings: Partial<Record<RatingKey, number>>;
  caricatureRisk: boolean;
  licenceCleared: boolean;
  notes: string;
}

export type DecisionStatus = 'undecided' | 'shortlist' | 'cast' | 'more-auditions' | 'human-actor';

export const STATUS_LABELS: Record<DecisionStatus, string> = {
  undecided: 'Undecided',
  shortlist: 'Shortlisted',
  cast: 'Cast',
  'more-auditions': 'Needs more auditions',
  'human-actor': 'Needs a human actor',
};

export interface CharacterDecision {
  status: DecisionStatus;
  /** Candidate slug, when shortlisted or cast. */
  chosen: string | null;
  /** The reviewer is a native or heritage speaker of this character's accent. */
  reviewerSpeaksAccent: boolean;
  notes: string;
  /** Reviews by candidate slug. */
  candidates: Record<string, CandidateReview>;
}

export interface CastingDecisions {
  kind: 'nwc-casting-decisions';
  version: 1;
  reviewer: string;
  updatedAt: string;
  characters: Record<string, CharacterDecision>;
}

export interface DecisionIssue {
  level: 'error' | 'warning';
  character: string;
  message: string;
}

export const emptyReview = (): CandidateReview => ({
  ratings: {},
  caricatureRisk: false,
  licenceCleared: false,
  notes: '',
});

export const emptyDecision = (): CharacterDecision => ({
  status: 'undecided',
  chosen: null,
  reviewerSpeaksAccent: false,
  notes: '',
  candidates: {},
});

export function emptyDecisions(characters: readonly string[], now: string): CastingDecisions {
  return {
    kind: 'nwc-casting-decisions',
    version: 1,
    reviewer: '',
    updatedAt: now,
    characters: Object.fromEntries(characters.map((c) => [c, emptyDecision()])),
  };
}

/** Mean of the ratings given, or null if none. */
export function averageRating(r: CandidateReview | undefined): number | null {
  const v = Object.values(r?.ratings ?? {}).filter((x): x is number => typeof x === 'number');
  return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null;
}

/**
 * Everything wrong with a set of decisions, against the audition index.
 * `accentReview`: characters whose accent must be judged by a native or heritage speaker.
 */
export function decisionIssues(
  d: CastingDecisions,
  index: AuditionIndex,
  accentReview: ReadonlySet<string>,
): DecisionIssue[] {
  const issues: DecisionIssue[] = [];
  const err = (character: string, message: string): void => {
    issues.push({ level: 'error', character, message });
  };
  const warn = (character: string, message: string): void => {
    issues.push({ level: 'warning', character, message });
  };
  const castBy = new Map<string, string>();

  for (const who of Object.keys(index.lines)) {
    const dec = d.characters[who];
    if (!dec || dec.status === 'undecided') {
      warn(who, 'Not decided yet.');
      continue;
    }
    if (dec.status !== 'cast' && dec.status !== 'shortlist') continue;
    if (!dec.chosen) {
      err(who, `Marked "${STATUS_LABELS[dec.status]}" but no candidate is chosen.`);
      continue;
    }
    const cand: IndexedCandidate | undefined = index.candidates.find(
      (c) => c.character === who && c.slug === dec.chosen,
    );
    if (!cand) {
      err(who, `Chosen candidate "${dec.chosen}" is not in the audition index.`);
      continue;
    }
    if (cand.pipelineTestOnly) {
      err(who, `${cand.voice} is a placeholder pipeline-test voice and can never be cast.`);
      continue;
    }
    if (dec.status !== 'cast') continue;
    const review = dec.candidates[cand.slug];
    if (cand.status !== 'ready')
      err(who, `Cast without hearing every audition line (${cand.status}).`);
    if (!review?.licenceCleared) err(who, `Licence for ${cand.voice} is not cleared.`);
    if (review?.caricatureRisk) err(who, `${cand.voice} is flagged as a caricature risk.`);
    const other = castBy.get(cand.identity);
    if (other)
      err(
        who,
        `Shares a base voice (${cand.identity}) with ${other}: every character needs its own.`,
      );
    else castBy.set(cand.identity, who);
    if (review?.ratings.accent === undefined)
      warn(who, 'Cast without an accent-authenticity rating.');
    if (accentReview.has(who) && !dec.reviewerSpeaksAccent)
      warn(
        who,
        "Accent authenticity should be confirmed by a native or heritage speaker of this character's accent.",
      );
  }
  return issues;
}

const isObj = (x: unknown): x is Record<string, unknown> =>
  typeof x === 'object' && x !== null && !Array.isArray(x);

/** Validate an imported decisions file. Returns the decisions or a message saying what's wrong. */
export function parseDecisions(json: unknown): CastingDecisions | string {
  if (!isObj(json) || json.kind !== 'nwc-casting-decisions' || json.version !== 1)
    return 'Not a casting decisions file (kind "nwc-casting-decisions", version 1).';
  if (!isObj(json.characters)) return 'Missing "characters".';
  const characters: Record<string, CharacterDecision> = {};
  for (const [who, raw] of Object.entries(json.characters)) {
    if (!isObj(raw)) return `${who}: not an object.`;
    const status = raw.status as DecisionStatus;
    if (!Object.hasOwn(STATUS_LABELS, status))
      return `${who}: unknown status "${String(raw.status)}".`;
    const candidates: Record<string, CandidateReview> = {};
    for (const [slug, r] of Object.entries(isObj(raw.candidates) ? raw.candidates : {})) {
      if (!isObj(r)) return `${who}/${slug}: not an object.`;
      const ratings: Partial<Record<RatingKey, number>> = {};
      for (const k of RATING_KEYS) {
        const v = isObj(r.ratings) ? r.ratings[k] : undefined;
        if (v === undefined || v === null) continue;
        if (typeof v !== 'number' || !Number.isInteger(v) || v < 1 || v > 5)
          return `${who}/${slug}: ${k} must be 1–5.`;
        ratings[k] = v;
      }
      candidates[slug] = {
        ratings,
        caricatureRisk: r.caricatureRisk === true,
        licenceCleared: r.licenceCleared === true,
        notes: typeof r.notes === 'string' ? r.notes : '',
      };
    }
    characters[who] = {
      status,
      chosen: typeof raw.chosen === 'string' && raw.chosen ? raw.chosen : null,
      reviewerSpeaksAccent: raw.reviewerSpeaksAccent === true,
      notes: typeof raw.notes === 'string' ? raw.notes : '',
      candidates,
    };
  }
  return {
    kind: 'nwc-casting-decisions',
    version: 1,
    reviewer: typeof json.reviewer === 'string' ? json.reviewer : '',
    updatedAt: typeof json.updatedAt === 'string' ? json.updatedAt : '',
    characters,
  };
}
