import { describe, expect, it } from 'vitest';
import { buildAuditionIndex, type FoundCandidate } from '../../src/data/voice/auditionIndex';
import type { Candidate } from '../../src/data/voice/casting';
import {
  averageRating,
  decisionIssues,
  emptyDecisions,
  emptyReview,
  parseDecisions,
  type CastingDecisions,
} from '../../src/data/voice/decision';

const lines = { gaz: ['a', 'b'], dazza: ['c', 'd'], mei: ['e', 'f'] };
const casting: Record<string, readonly Candidate[]> = {
  gaz: [{ provider: 'azure', voice: 'en-AU-DuncanNeural', note: '' }],
  dazza: [
    { provider: 'azure', voice: 'en-AU-NeilNeural', note: '' },
    { provider: 'azure', voice: 'en-AU-KenNeural', note: '' },
  ],
  mei: [{ provider: 'files', voice: 'mei-actor-a', note: '' }],
};
const full = (who: string, slug: string, info: FoundCandidate['info'] = {}): FoundCandidate => ({
  character: who,
  slug,
  info,
  takes: [0, 1].map((i) => ({ file: `${who}/${slug}/${i + 1}.mp3`, line: i, duration: 1 })),
});
const index = buildAuditionIndex({
  lines,
  casting,
  generatedAt: 'now',
  found: [
    full('gaz', 'azure-en-AU-DuncanNeural'),
    full('dazza', 'azure-en-AU-NeilNeural'),
    full('mei', 'files-mei-actor-a', { performer: 'Actor M' }),
    full('mei', 'macos-Tingting', { provider: 'macos', voice: 'Tingting', pipelineTestOnly: true }),
    // Delivered takes for Dazza by the same performer as Mei's.
    full('dazza', 'files-dupe', { provider: 'files', voice: 'dupe', performer: 'Actor M' }),
  ],
});
const accentReview = new Set(['mei']);
const fresh = (): CastingDecisions => emptyDecisions(['gaz', 'dazza', 'mei'], 'now');

function cast(d: CastingDecisions, who: string, slug: string, cleared = true): void {
  const c = d.characters[who]!;
  c.status = 'cast';
  c.chosen = slug;
  c.candidates[slug] = { ...emptyReview(), licenceCleared: cleared, ratings: { accent: 4 } };
}

describe('decisionIssues', () => {
  it('a fresh set has only "not decided" warnings', () => {
    const issues = decisionIssues(fresh(), index, accentReview);
    expect(issues.map((i) => i.level)).toEqual(['warning', 'warning', 'warning']);
  });

  it('a clean cast of distinct, licensed, fully-heard voices passes', () => {
    const d = fresh();
    cast(d, 'gaz', 'azure-en-AU-DuncanNeural');
    cast(d, 'dazza', 'azure-en-AU-NeilNeural');
    cast(d, 'mei', 'files-mei-actor-a');
    d.characters.mei!.reviewerSpeaksAccent = true;
    expect(decisionIssues(d, index, accentReview)).toEqual([]);
  });

  it('refuses placeholders, uncleared licences, caricature, and unheard candidates', () => {
    const d = fresh();
    cast(d, 'mei', 'macos-Tingting');
    cast(d, 'gaz', 'azure-en-AU-DuncanNeural', false);
    cast(d, 'dazza', 'azure-en-AU-KenNeural');
    d.characters.dazza!.candidates['azure-en-AU-KenNeural']!.caricatureRisk = true;
    const msgs = decisionIssues(d, index, accentReview)
      .filter((i) => i.level === 'error')
      .map((i) => `${i.character}: ${i.message}`);
    expect(msgs).toContainEqual(expect.stringMatching(/^mei: .*placeholder/));
    expect(msgs).toContainEqual(expect.stringMatching(/^gaz: Licence .* not cleared/));
    expect(msgs).toContainEqual(expect.stringMatching(/^dazza: Cast without hearing/));
    expect(msgs).toContainEqual(expect.stringMatching(/^dazza: .*caricature/));
  });

  it('two characters can never share a base voice', () => {
    const d = fresh();
    cast(d, 'mei', 'files-mei-actor-a');
    cast(d, 'dazza', 'files-dupe');
    const shared = decisionIssues(d, index, accentReview).filter((i) =>
      /Shares a base voice/.test(i.message),
    );
    expect(shared).toHaveLength(1);
    expect(shared[0]?.message).toMatch(/performer:Actor M/);
  });

  it('warns when an L2 accent was not checked by a speaker of it', () => {
    const d = fresh();
    cast(d, 'mei', 'files-mei-actor-a');
    const w = decisionIssues(d, index, accentReview).filter((i) => i.character === 'mei');
    expect(w).toEqual([expect.objectContaining({ level: 'warning' })]);
    expect(w[0]?.message).toMatch(/native or heritage speaker/);
  });

  it('a shortlist needs a chosen candidate that exists', () => {
    const d = fresh();
    d.characters.gaz!.status = 'shortlist';
    d.characters.dazza!.status = 'shortlist';
    d.characters.dazza!.chosen = 'nobody';
    const errs = decisionIssues(d, index, accentReview).filter((i) => i.level === 'error');
    expect(errs.map((e) => e.character)).toEqual(['gaz', 'dazza']);
  });
});

describe('parseDecisions', () => {
  it('round-trips an exported file', () => {
    const d = emptyDecisions(['gaz', 'mei'], '2026-10-14T00:00:00.000Z');
    d.reviewer = 'Edward';
    cast(d, 'gaz', 'azure-en-AU-DuncanNeural');
    d.characters.gaz!.candidates['azure-en-AU-DuncanNeural']!.notes = 'dry, good timing';
    expect(parseDecisions(JSON.parse(JSON.stringify(d)))).toEqual(d);
  });

  it('rejects other files, unknown statuses and out-of-range ratings', () => {
    expect(parseDecisions({ kind: 'other' })).toMatch(/Not a casting decisions file/);
    const bad = emptyDecisions(['gaz'], 'now');
    bad.characters.gaz!.candidates.x = { ...emptyReview(), ratings: { naturalness: 7 } };
    expect(parseDecisions(JSON.parse(JSON.stringify(bad)))).toMatch(/naturalness must be 1–5/);
    const st = JSON.parse(JSON.stringify(emptyDecisions(['gaz'], 'now'))) as {
      characters: { gaz: { status: string } };
    };
    st.characters.gaz.status = 'toString';
    expect(parseDecisions(st)).toMatch(/unknown status/);
  });
});

describe('averageRating', () => {
  it('averages only the ratings given', () => {
    expect(averageRating(undefined)).toBeNull();
    expect(averageRating({ ...emptyReview(), ratings: { naturalness: 4, acting: 2 } })).toBe(3);
  });
});
