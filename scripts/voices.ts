// Renders every voice line to MP3 and writes src/data/voice/manifest.json.
//
//   npm run voices            render what's missing or changed
//   npm run voices -- --force re-render everything
//   npm run voices -- --only gaz,priya
//
// PLACEHOLDER PIPELINE: uses macOS `say` voices (Apple licenses them for personal, non-commercial
// use; the MP3s are gitignored and must not be shipped). Swap `renderOne` for a licensed provider
// or real recordings later; the manifest format and the game don't change.

import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

// src/ uses bundler-style extensionless imports; teach Node to try `.ts`.
registerHooks({
  resolve(spec, ctx, next) {
    try {
      return next(spec, ctx);
    } catch (e) {
      if (spec.startsWith('.') && !/\.\w+$/.test(spec)) return next(`${spec}.ts`, ctx);
      throw e;
    }
  },
});

const { voiceScript } = await import('../src/data/voice/script.ts');
const { dialogueId } = await import('../src/data/voice/ids.ts');
const { VOICE_PROFILES } = await import('../src/data/voice/profiles.ts');
type ScriptLine = import('../src/data/voice/script.ts').ScriptLine;
type VoiceProfile = import('../src/data/voice/profiles.ts').VoiceProfile;
type Manifest = import('../src/data/voice/manifest.ts').VoiceManifest;
type Clip = import('../src/data/voice/manifest.ts').VoiceClip;

const run = promisify(execFile);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST = join(ROOT, 'src/data/voice/manifest.json');
const TMP = join(tmpdir(), 'nwc-voices');
const SAMPLE_RATE = 22050;

const args = process.argv.slice(2);
const force = args.includes('--force');
const onlyArg = args[args.indexOf('--only') + 1];
const only = args.includes('--only') && onlyArg ? new Set(onlyArg.split(',')) : null;

/** What the TTS engine reads. Subtitles keep the original text. */
export function forSay(text: string): string {
  return text
    .replace(/tss-tss/gi, 'tss, tss')
    .replace(/(\d+)\s*[–-]\s*(\d+)/g, '$1 to $2')
    .replace(/\s*°C/g, ' degrees')
    .replace(/[—–]/g, ', ')
    .replace(/…/g, '... ')
    .replace(/\bute\b/g, 'yoot')
    .replace(/\bOi\b/g, 'Oy')
    .replace(/\bRighto\b/g, 'Right-oh');
}

async function installedVoices(): Promise<Set<string>> {
  const { stdout } = await run('say', ['-v', '?']);
  const names = new Set<string>();
  for (const line of stdout.split('\n')) {
    const m = /^(.+?)\s{2,}[a-z]{2,3}_[A-Za-z0-9]+\s+#/.exec(line);
    if (m?.[1]) names.add(m[1].trim());
  }
  return names;
}

interface Casting {
  voice: string;
  rate: number;
  pitch: number;
}

function cast(p: VoiceProfile, installed: Set<string>): Casting | null {
  const voice = p.prefer.find((v) => installed.has(v));
  if (!voice) return null;
  const pitch = p.pitchOnlyFor && p.pitchOnlyFor !== voice ? 1 : p.pitch;
  return { voice, rate: p.rate, pitch };
}

async function measure(file: string): Promise<{ duration: number; meanDb: number; maxDb: number }> {
  const probe = await run('ffprobe', [
    '-v',
    'error',
    '-show_entries',
    'format=duration',
    '-of',
    'csv=p=0',
    file,
  ]);
  const vol = await run('ffmpeg', [
    '-hide_banner',
    '-i',
    file,
    '-af',
    'volumedetect',
    '-f',
    'null',
    '-',
  ]);
  const mean = /mean_volume:\s*(-?[\d.]+) dB/.exec(vol.stderr);
  const max = /max_volume:\s*(-?[\d.]+) dB/.exec(vol.stderr);
  return {
    duration: Math.round(Number(probe.stdout.trim()) * 1000) / 1000,
    meanDb: Number(mean?.[1] ?? -91),
    maxDb: Number(max?.[1] ?? -91),
  };
}

async function renderOne(line: ScriptLine, c: Casting, file: string): Promise<void> {
  const rate = Math.round(c.rate * (line.delivery === 'slow' ? 0.8 : 1));
  const wav = join(TMP, `${Math.abs(hash(file))}.wav`);
  await run('say', [
    '-v',
    c.voice,
    '-r',
    String(rate),
    '--file-format=WAVE',
    `--data-format=LEI16@${SAMPLE_RATE}`,
    '-o',
    wav,
    forSay(line.text),
  ]);
  const chain = [
    // Darken a voice without changing its speed (formants move too: a bigger, deeper speaker).
    ...(c.pitch !== 1
      ? [
          `asetrate=${Math.round(SAMPLE_RATE * c.pitch)}`,
          `aresample=${SAMPLE_RATE}`,
          `atempo=${(1 / c.pitch).toFixed(4)}`,
        ]
      : []),
    // Trim leading/trailing silence so the clip length is the speech length.
    'silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.03',
    'areverse',
    'silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.06',
    'areverse',
    'loudnorm=I=-17:TP=-2:LRA=11',
  ].join(',');
  mkdirSync(dirname(file), { recursive: true });
  await run('ffmpeg', [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-i',
    wav,
    '-af',
    chain,
    '-ac',
    '1',
    '-ar',
    '24000',
    '-codec:a',
    'libmp3lame',
    '-b:a',
    '48k',
    file,
  ]);
  rmSync(wav, { force: true });
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  return h;
}

async function pool<T>(items: T[], n: number, fn: (t: T) => Promise<void>): Promise<void> {
  let i = 0;
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (i < items.length) await fn(items[i++] as T);
    }),
  );
}

async function main(): Promise<void> {
  mkdirSync(TMP, { recursive: true });
  const installed = await installedVoices();
  const prev: Manifest | null = existsSync(MANIFEST)
    ? (JSON.parse(readFileSync(MANIFEST, 'utf8')) as Manifest)
    : null;
  const prevById = new Map((prev?.clips ?? []).map((c) => [c.dialogueId, c]));
  const castings = new Map<string, Casting>();
  const missingVoices: string[] = [];
  for (const p of Object.values(VOICE_PROFILES)) {
    const c = cast(p, installed);
    if (c) castings.set(p.speaker, c);
    else missingVoices.push(`${p.speaker} (wants ${p.prefer.join(' / ')})`);
  }

  const script = voiceScript();
  const clips: Clip[] = [];
  const todo: Array<{ line: ScriptLine; c: Casting; clip: Clip; abs: string }> = [];
  for (const line of script) {
    const p = VOICE_PROFILES[line.speaker];
    const c = castings.get(line.speaker);
    if (!p || !c) continue;
    const id = dialogueId(line.speaker, line.text, line.delivery);
    const rel = `assets/voice/${line.speaker}/${id.split(':')[1]}${line.delivery === 'slow' ? '-slow' : ''}.mp3`;
    const abs = join(ROOT, 'public', rel);
    const clip: Clip = {
      dialogueId: id,
      characterId: line.speaker,
      voiceId: `macos:${c.voice}`,
      accent: p.accent,
      locale: p.locale,
      key: line.key,
      delivery: line.delivery,
      transcript: line.text,
      file: rel,
      duration: 0,
      meanDb: -91,
      playback: { gain: 1, rate: 1 },
      source: {
        engine: 'macos-say',
        voice: c.voice,
        rate: c.rate,
        pitch: c.pitch,
        placeholder: true,
      },
    };
    const old = prevById.get(id);
    const same =
      old &&
      old.source.voice === c.voice &&
      old.source.rate === c.rate &&
      old.source.pitch === c.pitch &&
      existsSync(abs);
    if (!force && same && (!only || !only.has(line.speaker))) {
      clips.push({ ...clip, duration: old.duration, meanDb: old.meanDb });
      continue;
    }
    if (only && !only.has(line.speaker)) {
      if (old) clips.push(old);
      continue;
    }
    todo.push({ line, c, clip, abs });
    clips.push(clip);
  }

  let done = 0;
  const failures: string[] = [];
  await pool(todo, 6, async ({ line, c, clip, abs }) => {
    try {
      await renderOne(line, c, abs);
      const m = await measure(abs);
      clip.duration = m.duration;
      clip.meanDb = m.meanDb;
      if (m.maxDb < -30 || m.duration < 0.3) failures.push(`${clip.dialogueId} looks silent/short`);
    } catch (e) {
      failures.push(`${clip.dialogueId}: ${(e as Error).message.split('\n')[0]}`);
    }
    done++;
    if (done % 25 === 0 || done === todo.length) process.stdout.write(`  ${done}/${todo.length}\n`);
  });

  clips.sort((a, b) => (a.dialogueId < b.dialogueId ? -1 : 1));
  const manifest: Manifest = {
    version: 1,
    provider: 'macos-say (PLACEHOLDER: Apple system voices, personal/non-commercial use only)',
    clips: clips.filter((c) => c.duration > 0),
  };
  writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);

  const by = new Map<string, number>();
  for (const c of manifest.clips) by.set(c.characterId, (by.get(c.characterId) ?? 0) + 1);
  console.log(
    `rendered ${todo.length}, manifest has ${manifest.clips.length} clips of ${script.length} lines`,
  );
  for (const [k, n] of by)
    console.log(`  ${k.padEnd(6)} ${String(n).padStart(4)}  ${castings.get(k)?.voice ?? '-'}`);
  if (missingVoices.length) console.log(`no installed voice for: ${missingVoices.join('; ')}`);
  if (failures.length) {
    console.error(`${failures.length} failures:\n  ${failures.join('\n  ')}`);
    process.exitCode = 1;
  }
}

await main();
