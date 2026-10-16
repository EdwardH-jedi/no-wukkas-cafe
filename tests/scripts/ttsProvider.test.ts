// The licensed-TTS provider layer (scripts/tts-provider.ts, scripts/tts-google.ts): the paid-call
// guard, cost maths, what the engine reads, and the Google requests, with fetch stubbed. Nothing
// here reaches the network.

import { describe, expect, it } from 'vitest';
import {
  GOOGLE_TTS_URL,
  googleAuthFrom,
  googleBody,
  googleHeaders,
  googleProvider,
  MAX_INPUT_BYTES,
  type GoogleAuth,
} from '../../scripts/tts-google';
import { billedChars, estimateCost, forTts, paidAccess } from '../../scripts/tts-provider';
import { TTS_BUDGET } from '../../src/data/voice/casting';

const token: GoogleAuth = { kind: 'token', token: 'tok', project: 'nwc-voices' };

describe('the paid-call guard', () => {
  it('needs --allow-paid AND credentials; otherwise it says why and stays a dry run', () => {
    expect(paidAccess([], token, 'creds')).toEqual({
      ok: false,
      reason: expect.stringMatching(/dry run/),
    });
    expect(paidAccess(['--allow-paid'], null, 'GOOGLE_X')).toEqual({
      ok: false,
      reason: expect.stringMatching(/refused: --allow-paid needs GOOGLE_X/),
    });
    expect(paidAccess(['--allow-paid'], token, 'creds')).toEqual({ ok: true, auth: token });
  });

  it('reads Google credentials from the environment: a token with its project, or a key', () => {
    expect(googleAuthFrom({})).toBeNull();
    expect(googleAuthFrom({ GOOGLE_TTS_ACCESS_TOKEN: 'tok' })).toBeNull(); // no billed project
    expect(
      googleAuthFrom({ GOOGLE_TTS_ACCESS_TOKEN: ' tok ', GOOGLE_CLOUD_PROJECT: 'nwc-voices' }),
    ).toEqual(token);
    expect(googleAuthFrom({ GOOGLE_TTS_API_KEY: 'k' })).toEqual({ kind: 'key', key: 'k' });
    expect(googleHeaders(token)).toMatchObject({
      Authorization: 'Bearer tok',
      'x-goog-user-project': 'nwc-voices',
    });
    expect(googleHeaders({ kind: 'key', key: 'k' })).toMatchObject({ 'x-goog-api-key': 'k' });
  });
});

describe('cost and text', () => {
  it('bills every character sent, spaces included, and converts the price to AUD', () => {
    expect(billedChars('Flat white, ta.')).toBe(15);
    expect(billedChars('와, perfect!')).toBe(11);
    const c = estimateCost(1_000_000, TTS_BUDGET);
    expect(c.usd).toBeCloseTo(30);
    expect(c.aud).toBeCloseTo(48);
    expect(estimateCost(30_000, TTS_BUDGET).aud).toBeCloseTo(1.44);
  });

  it('reads ranges, units and dashes the way they are meant, and keeps everything else', () => {
    expect(forTts('Steam it to 68–74 °C — extra hot…')).toBe(
      'Steam it to 68 to 74 degrees, extra hot...',
    );
    expect(forTts("Mornin', ute's out the front.")).toBe("Mornin', ute's out the front.");
  });
});

describe('Google Cloud TTS requests', () => {
  const req = {
    text: 'Flat white, ta.',
    voice: 'en-AU-Chirp3-HD-Fenrir',
    languageCode: 'en-AU',
    rate: 1.1,
  };

  it('asks for MP3 at a speaking rate, never a pitch (Chirp 3 HD has none)', () => {
    expect(googleBody(req)).toEqual({
      input: { text: 'Flat white, ta.' },
      voice: { languageCode: 'en-AU', name: 'en-AU-Chirp3-HD-Fenrir' },
      audioConfig: { audioEncoding: 'MP3', speakingRate: 1.1 },
    });
    expect(googleBody({ ...req, rate: 3 }).audioConfig.speakingRate).toBe(2);
    expect(() => googleBody({ ...req, text: 'a'.repeat(MAX_INPUT_BYTES + 1) })).toThrow(/5000/);
  });

  it('posts to text:synthesize and decodes the base64 audio', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchFn = async (url: string, init?: RequestInit): Promise<Response> => {
      calls.push({ url, ...(init ? { init } : {}) });
      return new Response(
        JSON.stringify({ audioContent: Buffer.from('ID3fake').toString('base64') }),
      );
    };
    const audio = await googleProvider(token, fetchFn).render(req);
    expect(Buffer.from(audio).toString()).toBe('ID3fake');
    expect(calls[0]?.url).toBe(`${GOOGLE_TTS_URL}/text:synthesize`);
    expect(calls[0]?.init?.method).toBe('POST');
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual(googleBody(req));
  });

  it('lists voices for a language and surfaces errors with the status', async () => {
    const ok = googleProvider(
      token,
      async () =>
        new Response(
          JSON.stringify({
            voices: [
              {
                name: 'en-AU-Chirp3-HD-Kore',
                languageCodes: ['en-AU'],
                ssmlGender: 'FEMALE',
                naturalSampleRateHertz: 24000,
              },
            ],
          }),
        ),
    );
    expect(await ok.listVoices('en-AU')).toEqual([
      {
        name: 'en-AU-Chirp3-HD-Kore',
        languageCodes: ['en-AU'],
        gender: 'FEMALE',
        sampleRateHertz: 24000,
      },
    ]);
    const denied = googleProvider(
      token,
      async () => new Response('PERMISSION_DENIED', { status: 403 }),
    );
    await expect(denied.render(req)).rejects.toThrow(/synthesize 403: PERMISSION_DENIED/);
  });
});
