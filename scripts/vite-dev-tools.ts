// Dev-server plumbing for the audio review tools (dev/casting.html, dev/listening.html). Serve
// only: none of this exists in a production build.
//  - GET  /__auditions/…            files from voice-auditions/ (audition takes + index.json)
//  - POST /__dev/save/casting       writes voice-auditions/decisions.json (casting decisions)
//  - POST /__dev/save/listening     writes reports/listening-notes.json (music listening notes)
//  - GET  /__dev/load/<kind>        { data } of a saved file, or { data: null } (never a 404, so
//                                   a first visit doesn't log console errors)
// The save targets are fixed paths; the request picks one by name, never a path.

import {
  createReadStream,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import type { Plugin } from 'vite';
import { parseDecisions } from '../src/data/voice/decision.ts';

export const AUDITIONS_URL = '/__auditions/';
const SAVE_URL = '/__dev/save/';
const LOAD_URL = '/__dev/load/';
const MAX_BODY = 2 * 1024 * 1024;

const TYPES: Record<string, string> = {
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.json': 'application/json',
};

export type SaveKind = 'casting' | 'listening';

/** Where a save goes, relative to the project root. */
export const SAVE_TARGETS: Record<SaveKind, string> = {
  casting: 'voice-auditions/decisions.json',
  listening: 'reports/listening-notes.json',
};

/** Check a save request. Returns the file (relative to the root) and its contents, or an error. */
export function validateSave(
  kind: string,
  body: string,
): { file: string; text: string } | { error: string } {
  if (!Object.hasOwn(SAVE_TARGETS, kind)) return { error: `unknown save kind "${kind}"` };
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    return { error: 'body is not JSON' };
  }
  if (kind === 'casting') {
    const d = parseDecisions(json);
    if (typeof d === 'string') return { error: d };
    return { file: SAVE_TARGETS.casting, text: `${JSON.stringify(d, null, 2)}\n` };
  }
  const n = json as { kind?: unknown; version?: unknown } | null;
  if (n?.kind !== 'nwc-listening-notes' || n.version !== 1)
    return { error: 'not a listening notes file (kind "nwc-listening-notes", version 1)' };
  return { file: SAVE_TARGETS.listening, text: `${JSON.stringify(json, null, 2)}\n` };
}

export function devTools(root: string): Plugin {
  const auditions = resolve(root, 'voice-auditions');
  return {
    name: 'nwc-dev-tools',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = (req.url ?? '').split('?')[0] ?? '';
        if (req.method === 'GET' && url.startsWith(AUDITIONS_URL)) {
          const rel = decodeURIComponent(url.slice(AUDITIONS_URL.length));
          const file = normalize(join(auditions, rel));
          if (!file.startsWith(auditions + '/') || !existsSync(file) || !statSync(file).isFile()) {
            res.statusCode = 404;
            res.end('not found');
            return;
          }
          const type = TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream';
          res.setHeader('Content-Type', type);
          res.setHeader('Cache-Control', 'no-cache');
          createReadStream(file).pipe(res);
          return;
        }
        if (req.method === 'GET' && url.startsWith(LOAD_URL)) {
          const kind = url.slice(LOAD_URL.length);
          res.setHeader('Content-Type', 'application/json');
          if (!Object.hasOwn(SAVE_TARGETS, kind)) {
            res.statusCode = 400;
            res.end(JSON.stringify({ ok: false, error: `unknown kind "${kind}"` }));
            return;
          }
          const path = resolve(root, SAVE_TARGETS[kind as SaveKind]);
          res.end(`{"ok":true,"data":${existsSync(path) ? readFileSync(path, 'utf8') : 'null'}}`);
          return;
        }
        if (req.method === 'POST' && url.startsWith(SAVE_URL)) {
          let body = '';
          let tooBig = false;
          req.setEncoding('utf8');
          req.on('data', (chunk: string) => {
            if (tooBig) return;
            body += chunk;
            if (body.length > MAX_BODY) tooBig = true;
          });
          req.on('end', () => {
            const r = tooBig
              ? { error: 'too large' }
              : validateSave(url.slice(SAVE_URL.length), body);
            res.setHeader('Content-Type', 'application/json');
            if ('error' in r) {
              res.statusCode = 400;
              res.end(JSON.stringify({ ok: false, error: r.error }));
              return;
            }
            const path = resolve(root, r.file);
            mkdirSync(dirname(path), { recursive: true });
            writeFileSync(path, r.text);
            res.end(JSON.stringify({ ok: true, file: r.file }));
          });
          return;
        }
        next();
      });
    },
  };
}
