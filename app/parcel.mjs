/**
 * A folder, made into one thing that can travel, and put back at the other end.
 *
 * There is no archive format in the standard library and this project has no
 * dependencies, so here is the smallest one that does the job honestly:
 *
 *   first:          <{ v: 2, totalFiles, totalDirs, totalBytes }>\n
 *   for each folder:<{ dir }>\n
 *   for each file:  <{ path, size }>\n  <exactly size bytes>
 *   at the end:     <{ end: true, files, dirs, bytes }>\n
 *
 * The whole stream is compressed. Paths are written with forward slashes and are
 * checked on the way out as well as the way in: nothing may climb above the
 * folder it is being put into, no matter what the other end says.
 *
 * **The opening line and the closing line are the whole design.** The closing
 * line says what was sent; the opening line says what was *going* to be sent,
 * before a byte moved. The receiver checks both, and refuses to call anything
 * finished unless every file and every byte is accounted for.
 *
 * That was the missing half. The closing line existed and the receiver read it
 * and **threw it away** — it reported its own count as the answer without ever
 * comparing the two. So every way a folder can quietly lose part of itself came
 * out the other end looking like a success:
 *
 *   a folder the sender could not read, skipped whole and silently;
 *   a file too large for one parcel, dropped without a word;
 *   a write that failed on the receiving disk, counted as though it had worked.
 *
 * Each of those is rare. Together they are the difference between a tool you
 * trust with 1.3 GB and one that hands you 300 MB and says "done".
 *
 * The opening line also buys the thing progress needs: the receiver knows the
 * total before anything arrives, so a percentage is a fact rather than a guess.
 * It costs one extra walk of the directory entries, which is the cheap kind —
 * nothing is read, and a hundred megabytes costs the same as an empty folder.
 */

import { createReadStream, createWriteStream, existsSync } from 'node:fs';
import { mkdir, readdir, stat, rm, readFile, writeFile, utimes } from 'node:fs/promises';
import { join, dirname, relative, sep, resolve } from 'node:path';
import { createGzip, createGunzip } from 'node:zlib';
import { PassThrough } from 'node:stream';

/**
 * Folders that are rebuilt from what is already in the project, and are usually
 * bigger than the project. Sent only if you say to send everything.
 */
export const HEAVY = [
  'node_modules', '.venv', 'venv', '__pycache__', '.pytest_cache',
  'target', 'dist', 'build', 'out', '.next', '.nuxt', '.turbo',
  '.gradle', '.parcel-cache', '.cache', 'DerivedData', 'bin', 'obj',
];

const ONE_FILE_LIMIT = 2 * 1024 * 1024 * 1024;

/**
 * Everything in a folder that would travel, listed once.
 *
 * The one walk. What a card advertises, what the parcel's opening line promises
 * and what the sender actually puts on the wire all come from here, because the
 * moment there are two walks there are two answers and the person is shown
 * whichever one happens to be wrong.
 *
 * There used to be two. The number on a project's card came from the
 * fingerprint, which skips the history folder and stops counting at thirty
 * thousand files; the bytes that travelled came from this. On a project with a
 * large history or a lot of files those are simply different numbers, and the
 * one on screen was never the one that moved.
 *
 * `unreadable` is the part that is not a nicety. A folder this computer cannot
 * open is not an empty folder, and treating it as one is how a subtree
 * disappears without anybody being told. It is counted, and the sender refuses
 * to claim a parcel is complete when it is not empty.
 */
export async function survey(root, { everything = false } = {}) {
  const from = resolve(root);
  const dirs = [];
  const files = [];
  let bytes = 0;
  const skipped = [];
  const unreadable = [];

  const walk = async (at) => {
    let entries;
    try {
      entries = await readdir(at, { withFileTypes: true });
    } catch (e) {
      unreadable.push({ path: relative(from, at).split(sep).join('/') || '.', why: e.code ?? 'unreadable' });
      return;
    }
    // Sorted, so the same folder produces the same parcel twice running.
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

    for (const entry of entries) {
      const path = join(at, entry.name);
      const named = relative(from, path).split(sep).join('/');

      if (entry.isDirectory()) {
        if (!everything && HEAVY.includes(entry.name)) {
          skipped.push({ path: named, why: 'rebuilt from what is already here' });
          continue;
        }
        // Kept whether or not anything is inside it. A folder that is empty on
        // purpose is part of the shape of a project, and rebuilding the shape
        // from the files alone quietly loses every one of them.
        dirs.push(named);
        await walk(path);
        continue;
      }

      // Anything that is neither a folder nor an ordinary file — a link, a
      // pipe, a device — is named rather than passed over in silence.
      if (!entry.isFile()) {
        skipped.push({ path: named, why: 'not an ordinary file' });
        continue;
      }

      let size;
      let when;
      try {
        const known = await stat(path);
        size = known.size;
        // The moment it was last written, carried from here to the far end and
        // put back there. Without it, a file that arrived is a file with
        // today's date, every comparison afterwards says it differs from the
        // one it was copied from, and a sync can never end in "up to date".
        when = Math.round(known.mtimeMs);
      } catch (e) {
        unreadable.push({ path: named, why: e.code ?? 'unreadable' });
        continue;
      }
      if (size > ONE_FILE_LIMIT) {
        skipped.push({ path: named, why: 'larger than one parcel can carry' });
        continue;
      }

      // Two names, deliberately. `path` is what travels and is relative with
      // forward slashes, because the far end must never be handed one of this
      // computer's absolute paths. `from` is where to read it here. Carrying
      // only the first one is how the sender ends up opening files relative to
      // wherever it happens to be running.
      files.push({ path: named, from: path, size, when });
      bytes += size;
    }
  };

  await walk(from);
  return { dirs, files, bytes, skipped, unreadable };
}

/**
 * What is in a folder, as the numbers a card shows.
 *
 * Kept as its own name because that is what everything already calls, and
 * because "how big is it" is a fair question to ask without wanting the list.
 */
export async function weigh(root, { everything = false } = {}) {
  const seen = await survey(root, { everything });
  return {
    files: seen.files.length,
    dirs: seen.dirs.length,
    bytes: seen.bytes,
    skipped: seen.skipped.length,
    unreadable: seen.unreadable.length,
  };
}

/** Say the size the way a person would. */
export const inWords = (bytes) => (bytes >= 1e9
  ? `${(bytes / 1e9).toFixed(1)} GB`
  : bytes >= 1e6 ? `${Math.round(bytes / 1e6)} MB`
    : bytes >= 1e3 ? `${Math.round(bytes / 1e3)} KB` : `${bytes} bytes`);

// ---------------------------------------------------------------------------
// Making one
// ---------------------------------------------------------------------------

/**
 * Wrap a folder up into a stream.
 *
 * Returns a readable straight away and fills it as it goes, so nothing is ever
 * held whole in memory and a large project starts moving immediately.
 */
/**
 * The same survey with what the other end already has taken out of it.
 *
 * **Matched on path and size together, never on path alone.** A file that has
 * changed since the attempt that carried it has the same name and different
 * bytes, and skipping it would hand somebody a folder that is a mixture of two
 * moments — every file present, every count agreeing, and the contents wrong.
 * That is the exact shape of quiet failure this whole format exists to refuse,
 * so a size that does not match means the file is sent again.
 *
 * The folders are all kept. Making one that is already there costs nothing and
 * saves working out which of them the other end managed to create.
 */
export function withoutWhatTheyHave(seen, have) {
  if (!have || !Object.keys(have).length) return seen;

  const files = seen.files.filter((one) => Number(have[one.path]) !== one.size);
  return {
    ...seen,
    files,
    bytes: files.reduce((sum, one) => sum + one.size, 0),
    /** What the other end is keeping, so the reply can say what the whole is. */
    theirs: {
      files: seen.files.length - files.length,
      bytes: seen.bytes - files.reduce((sum, one) => sum + one.size, 0),
    },
  };
}

export function wrap(root, { everything = false, seen = null } = {}) {
  const out = new PassThrough();
  const squashed = createGzip({ level: 6 });
  squashed.pipe(out);

  (async () => {
    const from = resolve(root);
    const list = seen ?? (await survey(from, { everything }));

    // A folder this computer could not open is not an empty folder. Refusing
    // here — before a byte moves — is the difference between somebody being
    // told their project cannot be sent and somebody receiving most of it.
    if (list.unreadable.length) {
      throw new Error(`${list.unreadable.length} folders here could not be read`);
    }

    const put = (chunk) => new Promise((done, fail) => {
      // The callback is what makes this respect a full pipe rather than piling
      // the whole project into memory ahead of a slow network.
      squashed.write(chunk, (e) => (e ? fail(e) : done()));
    });

    await put(`${JSON.stringify({
      v: 2,
      totalFiles: list.files.length,
      totalDirs: list.dirs.length,
      totalBytes: list.bytes,
    })}\n`);

    for (const dir of list.dirs) await put(`${JSON.stringify({ dir })}\n`);

    let files = 0;
    let bytes = 0;

    for (const one of list.files) {
      // The other end went away. Reading the rest of a gigabyte off the disk to
      // write it into a socket nobody is holding is work that cannot help
      // anybody, and on a large project it goes on for minutes after the person
      // has given up and walked off.
      if (out.destroyed) return;

      await put(`${JSON.stringify({ path: one.path, size: one.size, when: one.when ?? null })}\n`);

      // Read by hand rather than with `pipeline(…, { end: false })`.
      //
      // That helper adds a close listener to the destination for every call and
      // takes none of them off again, because it is built for one stream into
      // one stream — not for four thousand streams into the same one. It shows
      // up as "11 close listeners added to [Gzip]" and then keeps going: on a
      // project of four thousand files, four thousand listeners on a single
      // stream, every one of them consulted on every event.
      let sent = 0;
      for await (const chunk of createReadStream(one.from ?? join(from, one.path))) {
        await put(chunk);
        sent += chunk.length;
      }

      // The file changed size underneath us. Saying nothing here would put a
      // stream out of step with its own manifest, and every file after it would
      // land as somebody else's bytes.
      if (sent !== one.size) {
        throw new Error(`${one.path} changed while it was being sent`);
      }

      files += 1;
      bytes += sent;
    }

    await put(`${JSON.stringify({
      end: true, files, dirs: list.dirs.length, bytes,
    })}\n`);
    squashed.end();
  })().catch((e) => out.destroy(e));

  return out;
}

/**
 * One file, wrapped as a parcel of one.
 *
 * Deliberately the same format rather than a second one. A file could be sent
 * as its own bytes down the wire with the name in a header, and that would be
 * simpler for about a week — until the first time a size is wrong, and there
 * are two places to check the arithmetic instead of one. Everything a folder
 * gets, a file gets: an opening line saying what is coming, a closing line
 * saying what went, and a receiver that refuses to accept the difference.
 */
export function wrapOne(path) {
  const out = new PassThrough();
  const squashed = createGzip({ level: 6 });
  squashed.pipe(out);

  (async () => {
    const at = resolve(path);
    const size = (await stat(at)).size;
    const named = at.split(sep).pop();

    const put = (chunk) => new Promise((done, fail) => {
      squashed.write(chunk, (e) => (e ? fail(e) : done()));
    });

    await put(`${JSON.stringify({ v: 2, totalFiles: 1, totalDirs: 0, totalBytes: size })}\n`);
    await put(`${JSON.stringify({ path: named, size })}\n`);

    let sent = 0;
    for await (const chunk of createReadStream(at)) {
      if (out.destroyed) return;
      await put(chunk);
      sent += chunk.length;
    }
    if (sent !== size) throw new Error(`${named} changed while it was being sent`);

    await put(`${JSON.stringify({ end: true, files: 1, dirs: 0, bytes: sent })}\n`);
    squashed.end();
  })().catch((e) => out.destroy(e));

  return out;
}

// ---------------------------------------------------------------------------
// Opening one
// ---------------------------------------------------------------------------

/** Where a folder is built while it is still arriving, and its ledger. */
export const halfOf = (into) => `${resolve(into)}.part`;
export const ledgerOf = (into) => join(halfOf(into), '.viberant-carried.json');

/**
 * What a previous attempt already got, if it left anything.
 *
 * The ledger rather than the folder, and the difference matters: a file that
 * was half written is on the disk and is not in the ledger, so it is asked for
 * again and overwritten. Trusting the folder would keep a truncated file and
 * call the transfer finished, which is the one kind of wrong this must not be.
 */
export async function whatIsAlreadyHere(into, { forOffer = null } = {}) {
  const at = ledgerOf(into);
  if (!existsSync(at)) return null;

  try {
    const held = JSON.parse(await readFile(at, 'utf8'));
    if (!held?.have || typeof held.have !== 'object') return null;
    // A part folder left over from something else entirely is not a head start,
    // it is a folder about to be filled with two different things.
    if (forOffer && held.forOffer && held.forOffer !== forOffer) return null;
    return held;
  } catch { return null; }
}

/** Forget a part-finished folder, and take it off the disk. */
export async function forget(into) {
  await rm(halfOf(into), { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
    .catch(() => {});
}

/**
 * Unwrap a stream into a folder.
 *
 * Written beside the folder first and moved into place only once the closing
 * line has arrived, so a transfer that stops half way leaves nothing that looks
 * like a finished project.
 *
 * **`have` is what a previous attempt already landed.** With it, the half-built
 * folder is kept rather than cleared, those files are counted as here from the
 * start, and the sender has been asked for only the rest. Without it this
 * behaves exactly as it always did — a fresh folder, from nothing.
 *
 * **`keep` decides what happens to a transfer that stops.** Off, the half folder
 * goes and nothing is left behind, which is right for a first attempt at
 * something small. On, what arrived stays with a ledger beside it, so the next
 * attempt can carry on instead of starting again. Either way **nothing that
 * looks finished is ever left**, because the half folder is never the target.
 */
export async function unwrap(stream, into, {
  onProgress, have = null, keep = false, forOffer = null, merge = false,
} = {}) {
  const target = resolve(into);
  const half = halfOf(target);

  /**
   * Listened to before anything is awaited.
   *
   * Preparing the folder takes a moment, and a source that fails during that
   * moment used to raise an error on a stream nothing was listening to — which
   * is not a rejected promise, it is the end of the whole manager (D-77). The
   * window was small and entirely real: a peer hanging up the instant after a
   * transfer was asked for lands squarely in it.
   *
   * Kept, and handed to the reader below once there is one.
   */
  let sourceFailed = null;
  const holdError = (e) => { sourceFailed = e; };
  stream.on('error', holdError);

  if (!have) await rm(half, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  await mkdir(half, { recursive: true });

  // Everything a previous attempt confirmed. Counted in from the start, so the
  // numbers this reports are about the whole folder rather than about one go at
  // it — the person is waiting for a folder, not for an attempt.
  const carried = new Map(Object.entries(have?.have ?? {}));
  let alreadyFiles = 0;
  let alreadyBytes = 0;
  for (const size of carried.values()) { alreadyFiles += 1; alreadyBytes += Number(size) || 0; }

  /**
   * A file that was already here and has been sent again.
   *
   * It changed since the last attempt, so the sender sent it rather than
   * trusting the name — and it is no longer part of what was already here, it
   * is part of what just arrived. Without this it is counted twice, at two
   * different sizes, and the total comes out larger than the folder. Found by a
   * test that changed a file between two attempts, which is the only way this
   * ever shows: it needs an interruption *and* an edit, in that order.
   */
  const forgetOldCopyOf = (named) => {
    if (!carried.has(named)) return;
    alreadyFiles -= 1;
    alreadyBytes -= Number(carried.get(named)) || 0;
  };

  /**
   * A source that fails, rather than merely stops.
   *
   * `pipe` does not carry an error forward. So a reply that dies half way
   * through its body raised an error on a stream nothing was listening to, and
   * an unheard `error` is not a rejected promise — it comes out of the event
   * loop with nobody expecting it, which in this process ends the whole manager
   * (D-77). The one place that reads it is here, so the listener goes here, and
   * it is turned into the ordinary answer: it stopped part way through.
   *
   * Found by a test that cut a transfer the way a network cuts one. Every
   * earlier test ended its stream politely, which is the one thing a failing
   * transfer never does.
   */
  const loose = createGunzip();
  stream.off('error', holdError);
  stream.on('error', (e) => loose.destroy(e));
  // Anything that went wrong while the folder was being prepared is delivered
  // now, to the one thing that is finally in a position to answer for it.
  if (sourceFailed) loose.destroy(sourceFailed); else stream.pipe(loose);

  let holding = Buffer.alloc(0);
  let promised = null;
  let onFile = null;
  let writing = null;
  let left = 0;
  let files = 0;
  let dirs = 0;
  let bytes = 0;
  let finished = null;
  /** What this stream has landed whole, so a next attempt need not ask again. */
  let landing = null;

  /**
   * A disk that would not take it.
   *
   * Held here rather than thrown from inside the handler that noticed. An
   * exception raised inside an `error` listener does not travel back to the
   * code that was writing — it comes out of the event loop with nobody
   * expecting it, which in this process means the whole manager (D-77).
   */
  let refused = null;

  /**
   * Write, and wait when the disk is behind.
   *
   * Both listeners come off again. Adding a one-shot `error` alongside a
   * one-shot `drain` leaves the `error` behind every time the `drain` is the
   * one that fires — a leak of exactly the shape just removed from the sending
   * side, arriving in the fix for it. On a large file that is thousands of dead
   * listeners on one stream.
   */
  const putTo = (to, chunk) => {
    if (to.write(chunk)) return Promise.resolve();
    return new Promise((done, fail) => {
      const ok = () => { to.off('error', bad); done(); };
      const bad = (e) => { to.off('drain', ok); fail(e); };
      to.once('drain', ok);
      to.once('error', bad);
    });
  };

  /**
   * Give a file back the moment it was last written where it came from.
   *
   * Quietly, and never fatally: a folder that arrived is worth having even on a
   * disk that will not take a timestamp. What it buys is that the copy and the
   * original are recognisably the same file afterwards, which is what lets a
   * sync say "up to date" instead of offering to bring everything again.
   */
  const putTheMomentBack = async (at, when) => {
    if (!at || !when) return;
    const secs = when / 1000;
    await utimes(at, secs, secs).catch(() => {});
  };

  const openFor = async (named, size, when = null) => {
    const path = safely(half, named);
    if (!path) throw new Error('a file tried to land outside the folder');
    await mkdir(dirname(path), { recursive: true });
    landing = { path: named, size, when, at: path };
    writing = createWriteStream(path);
    // A disk that fills up, or a name this computer will not accept, used to be
    // nobody's business: the stream was written to and never listened to, so
    // the bytes were counted as arrived and the file was not there.
    writing.once('error', (e) => { refused = refused ?? e; });
    left = size;
    if (size === 0) {
      await new Promise((r) => writing.end(r));
      writing = null;
      files += 1;
      forgetOldCopyOf(named);
      carried.set(named, 0);
      await putTheMomentBack(path, when);
      landing = null;
    }
  };

  const eat = async () => {
    for (;;) {
      if (refused) throw refused;
      if (writing && left > 0) {
        const take = holding.subarray(0, Math.min(left, holding.length));
        if (!take.length) return;
        holding = holding.subarray(take.length);
        await putTo(writing, take);
        left -= take.length;
        bytes += take.length;
        if (left === 0) {
          await new Promise((r) => writing.end(r));
          writing = null;
          files += 1;
          if (landing) {
            forgetOldCopyOf(landing.path);
            carried.set(landing.path, landing.size);
            await putTheMomentBack(landing.at, landing.when);
          }
          landing = null;
        }
        onFile?.({ files: alreadyFiles + files, bytes: alreadyBytes + bytes, of: promised });
        continue;
      }

      const stop = holding.indexOf(0x0a);
      if (stop === -1) return;
      const line = holding.subarray(0, stop).toString('utf8');
      holding = holding.subarray(stop + 1);
      if (!line.trim()) continue;

      let said;
      try { said = JSON.parse(line); } catch { throw new Error('the parcel is not readable'); }

      if (said.end) { finished = said; return; }

      if (said.v) { promised = said; continue; }

      if (said.dir !== undefined) {
        const path = safely(half, said.dir);
        if (!path) throw new Error('a folder tried to land outside the folder');
        await mkdir(path, { recursive: true });
        dirs += 1;
        continue;
      }

      await openFor(said.path, Number(said.size) || 0, Number(said.when) || null);
    }
  };

  // Told at most fifteen times a second, however many thousand files arrive.
  // The counters underneath stay exact; it is only the telling that is paced,
  // because a page redrawn per chunk is a page that does nothing else.
  let toldAt = 0;
  onFile = (state) => {
    const now = Date.now();
    if (now - toldAt < 66) return;
    toldAt = now;
    onProgress?.(state);
  };

  // A stream that stops half way does not politely end — it throws, from
  // somewhere inside decompression. That is the ordinary case here rather than
  // an exceptional one, so it is caught and turned into the same answer as any
  // other way of not arriving.
  let broke = null;
  try {
    for await (const chunk of loose) {
      holding = holding.length ? Buffer.concat([holding, chunk]) : chunk;
      await eat();
      if (finished) break;
    }
  } catch (e) {
    broke = e;
    finished = null;
  }

  if (writing) await new Promise((r) => writing.end(r));
  onProgress?.({ files: alreadyFiles + files, bytes: alreadyBytes + bytes, of: promised });

  // A write that failed at the very end, after the last chunk was handed over.
  if (refused) finished = null;

  /**
   * Give up, and decide whether what arrived is worth keeping.
   *
   * Keeping it is only ever safe because of the ledger. It lists the files that
   * reached their stated size and nothing else, so the file that was being
   * written when the network went is absent from it — it is on the disk, it
   * will be asked for again, and it will be written over. A folder is never
   * built out of what merely happens to be lying there.
   */
  const giveUp = async (sentence, action) => {
    if (keep && carried.size) {
      const ledger = {
        forOffer: forOffer ?? null,
        have: Object.fromEntries(carried),
        at: Date.now(),
      };
      const wrote = await writeFile(ledgerOf(target), JSON.stringify(ledger), 'utf8')
        .then(() => true).catch(() => false);

      if (wrote) {
        return {
          ok: false,
          resumable: true,
          have: carried.size,
          haveBytes: alreadyBytes + bytes,
          sentence,
          action,
          files: alreadyFiles + files,
          bytes: alreadyBytes + bytes,
          promised,
        };
      }
    }

    await rm(half, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    return {
      ok: false,
      sentence,
      action,
      files: alreadyFiles + files,
      bytes: alreadyBytes + bytes,
      promised,
    };
  };

  if (!finished) {
    const parts = broke?.message?.includes('outside the folder');
    return giveUp(
      keep && carried.size && !parts
        ? `The folder stopped arriving part way through. ${carried.size} files are here and the rest can be asked for again.`
        : 'The folder stopped arriving part way through, so nothing was kept.',
      parts
        ? 'That parcel is not one this computer will accept.'
        : 'Check both computers are still on the same network, then try again.',
    );
  }

  // The check that was missing, and it is the whole reason any of this can be
  // trusted. Everything above can go wrong quietly; this is where quiet stops.
  //
  // Three numbers have to agree: what was promised before anything moved, what
  // the far end says it sent, and what actually landed on this disk. Any two of
  // them agreeing is not enough — a sender that skipped a folder would have a
  // consistent story with itself all the way through.
  //
  // All three are about **this stream**, and stay that way when a transfer is
  // being carried on from a previous attempt: the sender was asked for the
  // rest, so the rest is what it promised, sent and is held to. Whether the
  // whole folder is now here is a different question with a different answer,
  // and it is asked one level up where both halves are known. Folding them
  // together here would have made this check compare a part against a whole and
  // fail every resumed transfer.
  const shortOf = (a, b) => a !== undefined && a !== null && a !== b;

  if (shortOf(finished.files, files) || shortOf(finished.bytes, bytes)
    || (promised && (shortOf(promised.totalFiles, files) || shortOf(promised.totalBytes, bytes)))) {
    const wanted = (promised?.totalBytes ?? finished.bytes ?? 0) + alreadyBytes;
    return giveUp(
      `Only ${inWords(alreadyBytes + bytes)} of ${inWords(wanted)} arrived, so it is not finished.`,
      'Nothing on this computer was changed. Try again when both are settled.',
    );
  }

  // The ledger tracked an arrival. Once it has arrived it is litter, and litter
  // inside somebody's project is worse than litter beside it.
  await rm(ledgerOf(target), { force: true }).catch(() => {});

  if (merge) {
    /**
     * Put what arrived *into* the folder, rather than in place of it.
     *
     * The ordinary way a parcel lands is to build the whole thing beside the
     * target and then swap it in, which is right when the parcel is the whole
     * project: nothing of the old folder can survive half a transfer.
     *
     * A sync is the one case where the parcel is deliberately **not** the whole
     * project — the files that did not change were never sent, because they are
     * already here. Swapping the folder then replaces a project with the handful
     * of files that changed, and everything else is gone.
     *
     * Caught by holding the resulting folder against what the far end said the
     * project comes to, which is the one check that can see it: every number
     * about the stream was correct.
     */
    await mergeOver(half, target);
    await rm(half, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }).catch(() => {});
  } else {
    await rm(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    await moveIntoPlace(half, target);
  }

  return {
    ok: true,
    at: target,
    dirs,
    files: alreadyFiles + files,
    bytes: alreadyBytes + bytes,
    promised,
    carriedOver: alreadyFiles,
  };
}

/**
 * Move everything from one folder into another, keeping what is already there.
 *
 * Used only by a sync, where what arrived is a part rather than a whole. Files
 * that arrived replace what is there; files that did not arrive are left
 * exactly as they were, because they are the ones that had not changed.
 */
async function mergeOver(from, to) {
  const { rename, readdir: read, mkdir: make, copyFile } = await import('node:fs/promises');

  const walk = async (at, into) => {
    await make(into, { recursive: true });
    for (const entry of await read(at, { withFileTypes: true })) {
      const here = join(at, entry.name);
      const there = join(into, entry.name);
      if (entry.isDirectory()) { await walk(here, there); continue; }
      // Renaming across the same disk is a move; the copy is for the day it is
      // not, which on Windows is any two folders on different drives.
      try {
        await rm(there, { force: true });
        await rename(here, there);
      } catch {
        await copyFile(here, there);
      }
    }
  };

  await walk(from, to);
}

/**
 * Put the finished folder where it is meant to go, waiting out Windows.
 *
 * The last step of a folder arriving is a rename, and on Windows it is the step
 * most likely to be refused for a reason that has nothing to do with this
 * program. A virus scanner reads a file the moment it is written; the search
 * indexer opens the folder; and a folder that was just deleted keeps its name
 * reserved for a moment afterwards. Any of those comes back as a flat refusal.
 *
 * Everything either side of this line already waits — both `rm` calls here ask
 * for five attempts a tenth of a second apart, for exactly this reason. The
 * rename between them did not, and it is the one step where giving up costs the
 * whole transfer: every byte has arrived, and the person is told the folder did
 * not come. Caught once in three full runs of the tests, which is roughly how
 * often it would happen to somebody moving a real folder.
 */
async function moveIntoPlace(from, to) {
  const { rename } = await import('node:fs/promises');
  for (let attempt = 0; ; attempt += 1) {
    try {
      await rename(from, to);
      return;
    } catch (e) {
      // Only the ones that pass. A folder that is not there, or a name that
      // cannot exist, will not become possible by asking again.
      const passing = e?.code === 'EPERM' || e?.code === 'EACCES' || e?.code === 'EBUSY';
      if (!passing || attempt >= 20) throw e;
      await new Promise((r) => setTimeout(r, 50 + attempt * 25));
    }
  }
}

/**
 * A path from somewhere else, made safe.
 *
 * The other end could say anything, including `..\..\Windows\System32`. This is
 * the one place that matters, so it is a function with a name rather than a
 * line inside a loop.
 */
export function safely(root, named) {
  const cleaned = String(named).replace(/\\/g, '/').replace(/^\/+/, '');
  if (!cleaned || cleaned.includes('\0')) return null;
  const path = resolve(root, cleaned);
  const inside = resolve(root);
  if (path !== inside && !path.startsWith(inside + sep)) return null;
  return path;
}
