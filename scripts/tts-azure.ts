// Azure Neural TTS request building for auditions (docs/VOICE_CASTING.md). The SSML builder is pure
// and unit-tested; the network call is only made by scripts/voices-audition.ts with --allow-paid
// and credentials in the environment. Untested against the live service (no account here).

export interface AzureVoice {
  voice: string;
  rate?: number;
  style?: string;
}

const esc = (t: string): string =>
  t
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

/** SSML for one line. Locale comes from the voice name ("en-AU-DuncanNeural" → en-AU). */
export function azureSsml(text: string, v: AzureVoice): string {
  const locale = v.voice.split('-').slice(0, 2).join('-');
  const pct = Math.round(((v.rate ?? 1) - 1) * 100);
  const prosody = `<prosody rate="${pct >= 0 ? '+' : ''}${pct}%">${esc(text)}</prosody>`;
  const body = v.style
    ? `<mstts:express-as style="${esc(v.style)}">${prosody}</mstts:express-as>`
    : prosody;
  return (
    `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" ` +
    `xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="${locale}">` +
    `<voice name="${esc(v.voice)}">${body}</voice></speak>`
  );
}

/** One synthesis request (MP3). Only called with explicit approval (see voices-audition). */
export async function azureSynthesize(
  ssml: string,
  key: string,
  region: string,
): Promise<ArrayBuffer> {
  const res = await fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': key,
      'Content-Type': 'application/ssml+xml',
      'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3',
      'User-Agent': 'no-wukkas-cafe-auditions',
    },
    body: ssml,
  });
  if (!res.ok) throw new Error(`Azure TTS ${res.status}: ${await res.text()}`);
  return res.arrayBuffer();
}
