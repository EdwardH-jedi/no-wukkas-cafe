// Renders every voice line for DEVELOPMENT and writes src/data/voice/manifest.json.
//
//   npm run voices                     render what's missing or changed, re-measure the rest
//   npm run voices -- --force          re-render every placeholder clip
//   npm run voices -- --only gaz,priya
//   npm run voices -- --jobs 4         parallel renders (default 6)
//   npm run voices -- --prune          delete cached clips the manifest no longer lists
//   npm run voices -- --segments       render generated-order segments → voice-cache/segments/
//
// PLACEHOLDER PIPELINE (docs/VOICE_ASSETS.md): macOS `say` voices, which Apple licenses for
// personal, non-commercial use. Clips go to voice-cache/ (gitignored), are served by the dev
// server only and are stripped from production builds. Release clips (source.placeholder =
// false, with a licence) are never touched by this script. No network, no paid APIs.
//
// Reproducibility: some voices don't render bit-identically (Tara, 2026-10-13: different audio
// on every run, worse under parallel load). Each run probes every voice; unstable voices render
// one clip at a time, every clip is sanity-checked (length, pace, loudness) and retried, and the
// manifest always records what is on disk now.

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  argValue,
  CACHE_DIR,
  cachePath,
  listClips,
  MANIFEST,
  measure,
  ownIndex,
  pool,
  ROOT,
  run,
  type Measured,
} from './voice-node.ts';

const { voiceScript } = await import('../src/data/voice/script.ts');
const { dialogueId } = await import('../src/data/voice/ids.ts');
const { VOICE_PROFILES } = await import('../src/data/voice/profiles.ts');
const { DURATION_RANGE, PACE_RANGE, QUIET_DB, expectedFile, summarise, validateManifest } =
  await import('../src/data/voice/validate.ts');
type ScriptLine = import('../src/data/voice/script.ts').ScriptLine;
type VoiceProfile = import('../src/data/voice/profiles.ts').VoiceProfile;
type Manifest = import('../src/data/voice/manifest.ts').VoiceManifest;
type Clip = import('../src/data/voice/manifest.ts').VoiceClip;

const TMP = join(tmpdir(), 'nwc-voices');
const SAMPLE_RATE = 22050;
const SAY_TIMEOUT_MS = 30_000;
const ATTEMPTS = 3;
/** Takes per clip for voices that don't render deterministically (median length is kept). */
const UNSTABLE_TAKES = 3;
/** Voices seen rendering different audio for the same input. Tara (2026-10-13): 12 of 36 Priya
 *  clips changed length between two forced renders, and parallel renders produced empty, hung
 *  or garbled files, even though a short probe often repeats exactly. */
const KNOWN_UNSTABLE = new Set(['Tara']);

/** Probe phrases: a voice is deterministic only if every one renders identically twice. One
 *  short phrase isn't enough: Tara often repeats a short line exactly but not a longer one. */
const PROBES = [
  'Probe line. One flat white with oat milk, and a long black, please.',
  'Line number two. Can I get a flat white with almond milk, please? It has to survive the bus home.',
  'Three. Sorry, a long black, extra hot, and a heart if you can. I am half asleep this morning.',
];

const PROVIDER = 'macos-say (PLACEHOLDER: Apple system voices, personal/non-commercial use only)';
const LICENCE =
  'PLACEHOLDER audio rendered locally with Apple macOS system voices (personal, non-commercial ' +
  'use). Not for distribution: kept in voice-cache/ (gitignored), stripped from production ' +
  'builds. Replace with licensed recordings before release (docs/VOICE_ASSETS.md).';

const args = process.argv.slice(2);
const force = args.includes('--force');
const prune = args.includes('--prune');
const segmentsOnly = args.includes('--segments');
const onlyArg = argValue(args, '--only');
const only = onlyArg ? new Set(onlyArg.split(',')) : null;
const jobs = Number(argValue(args, '--jobs') ?? 6) || 6;

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
    const m = /^(.+?)\s+[a-z]{2,3}_[A-Za-z0-9]+\s+#/.exec(line);
    if (!m?.[1]) continue;
    // Newer macOS lists some voices as "Tara (English (India))"; `say -v Tara` still works.
    const name = m[1].trim();
    names.add(name);
    names.add(name.replace(/\s*\(.*\)$/, ''));
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

let tmpN = 0;
async function say(voice: string, rate: number, text: string): Promise<string> {
  const wav = join(TMP, `${process.pid}-${tmpN++}.wav`);
  await run(
    'say',
    [
      '-v',
      voice,
      '-r',
      String(rate),
      '--file-format=WAVE',
      `--data-format=LEI16@${SAMPLE_RATE}`,
      '-o',
      wav,
      text,
    ],
    { timeout: SAY_TIMEOUT_MS },
  );
  return wav;
}

/** Does this voice render the same audio twice in a row? (Rendered one at a time.) */
async function isDeterministic(voice: string): Promise<boolean> {
  for (const text of PROBES) {
    const hashes: string[] = [];
    for (let i = 0; i < 2; i++) {
      const wav = await say(voice, 175, text);
      hashes.push(createHash('sha1').update(readFileSync(wav)).digest('hex'));
      rmSync(wav, { force: true });
    }
    if (hashes[0] !== hashes[1]) return false;
  }
  return true;
}

async function renderOne(line: ScriptLine, c: Casting, file: string): Promise<void> {
  const wav = await say(c.voice, Math.round(c.rate * line.rate), forSay(line.text));
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
  try {
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
  } finally {
    rmSync(wav, { force: true });
  }
}

/** Why a freshly rendered clip doesn't look like this line spoken, or null if it does. */
function insane(text: string, m: Measured): string | null {
  if (m.duration < DURATION_RANGE[0] || m.duration > DURATION_RANGE[1])
    return `duration ${m.duration} s`;
  const pace = text.trim().split(/\s+/).length / m.duration;
  if (pace < PACE_RANGE[0] || pace > PACE_RANGE[1]) return `pace ${pace.toFixed(2)} words/s`;
  if (m.maxDb < -30 || !(m.meanDb > QUIET_DB)) return `too quiet (${m.meanDb} dB)`;
  return null;
}

/** One clip at a time for voices that aren't deterministic (they misbehave under load). */
const voiceLocks = new Map<string, Promise<void>>();
async function serially<T>(voice: string, fn: () => Promise<T>): Promise<T> {
  const before = voiceLocks.get(voice) ?? Promise.resolve();
  let release = (): void => undefined;
  const mine = new Promise<void>((r) => (release = r));
  voiceLocks.set(
    voice,
    before.then(() => mine),
  );
  await before;
  try {
    return await fn();
  } finally {
    release();
  }
}

/** `--segments`: every generated-order segment (data/voice/segments.ts) as its own placeholder
 *  clip, voice-cache/segments/<speaker>/<id>.mp3, plus voice-cache/segments/index.json (what is on
 *  disk, provenance 'placeholder'). The committed manifest is left alone: segment clips are
 *  development-only until a licensed pipeline exists, and timing never depends on them. */
async function renderSegments(castings: Map<string, Casting>): Promise<void> {
  const { SEGMENT_INVENTORY } = await import('../src/data/voice/segments.ts');
  const { segmentFile } = await import('../src/data/voice/manifest.ts');
  const todo = Object.entries(SEGMENT_INVENTORY).flatMap(([speaker, segs]) =>
    segs.map((g) => ({ speaker, id: g.id, text: g.text.trim(), file: segmentFile(g.id) })),
  );
  const index: Array<{
    id: string;
    speaker: string;
    transcript: string;
    file: string;
    duration: number;
    meanDb: number;
    voice: string;
  }> = [];
  const failures: string[] = [];
  let rendered = 0;
  await pool(todo, jobs, async (j) => {
    const c = castings.get(j.speaker);
    const abs = cachePath(j.file);
    try {
      if (!c) throw new Error('no voice cast');
      if (force || !existsSync(abs)) {
        const line: ScriptLine = {
          speaker: j.speaker,
          key: j.id,
          text: j.text,
          delivery: 'normal',
          rate: 1,
        };
        // One clip at a time per voice: some macOS voices misbehave under parallel load.
        await serially(c.voice, () => renderOne(line, c, abs));
        rendered++;
      }
      const m = await measure(abs);
      if (!(m.duration > 0.05)) throw new Error(`duration ${m.duration} s`);
      index.push({
        id: j.id,
        speaker: j.speaker,
        transcript: j.text,
        file: j.file,
        duration: m.duration,
        meanDb: m.meanDb,
        voice: `macos:${c.voice}`,
      });
    } catch (e) {
      rmSync(abs, { force: true });
      failures.push(`${j.id} ("${j.text}"): ${(e as Error).message.split('\n')[0] ?? ''}`);
    }
  });
  index.sort((a, b) => (a.id < b.id ? -1 : 1));
  const dir = join(CACHE_DIR, 'segments');
  mkdirSync(dir, { recursive: true });
  const out = { provenance: 'placeholder', provider: PROVIDER, licence: LICENCE, segments: index };
  writeFileSync(join(dir, 'index.json'), `${JSON.stringify(out, null, 2)}\n`);
  console.log(
    `segments: rendered ${rendered}, ${index.length}/${todo.length} on disk in ${dir} (placeholder)`,
  );
  if (failures.length) {
    console.error(`${failures.length} segment failure(s):\n  ${failures.join('\n  ')}`);
    process.exitCode = 1;
  }
}

interface Job {
  line: ScriptLine;
  c: Casting;
  clip: Clip;
  abs: string;
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
  // A speaker with no voice would silently lose every clip (Codex A5): stop before touching
  // anything.
  if (missingVoices.length) {
    console.error(`no installed voice for: ${missingVoices.join('; ')}. Nothing was changed.`);
    process.exitCode = 1;
    return;
  }

  if (segmentsOnly) return renderSegments(castings);

  // Before 2026-10-13 this script wrote placeholder clips into public/, where builds copy them.
  // Builds now strip placeholders, but the old folder should go.
  const legacy = listClips(join(ROOT, 'public/assets/voice')).length;
  if (legacy > 0)
    console.warn(
      `note: ${legacy} clip(s) in public/assets/voice/ (the old location). Placeholder clips now ` +
        'live in voice-cache/; delete public/assets/voice/ unless it holds licensed release audio.',
    );

  // Which voices render the same audio every time?
  const voices = [...new Set([...castings.values()].map((c) => c.voice))];
  const deterministic = new Map<string, boolean>();
  for (const v of voices)
    deterministic.set(v, !KNOWN_UNSTABLE.has(v) && (await isDeterministic(v)));
  console.log(
    `voices: ${voices
      .map((v) => `${v}${deterministic.get(v) ? '' : ' (not deterministic: one clip at a time)'}`)
      .join(', ')}`,
  );

  const script = voiceScript();
  const clips: Clip[] = [];
  const todo: Job[] = [];
  const keep: Array<{ clip: Clip; abs: string }> = [];
  for (const line of script) {
    const p = VOICE_PROFILES[line.speaker];
    const id = dialogueId(line.speaker, line.text, line.delivery);
    const old = prevById.get(id);
    // Release audio belongs to whoever licensed it: never re-render or re-measure it here.
    if (old && old.source.placeholder === false) {
      clips.push(old);
      continue;
    }
    const c = castings.get(line.speaker);
    if (!p || !c) {
      if (old) clips.push(old);
      continue;
    }
    const rate = Math.round(c.rate * line.rate);
    const file = expectedFile({
      characterId: line.speaker,
      dialogueId: id,
      delivery: line.delivery,
    });
    const abs = cachePath(file);
    const clip: Clip = {
      dialogueId: id,
      characterId: line.speaker,
      voiceId: `macos:${c.voice}`,
      accent: p.accent,
      locale: p.locale,
      key: line.key,
      delivery: line.delivery,
      transcript: line.text,
      file,
      duration: 0,
      meanDb: -91,
      playback: { gain: 1, rate: 1 },
      source: {
        engine: 'macos-say',
        voice: c.voice,
        rate,
        pitch: c.pitch,
        placeholder: true,
        deterministic: deterministic.get(c.voice) ?? false,
      },
    };
    const same =
      old !== undefined &&
      old.source.voice === c.voice &&
      old.source.rate === rate &&
      old.source.pitch === c.pitch &&
      existsSync(abs);
    const wanted = !only || only.has(line.speaker);
    if (same && !(force && wanted)) keep.push({ clip, abs });
    else if (wanted) todo.push({ line, c, clip, abs });
    else if (old) clips.push(old);
  }

  // Kept clips: record what is actually on disk (it may have been re-rendered since), and
  // re-render any that don't pass the same sanity check as a fresh render.
  const lineFor = new Map(script.map((l) => [dialogueId(l.speaker, l.text, l.delivery), l]));
  let remeasured = 0;
  await pool(keep, 8, async ({ clip, abs }) => {
    const m = await measure(abs);
    const line = lineFor.get(clip.dialogueId);
    const c = castings.get(clip.characterId);
    if (insane(clip.transcript, m) && line && c) {
      todo.push({ line, c, clip, abs });
      return;
    }
    clip.duration = m.duration;
    clip.meanDb = m.meanDb;
    clips.push(clip);
    remeasured++;
  });

  let done = 0;
  let retried = 0;
  const failures: string[] = [];
  await pool(todo, jobs, async ({ line, c, clip, abs }) => {
    // An unstable voice gets several takes and keeps the median-length good one, so a take with a
    // stray pause or a rushed read doesn't become the clip.
    const takes = deterministic.get(c.voice) ? 1 : UNSTABLE_TAKES;
    const render = async (): Promise<void> => {
      let why = '';
      for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
        const good: Array<{ file: string; m: Measured }> = [];
        for (let t = 0; t < takes; t++) {
          const file = takes === 1 ? abs : `${abs}.take${t}.mp3`;
          try {
            await renderOne(line, c, file);
            const m = await measure(file);
            const bad = insane(line.text, m);
            if (bad) {
              why = bad;
              rmSync(file, { force: true });
            } else good.push({ file, m });
          } catch (e) {
            why = (e as Error).message.split('\n')[0] ?? 'render failed';
            rmSync(file, { force: true });
          }
        }
        if (good.length === 0) continue;
        good.sort((x, y) => x.m.duration - y.m.duration);
        const pick = good[Math.floor((good.length - 1) / 2)] as { file: string; m: Measured };
        for (const g of good) if (g !== pick) rmSync(g.file, { force: true });
        if (pick.file !== abs) renameSync(pick.file, abs);
        clip.duration = pick.m.duration;
        clip.meanDb = pick.m.meanDb;
        clips.push(clip);
        if (attempt > 1 || good.length < takes) retried++;
        return;
      }
      rmSync(abs, { force: true });
      failures.push(`${clip.dialogueId} (${line.speaker}: "${line.text}"): ${why}`);
    };
    if (deterministic.get(c.voice)) await render();
    else await serially(c.voice, render);
    done++;
    if (done % 25 === 0 || done === todo.length) process.stdout.write(`  ${done}/${todo.length}\n`);
  });

  clips.sort((a, b) => (a.dialogueId < b.dialogueId ? -1 : 1));
  const manifest: Manifest = {
    version: 2,
    status: clips.some((c) => c.source.placeholder !== false) ? 'placeholder' : 'release',
    provider: PROVIDER,
    licence: LICENCE,
    clips,
  };

  const by = new Map<string, number>();
  for (const c of manifest.clips) by.set(c.characterId, (by.get(c.characterId) ?? 0) + 1);
  console.log(
    `rendered ${todo.length - failures.length}/${todo.length} (${retried} needed a retry or lost a take), ` +
      `kept and re-measured ${remeasured}; manifest has ${manifest.clips.length} clips for ${script.length} lines`,
  );
  for (const [k, n] of by)
    console.log(`  ${k.padEnd(6)} ${String(n).padStart(4)}  ${castings.get(k)?.voice ?? '-'}`);
  if (prune && !failures.length) {
    const listed = new Set(manifest.clips.map((c) => c.file));
    let removed = 0;
    // Never the segment placeholders or the licensed (paid) staging: they have their own index.
    // listClips lists only real files whose real path is inside the cache (no symlinks followed).
    for (const f of listClips(CACHE_DIR))
      if (!listed.has(f) && !ownIndex(f)) {
        rmSync(cachePath(f), { force: true });
        removed++;
      }
    console.log(`pruned ${removed} cached clip(s) no longer in the manifest`);
  }

  const issues = validateManifest(manifest, { script, profiles: VOICE_PROFILES });
  const s = summarise(issues);
  for (const i of issues.filter((x) => x.level === 'error').slice(0, 20))
    console.error(`  ${i.code}: ${i.id ?? ''} ${i.message}`);
  console.log(`manifest check: ${s.errors} error(s), ${s.warnings} warning(s)`);
  if (failures.length)
    console.error(`${failures.length} render failure(s):\n  ${failures.join('\n  ')}`);
  // Only a complete, valid manifest replaces the old one, and atomically (temp file + rename):
  // a failed run leaves the committed manifest exactly as it was (Codex A5).
  const text = `${JSON.stringify(manifest, null, 2)}\n`;
  if (failures.length || s.errors) {
    const rejected = join(CACHE_DIR, 'manifest.rejected.json');
    mkdirSync(CACHE_DIR, { recursive: true });
    writeFileSync(rejected, text);
    console.error(`manifest NOT updated; this run's result is in ${rejected}`);
    process.exitCode = 1;
    return;
  }
  const tmp = `${MANIFEST}.tmp-${process.pid}`;
  writeFileSync(tmp, text);
  renameSync(tmp, MANIFEST);
}

await main();
