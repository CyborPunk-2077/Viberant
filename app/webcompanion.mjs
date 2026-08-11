/**
 * A deliberately small, explicit bridge from a web target back to its desktop
 * project. Pairing happens in a page served by the loopback-only Viberant
 * server. Access tokens are bound to one browser origin and one project; only
 * hashed tokens are kept on disk.
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { existsSync } from 'node:fs';
import { chmod, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { basename, isAbsolute, join, relative, resolve } from 'node:path';

import { HOUSE } from './projects.mjs';

const TOKENS = process.env.VIBERANT_WEB_COMPANION_STORE || join(HOUSE, 'web-companions.json');
const pending = new Map();
const codes = new Map();
const hash = (value) => createHash('sha256').update(String(value)).digest('hex');
const now = () => Date.now();
const ONE_MINUTE = 60_000;
const THIRTY_DAYS = 30 * 24 * 60 * 60_000;
const MOST_FILE = 1024 * 1024;

export const projectId = (dir) => hash(resolve(dir)).slice(0, 32);

async function book() {
  if (!existsSync(TOKENS)) return { version: 1, tokens: [] };
  try { return JSON.parse(await readFile(TOKENS, 'utf8')); } catch { return { version: 1, tokens: [] }; }
}

async function keep(value) {
  await mkdir(HOUSE, { recursive: true });
  await writeFile(TOKENS, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await chmod(TOKENS, 0o600).catch(() => null);
}

function acceptableOrigin(value) {
  try {
    const url = new URL(value);
    return url.origin === value && (url.protocol === 'https:'
      || ['localhost', '127.0.0.1', '::1'].includes(url.hostname));
  } catch { return false; }
}

export function beginPairing({ origin, returnTo, challenge, state, project }) {
  let back;
  try { back = new URL(returnTo); } catch { return null; }
  if (!acceptableOrigin(origin) || back.origin !== origin
    || !/^[A-Za-z0-9_-]{40,100}$/.test(String(challenge ?? ''))
    || !/^[A-Za-z0-9_-]{16,100}$/.test(String(state ?? ''))
    || !project?.path || !existsSync(project.path)) return null;

  const id = randomBytes(24).toString('base64url');
  pending.set(id, {
    id, origin, returnTo: back.toString(), challenge, state,
    project: { id: project.id, name: project.name, path: resolve(project.path) },
    expiresAt: now() + 5 * ONE_MINUTE,
  });
  return { id, project: project.name, origin };
}

export function pairing(id) {
  const one = pending.get(String(id));
  if (!one || one.expiresAt <= now()) { pending.delete(String(id)); return null; }
  return { id: one.id, origin: one.origin, project: one.project.name };
}

export function cancel(id) {
  pending.delete(String(id));
  return { ok: true };
}

export function approve(id) {
  const one = pending.get(String(id));
  pending.delete(String(id));
  if (!one || one.expiresAt <= now()) return null;
  const code = randomBytes(32).toString('base64url');
  codes.set(code, { ...one, expiresAt: now() + ONE_MINUTE });
  const back = new URL(one.returnTo);
  back.searchParams.set('viberant_code', code);
  back.searchParams.set('viberant_state', one.state);
  return back.toString();
}

export async function exchange({ code, verifier, origin }) {
  const one = codes.get(String(code));
  codes.delete(String(code));
  if (!one || one.expiresAt <= now() || one.origin !== origin) return null;
  const made = createHash('sha256').update(String(verifier ?? '')).digest('base64url');
  const have = Buffer.from(made);
  const wanted = Buffer.from(one.challenge);
  if (have.length !== wanted.length || !timingSafeEqual(have, wanted)) return null;

  const token = randomBytes(32).toString('base64url');
  const held = await book();
  held.tokens = [
    { hash: hash(token), origin, project: one.project, createdAt: now(), lastUsed: now(), expiresAt: now() + THIRTY_DAYS },
    ...(held.tokens ?? []).filter((saved) => saved.expiresAt > now()
      && !(saved.origin === origin && saved.project?.id === one.project.id)),
  ].slice(0, 40);
  await keep(held);
  return { token, project: one.project.name, expiresAt: now() + THIRTY_DAYS };
}

export async function authorize({ authorization, origin }) {
  const token = String(authorization ?? '').match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token || !acceptableOrigin(origin)) return null;
  const held = await book();
  const one = (held.tokens ?? []).find((saved) => saved.hash === hash(token)
    && saved.origin === origin && saved.expiresAt > now());
  if (!one || !existsSync(one.project?.path)) return null;
  one.lastUsed = now();
  await keep(held);
  return one;
}

const forbidden = (part) => part.startsWith('.')
  || /^(?:node_modules|dist|build|out)$/i.test(part)
  || /(?:^|[._-])(?:secret|credential|token|private|key)(?:[._-]|$)/i.test(part)
  || /^\.env/i.test(part) || /\.(?:pem|p12|pfx|key)$/i.test(part);

function inside(root, asked = '') {
  const clean = String(asked ?? '').replaceAll('\\', '/').replace(/^\/+/, '');
  const parts = clean.split('/').filter(Boolean);
  if (parts.some((part) => part === '..' || forbidden(part))) return null;
  const at = resolve(root, ...parts);
  const rel = relative(resolve(root), at);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel)) ? at : null;
}

export async function call(session, body) {
  const method = String(body?.method ?? '');
  const root = session.project.path;
  if (method === 'project.status') {
    return {
      ok: true,
      project: { id: session.project.id, name: basename(root) },
      adapters: ['project.status', 'files.list', 'files.read'],
      unavailable: ['processes', 'desktop windows', 'device drivers'],
    };
  }
  if (method === 'files.list') {
    const at = inside(root, body?.path);
    if (!at) return { ok: false, sentence: 'That location is not available to this web companion.', action: 'Choose a project file.' };
    try {
      const entries = await readdir(at, { withFileTypes: true });
      return { ok: true, entries: entries.filter((one) => !forbidden(one.name)).slice(0, 500)
        .map((one) => ({ name: one.name, kind: one.isDirectory() ? 'folder' : 'file' })) };
    } catch { return { ok: false, sentence: 'That folder could not be read.', action: 'Check it still exists on the desktop computer.' }; }
  }
  if (method === 'files.read') {
    const at = inside(root, body?.path);
    if (!at) return { ok: false, sentence: 'That file is not available to this web companion.', action: 'Choose a project file.' };
    try {
      const data = await readFile(at);
      if (data.length > MOST_FILE) return { ok: false, sentence: 'That file is too large for the web companion.', action: 'Open it on the desktop computer.' };
      return { ok: true, text: data.toString('utf8'), bytes: data.length };
    } catch { return { ok: false, sentence: 'That file could not be read.', action: 'Check it still exists on the desktop computer.' }; }
  }
  return { ok: false, sentence: 'That desktop capability is not exposed to the web companion.', action: 'Use one of the available adapters.' };
}

export const __testOnly = { acceptableOrigin, inside };
