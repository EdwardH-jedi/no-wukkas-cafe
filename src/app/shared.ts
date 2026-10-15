// Small helpers more than one wiring module needs. A leaf: it imports no other src/app module
// except the context types.

import type { AudioManager, VoiceRequest } from '../audio/manager';
import type { Rush } from '../core/rush';
import { GREETING, GREETING_OPENERS } from '../data/ownerLines';
import { VOICE_MANIFEST } from '../data/voice';
import { ibisForShift } from '../sim/events/rareBird';
import { createIbis, type Ibis } from '../sim/ibis';

/** Download a day's clips up front (decoded only when played). Greeting first. */
export function prefetchDay(audio: AudioManager, day: 1 | 2): void {
  const asReq = (text: string): VoiceRequest => ({ speaker: 'gaz', text });
  if (day === 1) audio.prefetch([...GREETING_OPENERS, ...GREETING].map((d) => asReq(d.text)));
  audio.prefetch(
    VOICE_MANIFEST.clips
      .filter((c) =>
        day === 1
          ? c.characterId === 'gaz' && !c.key.startsWith('rush.')
          : c.characterId !== 'gaz' || c.key.startsWith('rush.'),
      )
      .map((c) => ({ speaker: c.characterId, text: c.transcript, delivery: c.delivery })),
  );
}

// The bin chicken: ?ibis=0 never, ?ibis=1 every shift (30 s in); otherwise seeded and rare. On a
// week shift the event scheduler books it (RARE_BIRD), unless ?ibis= says otherwise.
export function makeIbis(app: {
  readonly params: URLSearchParams;
  readonly seed: number;
  readonly rush: Rush | null;
}): Ibis {
  const force = app.params.get('ibis');
  const rush = app.rush;
  if (rush?.week && force === null) return ibisForShift(rush.seed, rush.shiftEvents.bird);
  const b = createIbis(app.seed, force === '1');
  if (force === '0') b.scheduledAt = null;
  return b;
}
