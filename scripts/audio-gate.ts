// Release gate for audio files (Codex A4/A6): decides, for every audio file in a build, whether it
// may ship. Pure; used by the Vite build plugin (scripts/vite-voice.ts) and the unit tests.
//
//   keep    release voice clips (in the voice manifest, licensed, provenance licensed_tts or
//           recorded) and files listed in src/data/audio/provenance.json with a verified licence
//   strip   placeholder voice clips (development audio that must never ship)
//   reject  anything else: unknown provenance fails the build instead of shipping silently

/** Every audio format the gate checks: what browsers play, plus the formats takes arrive in
 *  (AIFF and CAF from macOS; scripts/voices-render.ts and voices-audition.ts import AIFF). */
export const AUDIO_FILE =
  /\.(mp3|ogg|oga|wav|m4a|aac|flac|opus|weba|webm|mid|midi|aif|aiff|aifc|caf)$/i;

export interface VoiceManifestLike {
  clips: Array<{
    file: string;
    source?: { placeholder?: boolean; licence?: string; provenance?: string };
  }>;
}

/** The only provenances a shipped voice clip may have (src/data/voice/manifest.ts). */
const SHIPPABLE = new Set(['licensed_tts', 'recorded']);

export interface ProvenanceEntry {
  file: string;
  title: string;
  author: string;
  source: string;
  licence: string;
  /** Who checked the licence allows use in this game, and when (ISO date). */
  verifiedBy: string;
  verifiedOn: string;
}

export interface ProvenanceLike {
  files: ProvenanceEntry[];
}

export interface GateResult {
  keep: string[];
  strip: string[];
  reject: Array<{ file: string; why: string }>;
}

const verified = (e: ProvenanceEntry): boolean =>
  [e.licence, e.source, e.verifiedBy, e.verifiedOn].every(
    (x) => typeof x === 'string' && x.trim().length > 0,
  );

/** `files`: paths relative to the build root, forward slashes (e.g. "assets/voice/gaz/x.mp3"). */
export function classifyAudio(
  files: readonly string[],
  voice: VoiceManifestLike,
  provenance: ProvenanceLike,
): GateResult {
  const voiceBy = new Map(voice.clips.map((c) => [c.file, c]));
  const provBy = new Map(provenance.files.map((e) => [e.file, e]));
  const out: GateResult = { keep: [], strip: [], reject: [] };
  for (const f of files) {
    if (!AUDIO_FILE.test(f)) continue;
    const v = voiceBy.get(f);
    if (v) {
      const s = v.source;
      if (s?.placeholder !== false) out.strip.push(f);
      else if (!s.licence?.trim())
        out.reject.push({ file: f, why: 'release voice clip without a licence' });
      else if (!SHIPPABLE.has(s.provenance ?? ''))
        out.reject.push({
          file: f,
          why: `release voice clip provenance is ${s.provenance ?? 'missing'}, not licensed_tts or recorded`,
        });
      else out.keep.push(f);
      continue;
    }
    const p = provBy.get(f);
    if (p && verified(p)) out.keep.push(f);
    else if (p)
      out.reject.push({
        file: f,
        why: 'listed in provenance.json but the licence is not verified',
      });
    else
      out.reject.push({
        file: f,
        why: 'no provenance: not in the voice manifest or provenance.json',
      });
  }
  return out;
}

/** Vite's `build.assetsInlineLimit`, never inlining audio: audio imported from code is emitted as
 *  a file, so the gate sees it. Anything else keeps the project's own limit (or Vite's default). */
export function neverInlineAudio(
  limit?: number | ((file: string, content: Buffer) => boolean | undefined),
): (file: string, content: Buffer) => boolean | undefined {
  return (file, content) => {
    if (AUDIO_FILE.test(file)) return false;
    if (typeof limit === 'function') return limit(file, content);
    return limit === undefined ? undefined : content.length < limit;
  };
}

/** Audio modules a build would ship inside its code, with no file emitted for the gate to see:
 *  imported with `?inline` (a data: URL, whatever the limit) or `?raw` (the bytes as a string).
 *  `moduleIds` as the bundler reports them (paths with their query). */
export function audioInCode(moduleIds: readonly string[]): string[] {
  return moduleIds.filter((id) => {
    const q = id.indexOf('?');
    if (q < 0 || !AUDIO_FILE.test(id.slice(0, q))) return false;
    const query = new URLSearchParams(id.slice(q + 1));
    return query.has('inline') || query.has('raw');
  });
}
