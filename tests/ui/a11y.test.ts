// Phase 7: the presentation-only accessibility settings land as attributes on <html>.
import { describe, expect, it } from 'vitest';
import { applyA11y } from '../../src/ui/a11y';
import type { ListenSettings } from '../../src/ui/settings';

const base: ListenSettings = {
  version: 2,
  difficulty: 'normal',
  subtitles: 'auto',
  learning: false,
  pourSensitivity: 1,
};
const root = () => ({ dataset: {} as Record<string, string> }) as unknown as HTMLElement;

describe('applyA11y', () => {
  it('subtitles are on unless the setting says off (missing = on)', () => {
    const r = root();
    applyA11y(base, r);
    expect(r.dataset.captions).toBe('on');
    applyA11y({ ...base, captions: false }, r);
    expect(r.dataset.captions).toBe('off');
    applyA11y({ ...base, captions: true }, r);
    expect(r.dataset.captions).toBe('on');
  });
});
