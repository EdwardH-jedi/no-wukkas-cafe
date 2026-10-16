// Scenario 8: a production build containing an audio file with no verified licence fails. The
// classifier itself is unit-tested in tests/scripts/audioGate.test.ts; this runs the real Vite
// build hook (scripts/vite-voice.ts) on throwaway projects, and checks the game's own build
// config installs it. (Audio formats and paths the gate does not see: the .failing file.)

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { Plugin } from 'vite';
import config from '../../vite.config';
import { VOICE_MANIFEST } from '../../src/data/voice';
import { buildWithGate, project, type Project } from './audioGateBuild';

const made: Project[] = [];
const fresh = (main?: string): Project => {
  const p = project(main);
  made.push(p);
  return p;
};
afterEach(() => {
  for (const p of made.splice(0)) p.cleanup();
});

describe('S8: unlicensed audio fails the build', () => {
  it("the game's build config runs the release gate at build time", () => {
    const plugins = (config.plugins ?? []).flat() as Plugin[];
    const gate = plugins.find((p) => p?.name === 'nwc-audio-release-gate');
    expect(gate).toBeDefined();
    expect(gate?.apply).toBe('build');
    expect(typeof gate?.closeBundle).toBe('function');
  });

  it('a build with an unlisted audio file in public/ fails, naming the file', async () => {
    const p = fresh();
    p.put('public/assets/music/tram.ogg');
    const err = await buildWithGate(p);
    expect(err?.message).toMatch(
      /\[audio-gate\] 1 audio file\(s\) in the build have no verified licence/,
    );
    expect(err?.message).toContain('assets/music/tram.ogg');
  });

  it('every listed audio extension fails the same way, upper case included', async () => {
    const p = fresh();
    const files = ['a.mp3', 'b.WAV', 'c.m4a', 'd.flac', 'e.opus', 'f.webm'].map((f) => `sfx/${f}`);
    for (const f of files) p.put(`public/${f}`);
    const err = await buildWithGate(p);
    for (const f of files) expect(err?.message).toContain(f);
  });

  it('a placeholder voice clip is stripped from the build, not shipped (and the build passes)', async () => {
    const p = fresh();
    const clip = VOICE_MANIFEST.clips.find((c) => c.source.placeholder !== false)!;
    p.put(`public/${clip.file}`);
    expect(await buildWithGate(p)).toBeNull();
    expect(existsSync(join(p.dist, clip.file))).toBe(false);
    expect(existsSync(join(p.dist, 'index.html'))).toBe(true);
  });

  it('a build with no audio files passes', async () => {
    const p = fresh();
    p.put('public/robots.txt', 'User-agent: *');
    expect(await buildWithGate(p)).toBeNull();
  });
});
