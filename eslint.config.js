import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      'dist',
      'node_modules',
      'prototype',
      'coverage',
      'reports',
      'test-results',
      'playwright-report',
      '.remember',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      // AGENTS.md §4 rule 2: all randomness goes through core/rng.ts.
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'Use the seeded RNG in core/rng.ts.' },
      ],
    },
  },
  {
    // AGENTS.md §4 rules 1 + 3: sim/ and core/ stay pure and pause-safe.
    files: ['src/sim/**/*.ts', 'src/core/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['three', 'three/*'], message: 'sim/ and core/ must not import three.' },
            {
              group: ['**/world/**', '**/ui/**', '**/audio/**'],
              message: 'sim/ and core/ must not import view code.',
            },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'window', message: 'No DOM in sim/ or core/.' },
        { name: 'document', message: 'No DOM in sim/ or core/.' },
        { name: 'setTimeout', message: 'Use the game clock.' },
        { name: 'setInterval', message: 'Use the game clock.' },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "MemberExpression[object.name='Date'][property.name='now']",
          message: 'Use the game clock.',
        },
      ],
    },
  },
  prettier,
);
