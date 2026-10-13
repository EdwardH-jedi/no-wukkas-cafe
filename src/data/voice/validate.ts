// Manifest validation shared by `npm run voices`, `npm run voices:check` and the unit tests.
// Pure: no file system. File-level checks (exists, measured duration, orphans) are done by
// scripts/voices-check.ts on top of this.

import { dialogueId } from './ids';
import { VOICE_URL_PREFIX, type VoiceClip, type VoiceManifest } from './manifest';
import type { VoiceProfile } from './profiles';
import type { ScriptLine } from './script';

export type IssueCode =
  | 'version'
  | 'status'
  | 'field'
  | 'duplicate-id'
  | 'duplicate-file'
  | 'id-mismatch'
  | 'file-mismatch'
  | 'unknown-speaker'
  | 'accent-mismatch'
  | 'locale-mismatch'
  | 'duration'
  | 'pace'
  | 'quiet'
  | 'playback'
  | 'placeholder-flag'
  | 'placeholder-in-release'
  | 'no-licence'
  | 'missing-clip'
  | 'stale-clip'
  | 'shared-voice'
  | 'pitch-shift';

export interface Issue {
  level: 'error' | 'warn';
  code: IssueCode;
  id?: string;
  message: string;
}

export interface ValidateOptions {
  /** Every line the game can say (voiceScript()). */
  script: readonly ScriptLine[];
  profiles: Record<string, VoiceProfile>;
  /** Release check: placeholder audio is an error. */
  release?: boolean;
}

/** Speech pace bounds, words per second: slower suggests stray silence or letter-spelling,
 *  faster suggests truncation. */
export const PACE_RANGE: readonly [number, number] = [1.2, 6];
/** Below this mean loudness a clip is treated as (nearly) silent, dB. */
export const QUIET_DB = -35;
export const DURATION_RANGE: readonly [number, number] = [0.3, 30];

/** The file path a clip must have for its id and delivery. */
export function expectedFile(
  c: Pick<VoiceClip, 'characterId' | 'dialogueId' | 'delivery'>,
): string {
  const hash = c.dialogueId.split(':')[1] ?? '';
  return `${VOICE_URL_PREFIX}${c.characterId}/${hash}${c.delivery === 'slow' ? '-slow' : ''}.mp3`;
}

const words = (t: string): number => t.trim().split(/\s+/).length;

export function validateManifest(m: VoiceManifest, o: ValidateOptions): Issue[] {
  const out: Issue[] = [];
  const err = (code: IssueCode, message: string, id?: string): void => {
    out.push({ level: 'error', code, message, ...(id ? { id } : {}) });
  };
  const warn = (code: IssueCode, message: string, id?: string): void => {
    out.push({ level: 'warn', code, message, ...(id ? { id } : {}) });
  };

  if (m.version !== 2) err('version', `manifest version ${String(m.version)}, expected 2`);
  const anyPlaceholder = m.clips.some((c) => c.source?.placeholder !== false);
  if (anyPlaceholder && m.status !== 'placeholder')
    err('status', `status is "${m.status}" but placeholder clips are listed`);
  if (!anyPlaceholder && m.clips.length > 0 && m.status !== 'release')
    warn('status', 'every clip is release audio but status is not "release"');

  const ids = new Set<string>();
  const files = new Set<string>();
  for (const c of m.clips) {
    const id = c.dialogueId;
    const strings: Array<keyof VoiceClip> = [
      'dialogueId',
      'characterId',
      'voiceId',
      'accent',
      'locale',
      'key',
      'delivery',
      'transcript',
      'file',
    ];
    const missing = strings.filter(
      (k) => typeof c[k] !== 'string' || (c[k] as string).length === 0,
    );
    if (missing.length || !c.source || !c.playback || !Number.isFinite(c.duration)) {
      err(
        'field',
        `missing or empty: ${[...missing, ...(c.source ? [] : ['source'])].join(', ')}`,
        id,
      );
      continue;
    }
    if (ids.has(id)) err('duplicate-id', 'dialogue id listed twice', id);
    ids.add(id);
    if (files.has(c.file)) err('duplicate-file', `file ${c.file} used by two clips`, id);
    files.add(c.file);
    if (dialogueId(c.characterId, c.transcript, c.delivery) !== id)
      err('id-mismatch', 'id does not match speaker + transcript + delivery', id);
    if (c.file !== expectedFile(c)) err('file-mismatch', `file should be ${expectedFile(c)}`, id);

    const p = o.profiles[c.characterId];
    if (!p) err('unknown-speaker', `no voice profile for ${c.characterId}`, id);
    else {
      if (p.accent !== c.accent)
        err('accent-mismatch', `accent ${c.accent}, profile ${p.accent}`, id);
      if (p.locale !== c.locale)
        err('locale-mismatch', `locale ${c.locale}, profile ${p.locale}`, id);
    }

    if (c.duration < DURATION_RANGE[0] || c.duration > DURATION_RANGE[1])
      err('duration', `duration ${c.duration} s is outside ${DURATION_RANGE.join('–')} s`, id);
    else {
      const pace = words(c.transcript) / c.duration;
      if (pace < PACE_RANGE[0] || pace > PACE_RANGE[1])
        err('pace', `${pace.toFixed(2)} words/s is outside ${PACE_RANGE.join('–')}`, id);
    }
    if (!(c.meanDb > QUIET_DB)) err('quiet', `mean loudness ${c.meanDb} dB looks silent`, id);
    if (!(c.playback.gain > 0) || !(c.playback.rate > 0))
      err('playback', 'playback gain and rate must be positive', id);

    if (c.source.engine === 'macos-say' && c.source.placeholder !== true)
      err('placeholder-flag', 'macOS system voices can only ever be placeholders', id);
    if (c.source.placeholder === false && !(c.source.licence && c.source.licence.trim()))
      err('no-licence', 'release clip without a licence statement', id);
    if (o.release && c.source.placeholder !== false)
      err('placeholder-in-release', 'placeholder audio cannot ship', id);
    // A character identity can't be another voice pitched up or down (docs/VOICE_CASTING.md).
    if (o.release && c.source.pitch !== 1)
      err('pitch-shift', `pitch ${c.source.pitch}: release voices are cast, not pitch-shifted`, id);
  }

  // Release: one base voice per character, never shared between characters.
  if (o.release) {
    const owners = new Map<string, Set<string>>();
    for (const c of m.clips) {
      const v = `${c.source?.engine}:${c.source?.voice}`;
      if (!owners.has(v)) owners.set(v, new Set());
      owners.get(v)!.add(c.characterId);
    }
    for (const [v, who] of owners)
      if (who.size > 1)
        err(
          'shared-voice',
          `${v} voices ${[...who].sort().join(', ')}: each character needs their own voice`,
        );
  }

  const scripted = new Set<string>();
  for (const l of o.script) {
    const id = dialogueId(l.speaker, l.text, l.delivery);
    scripted.add(id);
    if (!ids.has(id)) err('missing-clip', `no clip for ${l.speaker}: "${l.text}"`, id);
  }
  for (const id of ids)
    if (!scripted.has(id)) warn('stale-clip', 'clip for a line the game no longer says', id);
  return out;
}

export function summarise(issues: readonly Issue[]): { errors: number; warnings: number } {
  return {
    errors: issues.filter((i) => i.level === 'error').length,
    warnings: issues.filter((i) => i.level === 'warn').length,
  };
}
