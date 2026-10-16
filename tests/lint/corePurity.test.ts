// AGENTS.md §4 rules 2 and 3 for src/core as well as src/sim: no Math.random (the seeded RNG in
// core/rng.ts is the only randomness), no wall clock and no timers (the game clock is the only
// time). Two guards:
//  1. the lint config bans Math.random, Date.now, setTimeout and setInterval in every folder of
//     both trees, core/rng.ts included (it needs none of them: mulberry32 is pure arithmetic);
//  2. a source scan of every file in both trees, parsed with the TypeScript compiler so comments
//     are not part of what is scanned and an eslint-disable comment can't hide a call. It also
//     catches the forms the lint rules miss (globalThis.setTimeout, Date['now'], new Date(),
//     performance.now) and reports each hit as file:line.

import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { ESLint } from 'eslint';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const ROOT = join(import.meta.dirname, '..', '..');
const eslint = new ESLint({ cwd: ROOT });

async function ruleIds(code: string, filePath: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath: join(ROOT, filePath) });
  return (result?.messages ?? []).map((m) => m.ruleId ?? 'fatal');
}

/** Where a probe is linted from: each tree's root and its sub-folders, and the RNG itself. */
const PLACES = [
  'src/sim/__probe.ts',
  'src/sim/events/__probe.ts',
  'src/sim/listening/__probe.ts',
  'src/sim/contracts/__probe.ts',
  'src/core/__probe.ts',
  'src/core/rng.ts',
  'src/core/rush/__probe.ts',
  'src/core/week/__probe.ts',
  'src/core/save/__probe.ts',
];

const BANNED: Array<[string, string]> = [
  ['export const r = Math.random();', 'no-restricted-properties'],
  ["export const r = Math['random']();", 'no-restricted-properties'],
  ['const { random } = Math;\nexport const r = random();', 'no-restricted-properties'],
  ['export const t = Date.now();', 'no-restricted-syntax'],
  ['setTimeout(() => 0, 1);', 'no-restricted-globals'],
  ['setInterval(() => 0, 1);', 'no-restricted-globals'],
];

describe('core and sim purity lint', () => {
  it.each(PLACES.flatMap((p) => BANNED.map(([code, rule]) => [p, code, rule] as const)))(
    '%s rejects %s',
    async (place, code, rule) => {
      expect(await ruleIds(code, place)).toContain(rule);
    },
  );
});

// ---------------------------------------------------------------- the source scan

interface Hit {
  file: string;
  line: number;
  what: string;
}

/** Calls and names that read the wall clock, schedule real time, or draw outside core/rng.ts. */
const TIMER_NAMES = new Set([
  'setTimeout',
  'setInterval',
  'setImmediate',
  'requestAnimationFrame',
  'queueMicrotask',
  'getRandomValues',
  'randomUUID',
]);
const MEMBERS: Record<string, readonly string[]> = {
  Math: ['random'],
  Date: ['now'],
  performance: ['now'],
};

function memberName(n: ts.Node): string | null {
  if (ts.isPropertyAccessExpression(n)) return n.name.text;
  if (ts.isElementAccessExpression(n) && ts.isStringLiteralLike(n.argumentExpression))
    return n.argumentExpression.text;
  return null;
}

/** Every hit in one file's code (comments are trivia, not nodes, so they are never scanned). */
function scanSource(file: string, text: string): Hit[] {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const hits: Hit[] = [];
  const hit = (n: ts.Node, what: string): void => {
    hits.push({ file, line: sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1, what });
  };
  const visit = (n: ts.Node): void => {
    if (ts.isIdentifier(n) && TIMER_NAMES.has(n.text)) hit(n, n.text);
    const name = memberName(n);
    if (name !== null && (ts.isPropertyAccessExpression(n) || ts.isElementAccessExpression(n))) {
      const obj = n.expression;
      if (ts.isIdentifier(obj) && MEMBERS[obj.text]?.includes(name)) hit(n, `${obj.text}.${name}`);
    }
    // const { random } = Math
    if (
      ts.isVariableDeclaration(n) &&
      ts.isObjectBindingPattern(n.name) &&
      n.initializer &&
      ts.isIdentifier(n.initializer)
    ) {
      const banned = MEMBERS[n.initializer.text] ?? [];
      for (const el of n.name.elements) {
        const key = el.propertyName ?? el.name;
        if (ts.isIdentifier(key) && banned.includes(key.text))
          hit(el, `${n.initializer.text}.${key.text}`);
      }
    }
    // new Date() / Date(): the wall clock (Date.UTC and friends with arguments are pure, but
    // there's no need for them in sim/ or core/ either).
    if ((ts.isNewExpression(n) || ts.isCallExpression(n)) && ts.isIdentifier(n.expression))
      if (n.expression.text === 'Date') hit(n, ts.isNewExpression(n) ? 'new Date' : 'Date()');
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return hits;
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return sourceFiles(p);
    return /\.(ts|js|mts)$/.test(e.name) && !e.name.endsWith('.d.ts') ? [p] : [];
  });
}

describe('core and sim source scan', () => {
  it('the scanner finds calls in code, at the right line, and ignores comments', () => {
    const src = [
      '// Math.random() and setTimeout in a comment are fine',
      '/* Date.now() here too */ export const a = 1;',
      '// eslint-disable-next-line no-restricted-globals',
      'globalThis.setTimeout(() => 0, 1);',
      "export const t = Date['now']() + performance.now();",
      'export const d = new Date();',
      'const { random: r } = Math;',
      'export const s = "setInterval is only a word in a string";',
    ].join('\n');
    expect(scanSource('probe.ts', src).map((h) => `${h.line}:${h.what}`)).toEqual([
      '4:setTimeout',
      '5:Date.now',
      '5:performance.now',
      '6:new Date',
      '7:Math.random',
    ]);
  });

  it('no file in src/sim or src/core calls Math.random, the wall clock or a real timer', () => {
    const files = ['src/sim', 'src/core'].flatMap((d) => sourceFiles(join(ROOT, d)));
    expect(files.length).toBeGreaterThan(40);
    const hits = files.flatMap((f) => scanSource(relative(ROOT, f), readFileSync(f, 'utf8')));
    expect(hits.map((h) => `${h.file}:${h.line} ${h.what}`)).toEqual([]);
  });
});
