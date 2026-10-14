import { describe, expect, it } from 'vitest';
import { CUSTOMERS } from '../../src/data/customers';
import {
  clipFor,
  readingTime,
  spokenDuration,
  VOICE_MANIFEST,
  CLIP_TAIL,
} from '../../src/data/voice';
import { dialogueId, fnv1a } from '../../src/data/voice/ids';
import { VOICE_PROFILES } from '../../src/data/voice/profiles';
import { AWAITING_RENDER, awaitingRender, voiceScript } from '../../src/data/voice/script';

describe('voice ids', () => {
  it('are stable across runs and platforms', () => {
    expect(fnv1a('')).toBe('811c9dc5');
    expect(fnv1a('a')).toBe('e40c292c');
    expect(dialogueId('gaz', 'G’day')).toBe(dialogueId('gaz', 'G’day'));
  });
  it('differ by speaker, words and delivery', () => {
    const a = dialogueId('gaz', 'Flat white.');
    expect(dialogueId('priya', 'Flat white.')).not.toBe(a);
    expect(dialogueId('gaz', 'Flat white!')).not.toBe(a);
    expect(dialogueId('gaz', 'Flat white.', 'slow')).not.toBe(a);
  });
});

describe('voice script and manifest', () => {
  const script = voiceScript();

  it('expands every template: no {placeholders} left to record', () => {
    for (const l of script) expect(l.text, l.key).not.toMatch(/\{\w+\}/);
  });

  it('has a voice profile for every speaker', () => {
    for (const l of script) expect(VOICE_PROFILES[l.speaker], l.speaker).toBeDefined();
    for (const c of CUSTOMERS) expect(VOICE_PROFILES[c.id], c.id).toBeDefined();
  });

  it('every line in the script has a recording in the manifest (or is awaiting its render)', () => {
    const missing = script.filter(
      (l) => !clipFor(l.speaker, l.text, l.delivery) && !awaitingRender(l.key),
    );
    expect(missing.map((l) => `${l.speaker}: ${l.text}`)).toEqual([]);
  });

  it('lines awaiting a render are real script keys (no typos hiding a missing clip)', () => {
    for (const k of AWAITING_RENDER)
      expect(
        script.some((l) => l.key === k || l.key.startsWith(`${k}.`)),
        k,
      ).toBe(true);
  });

  it('manifest entries carry the required fields and look like speech', () => {
    for (const c of VOICE_MANIFEST.clips) {
      expect(c.file, c.dialogueId).toMatch(/^assets\/voice\/[a-z]+\/[0-9a-f]{8}(-slow)?\.mp3$/);
      expect(c.transcript.length).toBeGreaterThan(0);
      expect(c.locale).toMatch(/^[a-z]{2}-[A-Z]{2}$/);
      expect(c.voiceId).toMatch(/^\w+:/);
      // Not silent, not truncated, not absurdly slow (a voice spelling words out letter by letter).
      expect(c.meanDb, c.transcript).toBeGreaterThan(-35);
      const words = c.transcript.split(/\s+/).length;
      expect(c.duration, c.transcript).toBeGreaterThan(0.3);
      expect(words / c.duration, c.transcript).toBeGreaterThan(1.2);
      expect(words / c.duration, c.transcript).toBeLessThan(6);
    }
  });

  it('placeholder clips are labelled as placeholders', () => {
    for (const c of VOICE_MANIFEST.clips)
      if (c.source.engine === 'macos-say') expect(c.source.placeholder).toBe(true);
  });
});

describe('spoken duration', () => {
  it('holds the floor for the clip plus a beat', () => {
    const c = VOICE_MANIFEST.clips.find((x) => x.characterId === 'gaz');
    expect(c).toBeDefined();
    if (!c) return;
    expect(spokenDuration('gaz', c.transcript)).toBeCloseTo(
      Math.max(1.2, c.duration + CLIP_TAIL),
      5,
    );
  });
  it('falls back to reading time without a clip', () => {
    const text = 'A line nobody ever recorded, surely.';
    expect(clipFor('gaz', text)).toBeNull();
    expect(spokenDuration('gaz', text)).toBe(readingTime(text));
  });
});
