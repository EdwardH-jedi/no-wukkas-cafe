// Pointer, wheel and keyboard: the listeners that fill the shared input, and the per-step sampling
// that turns it into cup coordinates and jug depth.

import * as THREE from 'three';
import { STEP } from '../core/clock';
import { ibisPresent } from '../sim/ibis';
import { RIM } from '../world/station';
import type { App } from './context';
import { practiceAct, practiceKey } from './practiceWiring';
import { rushKey } from './rushWiring';
import { trialKey } from './trialWiring';

/** Register the input listeners (in boot's order) and return the per-step sampler. */
export function installInput(app: App): () => void {
  const { canvas, input, pointer, camera, station, sfx, clock } = app;
  // ---------------------------------------------------------------- input
  const ndc = new THREE.Vector2();
  const ray = new THREE.Raycaster();
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const hit = new THREE.Vector3();

  /** Is the pointer on the bin chicken? (Clicking it shoos it; hovering is "noticing" it.) */
  const onIbis = (e: PointerEvent): boolean => {
    if (app.mode !== 'rush' || !ibisPresent(app.ibis)) return false;
    ndc.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    return app.ibisView.hit(ray);
  };
  canvas.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    sfx.unlock();
    if (onIbis(e)) {
      app.ibisShoo = true;
      return;
    }
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      /* synthetic or already-released pointer: capture is a nicety */
    }
    app.held = true;
    input.pressed = true;
    pointer.x = e.clientX;
    pointer.y = e.clientY;
    pointer.has = true;
  });
  const release = (): void => {
    app.held = false;
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  canvas.addEventListener('pointermove', (e) => {
    pointer.x = e.clientX;
    pointer.y = e.clientY;
    pointer.has = true;
    app.ibisNoticed = onIbis(e);
  });
  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      // A trackpad pinch arrives as ctrl+wheel: block the page zoom, but don't move the jug.
      if (e.ctrlKey) return;
      const unit = e.deltaMode === 1 ? 33 : 1;
      // Clamp single events so a mouse-wheel notch or trackpad momentum can't teleport the jug.
      const dy = Math.max(-150, Math.min(150, e.deltaY * unit));
      input.heightDelta -= dy * 0.012;
    },
    { passive: false },
  );
  // Pinch never zooms the page, wherever the pointer is: over a card, the lesson strip or a button
  // a trackpad pinch is a ctrl+wheel that the canvas never sees, and Safari (macOS and iOS) sends
  // gesture events. Plain wheel stays free, so the review card still scrolls. Double-tap zoom is
  // off through `touch-action: none` on the body (ui/styles/base.css).
  window.addEventListener(
    'wheel',
    (e) => {
      if (e.ctrlKey) e.preventDefault();
    },
    { passive: false },
  );
  const noZoom = (e: Event): void => e.preventDefault();
  for (const type of ['gesturestart', 'gesturechange', 'gestureend'])
    document.addEventListener(type, noZoom, { passive: false });
  window.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === 'escape' || k === 'p') {
      app.setPaused(!clock.paused);
      return;
    }
    if (clock.paused) return;
    const { practice, rush } = app;
    if (k === ' ') {
      e.preventDefault();
      sfx.unlock();
      if (!e.repeat) input.pressed = true;
      app.spaceHeld = true;
      if (app.mode === 'practice' && practice?.phase === 'review' && !e.repeat)
        practiceAct(app, 'again');
    } else if (app.mode === 'practice' && practice) {
      practiceKey(app, practice, k, e);
    } else if (app.mode === 'rush' && rush) {
      rushKey(app, rush, k, e);
    } else trialKey(app, k, e);
  });

  window.addEventListener('keyup', (e) => {
    const k = e.key.toLowerCase();
    if (k === ' ') app.spaceHeld = false;
    if ((k === 'w' || k === 'arrowup') && app.keyHeight > 0) app.keyHeight = 0;
    if ((k === 's' || k === 'arrowdown') && app.keyHeight < 0) app.keyHeight = 0;
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && (app.mode !== 'trial' || app.trial.phase !== 'title'))
      app.setPaused(true);
  });
  window.addEventListener('blur', () => {
    app.held = false;
    app.spaceHeld = false;
    app.keyHeight = 0;
  });

  /** Fill the per-step parts of the input from the latest pointer/keyboard state. */
  const sampleInput = (): void => {
    input.holding = app.held || app.spaceHeld;
    input.heightDelta += (app.keyHeight + app.touchHeight) * 9 * STEP;
    if (!pointer.has) return;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const pouring =
      app.mode === 'rush'
        ? app.rush?.barista.phase === 'pour'
        : app.mode === 'practice'
          ? app.practice?.phase === 'pour'
          : app.trial.phase === 'pour';
    if (pouring) {
      ndc.set((pointer.x / w) * 2 - 1, -(pointer.y / h) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      // A fixed plane at the rim: if it followed the rising coffee, the jug would drift under a
      // still mouse as the cup fills.
      plane.constant = -station.cupRim.y;
      if (ray.ray.intersectPlane(plane, hit)) {
        input.hasCup = true;
        input.cupX = (hit.x - station.cupRim.x) / RIM;
        input.cupY = -(hit.z - station.cupRim.z) / RIM;
      }
    }
    // Steaming: mouse up = jug up = tip deeper.
    const yN = Math.min(1, Math.max(0, (pointer.y / h - 0.2) / 0.6));
    input.jugDepth = 3.0 - yN * 3.8;
  };
  return sampleInput;
}

/** Clear the one-step parts of the input (presses, actions, nudges) after each fixed step. */
export function clearEdges(app: App): void {
  const { input } = app;
  input.pressed = false;
  input.skip = false;
  input.action = null;
  input.heightDelta = 0;
  input.heightPreset = null;
  app.rushAction = null;
  app.practiceAction = null;
}
