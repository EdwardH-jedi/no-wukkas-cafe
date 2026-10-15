import { describe, expect, it } from 'vitest';
import { migrate, type SaveV2 } from '../../src/sim/contracts/save';
import { endlessReason } from '../../src/ui/screens/labels';

const save = (over: Partial<SaveV2> = {}): SaveV2 => ({ ...migrate(null), ...over });

describe('title: Endless Rush', () => {
  it('is locked on a fresh save, with a one-line reason', () => {
    const why = endlessReason(save());
    expect(why).toBe('Pass Monday in the week to unlock it.');
  });

  it('opens once Monday is passed, and stays open in later weeks', () => {
    expect(endlessReason(save({ shift: 1 }))).toBeNull();
    expect(endlessReason(save({ week: 2, shift: 0 }))).toBeNull();
  });
});
