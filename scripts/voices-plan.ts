// What the licensed voice pass renders or records (docs/TODO.md Phase 3): every line of the voice
// script, and with `segments` every generated-order segment, split by the release cast
// (src/data/voice/casting.ts CAST) into TTS jobs and lines for the actors. Pure; shared by
// `npm run voices:estimate`, `npm run voices:render` and the review sheet.

import type { CastEntry } from '../src/data/voice/casting.ts';
import { dialogueId } from '../src/data/voice/ids.ts';
import { segmentFile } from '../src/data/voice/manifest.ts';
import type { ScriptLine } from '../src/data/voice/script.ts';
import type { Segment } from '../src/sim/listening/phrase.ts';
import { billedChars, forTts } from './tts-provider.ts';
import { expectedFile } from '../src/data/voice/validate.ts';

export interface PlanJob {
  speaker: string;
  kind: 'line' | 'segment';
  /** The manifest's dialogue id for a line; the segment id for a segment. */
  id: string;
  key: string;
  /** Exact words (subtitles, the actor's script). */
  text: string;
  delivery: 'normal' | 'slow';
  /** URL path the clip is served at ("assets/voice/…"). */
  file: string;
  /** TTS only: what the engine is sent, its speaking rate and the characters billed. */
  sent: string;
  rate: number;
  chars: number;
}

export interface VoicePlan {
  /** Rendered by a licensed TTS voice. */
  tts: PlanJob[];
  /** Recorded by an actor (delivered with --import). */
  recorded: PlanJob[];
}

export function voicePlan(
  script: readonly ScriptLine[],
  cast: Record<string, CastEntry>,
  segments: Record<string, readonly Segment[]> | null = null,
): VoicePlan {
  const out: VoicePlan = { tts: [], recorded: [] };
  const add = (job: Omit<PlanJob, 'sent' | 'chars' | 'rate'>, lineRate: number): void => {
    const c = cast[job.speaker];
    if (!c) return;
    const sent = forTts(job.text);
    const rate = Math.round((c.rate ?? 1) * lineRate * 1000) / 1000;
    const full: PlanJob = { ...job, sent, rate, chars: billedChars(sent) };
    (c.provenance === 'licensed_tts' ? out.tts : out.recorded).push(full);
  };
  for (const l of script) {
    const id = dialogueId(l.speaker, l.text, l.delivery);
    add(
      {
        speaker: l.speaker,
        kind: 'line',
        id,
        key: l.key,
        text: l.text,
        delivery: l.delivery,
        file: expectedFile({ characterId: l.speaker, dialogueId: id, delivery: l.delivery }),
      },
      l.rate,
    );
  }
  // Segments are said at normal pace only (a slow repeat of a generated line is the browser voice).
  for (const [speaker, segs] of Object.entries(segments ?? {}))
    for (const g of segs)
      add(
        {
          speaker,
          kind: 'segment',
          id: g.id,
          key: g.id,
          text: g.text.trim(),
          delivery: 'normal',
          file: segmentFile(g.id),
        },
        1,
      );
  return out;
}

export interface SpeakerTotal {
  speaker: string;
  lines: number;
  segments: number;
  chars: number;
  words: number;
}

export function totalsBySpeaker(jobs: readonly PlanJob[]): SpeakerTotal[] {
  const by = new Map<string, SpeakerTotal>();
  for (const j of jobs) {
    const t = by.get(j.speaker) ?? {
      speaker: j.speaker,
      lines: 0,
      segments: 0,
      chars: 0,
      words: 0,
    };
    if (j.kind === 'line') t.lines++;
    else t.segments++;
    t.chars += j.chars;
    t.words += j.text.split(/\s+/).filter(Boolean).length;
    by.set(j.speaker, t);
  }
  return [...by.values()];
}
