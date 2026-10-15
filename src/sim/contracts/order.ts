// Shared contract for the week-1 lanes: an order a customer says. An OrderSpec IS a curated
// OrderLine (sim/listening.ts: `text` is the exact transcript, `order` the answer key, `cues` the
// words that carry each field) plus who says it, how it is voiced, and where it came from, so the
// register can take generated and curated orders through the same path.

import type { CustomerId } from '../../data/customers';
import type { Accent } from '../../data/voice/profiles';
import type { OrderLine, Tier } from '../listening';
import type { Ticket, TicketField } from './ticket';
import type { VoiceRef } from './voice';

export type AccentGroup = Accent;
export type SpeakerId = CustomerId | 'gaz';

export interface OrderChange {
  /** When they change their mind, in seconds into the order line. 0 = inside the line itself (a
   *  self-correction: "Long black. Actually, no, make that a flat white"), the only kind the
   *  register handles today; > 0 = a later interjection, which needs a register hook. */
  atSeconds: number;
  /** What the first version of the order had that the final one (`order`) doesn't. */
  patch: Partial<Ticket>;
  /** The words of the correction, exactly as in `text`. */
  transcript: string;
  voice: VoiceRef;
}

export interface OrderSpec extends OrderLine {
  speaker: CustomerId;
  accent: AccentGroup;
  /** Listening difficulty: always orderTier(this). */
  tier: Tier;
  voice: VoiceRef;
  change?: OrderChange;
  /** Single-field questions the player may ask about this order. */
  clarifiable: TicketField[];
  source: 'curated' | 'generated';
}
