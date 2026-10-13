import { describe, expect, it } from 'vitest';
import { SAVE_TARGETS, validateSave } from '../../scripts/vite-dev-tools';
import { emptyDecisions } from '../../src/data/voice/decision';

describe('dev tools save endpoint', () => {
  it('saves casting decisions to the fixed file, normalised', () => {
    const d = emptyDecisions(['gaz'], '2026-10-14T00:00:00.000Z');
    const r = validateSave('casting', JSON.stringify(d));
    expect(r).toEqual({ file: SAVE_TARGETS.casting, text: `${JSON.stringify(d, null, 2)}\n` });
  });

  it('saves listening notes only when they say what they are', () => {
    const ok = validateSave(
      'listening',
      JSON.stringify({ kind: 'nwc-listening-notes', version: 1 }),
    );
    expect(ok).toMatchObject({ file: 'reports/listening-notes.json' });
    expect(validateSave('listening', JSON.stringify({ kind: 'x' }))).toHaveProperty('error');
    expect(validateSave('listening', 'null')).toHaveProperty('error');
  });

  it('refuses unknown kinds (never a path), bad JSON and invalid decisions', () => {
    expect(validateSave('../../etc/passwd', '{}')).toEqual({
      error: 'unknown save kind "../../etc/passwd"',
    });
    expect(validateSave('constructor', '{}')).toHaveProperty('error');
    expect(validateSave('casting', 'nope')).toEqual({ error: 'body is not JSON' });
    expect(validateSave('casting', '{"kind":"nwc-casting-decisions"}')).toHaveProperty('error');
  });
});
