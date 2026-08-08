/**
 * How much went which way, counted here and nowhere else.
 *
 * A relay costs somebody money to run, and a direct connection does not. That
 * difference is going to matter one day, and the honest time to start counting
 * is before there is a price on it rather than after — a number invented
 * retrospectively is a number nobody can check.
 *
 * **This is not billing and it is not telemetry.** Nothing here is sent
 * anywhere. It is four counters in memory and a small file beside them, on this
 * computer, readable in a text editor, and the diagnostics page shows the same
 * numbers it holds. Somebody who deletes the file loses the count and nothing
 * else.
 *
 * What is counted: bytes, by how they travelled. What is not: who, what, when
 * beyond a day, or anything that could reconstruct what somebody was doing.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { HOUSE } from './projects.mjs';

const BOOK = join(HOUSE, 'carried.json');

/** How long a day's count is kept before it is folded into the total. */
const DAYS_KEPT = 30;

const quiet = async (fn, fallback = null) => { try { return await fn(); } catch { return fallback; } };

const today = () => new Date().toISOString().slice(0, 10);

let held = null;
let dirty = false;
let writing = null;

async function book() {
  if (held) return held;
  held = (existsSync(BOOK) && await quiet(async () => JSON.parse(await readFile(BOOK, 'utf8'))))
    || { days: {}, before: { lan: 0, direct: 0, relay: 0 } };
  held.days ??= {};
  held.before ??= { lan: 0, direct: 0, relay: 0 };
  return held;
}

/**
 * Say that some bytes went this way.
 *
 * Called on every chunk, so it does nothing expensive: it adds to a number in
 * memory and marks the file as owing a write. The write happens on a timer,
 * because a counter that writes to disk per chunk is a counter that costs more
 * than the thing it is counting.
 */
export async function went(kind, bytes) {
  if (!bytes || !['lan', 'direct', 'relay'].includes(kind)) return;
  const all = await book();
  const day = (all.days[today()] ??= { lan: 0, direct: 0, relay: 0 });
  day[kind] += bytes;
  dirty = true;
  laterWrite();
}

let timer = null;
function laterWrite() {
  if (timer) return;
  timer = setTimeout(() => { timer = null; save().catch(() => {}); }, 10_000);
  timer.unref?.();
}

export async function save() {
  if (!dirty || writing) return;
  writing = (async () => {
    const all = await book();

    // Anything older than a month is folded into one total, so this cannot
    // grow — and so nothing here is a record of which days somebody worked.
    const keep = {};
    const cutoff = new Date(Date.now() - DAYS_KEPT * 86400_000).toISOString().slice(0, 10);
    for (const [day, one] of Object.entries(all.days)) {
      if (day >= cutoff) keep[day] = one;
      else for (const kind of ['lan', 'direct', 'relay']) all.before[kind] += one[kind] ?? 0;
    }
    all.days = keep;

    await mkdir(HOUSE, { recursive: true });
    await writeFile(BOOK, JSON.stringify(all, null, 2), 'utf8');
    dirty = false;
  })().finally(() => { writing = null; });
  return writing;
}

/**
 * What has gone which way, as numbers a person could check.
 *
 * The relay total is the one that will matter: it is the only one that costs
 * anybody anything, and knowing it before there is a price on it is the
 * difference between a fair price and a made-up one.
 */
export async function sofar() {
  const all = await book();

  const add = (into, one) => {
    for (const kind of ['lan', 'direct', 'relay']) into[kind] += one[kind] ?? 0;
    return into;
  };

  const ever = Object.values(all.days).reduce(add, { ...all.before });
  const thisMonth = Object.values(all.days).reduce(add, { lan: 0, direct: 0, relay: 0 });

  return {
    ever,
    thisMonth,
    // Said the way somebody would ask it: how much of this needed a machine in
    // the middle?
    throughARelay: ever.relay,
    straightAcross: ever.lan + ever.direct,
  };
}

/** Forget the lot. Somebody's own numbers are somebody's to delete. */
export async function forget() {
  held = { days: {}, before: { lan: 0, direct: 0, relay: 0 } };
  dirty = true;
  await save();
  return { ok: true, sentence: 'What has been counted is gone.' };
}

export const BOOK_AT = BOOK;
export const __testOnly = { DAYS_KEPT, today };
