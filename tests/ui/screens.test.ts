import { describe, expect, it } from 'vitest';
import { FINDING_TEXT } from '../../src/data/coaching';
import { FAULT_TEXT } from '../../src/data/tips';
import type { Finding } from '../../src/sim/latte/coach';
import { cardFaults } from '../../src/ui/screens';

const finding = (id: Finding['id']): Finding => ({
  id,
  severity: 0.9,
  n: 0,
  dir: '',
  cause: null,
  cn: 0,
});

describe('Day 1 result card', () => {
  it("shows the diagnosis's own fix for a blob, never the generic pull-through line", () => {
    const [line] = cardFaults(['blob'], [finding('streamDied')]);
    expect(line?.label).toBe(FINDING_TEXT.streamDied.label);
    expect(line?.tip).toBe(FINDING_TEXT.streamDied.fix);
    expect(line?.tip).not.toBe(FAULT_TEXT.blob.tip);
  });

  it('matches each art fault to its own finding, and keeps tips for the rest', () => {
    const lines = cardFaults(
      ['noCleft', 'lopsided', 'milkCold'],
      [finding('lopsided'), finding('sweptLong')],
    );
    expect(lines.map((l) => l.tip)).toEqual([
      FINDING_TEXT.sweptLong.fix,
      FINDING_TEXT.lopsided.fix,
      FAULT_TEXT.milkCold.tip,
    ]);
  });

  it('falls back to the fault tip when there is no diagnosis', () => {
    expect(cardFaults(['blob'], [])).toEqual([FAULT_TEXT.blob]);
  });
});
