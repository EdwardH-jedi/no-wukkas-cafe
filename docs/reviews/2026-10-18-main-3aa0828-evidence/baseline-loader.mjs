// Read baseline modules directly from Git; never replace files in the review worktree.
import { registerHooks, stripTypeScriptTypes } from 'node:module';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { relative, resolve } from 'node:path';
const root = resolve(import.meta.dirname, '../../..');
registerHooks({
  load(url, context, next) {
    if (!url.startsWith('file:')) return next(url, context);
    const path = relative(root, fileURLToPath(url));
    if (!/^(src\/|tests\/helpers\/)/.test(path)) return next(url, context);
    const source = execFileSync('git', ['show', `157329e:${path}`], {cwd:root, encoding:'utf8'});
    return {format:'module',shortCircuit:true,source:path.endsWith('.json') ? `export default ${source}` : stripTypeScriptTypes(source,{mode:'strip',sourceUrl:url})};
  }
});
