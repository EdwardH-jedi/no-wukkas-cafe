import { describe, expect, it } from 'vitest';
import { VOICE_MANIFEST } from '../../src/data/voice';
import { dialogueId } from '../../src/data/voice/ids';
import type { VoiceClip, VoiceManifest } from '../../src/data/voice/manifest';
import { VOICE_PROFILES } from '../../src/data/voice/profiles';
import { awaitingRender, voiceScript } from '../../src/data/voice/script';
import {
  expectedFile,
  validateManifest,
  type Issue,
  type IssueCode,
} from '../../src/data/voice/validate';

const script = voiceScript();
const opts = { script, profiles: VOICE_PROFILES };
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
const codes = (m: VoiceManifest, release = false): IssueCode[] =>
  validateManifest(m, { ...opts, release }).map((i) => i.code);

// Lines whose words changed since the last render are missing until `npm run voices`, and the
// clips they replace are stale until then (src/data/voice/script.ts AWAITING_RENDER).
const keyOf = new Map<string, string>([
  ...script.map((l) => [dialogueId(l.speaker, l.text, l.delivery), l.key] as const),
  ...VOICE_MANIFEST.clips.map((c) => [c.dialogueId, c.key] as const),
]);
const settled = (issues: Issue[]): Issue[] =>
  issues.filter(
    (i) =>
      !(
        (i.code === 'missing-clip' || i.code === 'stale-clip') &&
        awaitingRender(keyOf.get(i.id ?? '') ?? '')
      ),
  );

describe('the committed voice manifest', () => {
  it('is valid for development: no errors, no warnings (bar lines awaiting their render)', () => {
    expect(settled(validateManifest(VOICE_MANIFEST, opts))).toEqual([]);
  });

  it('is honestly labelled: placeholder status, every clip a placeholder with a source', () => {
    expect(VOICE_MANIFEST.version).toBe(2);
    expect(VOICE_MANIFEST.status).toBe('placeholder');
    expect(VOICE_MANIFEST.licence).toMatch(/PLACEHOLDER/);
    for (const c of VOICE_MANIFEST.clips) {
      expect(c.source.placeholder).toBe(true);
      expect(typeof c.source.deterministic).toBe('boolean');
    }
  });

  it('fails a release check: placeholders, pitch-shifted and shared voices', () => {
    const issues = validateManifest(VOICE_MANIFEST, { ...opts, release: true });
    const by = (code: string): number => issues.filter((i) => i.code === code).length;
    expect(by('placeholder-in-release')).toBe(VOICE_MANIFEST.clips.length);
    // Gaz, Dazza and Karen are Karen pitched; Beryl is plain Karen.
    expect(by('pitch-shift')).toBe(VOICE_MANIFEST.clips.filter((c) => c.source.pitch !== 1).length);
    expect(issues.find((i) => i.code === 'shared-voice')?.message).toMatch(
      /beryl, dazza, gaz, karen/,
    );
  });

  it('records which voices render reproducibly (Tara does not)', () => {
    const tara = VOICE_MANIFEST.clips.filter((c) => c.source.voice === 'Tara');
    if (tara.length) expect(tara.every((c) => c.source.deterministic === false)).toBe(true);
  });
});

describe('validation catches broken manifests', () => {
  const base = (): VoiceManifest => clone(VOICE_MANIFEST);
  const first = (m: VoiceManifest): VoiceClip => m.clips[0] as VoiceClip;

  it('duplicate dialogue ids and files', () => {
    const m = base();
    m.clips.push(clone(first(m)));
    const got = codes(m);
    expect(got).toContain('duplicate-id');
    expect(got).toContain('duplicate-file');
  });

  it('an id or file that does not match the speaker, words and delivery', () => {
    const m = base();
    first(m).transcript += ' (edited)';
    first(m).file = 'assets/voice/gaz/00000000.mp3';
    const got = codes(m);
    expect(got).toContain('id-mismatch');
    expect(got).toContain('file-mismatch');
  });

  it('unknown speaker, wrong accent or locale', () => {
    const a = base();
    first(a).accent = first(a).accent === 'korean' ? 'indian' : 'korean';
    first(a).locale = 'xx-XX';
    expect(codes(a)).toEqual(expect.arrayContaining(['accent-mismatch', 'locale-mismatch']));
    const b = base();
    const c = first(b);
    c.characterId = 'nobody';
    c.dialogueId = dialogueId('nobody', c.transcript, c.delivery);
    c.file = expectedFile(c);
    expect(codes(b)).toContain('unknown-speaker');
  });

  it('durations, pace and loudness that do not look like the line spoken', () => {
    const tooShort = base();
    first(tooShort).duration = 0.1;
    expect(codes(tooShort)).toContain('duration');
    const tooSlow = base();
    first(tooSlow).duration = 29; // a few words over 29 s: stray silence or spelling-out
    expect(codes(tooSlow)).toContain('pace');
    const silent = base();
    first(silent).meanDb = -60;
    expect(codes(silent)).toContain('quiet');
    const bad = base();
    first(bad).playback.rate = 0;
    expect(codes(bad)).toContain('playback');
  });

  it('missing fields', () => {
    const m = base();
    (first(m) as unknown as Record<string, unknown>).transcript = '';
    expect(codes(m)).toContain('field');
  });

  it('a missing clip is an error, a clip for a line the game no longer says is a warning', () => {
    const m = base();
    const gone = m.clips.find((c) => !awaitingRender(c.key)) as VoiceClip;
    m.clips.splice(m.clips.indexOf(gone), 1);
    const issues = validateManifest(m, opts);
    expect(issues.map((i) => i.id)).toContain(gone.dialogueId);
    expect(issues.find((i) => i.id === gone.dialogueId)?.code).toBe('missing-clip');
    const extra = base();
    const c = clone(first(extra));
    c.transcript = 'A line nobody says any more, mate.';
    c.dialogueId = dialogueId(c.characterId, c.transcript, c.delivery);
    c.file = expectedFile(c);
    extra.clips.push(c);
    const stale = validateManifest(extra, opts).filter(
      (i) => i.code === 'stale-clip' && i.id === c.dialogueId,
    );
    expect(stale.map((i) => i.level)).toEqual(['warn']);
  });

  it('placeholder vs release: macOS voices can never be release audio; release needs a licence', () => {
    const m = base();
    first(m).source.placeholder = false;
    expect(codes(m)).toEqual(expect.arrayContaining(['placeholder-flag', 'no-licence']));
    const licensed = base();
    for (const c of licensed.clips) {
      c.source = {
        ...c.source,
        engine: 'studio',
        placeholder: false,
        licence: 'Buyout from the voice actor, 2027',
      };
    }
    licensed.status = 'release';
    // Still not shippable: the Australians share one voice and three of them are pitch-shifted.
    const codes2 = new Set(
      settled(validateManifest(licensed, { ...opts, release: true })).map((i) => i.code),
    );
    expect(codes2).toEqual(new Set(['shared-voice', 'pitch-shift']));
    // Cast properly: a voice of their own each, no pitch shift.
    for (const c of licensed.clips)
      c.source = { ...c.source, voice: `cast-${c.characterId}`, pitch: 1 };
    expect(settled(validateManifest(licensed, { ...opts, release: true }))).toEqual([]);
  });

  it('manifest version and status', () => {
    const m = base() as unknown as Record<string, unknown>;
    m.version = 1;
    m.status = 'release'; // while every clip is still a placeholder
    expect(codes(m as unknown as VoiceManifest)).toEqual(
      expect.arrayContaining(['version', 'status']),
    );
  });
});

describe('expected clip paths', () => {
  it('follow speaker, id hash and delivery', () => {
    expect(
      expectedFile({ characterId: 'gaz', dialogueId: 'gaz:1a2b3c4d', delivery: 'normal' }),
    ).toBe('assets/voice/gaz/1a2b3c4d.mp3');
    expect(expectedFile({ characterId: 'mei', dialogueId: 'mei:deadbeef', delivery: 'slow' })).toBe(
      'assets/voice/mei/deadbeef-slow.mp3',
    );
  });
});
