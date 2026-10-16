import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildWithGate, project, type Project } from './audioGateBuild';

const made: Project[] = [];
const fresh = (main?: string): Project => {
  const p = project(main);
  made.push(p);
  return p;
};
afterEach(() => made.splice(0).forEach((p) => p.cleanup()));

describe('independent release build mutations in scratch projects', () => {
  it('rejects an unlisted .aif in public', async () => {
    const p = fresh();
    p.put('public/probe.aif', 'FORM....AIFF');
    const err = await buildWithGate(p, p.dir);
    console.log(`public .aif: ${err?.message ?? 'BUILD SUCCEEDED'}`);
    expect(err?.message).toContain('probe.aif');
  });

  it('rejects an .mp3 imported from src', async () => {
    const p = fresh('import url from "./src/probe.mp3"; console.log(url);');
    p.put('src/probe.mp3');
    const err = await buildWithGate(p, p.dir);
    console.log(`src .mp3 import: ${err?.message ?? 'BUILD SUCCEEDED'}`);
    expect(err?.message).toContain('[audio-gate]');
  });

  it('rejects a licensed_tts line clip with the licence field missing', async () => {
    const p = fresh();
    p.put(
      'src/data/voice/manifest.json',
      JSON.stringify({
        version: 1,
        clips: [
          {
            file: 'assets/voice/probe.mp3',
            source: { placeholder: false, provenance: 'licensed_tts' },
          },
        ],
      }),
    );
    p.put('public/assets/voice/probe.mp3');
    const err = await buildWithGate(p, p.dir);
    console.log(`missing licence: ${err?.message ?? 'BUILD SUCCEEDED'}`);
    expect(err?.message).toContain('release voice clip without a licence');
  });

  for (const placeholder of [true, false]) {
    it(`rejects a segment of provenance placeholder (placeholder flag ${placeholder})`, async () => {
      const p = fresh();
      const file = 'assets/voice/segments/dazza/probe.mp3';
      p.put(
        'src/data/voice/segments.manifest.json',
        JSON.stringify({
          version: 1,
          clips: [
            {
              file,
              source: { placeholder, provenance: 'placeholder', licence: 'placeholder only' },
            },
          ],
        }),
      );
      p.put(`public/${file}`);
      const err = await buildWithGate(p, p.dir);
      console.log(
        JSON.stringify({
          placeholder,
          error: err?.message ?? null,
          remainsInBuild: existsSync(join(p.dist, file)),
        }),
      );
      expect(
        err,
        'The requested strict gate must reject the build, not only strip its file',
      ).not.toBeNull();
    });
  }
});
