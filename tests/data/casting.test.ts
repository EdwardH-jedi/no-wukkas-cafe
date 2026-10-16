import { describe, expect, it } from 'vitest';
import { azureSsml } from '../../scripts/tts-azure';
import { CUSTOMERS } from '../../src/data/customers';
import { AUDITIONS } from '../../src/data/voice/auditions';
import { CAST, CASTING, PIPELINE_TEST, TTS_BUDGET } from '../../src/data/voice/casting';
import { VOICE_PROFILES } from '../../src/data/voice/profiles';
import { voiceScript } from '../../src/data/voice/script';

const cast = ['gaz', ...CUSTOMERS.map((c) => c.id)];

describe('casting plan data', () => {
  it('every character has 2-3 audition lines, all real lines they say in the game', () => {
    const script = voiceScript();
    for (const who of cast) {
      const lines = AUDITIONS[who] ?? [];
      expect(lines.length, who).toBeGreaterThanOrEqual(2);
      expect(lines.length, who).toBeLessThanOrEqual(3);
      for (const t of lines)
        expect(
          script.some((l) => l.speaker === who && l.text === t),
          `${who}: ${t}`,
        ).toBe(true);
    }
  });

  it('every character has at least one real candidate; placeholders are never candidates', () => {
    for (const who of cast) expect((CASTING[who] ?? []).length, who).toBeGreaterThan(0);
    for (const c of Object.values(CASTING).flat()) expect(c.provider).not.toBe('macos');
    for (const c of Object.values(PIPELINE_TEST)) expect(c.provider).toBe('macos');
  });

  it('no two characters audition the same TTS voice', () => {
    const seen = new Map<string, string>();
    for (const [who, cs] of Object.entries(CASTING))
      for (const c of cs.filter((x) => x.provider !== 'files')) {
        const k = `${c.provider}:${c.voice}`;
        expect(seen.get(k) ?? who, `${k} is auditioned for ${seen.get(k)} and ${who}`).toBe(who);
        seen.set(k, who);
      }
  });
});

describe('Azure SSML', () => {
  it('uses the voice locale, prosody rate and escapes the text', () => {
    const s = azureSsml(`Oi mate! "Flattie" & <ta>`, { voice: 'en-AU-NeilNeural', rate: 1.1 });
    expect(s).toContain('xml:lang="en-AU"');
    expect(s).toContain('<voice name="en-AU-NeilNeural">');
    expect(s).toContain('<prosody rate="+10%">');
    expect(s).toContain('Oi mate! &quot;Flattie&quot; &amp; &lt;ta&gt;');
    expect(azureSsml('Hi.', { voice: 'en-IN-NeerjaNeural', rate: 0.95 })).toContain('rate="-5%"');
    expect(azureSsml('Hi.', { voice: 'en-AU-DuncanNeural', style: 'cheerful' })).toContain(
      '<mstts:express-as style="cheerful">',
    );
  });

  it('the release cast: one voice per speaker, licensed TTS or an actor, every TTS pick auditioned', () => {
    expect(Object.keys(CAST).sort()).toEqual(Object.keys(VOICE_PROFILES).sort());
    const voices = Object.values(CAST).map((c) => `${c.provider}:${c.voice}`);
    expect(new Set(voices).size).toBe(voices.length);
    for (const [who, c] of Object.entries(CAST)) {
      if (c.provenance === 'licensed_tts') {
        expect(c.provider, who).toBe('google');
        expect(c.voice.startsWith(`${c.languageCode}-Chirp3-HD-`), who).toBe(true);
        expect(c.licence, who).toMatch(/Google Cloud/);
        expect(c.pending, who).toBeUndefined();
        expect(
          CASTING[who]?.some((x) => x.provider === 'google' && x.voice === c.voice),
          `${who} ${c.voice} was never an audition candidate`,
        ).toBe(true);
        if (c.rate !== undefined) expect(c.rate).toBeGreaterThanOrEqual(0.25);
      } else {
        expect(c.provider, who).toBe('files');
        expect(c.licence, who).toBe('');
        expect(c.pending, who).toMatch(/signed/);
      }
    }
    // Edward, 2026-10-16: Gaz, Jiwoo and Mei are recorded by actors.
    expect(
      Object.entries(CAST)
        .filter(([, c]) => c.provenance === 'recorded')
        .map(([who]) => who)
        .sort(),
    ).toEqual(['gaz', 'jiwoo', 'mei']);
    expect(TTS_BUDGET.capAud).toBe(20);
  });
});
