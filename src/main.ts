// Boot: builds the café, wires input → the active day (Day 1 trial or Day 2 rush) → view, and owns
// the frame loop.

import '@fontsource/bowlby-one/400.css';
import '@fontsource/figtree/400.css';
import '@fontsource/figtree/600.css';
import '@fontsource/figtree/800.css';
import './ui/styles.css';
import { boot } from './app/boot';

void boot();
