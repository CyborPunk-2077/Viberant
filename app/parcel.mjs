/**
 * A folder, made into one thing that can travel, and put back at the other end.
 *
 * There is no archive format in the standard library and this project has no
 * dependencies, so here is the smallest one that does the job honestly:
 *
 *   for each file:  <one line of JSON: { path, size }>\n  <exactly size bytes>
 *   at the end:     <one line of JSON: { end: true, files, bytes }>\n
 *
 * The whole stream is compressed. The closing line is the point of the design —
 * a parcel that arrived complete says so, so a transfer cut off half way is
 * detected rather than quietly leaving somebody with two thirds of a project.
 *
 * Paths are written with forward slashes and are checked on the way out as well
 * as the way in: nothing may climb above the folder it is being put into, no
 * matter what the other end says.
 */

import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readdir, stat, rm } from 'node:fs/promises';
import { join, dirname, relative, sep, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
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

/** What is in a folder, before anything is sent. */
export async function weigh(root, { everything = false } = {}) {
  let files = 0;
  let bytes = 0;
  let skipped = 0;

  const walk = async (at) => {
    for (const entry of await readdir(at, { withFileTypes: true }).catch(() => [])) {
      const path = join(at, entry.name);
      if (entry.isDirectory()) {
        if (!everything && HEAVY.includes(entry.name)) { skipped += 1; continue; }
        await walk(path);
      } else if (entry.isFile()) {
        const size = await stat(path).then((s) => s.size).catch(() => 0);
        if (size > ONE_FILE_LIMIT) { skipped += 1; continue; }
        files += 1;
        bytes += size;
      }
    }
  };

  await walk(resolve(root));
  return { files, bytes, skipped };
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
export function wrap(root, { everything = false } = {}) {
  const out = new PassThrough();
  const squashed = createGzip({ level: 6 });
  squashed.pipe(out);

  (async () => {
    const from = resolve(root);
    let files = 0;
    let bytes = 0;

    const put = (chunk) => new Promise((done, fail) => {
      squashed.write(chunk, (e) => (e ? fail(e) : done()));
    });

    const walk = async (at) => {
      const entries = await readdir(at, { withFileTypes: true }).catch(() => []);
      for (const entry of entries) {
        const path = join(at, entry.name);
        if (entry.isDirectory()) {
          if (!everything && HEAVY.includes(entry.name)) continue;
          await walk(path);
          continue;
        }
        if (!entry.isFile()) continue;

        const size = await stat(path).then((s) => s.size).catch(() => null);
        if (size === null || size > ONE_FILE_LIMIT) continue;

        const named = relative(from, path).split(sep).join('/');
        await put(`${JSON.stringify({ path: named, size })}\n`);
        await pipeline(createReadStream(path), squashed, { end: false });
        files += 1;
        bytes += size;
      }
    };

    await walk(from);
    await put(`${JSON.stringify({ end: true, files, bytes })}\n`);
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
  let expecting = null;
  let writing = null;
  let left = 0;
  let files = 0;
  let bytes = 0;
  let finished = null;

  const openFor = async (named, size) => {
    const path = safely(half, named);
    if (!path) throw new Error('a file tried to land outside the folder');
    await mkdir(dirname(path), { recursive: true });
    writing = createWriteStream(path);
    left = size;
    if (size === 0) { writing.end(); writing = null; files += 1; }
  };

  const eat = async () => {
    for (;;) {
      if (writing && left > 0) {
        const take = holding.subarray(0, Math.min(left, holding.length));
        if (!take.length) return;
        holding = holding.subarray(take.length);
        writing.write(take);
        left -= take.length;
        bytes += take.length;
        if (left === 0) {
          await new Promise((r) => writing.end(r));
          writing = null;
          files += 1;
          onProgress?.({ files, bytes });
        }
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
      expecting = said;
      await openFor(said.path, Number(said.size) || 0);
    }
  };

  // A stream that stops half way does not politely end — it throws, from
  // somewhere inside decompression. That is the ordinary case here rather than
  // an exceptional one, so it is caught and turned into the same answer as any
  // other way of not arriving.
  try {
    for await (const chunk of loose) {
      holding = holding.length ? Buffer.concat([holding, chunk]) : chunk;
      await eat();
      if (finished) break;
    }
  } catch {
    finished = null;
  }

  if (writing) await new Promise((r) => writing.end(r));

  if (!finished) {
    await rm(half, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    return {
      ok: false,
      sentence: 'The folder stopped arriving part way through, so nothing was kept.',
      action: 'Check both computers are still on the same network, then try again.',
    };
  }

  await rm(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  const { rename } = await import('node:fs/promises');
  await rename(half, target);

  return { ok: true, files, bytes, at: target, expected: expecting };
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
