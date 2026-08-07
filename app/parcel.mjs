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

import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readdir, stat, rm } from 'node:fs/promises';
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
      try {
        size = (await stat(path)).size;
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
      files.push({ path: named, from: path, size });
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

      await put(`${JSON.stringify({ path: one.path, size: one.size })}\n`);

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

// ---------------------------------------------------------------------------
// Opening one
// ---------------------------------------------------------------------------

/**
 * Unwrap a stream into a folder.
 *
 * Written beside the folder first and moved into place only once the closing
 * line has arrived, so a transfer that stops half way leaves nothing that looks
 * like a finished project.
 */
export async function unwrap(stream, into, { onProgress } = {}) {
  const target = resolve(into);
  const half = `${target}.part`;
  await rm(half, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  await mkdir(half, { recursive: true });

  const loose = stream.pipe(createGunzip());

  let holding = Buffer.alloc(0);
  let promised = null;
  let onFile = null;
  let writing = null;
  let left = 0;
  let files = 0;
  let dirs = 0;
  let bytes = 0;
  let finished = null;

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

  const openFor = async (named, size) => {
    const path = safely(half, named);
    if (!path) throw new Error('a file tried to land outside the folder');
    await mkdir(dirname(path), { recursive: true });
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
        }
        onFile?.({ files, bytes, of: promised });
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

      await openFor(said.path, Number(said.size) || 0);
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
  onProgress?.({ files, bytes, of: promised });

  // A write that failed at the very end, after the last chunk was handed over.
  if (refused) finished = null;

  const giveUp = async (sentence, action) => {
    await rm(half, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    return { ok: false, sentence, action, files, bytes, promised };
  };

  if (!finished) {
    return giveUp(
      'The folder stopped arriving part way through, so nothing was kept.',
      broke?.message?.includes('outside the folder')
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
  const shortOf = (a, b) => a !== undefined && a !== null && a !== b;

  if (shortOf(finished.files, files) || shortOf(finished.bytes, bytes)
    || (promised && (shortOf(promised.totalFiles, files) || shortOf(promised.totalBytes, bytes)))) {
    const wanted = promised?.totalBytes ?? finished.bytes ?? 0;
    return giveUp(
      `Only ${inWords(bytes)} of ${inWords(wanted)} arrived, so nothing was kept.`,
      'Nothing on this computer was changed. Try again when both are settled.',
    );
  }

  await rm(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  await moveIntoPlace(half, target);

  return { ok: true, files, dirs, bytes, at: target, promised };
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
