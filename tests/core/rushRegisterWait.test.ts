// "Take order" is timestamped (RushCustomer.takenAt) so telemetry can log how long players leave a
// customer standing at the register (docs/TODO.md, open question on QUEUE_JUMP / bot latency).

import { describe, expect, it } from 'vitest';
import { STEP } from '../../src/core/clock';
import { atRegister, createRush, emptyRushInput, stepRush, type Rush } from '../../src/core/rush';

/** Step with no player action until someone is at the register (skipping Gaz's intro lines). */
function untilRegister(r: Rush): void {
  for (let n = 0; n < 60 / STEP && !atRegister(r); n++) {
    const i = emptyRushInput();
    i.pressed = r.phase === 'intro' && n % 20 === 0;
    stepRush(r, i, STEP);
  }
}

describe('rush register timestamps', () => {
  it('takenAt is null until "Take order", then the game time it was pressed', () => {
    const r = createRush(3);
    untilRegister(r);
    const c = atRegister(r);
    expect(c).not.toBeNull();
    expect(c?.takenAt).toBeNull();
    const at = c?.registerAt ?? 0;
    // Leave them standing there for three seconds.
    for (let n = 0; n < Math.round(3 / STEP); n++) stepRush(r, emptyRushInput(), STEP);
    expect(c?.takenAt).toBeNull();
    const take = emptyRushInput();
    take.action = { type: 'takeOrder' };
    stepRush(r, take, STEP);
    expect(c?.state).toBe('ordering');
    expect((c?.takenAt ?? 0) - at).toBeCloseTo(3 + STEP, 5);
  });
});
