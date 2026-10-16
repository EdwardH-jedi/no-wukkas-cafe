// Segment manifest validation (src/data/voice/segments.manifest.json) shared by
// `npm run voices:check`, `npm run voices:render -- --promote / --import` and the unit tests.
// Pure: no file system (scripts/voices-check.ts checks the files on top of this).
//
// Every entry is release audio, so the release rules always apply: a segment that exists, with its
// current words, at its own file, said by a cast (not pitch-shifted) voice of its own, with a
// licence and a provenance of licensed_tts or recorded. Segments are short: the length check
// is the renderer's (scripts/voices-render.ts), not a line's pace range.

import {
  PLACEHOLDER_ENGINES,
  RELEASE_PROVENANCE,
  segmentFile,
  type SegmentClip,
  type SegmentManifest,
} from './manifest';
import type { VoiceProfile } from './profiles';
import { QUIET_DB, type Issue, type IssueCode } from './validate';

export interface SegmentValidateOptions {
  /** Every segment the game can say, per speaker (data/voice/segments.ts SEGMENT_INVENTORY). */
  inventory: Record<string, ReadonlyArray<{ id: string; text: string }>>;
  profiles: Record<string, VoiceProfile>;
}

/** Shortest segment clip that can hold a word, seconds (scripts/voices-render.ts). */
export const SEGMENT_MIN_SECONDS = 0.05;

export function validateSegmentManifest(m: SegmentManifest, o: SegmentValidateOptions): Issue[] {
  const out: Issue[] = [];
  const err = (code: IssueCode, message: string, id?: string): void => {
    out.push({ level: 'error', code, message, ...(id ? { id } : {}) });
  };
  if (m.version !== 1) err('version', `segment manifest version ${String(m.version)}, expected 1`);
  if (!Array.isArray(m.clips)) {
    err('field', 'segment manifest has no clips list');
    return out;
  }
  const words = new Map<string, { speaker: string; text: string }>();
  for (const [speaker, segs] of Object.entries(o.inventory))
    for (const g of segs) words.set(g.id, { speaker, text: g.text.trim() });

  const ids = new Set<string>();
  const files = new Set<string>();
  const owners = new Map<string, Set<string>>();
  for (const c of m.clips) {
    const id = c.id;
    const strings: Array<keyof SegmentClip> = [
      'id',
      'characterId',
      'voiceId',
      'transcript',
      'file',
    ];
    const missing = strings.filter(
      (k) => typeof c[k] !== 'string' || (c[k] as string).length === 0,
    );
    if (missing.length || !c.source || !Number.isFinite(c.duration)) {
      err(
        'field',
        `missing or empty: ${[...missing, ...(c.source ? [] : ['source']), ...(Number.isFinite(c.duration) ? [] : ['duration'])].join(', ')}`,
        id,
      );
      continue;
    }
    if (ids.has(id)) err('duplicate-id', 'segment id listed twice', id);
    ids.add(id);
    if (files.has(c.file)) err('duplicate-file', `file ${c.file} used by two segments`, id);
    files.add(c.file);

    const seg = words.get(id);
    if (!seg) err('unknown-segment', 'not a segment the game says (SEGMENT_INVENTORY)', id);
    else {
      if (seg.speaker !== c.characterId)
        err('id-mismatch', `said by ${seg.speaker}, entry says ${c.characterId}`, id);
      if (seg.text !== c.transcript)
        err('segment-text', `the segment now says "${seg.text}", the clip "${c.transcript}"`, id);
    }
    if (c.file !== segmentFile(id)) err('file-mismatch', `file should be ${segmentFile(id)}`, id);
    if (!o.profiles[c.characterId])
      err('unknown-speaker', `no voice profile for ${c.characterId}`, id);

    if (!(c.duration > SEGMENT_MIN_SECONDS))
      err('duration', `duration ${c.duration} s is too short for a word`, id);
    if (!(c.meanDb > QUIET_DB)) err('quiet', `mean loudness ${c.meanDb} dB looks silent`, id);

    // Only release audio is listed: placeholder segment clips stay in voice-cache/segments/.
    if (c.source.placeholder !== false)
      err('placeholder-in-release', 'placeholder segment clips are never listed', id);
    if (PLACEHOLDER_ENGINES.includes(c.source.engine))
      err('placeholder-flag', `${c.source.engine} voices can only ever be placeholders`, id);
    if (!(c.source.licence && c.source.licence.trim()))
      err('no-licence', 'segment clip without a licence statement', id);
    const prov = c.source.provenance;
    if (!(prov && RELEASE_PROVENANCE.includes(prov)))
      err(
        'provenance',
        `provenance must be licensed_tts or recorded, not ${prov ?? 'missing'}`,
        id,
      );
    if (c.source.pitch !== 1)
      err('pitch-shift', `pitch ${c.source.pitch}: release voices are cast, not pitch-shifted`, id);
    const v = `${c.source.engine}:${c.source.voice}`;
    if (!owners.has(v)) owners.set(v, new Set());
    owners.get(v)!.add(c.characterId);
  }
  for (const [v, who] of owners)
    if (who.size > 1)
      err(
        'shared-voice',
        `${v} voices ${[...who].sort().join(', ')}: each character needs their own voice`,
      );
  return out;
}
