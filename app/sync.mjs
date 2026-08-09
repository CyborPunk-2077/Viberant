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
import { createReadStream, existsSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { join, join as joinPath, dirname } from 'node:path';

/** The bytes of one file, or nothing if it is not there. */
async function readTheFile(at) {
  const { readFile } = await import('node:fs/promises');
  try { return await readFile(at); } catch { return null; }
}

/** Put bytes back where they were, making the folder if it went. */
async function putTheFileBack(at, bytes) {
  const { writeFile, mkdir } = await import('node:fs/promises');
  try {
    await mkdir(dirname(at), { recursive: true });
    await writeFile(at, bytes);
  } catch { /* the folder is gone, which the check below will notice */ }
}

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

// ---------------------------------------------------------------------------
// Doing it, between two computers
// ---------------------------------------------------------------------------

/**
 * Bring the changed part of a project from another computer.
 *
 * The whole conversation, in one place, so neither end has to guess what the
 * other is doing:
 *
 *   this end says what it already has;
 *   that end works out what is missing and sends only that;
 *   this end keeps a way back for anything that would be replaced;
 *   the parcel lands through the ordinary unwrap, with what was kept counted in;
 *   and the tree that results is held against what that end said the whole
 *     project comes to.
 *
 * That last step is the one worth naming. Everything before it verifies **the
 * stream** — that what was promised arrived. This verifies **the folder** —
 * that what is now on this disk is the project, rather than the project as it
 * was plus whatever happened to already be here. A sync is the one operation
 * where those two can differ, because it is the only one that deliberately
 * does not send everything.
 */
export async function bring({
  channel, into, snapshotWith = null, onProgress = null, keepMine = [],
}) {
  const parcelOf = await import('./parcel.mjs');

  // What is here now. An empty answer is fine and means "send everything".
  const mine = existsSyncSafe(into) ? await manifest(into, { everything: false }) : { files: {}, dirs: [] };
  await channel.write(`${JSON.stringify({ have: mine.files })}\n`);

  const head = await firstLine(channel);
  if (!head) {
    return { ok: false, sentence: 'That computer did not say what it has.', action: 'Try again in a moment.' };
  }
  if (head.no) {
    return { ok: false, sentence: head.no, action: head.action ?? null };
  }

  /*
   * What somebody said to keep, kept.
   *
   * A file both people changed is a decision, and this is where the decision
   * lands. Anything named here is dropped from what will be written — the
   * other end still sends it, because it was already told what to send before
   * anybody chose, and dropping it here is the difference between honouring a
   * choice and asking the far end to be trusted with it.
   */
  const mineToKeep = new Set(keepMine ?? []);
  const work = {
    toSend: (head.toSend ?? []).filter((path) => !mineToKeep.has(path)),
    bytesToSend: head.bytesToSend ?? 0,
    bytesUnchanged: head.bytesUnchanged ?? 0,
    kept: [...mineToKeep],
  };
  onProgress?.(inWords(work));

  // A way back for anything about to be written over, before a byte lands.
  let wayBack = null;
  if (snapshotWith && work.toSend.length) {
    const overwriting = work.toSend.filter((path) => path in (mine.files ?? {}));
    if (overwriting.length) {
      wayBack = await snapshotWith({ dir: into, files: overwriting, why: 'before bringing changes over' });
    }
  }

  // Everything this end is keeping, in the shape resuming already understands.
  const keeping = {};
  for (const [path, one] of Object.entries(mine.files ?? {})) {
    if (!work.toSend.includes(path)) keeping[path] = one.size;
  }

  /*
   * A file somebody chose to keep is held here, not asked for.
   *
   * Declaring it as already-held does not work and it is worth saying why: the
   * far end decides what to send from the list it was given *before* anybody
   * chose, and two versions of the same file are usually the same size, so
   * "I have one of those" is not "do not send me yours". Measured: the file was
   * sent, written, and somebody's own version was gone.
   *
   * So the bytes are read now and put back afterwards. Nothing subtle, and it
   * cannot be defeated by the far end sending something anyway.
   */
  const held = new Map();
  for (const path of mineToKeep) {
    const at = joinPath(into, path);
    const bytes = await readTheFile(at);
    if (bytes !== null) held.set(path, bytes);
  }

  const out = await parcelOf.unwrap(channel.incoming, into, {
    have: { have: keeping },
    keep: false,
    // A sync sends a part, so what arrives goes *into* the folder rather than
    // in place of it — otherwise everything that had not changed is gone.
    merge: true,
    onProgress: onProgress ? ({ files, bytes }) => onProgress(
      `${files} files · ${parcelOf.inWords(bytes)}`,
    ) : undefined,
  });
  if (!out.ok) return { ...out, wayBack };

  /**
   * The folder, held against what the far end said the whole project is.
   *
   * Counted rather than trusted: the far end said the project comes to so many
   * files and so many bytes, and this is what is on the disk. A sync that got
   * the arithmetic right about the stream and wrong about the folder would
   * leave somebody with a project that is quietly missing a file, and every
   * number on the way would have agreed.
   */
  // Put back exactly what somebody said to keep, before anything is measured.
  for (const [path, bytes] of held) {
    await putTheFileBack(joinPath(into, path), bytes);
  }

  const landed = await manifest(into, { everything: false });
  const wantedFiles = Number(head.whole?.files ?? 0);
  const wantedBytes = Number(head.whole?.bytes ?? 0);
  const hereFiles = Object.keys(landed.files).length;
  const hereBytes = Object.values(landed.files).reduce((sum, one) => sum + one.size, 0);

  if (wantedFiles && (hereFiles !== wantedFiles || hereBytes !== wantedBytes)) {
    return {
      ok: false,
      wayBack,
      sentence: `What is here now is ${hereFiles} files and that project is ${wantedFiles}.`,
      action: wayBack?.taken
        ? 'Nothing of yours was lost — what would have been replaced was kept first, and can be put back.'
        : 'Bring the whole project over instead.',
    };
  }

  return {
    ok: true,
    wayBack,
    at: out.at,
    changed: work.toSend.length,
    kept: work.kept,
    bytes: work.bytesToSend,
    unchanged: work.bytesUnchanged,
    sentence: work.toSend.length
      ? `${work.toSend.length} file${work.toSend.length === 1 ? '' : 's'} changed — ${parcelOf.inWords(work.bytesToSend)} came over.`
      : 'Nothing had changed, so nothing came over.',
    // What was kept is said out loud. Somebody who chose to keep their own
    // version needs to see that it was kept, not infer it from a total.
    action: [
      `${parcelOf.inWords(work.bytesUnchanged)} was already here and stayed where it was.`,
      work.kept.length
        ? `${work.kept.length} you chose to keep ${work.kept.length === 1 ? 'was' : 'were'} left exactly as ${work.kept.length === 1 ? 'it is' : 'they are'}.`
        : '',
    ].filter(Boolean).join(' '),
  };
}

/**
 * The far half: work out what is missing and send only that.
 *
 * The folder is decided here, from what this computer is offering — never from
 * anything the asker said. Same rule as everything else that runs at somebody
 * else's request.
 */
export async function serve({ channel, dir, everything = false }) {
  const parcelOf = await import('./parcel.mjs');

  const asked = await firstLine(channel);
  if (!asked) { channel.fail('nothing was asked for'); return { ok: false }; }

  const whole = await manifest(dir, { everything });
  const theirs = { files: asked.have ?? {} };
  const work = compare(whole, theirs);
  const toSend = await whatToSend(dir, work, { everything });

  await channel.write(`${JSON.stringify({
    whole: {
      files: Object.keys(whole.files).length,
      bytes: Object.values(whole.files).reduce((sum, one) => sum + one.size, 0),
    },
    toSend: work.toSend,
    bytesToSend: work.bytesToSend,
    bytesUnchanged: work.bytesUnchanged,
  })}\n`);

  await channel.pour(parcelOf.wrap(dir, { everything, seen: toSend }));
  return { ok: true, changed: work.toSend.length, bytes: work.bytesToSend };
}

/** One line of JSON off a channel, and whatever follows stays for the parcel. */
function firstLine(channel) {
  return new Promise((done) => {
    let held = Buffer.alloc(0);
    let settled = false;

    const finish = (v) => {
      if (settled) return;
      settled = true;
      // Paused before letting go, even on the paths where nothing reads next —
      // the rule is worth keeping uniform rather than reasoned about per case.
      channel.incoming.pause();
      channel.incoming.off('data', onData);
      done(v);
    };

    const onData = (chunk) => {
      held = Buffer.concat([held, chunk]);
      const at = held.indexOf(0x0a);
      if (at === -1) return;

      let said;
      try { said = JSON.parse(held.subarray(0, at).toString()); } catch { return finish(null); }

      /**
       * Stop the stream before letting go of it.
       *
       * Attaching a `data` listener puts a stream into flowing mode, and taking
       * the listener off again does **not** put it back — so everything that
       * arrived between reading this line and the parcel reader attaching went
       * into nothing. What was kept back went back on; what came next was lost,
       * and every sync reported that the folder had stopped arriving part way
       * through. The same shape of mistake as the relay's, which is why it is
       * worth naming twice.
       */
      const rest = held.subarray(at + 1);
      channel.incoming.pause();
      channel.incoming.off('data', onData);
      if (rest.length) channel.incoming.unshift(rest);
      settled = true;
      done(said);
    };

    channel.incoming.on('data', onData);
    channel.incoming.on('end', () => finish(null));
    channel.incoming.on('error', () => finish(null));
    setTimeout(() => finish(null), 30000).unref?.();
  });
}

const existsSyncSafe = (at) => { try { return existsSync(at); } catch { return false; } };
