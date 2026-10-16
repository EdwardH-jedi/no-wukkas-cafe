// Google Cloud Text-to-Speech (Chirp 3 HD) for the licensed voice pass (docs/TODO.md Phase 3).
// REST v1, plain fetch. Checked against Google's public docs on 2026-10-16 (no account, no call):
//   POST https://texttospeech.googleapis.com/v1/text:synthesize
//     { input: { text }, voice: { languageCode, name }, audioConfig: { audioEncoding, speakingRate } }
//     → { audioContent: base64 }   (MP3 at 32 kbps; input up to 5000 bytes)
//   GET  https://texttospeech.googleapis.com/v1/voices?languageCode=en-AU
//     → { voices: [{ languageCodes, name, ssmlGender, naturalSampleRateHertz }] }
// Chirp 3 HD takes a speaking rate (0.25–2) but no pitch, so none is sent. Auth: an OAuth access
// token (`gcloud auth print-access-token`) with the billed project in `x-goog-user-project`, as
// in Google's own curl example. An API key (`x-goog-api-key`) is also accepted here but Google's TTS
// pages don't say the API takes keys: unverified. Quota: 200 requests a minute per project.
// Only scripts/voices-render.ts and voices-audition.ts call it, after paidAccess().

import type { RenderRequest, TtsProvider, TtsVoice } from './tts-provider.ts';

export const GOOGLE_TTS_URL = 'https://texttospeech.googleapis.com/v1';
/** Google's limit on one request's input. */
export const MAX_INPUT_BYTES = 5000;
export const RATE_RANGE: readonly [number, number] = [0.25, 2];

export type GoogleAuth =
  { kind: 'token'; token: string; project: string } | { kind: 'key'; key: string };

/** What --allow-paid needs, for the refusal message. */
export const GOOGLE_NEEDS =
  'GOOGLE_TTS_ACCESS_TOKEN (gcloud auth print-access-token) and GOOGLE_CLOUD_PROJECT, ' +
  'or GOOGLE_TTS_API_KEY (unverified for this API)';

export function googleAuthFrom(env: Record<string, string | undefined>): GoogleAuth | null {
  const token = env.GOOGLE_TTS_ACCESS_TOKEN?.trim();
  const project = env.GOOGLE_CLOUD_PROJECT?.trim();
  if (token && project) return { kind: 'token', token, project };
  const key = env.GOOGLE_TTS_API_KEY?.trim();
  return key ? { kind: 'key', key } : null;
}

export function googleHeaders(auth: GoogleAuth): Record<string, string> {
  const base = { 'Content-Type': 'application/json; charset=utf-8' };
  return auth.kind === 'token'
    ? { ...base, Authorization: `Bearer ${auth.token}`, 'x-goog-user-project': auth.project }
    : { ...base, 'x-goog-api-key': auth.key };
}

const clampRate = (r: number): number =>
  Math.round(Math.min(RATE_RANGE[1], Math.max(RATE_RANGE[0], r)) * 1000) / 1000;

/** The synthesize request body for one line. */
export function googleBody(r: RenderRequest): {
  input: { text: string };
  voice: { languageCode: string; name: string };
  audioConfig: { audioEncoding: 'MP3'; speakingRate: number };
} {
  const bytes = new TextEncoder().encode(r.text).length;
  if (bytes > MAX_INPUT_BYTES)
    throw new Error(`input is ${bytes} bytes; Google takes at most ${MAX_INPUT_BYTES}`);
  return {
    input: { text: r.text },
    voice: { languageCode: r.languageCode, name: r.voice },
    audioConfig: { audioEncoding: 'MP3', speakingRate: clampRate(r.rate) },
  };
}

type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

const fail = async (what: string, res: Response): Promise<never> => {
  throw new Error(`Google TTS ${what} ${res.status}: ${(await res.text()).slice(0, 300)}`);
};

export function googleProvider(auth: GoogleAuth, fetchFn: Fetch = fetch): TtsProvider {
  return {
    id: 'google',
    engine: 'google-tts',
    provenance: 'licensed_tts',
    format: 'mp3',
    async listVoices(languageCode: string): Promise<TtsVoice[]> {
      const res = await fetchFn(
        `${GOOGLE_TTS_URL}/voices?languageCode=${encodeURIComponent(languageCode)}`,
        { headers: googleHeaders(auth) },
      );
      if (!res.ok) return fail('voices', res);
      const body = (await res.json()) as {
        voices?: Array<{
          name: string;
          languageCodes?: string[];
          ssmlGender?: string;
          naturalSampleRateHertz?: number;
        }>;
      };
      return (body.voices ?? []).map((v) => ({
        name: v.name,
        languageCodes: v.languageCodes ?? [],
        ...(v.ssmlGender ? { gender: v.ssmlGender } : {}),
        ...(v.naturalSampleRateHertz ? { sampleRateHertz: v.naturalSampleRateHertz } : {}),
      }));
    },
    async render(r: RenderRequest): Promise<Uint8Array> {
      const res = await fetchFn(`${GOOGLE_TTS_URL}/text:synthesize`, {
        method: 'POST',
        headers: googleHeaders(auth),
        body: JSON.stringify(googleBody(r)),
      });
      if (!res.ok) return fail('synthesize', res);
      const body = (await res.json()) as { audioContent?: string };
      if (!body.audioContent) throw new Error('Google TTS synthesize: no audioContent');
      return Uint8Array.from(Buffer.from(body.audioContent, 'base64'));
    },
  };
}
