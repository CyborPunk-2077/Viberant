/**
 * What has actually happened in this workspace.
 *
 * Deliberately not a feed, and the difference matters. A feed is a thing you
 * scroll because it might have something in it; this is a short list of facts
 * you look at when you want to know why something is different from how you
 * left it. Somebody joined. A computer connected. A project came over. A build
 * finished. A device was taken out.
 *
 * **Every line is something that measurably occurred.** There is no "Rahul is
 * looking at Atlas" and there is not going to be — nobody is watching anybody,
 * nothing is inferred from a file being open, and a line that says something
 * happened means it happened. That rules out most of what a product like this
 * usually shows, which is the point.
 *
 * It is small, it is on this computer, and it is not sent anywhere. Two hundred
 * lines, then the oldest go. Nothing here is an audit log for somebody's
 * employer, and building one would be a different product.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { HOUSE } from './projects.mjs';

const BOOK = join(HOUSE, 'activity.json');

/** How many are kept. Enough to answer "what changed since Friday". */
export const KEEP = 200;

/**
 * The kinds of thing worth writing down, and the words for each.
 *
 * A closed list rather than free text, so nothing can write a line that reads
 * like something it is not — and so this file is the only place the vocabulary
 * lives.
 */
export const KINDS = {
  joined: (one) => `${one.who} joined ${one.what ?? 'the workspace'}`,
  connected: (one) => `${one.who} connected${one.how ? ` — ${one.how.toLowerCase()}` : ''}`,
  left: (one) => `${one.who} left the workspace`,
  brought: (one) => `${one.what} came over from ${one.who}`,
  synced: (one) => `${one.what} caught up with ${one.who}`,
  'sync failed': (one) => `${one.what} did not catch up with ${one.who}`,
  built: (one) => `${one.what} was built on ${one.who}`,
  'build failed': (one) => `${one.what} did not build on ${one.who}`,
  deployed: (one) => `${one.what} went out into the world`,
  revoked: (one) => `${one.who} was taken out of the workspace`,
  allowed: (one) => `${one.who} may now ${one.what} here`,
  'terminal opened': (one) => `${one.who} opened a terminal on this computer`,
};

const quiet = async (fn, fallback = null) => { try { return await fn(); } catch { return fallback; } };

let held = null;
let writing = null;

async function book() {
  if (held) return held;
  held = (existsSync(BOOK) && await quiet(async () => JSON.parse(await readFile(BOOK, 'utf8')))) || [];
  if (!Array.isArray(held)) held = [];
  return held;
}

/**
 * Write down that something happened.
 *
 * Anything whose kind is not on the list above is dropped rather than written
 * as itself — a line nobody chose the words for is a line that will one day say
 * something misleading.
 */
export async function remember(kind, about = {}) {
  if (!KINDS[kind]) return { ok: false };

  const all = await book();
  all.unshift({
    kind,
    who: String(about.who ?? '').slice(0, 60) || 'a computer',
    what: about.what ? String(about.what).slice(0, 80) : null,
    how: about.how ? String(about.how).slice(0, 40) : null,
    at: Date.now(),
  });
  if (all.length > KEEP) all.length = KEEP;

  later();
  return { ok: true };
}

let timer = null;
function later() {
  if (timer) return;
  timer = setTimeout(() => { timer = null; save().catch(() => {}); }, 3000);
  timer.unref?.();
}

export async function save() {
  if (writing) return writing;
  writing = (async () => {
    await mkdir(HOUSE, { recursive: true });
    await writeFile(BOOK, JSON.stringify(await book(), null, 2), 'utf8');
  })().finally(() => { writing = null; });
  return writing;
}

/** What has happened lately, said the way a person would say it. */
export async function recently(howMany = 40) {
  const all = await book();
  return all.slice(0, howMany).map((one) => ({
    ...one,
    // Built here rather than stored, so changing the words is changing one line
    // and never rewriting anybody's history.
    sentence: KINDS[one.kind]?.(one) ?? null,
  })).filter((one) => one.sentence);
}

/** Forget the lot. */
export async function forget() {
  held = [];
  await save();
  return { ok: true, sentence: 'What was written down is gone.' };
}

export const BOOK_AT = BOOK;
