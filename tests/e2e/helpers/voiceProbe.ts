// Is a voice clip really on this machine? Vite answers a missing /assets/voice/….mp3 with the
// page itself (200 text/html, the SPA fallback), so `response.ok()` alone calls every clip
// present and the audio specs run, then fail on text-to-speech fallbacks (acceptance audit F8).
// A rendered clip is 200 with an audio/* content type.

import type { APIRequestContext } from '@playwright/test';

export interface ProbeResponse {
  status(): number;
  headers(): Record<string, string>;
}

export function isAudioResponse(res: ProbeResponse): boolean {
  return res.status() === 200 && /^audio\//i.test(res.headers()['content-type'] ?? '');
}

/** True when `file` (a manifest path such as assets/voice/gaz/ab12-normal.mp3) is served as audio. */
export async function clipServed(request: APIRequestContext, file: string): Promise<boolean> {
  return isAudioResponse(await request.get(`/${file}`));
}
