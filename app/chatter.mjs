/**
 * Things that happen in a workspace, said once and heard everywhere.
 *
 * Notes used to go through GitHub. That works, and it is the wrong shape for
 * something somebody types and expects to land: a note was written, committed,
 * sent, and then read back by whoever happened to sync next — which could be
 * minutes. Nobody types a sentence to somebody in the next room and expects it
 * to travel via a hosting service.
 *
 * So the workspace has a stream of its own. It is not a second transport: it
 * rides the same authenticated channel between members that already carries
 * every other question, membership-checked exactly like all of them. What is
 * new is only that something can now be **said** rather than asked, and that
 * anybody looking at any screen hears it.
 *
 * Three rules, and they are what stop this becoming a mess:
 *
 *   **Everything has an identifier, and nothing is heard twice.** Two computers
 *   telling each other the same thing, or one reconnecting and repeating
 *   itself, must not produce two notes.
 *
 *   **Everything is kept in order it can be sorted by**, so a note that arrives
 *   late lands where it belongs rather than at the bottom.
 *
 *   **A listener that goes away is forgotten.** A page that closed must not
 *   keep a stream open behind it, and a stream that ends must not be written
 *   to forever.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

import { HOUSE } from './projects.mjs';

const FILE = join(HOUSE, 'chatter.jsonl');

/** How many of the most recent are worth keeping and reading back. */
export const KEEP = 300;

const quiet = async (fn, fallback = null) => { try { return await fn(); } catch { return fallback; } };

// ---------------------------------------------------------------------------
// What has been heard
// ---------------------------------------------------------------------------

let held = null;
const alreadyHeard = new Set();

async function everything() {
  if (held) return held;

  held = [];
  if (existsSync(FILE)) {
    const text = await quiet(() => readFile(FILE, 'utf8'), '');
    for (const line of String(text ?? '').split('\n')) {
      if (!line.trim()) continue;
      const one = await quiet(async () => JSON.parse(line));
      if (one?.id && !alreadyHeard.has(one.id)) {
        alreadyHeard.add(one.id);
        held.push(one);
      }
    }
  }

  held.sort((a, b) => a.at - b.at);
  return held;
}

/** The recent past of this workspace, oldest first. */
export async function lately({ workspace = null, most = 80 } = {}) {
  const all = await everything();
  const mine = workspace ? all.filter((one) => one.workspace === workspace) : all;
  return mine.slice(-most);
}

/**
 * Write one down, if it has not been written down already.
 *
 * The identifier is what makes this safe to call from both ends: the computer
 * that said it writes it down, and so does everybody who hears it, and the two
 * are the same event.
 */
export async function remember(one) {
  if (!one?.id || !one?.kind) return { ok: false, kept: false };
  if (alreadyHeard.has(one.id)) return { ok: true, kept: false, already: true };

  const all = await everything();
  alreadyHeard.add(one.id);
  all.push(one);
  all.sort((a, b) => a.at - b.at);

  // Only the recent past is worth keeping. This is a conversation between
  // computers, not a record of anything.
  if (all.length > KEEP) {
    const dropped = all.splice(0, all.length - KEEP);
    for (const gone of dropped) alreadyHeard.delete(gone.id);
    await quiet(async () => {
      await mkdir(HOUSE, { recursive: true });
      await writeFile(FILE, `${all.map((x) => JSON.stringify(x)).join('\n')}\n`, 'utf8');
    });
    tell(one);
    return { ok: true, kept: true };
  }

  await quiet(async () => {
    await mkdir(HOUSE, { recursive: true });
    const { appendFile } = await import('node:fs/promises');
    await appendFile(FILE, `${JSON.stringify(one)}\n`, 'utf8');
  });

  tell(one);
  return { ok: true, kept: true };
}

/** Make one, with everything it needs to be recognised anywhere. */
export const anEvent = ({ kind, workspace, from, fromName, ...rest }) => ({
  id: randomUUID(),
  kind,
  workspace: workspace ?? null,
  from: from ?? null,
  fromName: fromName ?? null,
  at: Date.now(),
  ...rest,
});

// ---------------------------------------------------------------------------
// Who is listening
// ---------------------------------------------------------------------------

const listeners = new Set();

/**
 * Listen to everything from now on.
 *
 * Returns the way to stop. Every caller must use it: a page that closed and a
 * listener still being written to is the leak that ends with a stream nobody
 * reads growing until something falls over.
 */
export function listen(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function tell(one) {
  for (const fn of [...listeners]) {
    try { fn(one); } catch { listeners.delete(fn); }
  }
}

export const howManyListening = () => listeners.size;

/** Put everything back, for a test. */
export async function forgetAll() {
  held = null;
  alreadyHeard.clear();
  listeners.clear();
  await quiet(async () => {
    const { rm } = await import('node:fs/promises');
    await rm(FILE, { force: true });
  });
}

export const CHATTER_FILE = FILE;
