// The audio specs skip when a clip is missing. A missing clip is served as the page (Vite's SPA
// fallback: 200 text/html), so the probe must look at the content type, not just the status.

import { describe, expect, it } from 'vitest';
import { isAudioResponse } from '../e2e/helpers/voiceProbe';

const res = (status: number, type?: string) => ({
  status: () => status,
  headers: (): Record<string, string> => (type === undefined ? {} : { 'content-type': type }),
});

describe('isAudioResponse', () => {
  it('a rendered clip is 200 audio/mpeg', () => {
    expect(isAudioResponse(res(200, 'audio/mpeg'))).toBe(true);
    expect(isAudioResponse(res(200, 'Audio/MPEG'))).toBe(true);
  });

  it('a missing clip served as the page is not a clip', () => {
    expect(isAudioResponse(res(200, 'text/html'))).toBe(false);
    expect(isAudioResponse(res(200, 'text/html; charset=utf-8'))).toBe(false);
  });

  it('no content type, or an error status, is not a clip', () => {
    expect(isAudioResponse(res(200))).toBe(false);
    expect(isAudioResponse(res(404, 'audio/mpeg'))).toBe(false);
    expect(isAudioResponse(res(206, 'audio/mpeg'))).toBe(false);
  });
});
