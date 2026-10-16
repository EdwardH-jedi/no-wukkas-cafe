// The licensed-TTS provider interface for `npm run voices:render` and `npm run voices:estimate`
// (docs/TODO.md Phase 3): list voices, render one line, say what it costs. Paid providers are
// only ever reached through paidAccess(): `--allow-paid` AND credentials in the environment, or
// nothing but a dry run. Pure apart from the fetch the providers are handed; no file system.

import type { Provenance } from '../src/data/voice/manifest.ts';

export interface TtsVoice {
  name: string;
  languageCodes: string[];
  gender?: string;
  sampleRateHertz?: number;
}

export interface RenderRequest {
  /** What the engine reads (forTts of the line); billed as sent. */
  text: string;
  voice: string;
  languageCode: string;
  /** Speaking-rate multiplier, 1 = the voice's own pace. */
  rate: number;
}

export interface Cost {
  chars: number;
  usd: number;
  aud: number;
}

export interface TtsProvider {
  id: 'google' | 'fake';
  /** What the manifest records as `source.engine`. */
  engine: string;
  /** What its audio is: only licensed_tts may ever be promoted to release. */
  provenance: Provenance;
  /** Audio container `render` returns. */
  format: 'mp3' | 'wav';
  listVoices(languageCode: string): Promise<TtsVoice[]>;
  render(r: RenderRequest): Promise<Uint8Array>;
}

export interface Pricing {
  usdPerMillionChars: number;
  audPerUsd: number;
}

/** Billed characters: every character sent, spaces included (Google counts spaces and newlines). */
export const billedChars = (text: string): number => [...text].length;

export function estimateCost(chars: number, p: Pricing): Cost {
  const usd = (chars / 1_000_000) * p.usdPerMillionChars;
  return { chars, usd, aud: usd * p.audPerUsd };
}

/** What a TTS engine reads; subtitles keep the original. Only rewrites that keep the meaning
 *  (ranges, units, dashes); the macOS respellings in scripts/voices.ts aren't for real voices. */
export function forTts(text: string): string {
  return text
    .replace(/tss-tss/gi, 'tss, tss')
    .replace(/(\d+)\s*[–-]\s*(\d+)/g, '$1 to $2')
    .replace(/\s*°C/g, ' degrees')
    .replace(/\s*[—–]\s*/g, ', ')
    .replace(/…/g, '... ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export type PaidAccess<A> = { ok: true; auth: A } | { ok: false; reason: string };

/** The paid-call guard: an explicit `--allow-paid` and the provider's credentials, or a refusal
 *  that says what's missing (the caller then stays a dry run). */
export function paidAccess<A>(
  args: readonly string[],
  creds: A | null,
  needs: string,
): PaidAccess<A> {
  if (!args.includes('--allow-paid'))
    return { ok: false, reason: 'dry run: add --allow-paid to call the paid service' };
  if (!creds) return { ok: false, reason: `refused: --allow-paid needs ${needs}` };
  return { ok: true, auth: creds };
}
