/**
 * Looking at a web target before it goes anywhere.
 *
 * A created web target is a folder of pages on this disk, and until now the
 * only way to see it running was to deploy it — which is the wrong moment to
 * find out it is broken. This serves that folder on an address only this
 * computer can reach, so "preview" means looking, not publishing.
 *
 * Deliberately its own small server rather than a route on the manager: a page
 * served from the manager's own address would share its origin, and a page
 * that shares the manager's origin can call everything the manager can do.
 * The Web Companion's whole design is that a web target is a *foreign* origin
 * that has to be paired and approved; previewing it must not quietly hand it
 * the keys instead.
 */

import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { extname, isAbsolute, join, relative, resolve } from 'node:path';

/** Loopback only, never a real address. */
const HERE = '127.0.0.1';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json',
  '.woff2': 'font/woff2',
};

/** One running preview per target folder, found again rather than doubled. */
const going = new Map();

/** A path asked for over HTTP, held inside the folder being served. */
function fileFor(root, asked) {
  const clean = decodeURIComponent(String(asked ?? '/').split('?')[0]).replaceAll('\\', '/');
  const parts = clean.split('/').filter(Boolean);
  if (parts.some((part) => part === '..' || part.startsWith('.'))) return null;
  const at = resolve(root, ...parts);
  const rel = relative(resolve(root), at);
  if (rel !== '' && (rel.startsWith('..') || isAbsolute(rel))) return null;
  return clean.endsWith('/') || parts.length === 0 ? join(at, 'index.html') : at;
}

/**
 * Serve one web target folder here, or find the one already serving it.
 *
 * One deliberate press means at most one of these, however many times state is
 * redrawn around it: asking again for a folder already being served returns
 * the same address rather than starting another server.
 */
export async function open({ root }) {
  const at = resolve(String(root ?? ''));
  if (!existsSync(at)) {
    return { ok: false, sentence: 'That web target folder is not there any more.', action: 'Create the web version again.' };
  }
  if (!existsSync(join(at, 'index.html'))) {
    return { ok: false, sentence: 'That folder has no front page to show.', action: 'Create the web version again, or open the folder to see what is in it.' };
  }
  if (existsSync(join(at, 'package.json'))) {
    return {
      ok: false,
      sentence: 'This web target builds with its own tools, so a plain preview would show broken pages.',
      action: `Open a terminal in ${at}, install what it names, and run its own dev step.`,
    };
  }

  const already = going.get(at);
  if (already) return { ok: true, at: already.address, already: true };

  const server = createServer(async (incoming, answer) => {
    if (incoming.method !== 'GET' && incoming.method !== 'HEAD') {
      answer.writeHead(405, { 'content-type': 'text/plain' });
      return answer.end('This preview only shows pages.');
    }
    const wanted = fileFor(at, incoming.url);
    let body = null;
    if (wanted) body = await readFile(wanted).catch(() => null);
    // A missing path falls back to the front page, which is what previewing a
    // page that routes itself in the browser needs, and harmless for the rest.
    if (body === null) body = await readFile(join(at, 'index.html')).catch(() => null);
    if (body === null) {
      answer.writeHead(404, { 'content-type': 'text/plain' });
      return answer.end('Not here.');
    }
    answer.writeHead(200, {
      'content-type': TYPES[extname(wanted ?? '.html').toLowerCase()] ?? 'application/octet-stream',
      'cache-control': 'no-store',
    });
    return answer.end(body);
  });

  await new Promise((ready, not) => {
    server.once('error', not);
    server.listen(0, HERE, ready);
  }).catch(() => null);

  const port = server.address()?.port;
  if (!port) {
    return { ok: false, sentence: 'A preview could not be started on this computer.', action: 'Try again in a moment.' };
  }
  const address = `http://${HERE}:${port}/`;
  going.set(at, { server, address, root: at, started: Date.now() });
  server.on('close', () => { if (going.get(at)?.server === server) going.delete(at); });
  return { ok: true, at: address };
}

/** Every preview running here, for anything that lists what is going on. */
export const openWindows = () => [...going.values()].map((one) => ({
  at: one.address, root: one.root, started: one.started,
}));

export function close(address) {
  for (const [key, one] of going) {
    if (one.address === address) {
      one.server.close();
      going.delete(key);
      return { ok: true, sentence: 'That preview is closed.', action: null };
    }
  }
  return { ok: true, sentence: 'That preview was already closed.', action: null };
}

export function closeEverything() {
  for (const one of going.values()) one.server.close();
  going.clear();
}

export const __testOnly = { fileFor, going };
