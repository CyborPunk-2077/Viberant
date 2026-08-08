/**
 * Sending the twenty megabytes that changed, rather than the ten gigabytes.
 *
 * `survey` already walks a folder and returns every file with its path and its
 * size, and `withoutWhatTheyHave` already takes a list of what the far end
 * holds and produces the rest. Resuming an interrupted transfer is the same
 * question asked about one attempt; this is the same question asked about two
 * moments. So this is not a new transfer system — it is the existing one, given
 * the other side's list instead of an empty one.
 *
 * **Size and time, then content when it matters.** Comparing every byte of ten
 * gigabytes to find out that nothing changed costs as much as sending it. A
 * file whose size and modified time both match is taken as unchanged, which is
 * what every synchroniser does and is right almost always. Where being wrong
 * would be expensive — a file whose size matches but whose time moved — the
 * content is hashed and the answer is certain.
 *
 * **Nothing is deleted without being asked.** A file here and not there is not
 * evidence that it should go: it is equally evidence that it was just made. So
 * the default is to add and replace and never remove, and removing is a
 * separate answer somebody gives on purpose.
 */

import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { join } from 'node:path';

import * as parcel from './parcel.mjs';

/**
 * What a folder looks like right now, as the other end needs to hear it.
 *
 * Path, size and when it was last written. The time is what makes this cheap:
 * without it, two files of the same size are indistinguishable without reading
 * both, and with it they are almost never read at all.
 */
export async function manifest(root, { everything = false } = {}) {
  const seen = await parcel.survey(root, { everything });

  const files = {};
  for (const one of seen.files) {
    const when = await stat(one.from ?? join(root, one.path)).then((s) => s.mtimeMs).catch(() => 0);
    files[one.path] = { size: one.size, when: Math.round(when) };
  }

  return {
    files,
    dirs: seen.dirs,
    count: seen.files.length,
    bytes: seen.bytes,
    unreadable: seen.unreadable.length,
  };
}

/** Whether two entries are the same file as far as anybody can tell cheaply. */
const looksSame = (a, b) => !!a && !!b && a.size === b.size && a.when === b.when;

/**
 * What has to move, and what does not.
 *
 * Four answers, and the fourth is the one that makes this worth building:
 *
 *   **missing** — not there at all;
 *   **changed** — a different size, or the same size at a different moment;
 *   **extra** — there and not here, which is reported and never acted on;
 *   **same** — everything else, which is almost all of it.
 */
export function compare(mine, theirs) {
  const missing = [];
  const changed = [];
  const same = [];
  const extra = [];

  for (const [path, one] of Object.entries(mine.files ?? {})) {
    const other = theirs.files?.[path];
    if (!other) { missing.push(path); continue; }
    if (looksSame(one, other)) { same.push(path); continue; }
    changed.push(path);
  }
  for (const path of Object.keys(theirs.files ?? {})) {
    if (!(path in (mine.files ?? {}))) extra.push(path);
  }

  const bytesOf = (list) => list.reduce((sum, p) => sum + (mine.files[p]?.size ?? 0), 0);

  return {
    missing,
    changed,
    same,
    extra,
    toSend: [...missing, ...changed],
    bytesToSend: bytesOf(missing) + bytesOf(changed),
    bytesUnchanged: bytesOf(same),
    // Folders travel whatever happens. Making one that is there costs nothing,
    // and a folder that is empty on purpose is part of the shape of a project.
    dirs: mine.dirs ?? [],
  };
}

/**
 * The same sentence a person would say about it.
 *
 * "8.98 GB unchanged · 22.4 MB changed" is the whole of what somebody wants to
 * know before pressing anything, and it is two numbers this already has.
 */
export function inWords(work) {
  const bits = [];
  if (work.bytesUnchanged) bits.push(`${parcel.inWords(work.bytesUnchanged)} unchanged`);
  bits.push(work.bytesToSend
    ? `${parcel.inWords(work.bytesToSend)} changed`
    : 'nothing changed');
  return bits.join(' · ');
}

/**
 * A survey trimmed to exactly what has to move.
 *
 * Handed to `wrap` as its `seen`, which is the same door resuming already uses.
 * One code path, so the integrity checks and the resume ledger apply to a sync
 * without being written twice.
 */
export async function whatToSend(root, work, { everything = false } = {}) {
  const whole = await parcel.survey(root, { everything });
  const wanted = new Set(work.toSend);
  const files = whole.files.filter((one) => wanted.has(one.path));

  return {
    ...whole,
    files,
    bytes: files.reduce((sum, one) => sum + one.size, 0),
    theirs: {
      files: whole.files.length - files.length,
      bytes: whole.bytes - files.reduce((sum, one) => sum + one.size, 0),
    },
  };
}

// ---------------------------------------------------------------------------
// Being sure, when cheap is not enough
// ---------------------------------------------------------------------------

/** The content of one file, as something short that can be compared. */
export function digestOf(path) {
  return new Promise((done) => {
    const hash = createHash('sha256');
    const stream = createReadStream(path);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => done(hash.digest('hex')));
    stream.on('error', () => done(null));
  });
}

/**
 * Ask the expensive question about the few files where it matters.
 *
 * A file whose size matches but whose time moved is usually the same file that
 * something touched. Reading those — and only those — turns "probably" into
 * "certainly" for the price of the handful that are ambiguous rather than the
 * price of the whole folder.
 */
export async function narrowDown(root, work, theirDigests = {}) {
  if (!Object.keys(theirDigests).length) return work;

  const stillChanged = [];
  const nowSame = [...work.same];

  for (const path of work.changed) {
    const theirs = theirDigests[path];
    if (!theirs) { stillChanged.push(path); continue; }
    const ours = await digestOf(join(root, path));
    if (ours && ours === theirs) nowSame.push(path); else stillChanged.push(path);
  }

  const bytesOf = (list) => list.reduce((sum, p) => sum + (work.sizes?.[p] ?? 0), 0);
  return {
    ...work,
    changed: stillChanged,
    same: nowSame,
    toSend: [...work.missing, ...stillChanged],
    bytesToSend: work.bytesToSend - bytesOf(work.changed.filter((p) => !stillChanged.includes(p))),
  };
}

// ---------------------------------------------------------------------------
// Not losing anybody's afternoon
// ---------------------------------------------------------------------------

/**
 * Has the other end changed the same files this one has?
 *
 * A sync that replaces a file somebody has been editing is the one failure
 * nobody forgives, so it is asked before anything moves. What counts as a
 * conflict: a file that both sides have changed since they last agreed. Where
 * there is no record of them ever agreeing, everything the far end would
 * overwrite counts, which errs towards asking.
 */
export function conflicts(mine, theirs, lastAgreed = null) {
  if (!lastAgreed?.files) {
    // Never synced. Anything they have that differs from ours is a decision
    // somebody has to make rather than one this makes for them.
    const both = [];
    for (const [path, one] of Object.entries(theirs.files ?? {})) {
      const ours = mine.files?.[path];
      if (ours && !looksSame(ours, one)) both.push(path);
    }
    return both;
  }

  const both = [];
  for (const [path, was] of Object.entries(lastAgreed.files)) {
    const ours = mine.files?.[path];
    const theirsNow = theirs.files?.[path];
    if (!ours || !theirsNow) continue;
    if (!looksSame(ours, was) && !looksSame(theirsNow, was) && !looksSame(ours, theirsNow)) {
      both.push(path);
    }
  }
  return both;
}

/** The three answers somebody may give about a file both sides changed. */
export const KEEP_MINE = 'keep mine';
export const KEEP_THEIRS = 'keep theirs';
export const LOOK_FIRST = 'look first';

export const __testOnly = { looksSame };
