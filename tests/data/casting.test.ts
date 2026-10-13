import { describe, expect, it } from 'vitest';
import { azureSsml } from '../../scripts/tts-azure';
import { CUSTOMERS } from '../../src/data/customers';
import { AUDITIONS } from '../../src/data/voice/auditions';
import { CASTING, PIPELINE_TEST } from '../../src/data/voice/casting';
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
});
