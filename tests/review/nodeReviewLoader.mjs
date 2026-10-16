// Resolve the repository's bundler-style imports for a Node-only trace recomputation.
import { registerHooks } from 'node:module';
import { readFileSync } from 'node:fs';

registerHooks({
  load(url, context, next) {
    if (url.endsWith('.json')) {
      return {
        format: 'module',
        shortCircuit: true,
        source: `export default ${readFileSync(new URL(url), 'utf8')};`,
      };
    }
    return next(url, context);
  },
  resolve(specifier, context, next) {
    try {
      return next(specifier, context);
    } catch (original) {
      if (!specifier.startsWith('.') || /\.\w+$/.test(specifier)) throw original;
      for (const suffix of ['.ts', '/index.ts']) {
        try {
          return next(specifier + suffix, context);
        } catch {
          // Try the directory barrel after the direct module.
        }
      }
      throw original;
    }
  },
});
