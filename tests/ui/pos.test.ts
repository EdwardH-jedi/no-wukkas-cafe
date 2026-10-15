import { describe, expect, it } from 'vitest';
import { LISTEN_COST, MAX_REPEATS } from '../../src/sim/listening';
import { costLabel, costPill, repeatCost } from '../../src/ui/pos';

describe('register costs', () => {
  it('shows a patience cost as minus seconds, and nothing when it is free', () => {
    expect(costLabel(3)).toBe('−3 s');
    expect(costLabel(0)).toBe('');
    expect(costPill(0)).toBe('');
    expect(costPill(LISTEN_COST.replay)).toContain(`−${LISTEN_COST.replay} s`);
    expect(costPill(LISTEN_COST.replay)).toContain(`${LISTEN_COST.replay} s of patience`);
  });

  it("takes each aid's cost from the sim's table", () => {
    expect(costLabel(LISTEN_COST.clarify)).toBe(`−${LISTEN_COST.clarify} s`);
    expect(repeatCost(0)).toBe(`−${LISTEN_COST.repeat} s · ${MAX_REPEATS} left`);
  });

  it('counts down the repeats they will put up with', () => {
    expect(repeatCost(MAX_REPEATS - 1)).toBe(`−${LISTEN_COST.repeat} s · 1 left`);
    expect(repeatCost(MAX_REPEATS)).toBe('no more');
    expect(repeatCost(MAX_REPEATS + 1)).toBe('no more');
  });
});
