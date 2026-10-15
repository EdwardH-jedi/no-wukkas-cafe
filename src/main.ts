// Entry: the bundled fonts and the stylesheet, then boot (src/app/boot.ts builds the café, wires
// input → the active day → view, and owns the frame loop).

import '@fontsource/bowlby-one/400.css';
import '@fontsource/figtree/400.css';
import '@fontsource/figtree/600.css';
import '@fontsource/figtree/800.css';
import './ui/styles/index.css';
import { boot } from './app/boot';

void boot();
