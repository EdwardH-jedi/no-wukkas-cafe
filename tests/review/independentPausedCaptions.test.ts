// A suspended AudioContext cannot emit a first sample. Caption hooks must wait for resume,
// including when the network finishes while paused; cancellation must still win.
import { afterEach, expect, it, vi } from 'vitest';
import { VOICE_MANIFEST } from '../../src/data/voice';
import { createHarness } from './harness';

afterEach(() => vi.unstubAllGlobals());

it.each(['paused', 'browser-suspended'] as const)(
  '%s: a decoded clip must not dispatch subtitle onStart before audio can start',
  async (mode) => {
    const h = createHarness({ plan: () => ({ status: 200, delay: 1 }) });
    h.audio.unlock();
    const clip = VOICE_MANIFEST.clips.find((c) => c.characterId === 'dazza')!;
    const onStart = vi.fn();
    h.audio.say({ speaker: clip.characterId, text: clip.transcript }, { onStart });
    expect(h.audio.loading).toBe(true);
    if (mode === 'paused') {
      h.app.clock.paused = true;
      h.audio.setPaused(true);
    } else {
      // A browser/device interruption can suspend Web Audio without pausing the game clock.
      await h.ctx().suspend();
      expect(h.app.clock.paused).toBe(false);
    }
    await h.run(2);
    expect(h.ctx().state).toBe('suspended');
    expect
      .soft(onStart, 'subtitle exposed while its audio context is suspended')
      .not.toHaveBeenCalled();
    h.app.clock.paused = false;
    h.audio.setPaused(false);
    await h.run(0.1);
    expect(onStart).toHaveBeenCalledTimes(1);
  },
);
