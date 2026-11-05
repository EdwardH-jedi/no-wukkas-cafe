// The browser-voice fallback (audio/voice.ts pickVoice): when a recording is missing, every
// speaker still gets a voice in their own accent where the browser has one (AU / IN / KR / CN /
// JP), a sensible English one where it doesn't, and never a crash or silence while any voice
// exists. Voice lists are what real browsers report (names and BCP-47 tags), trimmed.

import { describe, expect, it } from 'vitest';
import { pickVoice, type TtsStyle, type VoiceLike } from '../../src/audio/voice';
import { VOICE_PROFILES } from '../../src/data/voice/profiles';

/** The style voiceLines.ts builds from a speaker's profile. */
const styleOf = (speaker: string): TtsStyle => {
  const p = VOICE_PROFILES[speaker]!;
  return { ...p.tts, locale: p.locale, prefer: p.prefer };
};
const v = (name: string, lang: string): VoiceLike => ({ name, lang });
const pickFor = (speaker: string, voices: VoiceLike[]): string | null =>
  pickVoice(voices, styleOf(speaker))?.name ?? null;

// Chrome on a stock Mac (no Premium or Enhanced downloads).
const MAC = [
  v('Samantha', 'en-US'),
  v('Daniel', 'en-GB'),
  v('Karen', 'en-AU'),
  v('Rishi', 'en-IN'),
  v('Aman', 'en-IN'),
  v('Yuna', 'ko-KR'),
  v('Tingting', 'zh-CN'),
  v('Kyoko', 'ja-JP'),
  v('Eddy (Japanese (Japan))', 'ja-JP'),
];
// Edge / Chrome on Windows 11.
const WINDOWS = [
  v('Microsoft David - English (United States)', 'en-US'),
  v('Microsoft Catherine - English (Australia)', 'en-AU'),
  v('Microsoft James - English (Australia)', 'en-AU'),
  v('Microsoft Heera - English (India)', 'en-IN'),
  v('Microsoft Ravi - English (India)', 'en-IN'),
  v('Microsoft Heami - Korean (Korea)', 'ko-KR'),
  v('Microsoft Huihui - Chinese (Simplified, PRC)', 'zh-CN'),
  v('Microsoft Haruka - Japanese (Japan)', 'ja-JP'),
  v('Microsoft Ichiro - Japanese (Japan)', 'ja-JP'),
];

describe('browser-voice fallback: one accent per speaker', () => {
  it('every speaker has a fallback locale that matches their accent', () => {
    const LOCALE = {
      australian: 'en-AU',
      indian: 'en-IN',
      korean: 'ko-KR',
      chinese: 'zh-CN',
      japanese: 'ja-JP',
    } as const;
    for (const p of Object.values(VOICE_PROFILES))
      expect(p.locale, p.speaker).toBe(LOCALE[p.accent]);
  });

  it('on a Mac: the cast list first, then the speaker’s own locale', () => {
    expect(pickFor('gaz', MAC)).toBe('Karen'); // his list ends with Karen (darkened)
    expect(pickFor('dazza', MAC)).toBe('Karen');
    expect(pickFor('beryl', MAC)).toBe('Karen');
    expect(pickFor('karen', MAC)).toBe('Karen');
    // No Isha/Tara installed: an Indian-English voice beats an Australian woman.
    expect(pickFor('priya', MAC)).toMatch(/^(Rishi|Aman)$/);
    expect(pickFor('jiwoo', MAC)).toBe('Yuna');
    expect(pickFor('mei', MAC)).toBe('Tingting');
    expect(pickFor('kenji', MAC)).toBe('Kyoko'); // no Otoya: the cast list's Kyoko
  });

  it('on Windows: the locale, then the speaker’s gender', () => {
    expect(pickFor('dazza', WINDOWS)).toBe('Microsoft James - English (Australia)');
    expect(pickFor('beryl', WINDOWS)).toBe('Microsoft Catherine - English (Australia)');
    expect(pickFor('priya', WINDOWS)).toBe('Microsoft Heera - English (India)');
    expect(pickFor('jiwoo', WINDOWS)).toBe('Microsoft Heami - Korean (Korea)');
    expect(pickFor('mei', WINDOWS)).toBe('Microsoft Huihui - Chinese (Simplified, PRC)');
    expect(pickFor('kenji', WINDOWS)).toBe('Microsoft Ichiro - Japanese (Japan)');
  });

  it('the cast list wins when a better voice is installed (Otoya for Kenji)', () => {
    expect(pickFor('kenji', [...MAC, v('Otoya', 'ja-JP')])).toBe('Otoya');
    expect(pickFor('kenji', [...MAC, v('Otoya (Enhanced)', 'ja-JP')])).toBe('Otoya (Enhanced)');
  });

  it('reads Android tags (ja_JP) and language-only tags (ja)', () => {
    expect(pickFor('jiwoo', [v('en-AU-x-afh', 'en_AU'), v('ko-KR-x-ism', 'ko_KR')])).toBe(
      'ko-KR-x-ism',
    );
    expect(pickFor('kenji', [v('Karen', 'en-AU'), v('日本語', 'ja')])).toBe('日本語');
  });

  it('within a locale: own gender, then unknown, then the other', () => {
    const jp = [v('Microsoft Haruka - Japanese (Japan)', 'ja-JP'), v('Google 日本語', 'ja-JP')];
    expect(pickFor('kenji', jp)).toBe('Google 日本語');
    expect(pickFor('kenji', jp.slice(0, 1))).toBe('Microsoft Haruka - Japanese (Japan)');
  });

  it('no voice in their language: Australian, then British, then any English', () => {
    expect(
      pickFor('kenji', [v('Samantha', 'en-US'), v('Daniel', 'en-GB'), v('Lee', 'en-AU')]),
    ).toBe('Lee');
    expect(pickFor('jiwoo', [v('Samantha', 'en-US'), v('Daniel', 'en-GB')])).toBe('Daniel');
    expect(pickFor('priya', [v('Samantha', 'en-US')])).toBe('Samantha');
    expect(pickFor('mei', [v('Thomas', 'fr-FR')])).toBeNull();
    expect(pickFor('gaz', [])).toBeNull();
  });
});
