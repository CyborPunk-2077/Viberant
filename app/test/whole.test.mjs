/**
 * A folder arrives whole, or it does not arrive.
 *
 * The reported fault was a computer advertising 1.3 GB and the other one ending
 * up with about 300 MB — and being told it had worked. Everything here exists
 * because of the second half of that sentence. A transfer that fails is a bad
 * afternoon; a transfer that fails and says it succeeded is the end of anybody
 * trusting the product with anything.
 *
 * The closing line of a parcel has always said what was sent. What was missing
 * was anybody comparing it to what arrived.
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, writeFile, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, sep } from 'node:path';
import { randomBytes } from 'node:crypto';
import { PassThrough } from 'node:stream';
import { createGzip } from 'node:zlib';

import * as parcel from '../parcel.mjs';

let root, src;

/** Everything actually on disk under a folder, counted the way a person would. */
async function survey(dir) {
  const files = new Map();
  const dirs = new Set();
  const walk = async (at) => {
    for (const e of await readdir(at, { withFileTypes: true }).catch(() => [])) {
      const p = join(at, e.name);
      const rel = relative(dir, p).split(sep).join('/');
      if (e.isDirectory()) { dirs.add(rel); await walk(p); }
      else if (e.isFile()) files.set(rel, (await stat(p)).size);
    }
  };
  await walk(dir);
  return { files, dirs };
}

before(async () => {
  root = await mkdtemp(join(tmpdir(), 'viberant-whole-'));
  src = join(root, 'A Project With Spaces');

  const put = async (rel, bytes) => {
    const p = join(src, rel);
    await mkdir(join(p, '..'), { recursive: true });
    await writeFile(p, randomBytes(bytes));
  };

  // The awkward cases, all of which have been lost by some archive or other.
  for (let i = 0; i < 12; i += 1) await put(`src/mod${i}.js`, 1000 + i);
  await put('a/b/c/d/e/f/deep.txt', 40);              // deeply nested
  await put('LICENSE', 90);                            // no extension
  await put('.env.local', 12);                         // hidden file
  await put('.github/workflows/ci.yml', 80);           // hidden folder
  await put('.git/objects/ab/cdef', 4096);             // the history folder
  await put('docs/read me — notes.md', 70);            // spaces and unicode
  await put('assets/blob.bin', 3 * 1024 * 1024);       // bigger than one chunk
  await mkdir(join(src, 'empty-on-purpose'), { recursive: true });
  await mkdir(join(src, 'also/empty/nested'), { recursive: true });
});

after(async () => {
  await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
});

describe('a folder arrives whole, or not at all', () => {
  test('what is advertised is what is counted, from one walk', async () => {
    const seen = await parcel.survey(src);
    const weighed = await parcel.weigh(src);
    const real = await survey(src);

    assert.equal(weighed.files, seen.files.length);
    assert.equal(weighed.bytes, seen.bytes);
    assert.equal(seen.files.length, real.files.size, 'every file on disk is counted');
    assert.equal(seen.bytes, [...real.files.values()].reduce((a, b) => a + b, 0));
    assert.equal(seen.unreadable.length, 0);
  });

  test('every file, every folder and every byte comes out the other end', async () => {
    const before = await survey(src);
    const into = join(root, 'arrived');

    const out = await parcel.unwrap(parcel.wrap(src), into);
    assert.equal(out.ok, true, out.sentence);

    const after = await survey(into);

    assert.deepEqual([...after.files.keys()].sort(), [...before.files.keys()].sort());
    for (const [name, size] of before.files) {
      assert.equal(after.files.get(name), size, `${name} arrived the same size`);
    }
    assert.equal(
      [...after.files.values()].reduce((a, b) => a + b, 0),
      [...before.files.values()].reduce((a, b) => a + b, 0),
      'the same number of bytes',
    );
  });

  test('a folder that is empty on purpose is part of the shape, and survives', async () => {
    const after = await survey(join(root, 'arrived'));
    assert.ok(after.dirs.has('empty-on-purpose'), 'an empty folder is still a folder');
    assert.ok(after.dirs.has('also/empty/nested'), 'and so is an empty one three deep');
  });

  test('the history folder travels, because it is part of the project', async () => {
    const after = await survey(join(root, 'arrived'));
    assert.ok(after.files.has('.git/objects/ab/cdef'));
    assert.ok(after.files.has('.env.local'), 'and so does a hidden file');
  });

  test('a transfer cut off half way keeps nothing and says so', async () => {
    const into = join(root, 'cut');
    const cut = new PassThrough();
    const full = parcel.wrap(src);

    let through = 0;
    full.on('data', (c) => {
      if (through >= 40_000) return;
      through += c.length;
      cut.write(c);
      if (through >= 40_000) cut.end();
    });
    full.on('end', () => { if (through < 40_000) cut.end(); });

    const out = await parcel.unwrap(cut, into);
    assert.equal(out.ok, false);
    assert.ok(out.sentence && out.action);
    assert.equal(existsSync(into), false, 'nothing that looks finished is left behind');
    assert.equal(existsSync(`${into}.part`), false, 'and nothing half-written either');
  });

  test('a sender that claims more than it sends is caught, not believed', async () => {
    const into = join(root, 'liar');
    const lying = new PassThrough();
    const gz = createGzip();
    gz.pipe(lying);

    const put = (s) => new Promise((r) => gz.write(s, r));
    // A parcel that is internally consistent and completely wrong: it opens and
    // closes claiming a thousand files, and carries one.
    await put(`${JSON.stringify({ v: 2, totalFiles: 1000, totalDirs: 0, totalBytes: 5_000_000 })}\n`);
    await put(`${JSON.stringify({ path: 'only.bin', size: 4 })}\n`);
    await put(Buffer.alloc(4));
    await put(`${JSON.stringify({ end: true, files: 1000, dirs: 0, bytes: 5_000_000 })}\n`);
    gz.end();

    const out = await parcel.unwrap(lying, into);
    assert.equal(out.ok, false, 'a closing line agreeing with itself proves nothing');
    assert.match(out.sentence, /arrived/);
    assert.equal(existsSync(into), false);
  });

  test('nothing may land outside the folder it was put into', async () => {
    const into = join(root, 'escape');
    const nasty = new PassThrough();
    const gz = createGzip();
    gz.pipe(nasty);

    const put = (s) => new Promise((r) => gz.write(s, r));
    await put(`${JSON.stringify({ v: 2, totalFiles: 1, totalDirs: 0, totalBytes: 4 })}\n`);
    await put(`${JSON.stringify({ path: '../../../escaped.txt', size: 4 })}\n`);
    await put(Buffer.alloc(4));
    await put(`${JSON.stringify({ end: true, files: 1, dirs: 0, bytes: 4 })}\n`);
    gz.end();

    const out = await parcel.unwrap(nasty, into);
    assert.equal(out.ok, false);
    assert.equal(existsSync(join(root, '..', 'escaped.txt')), false);
  });

  test('progress is measured against what was promised, not guessed', async () => {
    const seen = await parcel.survey(src);
    const told = [];
    const out = await parcel.unwrap(parcel.wrap(src, { seen }), join(root, 'watched'), {
      onProgress: (state) => told.push(state),
    });

    assert.equal(out.ok, true, out.sentence);
    assert.ok(told.length, 'somebody was told something');

    const last = told[told.length - 1];
    assert.equal(last.of?.totalBytes, seen.bytes, 'the total is known before the end');
    assert.equal(last.bytes, seen.bytes);
    assert.ok(told.every((s) => s.bytes <= seen.bytes), 'and never claims more than there is');
  });
});

describe('two of the same transfer cannot fight over one folder', () => {
  test('the second is refused while the first is still arriving', async () => {
    const { PassThrough: PT } = await import('node:stream');
    const lan = await import('../lan.mjs');

    // A reply that never finishes, so the first transfer stays in flight.
    const hanging = new PT();
    hanging.headers = { 'x-viberant-files': '1', 'x-viberant-bytes': '10' };

    const jobs = { step() {}, write() {}, end(_j, r) { return r; } };
    const into = join(root, 'contested');

    const first = lan.__testOnly.receiveInto(hanging, into, { job: 'a', jobs, called: 'Thing' });
    await new Promise((r) => setTimeout(r, 30));

    const second = new PT();
    second.headers = { 'x-viberant-files': '1', 'x-viberant-bytes': '10' };
    const refused = await lan.__testOnly.receiveInto(second, into, { job: 'b', jobs, called: 'Thing' });

    assert.equal(refused.ok, false, 'the second one does not start');
    assert.match(refused.sentence, /already arriving/);

    hanging.end();
    await first;
  });
});
