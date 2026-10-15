import { describe, expect, it } from 'vitest';
import {
  auditionCoverage,
  buildAuditionIndex,
  candidateSlug,
  lineOfTake,
  type FoundCandidate,
} from '../../src/data/voice/auditionIndex';
import { AUDITIONS } from '../../src/data/voice/auditions';
import { CASTING, PIPELINE_TEST, type Candidate } from '../../src/data/voice/casting';

const lines = { gaz: ['a', 'b', 'c'], mei: ['x', 'y'] };
const casting: Record<string, readonly Candidate[]> = {
  gaz: [
    { provider: 'azure', voice: 'en-AU-DuncanNeural', note: 'dry' },
    { provider: 'files', voice: 'gaz-actor-a', note: 'actor' },
  ],
  mei: [{ provider: 'files', voice: 'mei-actor-a', note: 'L2 speaker' }],
};
const take = (who: string, slug: string, f: string, line: number | null) => ({
  file: `${who}/${slug}/${f}`,
  line,
  duration: 1.5,
});
const build = (found: FoundCandidate[]) =>
  buildAuditionIndex({ lines, casting, found, generatedAt: '2026-10-14T00:00:00.000Z' });

describe('lineOfTake', () => {
  it('reads the leading line number, 1-based, within the line count', () => {
    expect(lineOfTake('1.mp3', 3)).toBe(0);
    expect(lineOfTake('2b.mp3', 3)).toBe(1);
    expect(lineOfTake('03-take2.mp3', 3)).toBe(2);
    expect(lineOfTake('4.mp3', 3)).toBeNull();
    expect(lineOfTake('0.mp3', 3)).toBeNull();
    expect(lineOfTake('greeting.mp3', 3)).toBeNull();
  });
});

describe('buildAuditionIndex', () => {
  it('lists every configured candidate, as missing when nothing was rendered or delivered', () => {
    const idx = build([]);
    expect(idx.candidates).toHaveLength(3);
    for (const c of idx.candidates) {
      expect(c.status).toBe('missing');
      expect(c.configured).toBe(true);
      expect(c.missingLines).toHaveLength(lines[c.character as 'gaz' | 'mei'].length);
    }
    const azure = idx.candidates.find((c) => c.provider === 'azure');
    expect(azure?.needs).toMatch(/approve the spend/);
    expect(idx.candidates.find((c) => c.voice === 'mei-actor-a')?.needs).toMatch(/--import/);
  });

  it('matches delivered takes to the candidate, marks partial sets and records the licence', () => {
    const slug = candidateSlug({ provider: 'files', voice: 'gaz-actor-a' });
    expect(slug).toBe('files-gaz-actor-a');
    const idx = build([
      {
        character: 'gaz',
        slug,
        info: { provider: 'files', voice: 'gaz-actor-a', licence: 'Buyout #12', performer: 'A' },
        takes: [take('gaz', slug, '3.mp3', 2), take('gaz', slug, '1.mp3', 0)],
      },
    ]);
    const c = idx.candidates.find((x) => x.slug === slug);
    expect(c?.status).toBe('partial');
    expect(c?.missingLines).toEqual([1]);
    expect(c?.needs).toBe('Missing take(s) for line 2.');
    expect(c?.licence).toBe('Buyout #12');
    expect(c?.identity).toBe('performer:A');
    expect(c?.takes.map((t) => t.line)).toEqual([0, 2]);
  });

  it('a candidate with every line is ready; extra takes of a line are kept', () => {
    const slug = 'files-mei-actor-a';
    const idx = build([
      {
        character: 'mei',
        slug,
        info: {},
        takes: [
          take('mei', slug, '1.mp3', 0),
          take('mei', slug, '1b.mp3', 0),
          take('mei', slug, '2.mp3', 1),
        ],
      },
    ]);
    const c = idx.candidates.find((x) => x.slug === slug);
    expect(c?.status).toBe('ready');
    expect(c?.needs).toBeNull();
    expect(c?.takes).toHaveLength(3);
  });

  it('macOS pipeline-test takes are listed apart and never count as candidates', () => {
    const idx = build([
      {
        character: 'gaz',
        slug: 'macos-Karen',
        info: { provider: 'macos', voice: 'Karen', pipelineTestOnly: true },
        takes: [0, 1, 2].map((i) => take('gaz', 'macos-Karen', `${i + 1}.mp3`, i)),
      },
    ]);
    const c = idx.candidates.find((x) => x.slug === 'macos-Karen');
    expect(c?.configured).toBe(false);
    expect(c?.pipelineTestOnly).toBe(true);
    expect(c?.status).toBe('placeholder');
    expect(auditionCoverage(idx).gaz).toEqual({ real: 0, placeholder: 1, missing: 2 });
  });

  it('ignores folders for characters that have no audition lines', () => {
    const idx = build([{ character: 'ghost', slug: 'files-x', info: {}, takes: [] }]);
    expect(idx.candidates.some((c) => c.character === 'ghost')).toBe(false);
  });

  it('works on the real casting data: seven characters, nothing castable rendered yet', () => {
    const found: FoundCandidate[] = Object.entries(PIPELINE_TEST).map(([who, c]) => ({
      character: who,
      slug: candidateSlug(c),
      info: { ...c, pipelineTestOnly: true },
      takes: (AUDITIONS[who] ?? []).map((_, i) => take(who, candidateSlug(c), `${i + 1}.mp3`, i)),
    }));
    const idx = buildAuditionIndex({
      lines: AUDITIONS,
      casting: CASTING,
      found,
      generatedAt: 'now',
    });
    const cov = auditionCoverage(idx);
    expect(Object.keys(cov)).toHaveLength(7);
    for (const v of Object.values(cov)) expect(v.real).toBe(0);
    expect(Object.values(cov).reduce((s, v) => s + v.placeholder, 0)).toBe(4);
  });
});
