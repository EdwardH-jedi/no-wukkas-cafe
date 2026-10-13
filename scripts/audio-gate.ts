// Release gate for audio files (Codex A4/A6): decides, for every audio file in a build, whether it
// may ship. Pure; used by the Vite build plugin (scripts/vite-voice.ts) and the unit tests.
//
//   keep    release voice clips (licensed, in the voice manifest) and files listed in
//           src/data/audio/provenance.json with a verified licence
//   strip   placeholder voice clips (development audio that must never ship)
//   reject  anything else: unknown provenance fails the build instead of shipping silently

export const AUDIO_FILE = /\.(mp3|ogg|oga|wav|m4a|aac|flac|opus|weba|webm|mid|midi)$/i;

export interface VoiceManifestLike {
  clips: Array<{ file: string; source?: { placeholder?: boolean; licence?: string } }>;
}

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
      if (v.source?.placeholder === false && v.source.licence?.trim()) out.keep.push(f);
      else if (v.source?.placeholder === false)
        out.reject.push({ file: f, why: 'release voice clip without a licence' });
      else out.strip.push(f);
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
