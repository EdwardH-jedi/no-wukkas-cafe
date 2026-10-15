import { describe, expect, it } from 'vitest';
import { createRush, type Rush } from '../../src/core/rush';
import { weekFor } from '../../src/core/week/session';
import { EVENT_DATA } from '../../src/data/events';
import type { ShiftEventId } from '../../src/sim/contracts/events';
import { newSave } from '../../src/sim/contracts/save';
import { eventDef } from '../../src/sim/events/defs';
import {
  choiceHtml,
  EVENT_KEYS,
  eventChoiceForKey,
  eventOwnsKey,
  eventPrompt,
  shownEvent,
} from '../../src/ui/eventCard';

function withEvent(id: ShiftEventId | null, phase: Rush['phase'] = 'service'): Rush {
  const r = createRush(7, 'normal', {}, weekFor({ ...newSave({ seed: 7 }), shift: 3 }));
  r.phase = phase;
  r.shiftEvents.current = id
    ? { def: eventDef(id), customer: r.customers[0] ?? null, playerMistake: false }
    : null;
  return r;
}

describe('the event card', () => {
  it('is up only in service, with an event waiting', () => {
    expect(shownEvent(withEvent('THE_NAME'))?.id).toBe('THE_NAME');
    expect(shownEvent(withEvent(null))).toBeNull();
    expect(shownEvent(withEvent('THE_NAME', 'summary'))).toBeNull();
  });

  it('number keys 1–3 pick its choices, in order', () => {
    const r = withEvent('CALL_MANAGER');
    expect(eventChoiceForKey(r, '1')).toBe('gaz');
    expect(eventChoiceForKey(r, '2')).toBe('apologise');
    expect(eventChoiceForKey(r, '3')).toBe('refuse');
    expect(eventChoiceForKey(r, '4')).toBeNull();
  });

  it('keeps 1–3 while it is up, even past its last choice; 4–6 and other keys stay free', () => {
    const r = withEvent('THE_NAME');
    expect(eventOwnsKey(r, '3')).toBe(true);
    expect(eventChoiceForKey(r, '3')).toBeNull();
    for (const k of ['0', '4', '6', 't', 'enter']) expect(eventOwnsKey(r, k)).toBe(false);
    const none = withEvent(null);
    for (const k of ['1', '2', '3']) {
      expect(eventOwnsKey(none, k)).toBe(false);
      expect(eventChoiceForKey(none, k)).toBeNull();
    }
  });

  it('no event has more choices than there are keys for it', () => {
    for (const d of Object.values(EVENT_DATA))
      expect(d.choices.length).toBeLessThanOrEqual(EVENT_KEYS);
  });

  it("names the customer in the prompt and shows each choice's cost from the data", () => {
    expect(eventPrompt(eventDef('THE_NAME'), 'Jiwoo')).toMatch(/^Jiwoo wants their name/);
    const [spell, write] = eventDef('THE_NAME').choices;
    if (!spell || !write) throw new Error('THE_NAME has two choices');
    const html = choiceHtml(spell, 0, false);
    expect(html).toContain('<kbd>1</kbd>');
    expect(html).toContain(`−${spell.costSeconds} s`);
    expect(html).toContain('data-choice="spell"');
    // A free choice shows no cost; touch shows no key.
    expect(choiceHtml(write, 1, false)).not.toContain('cost');
    expect(choiceHtml(write, 1, true)).not.toContain('<kbd>');
  });
});
