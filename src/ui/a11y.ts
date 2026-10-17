// Accessibility settings that are presentation only (Phase 7), applied as attributes on <html> so
// the stylesheets do the work: subtitles shown at all (`data-captions`). Called at boot and
// whenever the settings change.

import type { ListenSettings } from './settings';

export function applyA11y(s: ListenSettings, root: HTMLElement = document.documentElement): void {
  root.dataset.captions = s.captions === false ? 'off' : 'on';
}
