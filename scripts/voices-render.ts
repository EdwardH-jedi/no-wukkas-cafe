// The licensed voice pass (docs/TODO.md Phase 3): render the TTS half of the release cast
// (src/data/voice/casting.ts CAST) into a staging folder, promote what was approved into the
// release clips, and import the actors' recordings. Never commits audio: release clips live in
// public/assets/voice/ (gitignored); only src/data/voice/manifest.json changes.
//
//   npm run voices:render                         dry run: what would render, characters, AU$, cap
//   npm run voices:render -- --allow-paid         render → voice-cache/licensed/ (paid: needs
//                                                 GOOGLE_TTS_ACCESS_TOKEN + GOOGLE_CLOUD_PROJECT)
//   npm run voices:render -- --segments …         the TTS speakers' generated-order segments too
//   npm run voices:render -- --only dazza,karen   some speakers
//   npm run voices:render -- --promote            offline: staged licensed clips → public/assets/
//                                                 voice/ + the manifest (release, licensed_tts)
//   npm run voices:render -- --import <dir>       actors' takes → public/assets/voice/ + the
//                                                 manifest (release, recorded); see the review sheet
//
// Staging: voice-cache/licensed/<the clip's path> plus index.json (provider, voice, licence,
// characters, date per clip), written after every clip so a stopped run loses nothing paid for
// and a re-run only renders what's missing. Segments stay staged: shipping them needs a segment
// manifest the build gate and the game read (docs/TODO.md Phase 3).

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, extname, join } from 'node:path';
import { argValue, CACHE_DIR, MANIFEST, measure, pool, publicPath, run } from './voice-node.ts';

const { voiceScript } = await import('../src/data/voice/script.ts');
const { CAST, TTS_BUDGET } = await import('../src/data/voice/casting.ts');
const { SEGMENT_INVENTORY } = await import('../src/data/voice/segments.ts');
const { VOICE_PROFILES } = await import('../src/data/voice/profiles.ts');
const { DURATION_RANGE, PACE_RANGE, QUIET_DB, summarise, validateManifest } =
  await import('../src/data/voice/validate.ts');
const { voicePlan } = await import('./voices-plan.ts');
const { estimateCost, paidAccess } = await import('./tts-provider.ts');
const { GOOGLE_NEEDS, googleAuthFrom, googleProvider } = await import('./tts-google.ts');
const { fakeProvider } = await import('./tts-fake.ts');
type PlanJob = import('./voices-plan.ts').PlanJob;
type TtsProvider = import('./tts-provider.ts').TtsProvider;
type Manifest = import('../src/data/voice/manifest.ts').VoiceManifest;
type Clip = import('../src/data/voice/manifest.ts').VoiceClip;

export interface StagedClip {
  id: string;
  kind: 'line' | 'segment';
  speaker: string;
  key: string;
  text: string;
  delivery: 'normal' | 'slow';
  /** Served path ("assets/voice/…"); staged at voice-cache/licensed/<path after assets/voice/>. */
  file: string;
  engine: string;
  provenance: 'placeholder' | 'licensed_tts' | 'recorded';
  voice: string;
  rate: number;
  sent: string;
  chars: number;
  licence: string;
  renderedOn: string;
  duration: number;
  meanDb: number;
}

interface StagedIndex {
  clips: StagedClip[];
}

const STAGE = join(CACHE_DIR, 'licensed');
const INDEX = join(STAGE, 'index.json');
const ATTEMPTS = 3;
const TMP = join(tmpdir(), 'nwc-voices-render');

const args = process.argv.slice(2);
const onlyArg = argValue(args, '--only');
const only = onlyArg ? new Set(onlyArg.split(',')) : null;
const withSegments = args.includes('--segments');
const jobs = Number(argValue(args, '--jobs') ?? 2) || 2;
const importDir = argValue(args, '--import');
const stagedPath = (file: string): string => join(STAGE, file.slice('assets/voice/'.length));
const money = (x: number): string => x.toFixed(2);
// The date a clip was rendered, for provenance (scripts may read the clock; src/sim and src/core may not).
const today = (): string => new Date().toISOString().slice(0, 10);

function readIndex(): StagedIndex {
  return existsSync(INDEX)
    ? (JSON.parse(readFileSync(INDEX, 'utf8')) as StagedIndex)
    : { clips: [] };
}

function writeAtomic(path: string, text: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp-${process.pid}`;
  writeFileSync(tmp, text);
  renameSync(tmp, path);
}

/** Trim silence and level the voice the way every clip is (scripts/voices.ts), mono MP3. */
async function encode(input: string, out: string): Promise<void> {
  mkdirSync(dirname(out), { recursive: true });
  await run('ffmpeg', [
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-i',
    input,
    '-af',
    'silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.03,areverse,silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.06,areverse,loudnorm=I=-17:TP=-2:LRA=11',
    '-ac',
    '1',
    '-ar',
    '24000',
    '-codec:a',
    'libmp3lame',
    '-b:a',
    '48k',
    out,
  ]);
}

/** Why a clip doesn't look like its words spoken, or null. Segments are short: length only. */
function insane(
  job: PlanJob,
  m: { duration: number; meanDb: number; maxDb: number },
): string | null {
  if (job.kind === 'segment') return m.duration > 0.05 ? null : `duration ${m.duration} s`;
  if (m.duration < DURATION_RANGE[0] || m.duration > DURATION_RANGE[1])
    return `duration ${m.duration} s`;
  const pace = job.text.trim().split(/\s+/).length / m.duration;
  if (pace < PACE_RANGE[0] || pace > PACE_RANGE[1]) return `pace ${pace.toFixed(2)} words/s`;
  if (m.maxDb < -30 || !(m.meanDb > QUIET_DB)) return `too quiet (${m.meanDb} dB)`;
  return null;
}

function providerFor(): { tts: TtsProvider } | { refused: string } {
  // Tests only: a free ffmpeg stand-in whose clips can never be promoted (tests/scripts).
  if (process.env.NWC_FAKE_TTS === '1') {
    const a = paidAccess(args, {}, 'nothing');
    return a.ok ? { tts: fakeProvider() } : { refused: a.reason };
  }
  const a = paidAccess(args, googleAuthFrom(process.env), GOOGLE_NEEDS);
  return a.ok ? { tts: googleProvider(a.auth) } : { refused: a.reason };
}

async function render(): Promise<void> {
  const plan = voicePlan(voiceScript(), CAST, withSegments ? SEGMENT_INVENTORY : null);
  const index = readIndex();
  const staged = new Map(index.clips.map((c) => [`${c.kind}:${c.id}`, c]));
  const wanted = plan.tts.filter((j) => !only || only.has(j.speaker));
  const todo = wanted.filter((j) => {
    const s = staged.get(`${j.kind}:${j.id}`);
    const voice = CAST[j.speaker]?.voice;
    return !(
      s &&
      s.voice === voice &&
      s.rate === j.rate &&
      s.sent === j.sent &&
      existsSync(stagedPath(j.file))
    );
  });
  const chars = todo.reduce((n, j) => n + j.chars, 0);
  const cost = estimateCost(chars, TTS_BUDGET);
  console.log(
    `voices:render: ${wanted.length} TTS clip(s) wanted, ${wanted.length - todo.length} already staged, ` +
      `${todo.length} to render: ${chars} characters, ~AU$${money(cost.aud)} (cap AU$${money(TTS_BUDGET.capAud)})`,
  );
  if (cost.aud > TTS_BUDGET.capAud) {
    console.error(`refused: AU$${money(cost.aud)} is over the cap. Nothing rendered.`);
    process.exitCode = 1;
    return;
  }
  if (todo.length === 0) return;
  const p = providerFor();
  if ('refused' in p) {
    console.error(`Not rendering: ${p.refused}.`);
    // A dry run is the default and not an error; asking to pay without credentials is.
    if (args.includes('--allow-paid')) process.exitCode = 1;
    return;
  }
  mkdirSync(TMP, { recursive: true });
  let spent = 0;
  let done = 0;
  const failures: string[] = [];
  await pool(todo, jobs, async (j) => {
    const c = CAST[j.speaker];
    if (!c?.languageCode) return;
    // Never past the cap, even if the estimate was wrong.
    if (estimateCost(spent + j.chars, TTS_BUDGET).aud > TTS_BUDGET.capAud) {
      failures.push(`${j.id}: stopped at the cap`);
      return;
    }
    const out = stagedPath(j.file);
    let why = '';
    for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
      const raw = join(TMP, `${process.pid}-${done}-${attempt}.${p.tts.format}`);
      try {
        spent += j.chars;
        const audio = await p.tts.render({
          text: j.sent,
          voice: c.voice,
          languageCode: c.languageCode,
          rate: j.rate,
        });
        writeFileSync(raw, audio);
        await encode(raw, out);
        const m = await measure(out);
        const bad = insane(j, m);
        if (bad) throw new Error(bad);
        staged.set(`${j.kind}:${j.id}`, {
          id: j.id,
          kind: j.kind,
          speaker: j.speaker,
          key: j.key,
          text: j.text,
          delivery: j.delivery,
          file: j.file,
          engine: p.tts.engine,
          provenance: p.tts.provenance,
          voice: c.voice,
          rate: j.rate,
          sent: j.sent,
          chars: j.chars,
          licence: p.tts.provenance === 'licensed_tts' ? c.licence : 'test stand-in, never shipped',
          renderedOn: today(),
          duration: m.duration,
          meanDb: m.meanDb,
        });
        // Written after every clip: a stopped run keeps what it paid for.
        writeAtomic(
          INDEX,
          `${JSON.stringify({ clips: [...staged.values()].sort((a, z) => (a.id < z.id ? -1 : 1)) }, null, 2)}\n`,
        );
        why = '';
        break;
      } catch (e) {
        why = (e as Error).message.split('\n')[0] ?? 'render failed';
        rmSync(out, { force: true });
      } finally {
        rmSync(raw, { force: true });
      }
    }
    if (why) failures.push(`${j.id} (${j.speaker}: "${j.text}"): ${why}`);
    done++;
    if (done % 25 === 0 || done === todo.length) console.log(`  ${done}/${todo.length}`);
  });
  const spentCost = estimateCost(spent, TTS_BUDGET);
  console.log(
    `rendered ${todo.length - failures.length}/${todo.length} into ${STAGE} with ${p.tts.engine} ` +
      `(${spent} characters sent, ~AU$${money(spentCost.aud)}). Listen, then --promote.`,
  );
  if (failures.length) {
    console.error(`${failures.length} failure(s):\n  ${failures.join('\n  ')}`);
    process.exitCode = 1;
  }
}

function loadManifest(): Manifest {
  return JSON.parse(readFileSync(MANIFEST, 'utf8')) as Manifest;
}

/** The manifest clip for a release line, from its old entry (or the profile when it's new). */
function releaseClip(
  old: Clip | undefined,
  j: Pick<PlanJob, 'id' | 'speaker' | 'key' | 'text' | 'delivery' | 'file'>,
  src: {
    engine: string;
    voice: string;
    rate: number;
    licence: string;
    provenance: 'licensed_tts' | 'recorded';
  },
  m: { duration: number; meanDb: number },
): Clip | null {
  const p = VOICE_PROFILES[j.speaker];
  if (!p) return null;
  return {
    dialogueId: j.id,
    characterId: j.speaker,
    voiceId: `${src.engine}:${src.voice}`,
    accent: old?.accent ?? p.accent,
    locale: old?.locale ?? p.locale,
    key: old?.key ?? j.key,
    delivery: j.delivery,
    transcript: j.text,
    file: j.file,
    duration: m.duration,
    meanDb: m.meanDb,
    playback: old?.playback ?? { gain: 1, rate: 1 },
    source: {
      engine: src.engine,
      voice: src.voice,
      rate: src.rate,
      pitch: 1,
      placeholder: false,
      deterministic: false,
      licence: src.licence,
      provenance: src.provenance,
    },
  };
}

/** Write the manifest only if it still validates (development rules), atomically. */
function saveManifest(m: Manifest, changed: number, what: string): void {
  m.clips.sort((a, b) => (a.dialogueId < b.dialogueId ? -1 : 1));
  m.status = m.clips.some((c) => c.source.placeholder !== false) ? 'placeholder' : 'release';
  const issues = validateManifest(m, { script: voiceScript(), profiles: VOICE_PROFILES });
  const errors = issues.filter((i) => i.level === 'error');
  // Lines still waiting for their first render are missing either way; anything else blocks.
  const blocking = errors.filter((i) => i.code !== 'missing-clip');
  if (blocking.length) {
    for (const i of blocking.slice(0, 20)) console.error(`  ${i.code}: ${i.id ?? ''} ${i.message}`);
    console.error(`manifest NOT updated: ${blocking.length} error(s) after ${what}`);
    process.exitCode = 1;
    return;
  }
  writeAtomic(MANIFEST, `${JSON.stringify(m, null, 2)}\n`);
  const s = summarise(issues);
  console.log(
    `${what}: ${changed} clip(s) now release; manifest status "${m.status}" (${s.errors} error(s), ${s.warnings} warning(s))`,
  );
}

async function promote(): Promise<void> {
  const index = readIndex();
  const lines = index.clips.filter((c) => c.kind === 'line' && (!only || only.has(c.speaker)));
  const notLicensed = lines.filter((c) => c.provenance !== 'licensed_tts');
  if (notLicensed.length) {
    console.error(
      `refused: ${notLicensed.length} staged clip(s) aren't licensed TTS (${[...new Set(notLicensed.map((c) => c.engine))].join(', ')}); only licensed_tts is promoted. Nothing changed.`,
    );
    process.exitCode = 1;
    return;
  }
  const m = loadManifest();
  const byId = new Map(m.clips.map((c) => [c.dialogueId, c]));
  let changed = 0;
  for (const s of lines) {
    const from = stagedPath(s.file);
    if (!existsSync(from)) continue;
    const to = publicPath(s.file);
    mkdirSync(dirname(to), { recursive: true });
    copyFileSync(from, to);
    const measured = await measure(to);
    const clip = releaseClip(byId.get(s.id), s, { ...s, provenance: 'licensed_tts' }, measured);
    if (!clip) continue;
    byId.set(s.id, clip);
    changed++;
  }
  m.clips = [...byId.values()];
  const segments = index.clips.filter((c) => c.kind === 'segment').length;
  if (segments)
    console.log(
      `${segments} staged segment clip(s) stay in ${STAGE}: segments don't ship yet (docs/TODO.md Phase 3).`,
    );
  saveManifest(m, changed, 'promote');
}

const TAKE = /\.(wav|mp3|flac|aif|aiff|m4a)$/i;

async function importTakes(dir: string): Promise<void> {
  const plan = voicePlan(voiceScript(), CAST);
  const m = loadManifest();
  const byId = new Map(m.clips.map((c) => [c.dialogueId, c]));
  let changed = 0;
  let unknown = 0;
  for (const speaker of readdirSync(dir)) {
    const cast = CAST[speaker];
    if (!cast || cast.provenance !== 'recorded') continue;
    const folder = join(dir, speaker);
    const srcFile = join(folder, 'source.json');
    const src = existsSync(srcFile)
      ? (JSON.parse(readFileSync(srcFile, 'utf8')) as { licence?: string; performer?: string })
      : {};
    if (!src.licence?.trim() || !src.performer?.trim()) {
      console.error(
        `refused: ${speaker}: ${srcFile} needs a "licence" and a "performer" (the signed terms). Nothing imported for ${speaker}.`,
      );
      process.exitCode = 1;
      continue;
    }
    // Takes are named after the clip's file: <hash>.wav, <hash>-slow.wav (the review sheet lists them).
    const jobsByName = new Map(
      plan.recorded.filter((j) => j.speaker === speaker).map((j) => [basename(j.file, '.mp3'), j]),
    );
    for (const name of readdirSync(folder).filter((f) => TAKE.test(f))) {
      const j = jobsByName.get(basename(name, extname(name)));
      if (!j) {
        unknown++;
        console.warn(`  ${speaker}/${name}: not a line in the script (named after a clip file?)`);
        continue;
      }
      const to = publicPath(j.file);
      await encode(join(folder, name), to);
      const measured = await measure(to);
      const clip = releaseClip(
        byId.get(j.id),
        j,
        {
          engine: 'recording',
          voice: src.performer.trim(),
          rate: 1,
          licence: src.licence.trim(),
          provenance: 'recorded',
        },
        measured,
      );
      if (!clip) continue;
      byId.set(j.id, clip);
      changed++;
    }
  }
  m.clips = [...byId.values()];
  if (unknown) console.warn(`${unknown} take(s) didn't match a line and were skipped.`);
  saveManifest(m, changed, 'import');
}

if (args.includes('--promote')) await promote();
else if (importDir) await importTakes(importDir);
else await render();
