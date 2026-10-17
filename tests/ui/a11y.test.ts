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
const root = () => {
  const props: Record<string, string> = {};
  return {
    dataset: {} as Record<string, string>,
    style: { setProperty: (k: string, v: string) => (props[k] = v), props },
  } as unknown as HTMLElement & { style: { props: Record<string, string> } };
};

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

  it('text size sets data-text and --text-scale (missing = medium, scale 1)', () => {
    const r = root();
    applyA11y(base, r);
    expect([r.dataset.text, r.style.props['--text-scale']]).toEqual(['m', '1']);
    applyA11y({ ...base, textSize: 'l' }, r);
    expect([r.dataset.text, r.style.props['--text-scale']]).toEqual(['l', '1.2']);
    applyA11y({ ...base, textSize: 's' }, r);
    expect([r.dataset.text, r.style.props['--text-scale']]).toEqual(['s', '0.9']);
  });
});
