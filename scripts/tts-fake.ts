// A stand-in TTS provider for the tests of `npm run voices:render`: a sine tone as long as the line
// would take to say (2.5 words a second), made by ffmpeg. Free and offline. Selected only by the
// test environment (NWC_FAKE_TTS=1); its engine (`fake-tts`) and provenance (`placeholder`) can
// never be promoted or pass a release check (src/data/voice/validate.ts).

import { execFile } from 'node:child_process';
import { readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type { RenderRequest, TtsProvider } from './tts-provider.ts';

const run = promisify(execFile);
let n = 0;

export function fakeProvider(): TtsProvider {
  return {
    id: 'fake',
    engine: 'fake-tts',
    provenance: 'placeholder',
    format: 'wav',
    listVoices: async (languageCode) => [
      { name: `${languageCode}-Fake-A`, languageCodes: [languageCode] },
    ],
    async render(r: RenderRequest): Promise<Uint8Array> {
      const words = r.text.trim().split(/\s+/).length;
      const seconds = Math.max(0.6, words / 2.5 / Math.max(0.25, r.rate));
      const out = join(tmpdir(), `nwc-fake-tts-${process.pid}-${n++}.wav`);
      await run('ffmpeg', [
        '-hide_banner',
        '-loglevel',
        'error',
        '-y',
        '-f',
        'lavfi',
        '-i',
        `sine=frequency=220:duration=${seconds.toFixed(2)}`,
        '-ar',
        '24000',
        '-ac',
        '1',
        out,
      ]);
      try {
        return new Uint8Array(await readFile(out));
      } finally {
        await rm(out, { force: true });
      }
    },
  };
}
