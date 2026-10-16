// The listen-through sheet for the licensed voice pass (docs/TODO.md Phase 3): one section per
// speaker of the release cast with their brief, cast, licence status and every line, as JSON and
// Markdown in voice-auditions/ (gitignored).
//  - TTS speakers: each line with its staged clip (voice-cache/licensed/, after a paid render) and
//    empty review fields: natural, clear at Easy, accent authentic, caricature, approve or re-cast.
//  - Actors: the recording script, every line with the file name to deliver it as, for
//    `npm run voices:render -- --import <dir>`.
//
//   npm run voices:sheet

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { CACHE_DIR, ROOT } from './voice-node.ts';

const { voiceScript } = await import('../src/data/voice/script.ts');
const { CAST, CAST_BRIEFS } = await import('../src/data/voice/casting.ts');
const { SEGMENT_INVENTORY } = await import('../src/data/voice/segments.ts');
const { voicePlan } = await import('./voices-plan.ts');
type PlanJob = import('./voices-plan.ts').PlanJob;

const OUT = process.env.VOICES_AUDITIONS ?? join(ROOT, 'voice-auditions');
const INDEX = join(CACHE_DIR, 'licensed', 'index.json');
const staged = new Map(
  existsSync(INDEX)
    ? (
        JSON.parse(readFileSync(INDEX, 'utf8')) as {
          clips: Array<{ id: string; kind: string; duration: number }>;
        }
      ).clips.map((c) => [`${c.kind}:${c.id}`, c])
    : [],
);

const plan = voicePlan(voiceScript(), CAST, SEGMENT_INVENTORY);
const REVIEW = {
  natural: null,
  clearAtEasy: null,
  accentAuthentic: null,
  caricature: null,
  verdict: null,
  notes: '',
};

/** The file an actor delivers a line as (the importer matches it to the clip). */
const deliverAs = (j: PlanJob): string =>
  j.kind === 'segment' ? `segments/${j.id}.wav` : `${basename(j.file, '.mp3')}.wav`;

const speakers = Object.entries(CAST).map(([speaker, cast]) => {
  const jobs = [...plan.tts, ...plan.recorded].filter((j) => j.speaker === speaker);
  const line = (j: PlanJob) => {
    const s = staged.get(`${j.kind}:${j.id}`);
    return {
      id: j.id,
      kind: j.kind,
      key: j.key,
      delivery: j.delivery,
      text: j.text,
      ...(cast.provenance === 'recorded'
        ? { deliverAs: deliverAs(j) }
        : {
            staged: s
              ? {
                  file: `voice-cache/licensed/${j.file.slice('assets/voice/'.length)}`,
                  duration: s.duration,
                }
              : null,
          }),
    };
  };
  return {
    speaker,
    brief: CAST_BRIEFS[speaker] ?? null,
    cast,
    lines: jobs.filter((j) => j.kind === 'line').map(line),
    // Generated-order segments: they ship once promoted or imported into the segment manifest.
    segments: jobs.filter((j) => j.kind === 'segment').map(line),
    review: { ...REVIEW },
  };
});

const generatedOn = new Date().toISOString().slice(0, 10);
mkdirSync(OUT, { recursive: true });
writeFileSync(
  join(OUT, 'review-sheet.json'),
  `${JSON.stringify({ generatedOn, speakers }, null, 2)}\n`,
);

const md: string[] = [
  '# Voice listen-through and recording sheet',
  '',
  `Generated ${generatedOn} by \`npm run voices:sheet\` (docs/TODO.md Phase 3). Not committed.`,
  '',
  '## How to review',
  '',
  "- Listen to each TTS speaker's staged clips (`voice-cache/licensed/`, after `npm run voices:render -- --allow-paid`),",
  '  or their auditions on the casting page (`npm run dev`, then `/dev/casting.html`).',
  '- Reviewers: native Korean, Mandarin and Indian-English speakers for Jiwoo, Mei and Priya; anyone for the Australians.',
  '- **Caricature check (AGENTS.md §6): the accent is the puzzle, never the joke.** Flag any line that sounds like',
  '  mockery, exaggeration or a stereotype, whoever says it.',
  '- Per speaker: natural (1–5), clear at Easy on first hearing (y/n), accent authentic (y/n), caricature (y/n),',
  '  verdict (approve / re-cast), notes. Fill `review` in review-sheet.json or note it here.',
  '- Actors deliver one WAV per line named as in the table (`<file>-slow.wav` is the slower "could you repeat that?"',
  '  take), in a folder per speaker with `source.json` `{ "licence": "…signed terms…", "performer": "…" }`, then',
  '  `npm run voices:render -- --import <folder>`.',
  '',
];
for (const s of speakers) {
  const b = s.brief;
  md.push(`## ${b?.name ?? s.speaker} (${s.speaker})`, '');
  if (b) md.push(`${b.role}. ${b.age}, ${b.accent}. ${b.voice}`, '');
  md.push(
    s.cast.provenance === 'recorded'
      ? `**Recorded by an actor** (\`${s.cast.voice}\`). Licence: ${s.cast.pending ?? s.cast.licence}`
      : `**Licensed TTS:** ${s.cast.voice}${s.cast.rate ? ` at ${s.cast.rate}×` : ''}. Licence: ${s.cast.licence}`,
    '',
    '| natural 1–5 | clear at Easy | accent authentic | caricature | verdict | notes |',
    '|---|---|---|---|---|---|',
    '|  |  |  |  |  |  |',
    '',
  );
  const table = (rows: typeof s.lines, title: string): void => {
    if (!rows.length) return;
    md.push(`### ${title} (${rows.length})`, '');
    if (s.cast.provenance === 'recorded') {
      md.push('| deliver as | delivery | line |', '|---|---|---|');
      for (const l of rows)
        md.push(
          `| \`${'deliverAs' in l ? l.deliverAs : ''}\` | ${l.delivery} | ${l.text.replace(/\|/g, '\\|')} |`,
        );
    } else {
      md.push('| key | delivery | line | staged |', '|---|---|---|---|');
      for (const l of rows) {
        const st = 'staged' in l && l.staged ? `${l.staged.duration.toFixed(1)} s` : 'not yet';
        md.push(`| ${l.key} | ${l.delivery} | ${l.text.replace(/\|/g, '\\|')} | ${st} |`);
      }
    }
    md.push('');
  };
  table(s.lines, 'Lines');
  table(s.segments, 'Generated-order segments');
}
writeFileSync(join(OUT, 'review-sheet.md'), `${md.join('\n')}\n`);
console.log(
  `voices:sheet: ${speakers.length} speakers, ${plan.tts.length} TTS and ${plan.recorded.length} recorded lines and segments → ${join(OUT, 'review-sheet.{json,md}')}`,
);
