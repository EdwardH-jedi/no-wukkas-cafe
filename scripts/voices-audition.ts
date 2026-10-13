// Voice auditions (docs/VOICE_CASTING.md): 2-3 real lines per character for each candidate voice,
// plus a review sheet. Renders nothing at scale and calls no paid service unless told to.
//
//   npm run voices:audition                      dry run: candidates, lines, characters per provider
//   npm run voices:audition -- --pipeline-test   render the macOS placeholders (proves the pipeline;
//                                                NOT casting candidates)
//   npm run voices:audition -- --import <dir>    import delivered takes: <dir>/<character>/<voice>/*.mp3|wav
//                                                (file names start with the line number: 1.wav, 2b.wav;
//                                                an optional source.json beside them records
//                                                { licence, source, performer })
//   npm run voices:audition -- --provider azure --allow-paid
//                                                Azure candidates; needs AZURE_SPEECH_KEY and
//                                                AZURE_SPEECH_REGION; prints the character count first
//
// Output: voice-auditions/ (gitignored) with one folder per character/candidate and index.json,
// the audition index the casting page reads (dev/casting.html on the dev server: `npm run dev`,
// then /dev/casting.html). Every configured candidate is listed, with or without audio.

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, extname, join } from 'node:path';
import { argValue, measure, ROOT, run } from './voice-node.ts';
import { azureSsml, azureSynthesize } from './tts-azure.ts';

const { AUDITIONS } = await import('../src/data/voice/auditions.ts');
const { CASTING, PIPELINE_TEST } = await import('../src/data/voice/casting.ts');
const { auditionCoverage, buildAuditionIndex, candidateSlug, lineOfTake } =
  await import('../src/data/voice/auditionIndex.ts');
type Candidate = import('../src/data/voice/casting.ts').Candidate;
type FoundCandidate = import('../src/data/voice/auditionIndex.ts').FoundCandidate;

const OUT = join(ROOT, 'voice-auditions');
const args = process.argv.slice(2);
const provider = argValue(args, '--provider');
const allowPaid = args.includes('--allow-paid');
const importDir = argValue(args, '--import');

const slug = (c: Candidate): string => candidateSlug(c);

async function encode(input: string, out: string): Promise<void> {
  await run('ffmpeg', [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-i',
    input,
    '-af',
    'silenceremove=start_periods=1:start_threshold=-50dB,areverse,silenceremove=start_periods=1:start_threshold=-50dB,areverse,loudnorm=I=-17:TP=-2:LRA=11',
    '-ac',
    '1',
    '-ar',
    '24000',
    '-codec:a',
    'libmp3lame',
    '-b:a',
    '64k',
    out,
  ]);
}

async function renderMac(who: string, c: Candidate): Promise<void> {
  const dir = join(OUT, who, slug(c));
  mkdirSync(dir, { recursive: true });
  for (const [i, text] of (AUDITIONS[who] ?? []).entries()) {
    const wav = join(tmpdir(), `nwc-audition-${process.pid}-${i}.wav`);
    await run(
      'say',
      ['-v', c.voice, '--file-format=WAVE', '--data-format=LEI16@22050', '-o', wav, text],
      {
        timeout: 30_000,
      },
    );
    await encode(wav, join(dir, `${i + 1}.mp3`));
    rmSync(wav, { force: true });
  }
  writeFileSync(
    join(dir, 'candidate.json'),
    JSON.stringify({ ...c, character: who, pipelineTestOnly: true }, null, 2),
  );
}

async function renderAzure(who: string, c: Candidate, key: string, region: string): Promise<void> {
  const dir = join(OUT, who, slug(c));
  mkdirSync(dir, { recursive: true });
  for (const [i, text] of (AUDITIONS[who] ?? []).entries()) {
    const ssml = azureSsml(text, {
      voice: c.voice,
      ...(c.rate ? { rate: c.rate } : {}),
      ...(c.style ? { style: c.style } : {}),
    });
    const mp3 = Buffer.from(await azureSynthesize(ssml, key, region));
    const raw = join(tmpdir(), `nwc-audition-${process.pid}-${i}.mp3`);
    writeFileSync(raw, mp3);
    await encode(raw, join(dir, `${i + 1}.mp3`));
    rmSync(raw, { force: true });
  }
  writeFileSync(join(dir, 'candidate.json'), JSON.stringify({ ...c, character: who }, null, 2));
}

async function importTakes(src: string): Promise<number> {
  let n = 0;
  for (const who of readdirSync(src)) {
    if (!AUDITIONS[who] || !statSync(join(src, who)).isDirectory()) continue;
    for (const voice of readdirSync(join(src, who))) {
      const from = join(src, who, voice);
      if (!statSync(from).isDirectory()) continue;
      const dir = join(OUT, who, `files-${voice}`.replace(/[^\w.-]+/g, '_'));
      mkdirSync(dir, { recursive: true });
      for (const f of readdirSync(from)
        .filter((x) => /\.(mp3|wav|m4a|aiff?)$/i.test(x))
        .sort()) {
        const out = join(dir, `${basename(f, extname(f))}.mp3`);
        if (extname(f).toLowerCase() === '.mp3') copyFileSync(join(from, f), out);
        else await encode(join(from, f), out);
        n++;
      }
      // Licence and performer details delivered with the takes, if any.
      const delivered = join(from, 'source.json');
      const source = existsSync(delivered)
        ? (JSON.parse(readFileSync(delivered, 'utf8')) as Record<string, unknown>)
        : {};
      const pick = (k: string): Record<string, string> =>
        typeof source[k] === 'string' ? { [k]: source[k] } : {};
      writeFileSync(
        join(dir, 'candidate.json'),
        JSON.stringify(
          {
            provider: 'files',
            voice,
            character: who,
            ...pick('licence'),
            ...pick('source'),
            ...pick('performer'),
          },
          null,
          2,
        ),
      );
    }
  }
  return n;
}

/** Scan voice-auditions/ and write index.json (every candidate, with or without audio). */
async function writeIndex(): Promise<void> {
  const found: FoundCandidate[] = [];
  if (existsSync(OUT))
    for (const who of readdirSync(OUT).filter((d) => AUDITIONS[d])) {
      const count = AUDITIONS[who]?.length ?? 0;
      for (const cand of readdirSync(join(OUT, who)).filter((d) =>
        statSync(join(OUT, who, d)).isDirectory(),
      )) {
        const dir = join(OUT, who, cand);
        const infoFile = join(dir, 'candidate.json');
        const info = existsSync(infoFile)
          ? (JSON.parse(readFileSync(infoFile, 'utf8')) as FoundCandidate['info'])
          : {};
        const files = readdirSync(dir)
          .filter((f) => f.endsWith('.mp3'))
          .sort();
        const takes = await Promise.all(
          files.map(async (f) => ({
            line: lineOfTake(f, count),
            file: `${who}/${cand}/${f}`,
            duration: (await measure(join(dir, f), false)).duration,
          })),
        );
        found.push({ character: who, slug: cand, info, takes });
      }
    }
  const index = buildAuditionIndex({
    lines: AUDITIONS,
    casting: CASTING,
    found,
    generatedAt: new Date().toISOString(),
  });
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, 'index.json'), `${JSON.stringify(index, null, 2)}\n`);
  // The old static review sheet is replaced by the casting page; leave a pointer to it.
  writeFileSync(
    join(OUT, 'index.html'),
    `<!doctype html><meta charset="utf-8"><title>Voice auditions</title>
<p>The review sheet moved to the casting page: run <code>npm run dev</code> and open
<a href="http://localhost:5183/dev/casting.html">/dev/casting.html</a>.</p>`,
  );
  console.log('Audition coverage (real candidates with audio / placeholders / missing):');
  for (const [who, c] of Object.entries(auditionCoverage(index)))
    console.log(
      `  ${who.padEnd(6)} ${c.real} real, ${c.placeholder} placeholder, ${c.missing} missing`,
    );
  console.log(`audition index: ${join(OUT, 'index.json')}`);
}

async function main(): Promise<void> {
  const chars = (who: string) => (AUDITIONS[who] ?? []).reduce((s, t) => s + t.length, 0);
  console.log('Audition lines per character:');
  for (const [who, lines] of Object.entries(AUDITIONS))
    console.log(`  ${who.padEnd(6)} ${lines.length} lines, ${chars(who)} chars`);
  const byProvider = new Map<string, number>();
  for (const [who, cands] of Object.entries(CASTING))
    for (const c of cands)
      byProvider.set(c.provider, (byProvider.get(c.provider) ?? 0) + chars(who));
  console.log(
    `Candidates: ${Object.values(CASTING).flat().length}; characters to synthesise per provider: ${[...byProvider].map(([p, n]) => `${p} ${n}`).join(', ')}`,
  );

  if (args.includes('--pipeline-test')) {
    for (const [who, c] of Object.entries(PIPELINE_TEST)) await renderMac(who, c);
    console.log('rendered the macOS pipeline test takes (placeholders, not candidates)');
  } else if (importDir) {
    console.log(`imported ${await importTakes(importDir)} take(s) from ${importDir}`);
  } else if (provider === 'azure') {
    const key = process.env.AZURE_SPEECH_KEY;
    const region = process.env.AZURE_SPEECH_REGION;
    const n = Object.entries(CASTING).reduce(
      (s, [who, cs]) => s + cs.filter((c) => c.provider === 'azure').length * chars(who),
      0,
    );
    console.log(`Azure would synthesise ${n} characters.`);
    if (!allowPaid || !key || !region) {
      console.error(
        'Not calling Azure: needs --allow-paid and AZURE_SPEECH_KEY / AZURE_SPEECH_REGION (Edward approves spending first).',
      );
      process.exitCode = 1;
      return;
    }
    for (const [who, cs] of Object.entries(CASTING))
      for (const c of cs.filter((x) => x.provider === 'azure'))
        await renderAzure(who, c, key, region);
  } else if (provider) {
    // Google candidates are listed to hear on Google's own voice list (docs/VOICE_PROVIDERS.md);
    // there's no account and no renderer yet, so nothing is called.
    console.error(
      `No renderer for provider "${provider}". Listen on the provider's own page, or deliver takes with --import.`,
    );
    process.exitCode = 1;
  } else {
    console.log(
      'Dry run: nothing rendered. See the header of scripts/voices-audition.ts for options.',
    );
  }
  await writeIndex();
}

await main();
