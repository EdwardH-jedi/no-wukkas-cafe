// AGENTS.md §4 rules 1-3: src/sim and src/core stay pure and pause-safe. ESLint enforces it; this
// checks the rules themselves, so a config edit can't quietly switch them off.

import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

const eslint = new ESLint();

async function ruleIds(code: string, filePath: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath });
  return (result?.messages ?? []).map((m) => m.ruleId ?? 'fatal');
}

describe('sim purity lint', () => {
  it.each([
    ['window.alert("x");', 'no-restricted-globals'],
    ['document.title;', 'no-restricted-globals'],
    ['setTimeout(() => 0, 1);', 'no-restricted-globals'],
    ['setInterval(() => 0, 1);', 'no-restricted-globals'],
    ['export const t = Date.now();', 'no-restricted-syntax'],
    ['export const r = Math.random();', 'no-restricted-properties'],
    ["import * as THREE from 'three';\nexport const v = THREE;", 'no-restricted-imports'],
    ["import { x } from '../ui/hud';\nexport const v = x;", 'no-restricted-imports'],
    ["import { x } from '../world/cafe';\nexport const v = x;", 'no-restricted-imports'],
    ["import { x } from '../audio/manager';\nexport const v = x;", 'no-restricted-imports'],
  ])('src/sim rejects %s', async (code, rule) => {
    expect(await ruleIds(code, 'src/sim/contracts/__probe.ts')).toContain(rule);
  });

  it('src/core gets the same timer ban, but may wrap storage (core/save needs it)', async () => {
    expect(await ruleIds('setTimeout(() => 0, 1);', 'src/core/__probe.ts')).toContain(
      'no-restricted-globals',
    );
    expect(await ruleIds('localStorage.getItem("x");', 'src/core/save/__probe.ts')).toEqual([]);
  });
});
