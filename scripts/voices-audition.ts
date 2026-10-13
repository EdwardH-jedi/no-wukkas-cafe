// Voice auditions (docs/VOICE_CASTING.md): 2-3 real lines per character for each candidate voice,
// plus a review sheet. Renders nothing at scale and calls no paid service unless told to.
//
//   npm run voices:audition                      dry run: candidates, lines, characters per provider
//   npm run voices:audition -- --pipeline-test   render the macOS placeholders (proves the pipeline;
//                                                NOT casting candidates)
//   npm run voices:audition -- --import <dir>    import delivered takes: <dir>/<character>/<voice>/*.mp3|wav
//   npm run voices:audition -- --provider azure --allow-paid
//                                                Azure candidates; needs AZURE_SPEECH_KEY and
//                                                AZURE_SPEECH_REGION; prints the character count first
//
// Output: voice-auditions/ (gitignored) with one folder per character/candidate and index.html.

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
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
type Candidate = import('../src/data/voice/casting.ts').Candidate;

const OUT = join(ROOT, 'voice-auditions');
const args = process.argv.slice(2);
const provider = argValue(args, '--provider');
const allowPaid = args.includes('--allow-paid');
const importDir = argValue(args, '--import');

const slug = (c: Candidate): string => `${c.provider}-${c.voice}`.replace(/[^\w.-]+/g, '_');

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
      writeFileSync(
        join(dir, 'candidate.json'),
        JSON.stringify({ provider: 'files', voice, character: who }, null, 2),
      );
    }
  }
  return n;
}

async function sheet(): Promise<void> {
  const rows: string[] = [];
  if (!existsSync(OUT)) return;
  for (const who of readdirSync(OUT).filter((d) => AUDITIONS[d])) {
    for (const cand of readdirSync(join(OUT, who)).filter((d) =>
      statSync(join(OUT, who, d)).isDirectory(),
    )) {
      const takes = readdirSync(join(OUT, who, cand))
        .filter((f) => f.endsWith('.mp3'))
        .sort();
      const info = existsSync(join(OUT, who, cand, 'candidate.json')) ? cand : cand;
      const test = cand.startsWith('macos-');
      const players = await Promise.all(
        takes.map(async (t, i) => {
          const m = await measure(join(OUT, who, cand, t), false);
          const line = AUDITIONS[who]?.[i] ?? '';
          return `<div class="take"><audio controls src="${who}/${cand}/${t}"></audio><small>${m.duration.toFixed(2)} s · ${line.replace(/</g, '&lt;')}</small></div>`;
        }),
      );
      const score = (k: string) =>
        `<label>${k}<select data-k="${k}"><option></option>${[1, 2, 3, 4, 5].map((v) => `<option>${v}</option>`).join('')}</select></label>`;
      rows.push(`<section data-c="${who}/${cand}"><h2>${who} · ${info}${test ? ' <span class="test">PIPELINE TEST ONLY: not a casting candidate</span>' : ''}</h2>${players.join('')}
        <div class="scores">${score('naturalness')}${score('intelligibility')}${score('accent authenticity')}${score('fit to brief')}
        <label><input type="checkbox" data-k="caricature risk"> caricature risk</label>
        <label><input type="checkbox" data-k="licence cleared"> licence cleared</label>
        <input data-k="notes" placeholder="notes"></div></section>`);
    }
  }
  writeFileSync(
    join(OUT, 'index.html'),
    `<!doctype html><meta charset="utf-8"><title>Voice auditions</title>
<style>body{font:15px system-ui;margin:24px;max-width:960px}section{border:1px solid #ccc;border-radius:8px;padding:12px;margin:12px 0}
.take{display:flex;gap:12px;align-items:center;margin:6px 0}.test{background:#fde68a;padding:2px 6px;border-radius:4px;font-size:12px}
.scores{display:flex;flex-wrap:wrap;gap:10px;margin-top:8px}textarea{width:100%;height:160px}</style>
<h1>Voice auditions</h1><p>Score each candidate (docs/VOICE_CASTING.md). Accent authenticity should come from a native or heritage speaker. Nothing here is approved for release until the licence is cleared.</p>
${rows.join('\n') || '<p>No takes yet.</p>'}
<h2>Scores (copy into the casting decision)</h2><button id="x">Export scores as JSON</button><textarea id="out"></textarea>
<script>document.getElementById('x').onclick=()=>{const r={};document.querySelectorAll('section').forEach(s=>{const o={};s.querySelectorAll('[data-k]').forEach(e=>{o[e.dataset.k]=e.type==='checkbox'?e.checked:e.value});r[s.dataset.c]=o});document.getElementById('out').value=JSON.stringify(r,null,2)};</script>`,
  );
  console.log(`review sheet: ${join(OUT, 'index.html')}`);
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
  } else {
    console.log(
      'Dry run: nothing rendered. See the header of scripts/voices-audition.ts for options.',
    );
  }
  await sheet();
}

await main();
