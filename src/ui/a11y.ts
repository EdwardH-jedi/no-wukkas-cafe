// Accessibility settings that are presentation only (Phase 7), applied as attributes on <html> so
// the stylesheets do the work: subtitles shown at all (`data-captions`) and the text size of the
// HUD and subtitles (`data-text`, `--text-scale`). Called at boot and whenever the settings change.

import { TEXT_SCALE, type ListenSettings } from './settings';

export function applyA11y(s: ListenSettings, root: HTMLElement = document.documentElement): void {
  root.dataset.captions = s.captions === false ? 'off' : 'on';
  const size = s.textSize ?? 'm';
  root.dataset.text = size;
  root.style.setProperty('--text-scale', String(TEXT_SCALE[size]));
}
