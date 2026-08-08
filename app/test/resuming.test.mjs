/**
 * A transfer that stopped, carrying on from where it stopped.
 *
 * The dangerous version of this feature is easy to write and impossible to
 * notice going wrong: keep whatever is on the disk, ask for the rest, and hand
 * somebody a folder that is a mixture of two moments — every file present,
 * every count agreeing, and the contents wrong. That is the exact failure the
 * parcel format was built to refuse, so resuming has to be held to the same
 * standard rather than excused from it.
 *
 * Three things are proved here, and the third is the one that matters:
 *
 *   what a stopped transfer keeps is only what it confirmed;
 *   carrying on asks for less and finishes;
 *   **what lands is byte-for-byte what was sent**, including the file that was
 *   half written when the network went, and including a file that changed
 *   between the two attempts.
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, writeFile, readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { randomBytes } from 'node:crypto';

let root, from, into;

/** A folder with enough in it that stopping half way lands somewhere useful. */
async function build() {
  from = join(root, 'a-project');
  await mkdir(join(from, 'src'), { recursive: true });
  await mkdir(join(from, 'docs'), { recursive: true });

  for (let i = 0; i < 12; i += 1) {
    // Random rather than repeated, and that is not decoration. Forty thousand
    // of the same character compresses to a few hundred bytes, so the whole
    // folder fits in one chunk on the wire and there is nothing left to cut in
    // half — the first version of this test proved resuming worked by never
    // interrupting anything.
    await writeFile(join(from, 'src', `part-${i}.js`), randomBytes(40_000));
  }
  await writeFile(join(from, 'docs', 'read-me.txt'), 'hello\n');
  await writeFile(join(from, 'top.json'), '{"name":"a-project"}\n');
}

/** Everything in a folder, as path to contents, for comparing two of them. */
async function everythingIn(at, prefix = '') {
  const out = new Map();
  for (const entry of await readdir(at, { withFileTypes: true })) {
    const named = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      for (const [k, v] of await everythingIn(join(at, entry.name), named)) out.set(k, v);
    } else {
      out.set(named, await readFile(join(at, entry.name)));
    }
  }
  return out;
}

/**
 * Send a folder, and cut the wire after so many bytes.
 *
 * The bytes counted are the compressed ones on the wire, which is what a real
 * interruption cuts. Where that lands inside the parcel is not chosen and not
 * predictable, which is the point — it is as likely to be inside a file as
 * between two of them.
 */
function sendButStopAfter(parcel, folder, stopAfter, { seen = null } = {}) {
  const wire = new PassThrough();
  const full = parcel.wrap(folder, { everything: true, seen });

  let sent = 0;
  full.on('data', (chunk) => {
    if (sent >= stopAfter) return;
    const room = stopAfter - sent;
    wire.write(chunk.length > room ? chunk.subarray(0, room) : chunk);
    sent += chunk.length;
    if (sent >= stopAfter) {
      full.destroy();
      // Cut with an error, rather than ended, and rather than closed quietly.
      //
      // Ended is a parcel that finished. Closed quietly is a stream that simply
      // stops producing, and the thing reading it waits forever — which is what
      // the first version of this did, and it hung the whole test run rather
      // than failing. A reply that stops half way through its body raises an
      // error at the far end, so that is what is simulated.
      wire.destroy(new Error('the network went'));
    }
  });
  full.on('end', () => wire.end());
  return wire;
}

before(async () => {
  root = await mkdtemp(join(tmpdir(), 'viberant-resume-'));
  into = join(root, 'landing');
  await mkdir(into, { recursive: true });
  await build();
});

after(async () => {
  await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
});

describe('a transfer that stops keeps only what it confirmed', () => {
  test('it says it is not finished, and leaves a ledger of what is here', async () => {
    const parcel = await import('../parcel.mjs');
    const target = join(into, 'a-project');

    // Part way through: enough that several files have landed whole, and far
    // enough from the end that plenty has not.
    const out = await parcel.unwrap(sendButStopAfter(parcel, from, 200_000), target, {
      keep: true,
      forOffer: 'offer-1',
    });

    assert.equal(out.ok, false, 'a cut transfer is never a success');
    assert.equal(out.resumable, true);
    assert.ok(out.have > 0, 'something was confirmed');
    assert.ok(out.have < 14, `everything arrived, so nothing was cut (${out.have})`);

    // Nothing that looks finished. This is the promise that predates resuming
    // and is not allowed to weaken because of it.
    assert.equal(existsSync(target), false, 'a folder that is not here must not appear');

    const held = await parcel.whatIsAlreadyHere(target, { forOffer: 'offer-1' });
    assert.ok(held, 'a ledger was left');
    assert.equal(Object.keys(held.have).length, out.have);
  });

  test('the file it was in the middle of is not in the ledger', async () => {
    const parcel = await import('../parcel.mjs');
    const target = join(into, 'a-project');
    const held = await parcel.whatIsAlreadyHere(target);

    // Every file the ledger names is on the disk at exactly the size claimed.
    for (const [named, size] of Object.entries(held.have)) {
      const at = join(parcel.halfOf(target), named);
      assert.equal(existsSync(at), true, `${named} is in the ledger and not here`);
      assert.equal((await readFile(at)).length, size, `${named} is not the size claimed`);
    }
  });

  test('a ledger from a different errand is not treated as a head start', async () => {
    const parcel = await import('../parcel.mjs');
    const target = join(into, 'a-project');
    assert.equal(await parcel.whatIsAlreadyHere(target, { forOffer: 'a-different-offer' }), null);
  });
});

describe('carrying on asks for less and finishes', () => {
  test('the sender is told what is here and sends only the rest', async () => {
    const parcel = await import('../parcel.mjs');
    const target = join(into, 'a-project');
    const held = await parcel.whatIsAlreadyHere(target, { forOffer: 'offer-1' });

    const whole = await parcel.survey(from, { everything: true });
    const rest = parcel.withoutWhatTheyHave(whole, held.have);

    assert.equal(rest.files.length, whole.files.length - Object.keys(held.have).length);
    assert.ok(rest.bytes < whole.bytes, 'less to send than the first time');
    assert.equal(rest.theirs.files, Object.keys(held.have).length);
    assert.equal(rest.theirs.bytes + rest.bytes, whole.bytes,
      'what they keep plus what is sent is the whole thing');
  });

  test('the second attempt finishes, and says how much it did not have to move', async () => {
    const parcel = await import('../parcel.mjs');
    const target = join(into, 'a-project');
    const held = await parcel.whatIsAlreadyHere(target, { forOffer: 'offer-1' });
    const carried = Object.keys(held.have).length;

    const whole = await parcel.survey(from, { everything: true });
    const rest = parcel.withoutWhatTheyHave(whole, held.have);

    const out = await parcel.unwrap(parcel.wrap(from, { everything: true, seen: rest }), target, {
      have: held,
      keep: true,
      forOffer: 'offer-1',
    });

    assert.equal(out.ok, true, out.sentence);
    assert.equal(out.carriedOver, carried, 'it says what it did not have to move');
    assert.equal(out.files, whole.files.length, 'every file is accounted for');
    assert.equal(out.bytes, whole.bytes, 'and every byte');
    assert.equal(existsSync(target), true);
  });

  test('what landed is byte-for-byte what was sent', async () => {
    const target = join(into, 'a-project');
    const sent = await everythingIn(from);
    const landed = await everythingIn(target);

    assert.deepEqual([...landed.keys()].sort(), [...sent.keys()].sort());
    for (const [named, bytes] of sent) {
      assert.equal(Buffer.compare(landed.get(named), bytes), 0,
        `${named} is not what was sent — a folder made of two moments`);
    }
  });

  test('the ledger is gone once the folder is here, rather than left as litter', async () => {
    const parcel = await import('../parcel.mjs');
    const target = join(into, 'a-project');
    assert.equal(existsSync(parcel.ledgerOf(target)), false);
    assert.equal(existsSync(parcel.halfOf(target)), false);
  });
});

/**
 * The one that would be silent.
 *
 * A file that changed between the two attempts has the same name and different
 * bytes. Matching on the name alone would skip it and hand somebody a folder
 * that is a mixture of two moments — which no count would catch, because every
 * count would agree.
 */
describe('a file that changed since the last attempt is sent again', () => {
  test('matching is on name and size together, never on name alone', async () => {
    const parcel = await import('../parcel.mjs');
    const whole = await parcel.survey(from, { everything: true });

    // Everything is claimed, but one of them is claimed at the wrong size.
    const claimed = Object.fromEntries(whole.files.map((f) => [f.path, f.size]));
    claimed['top.json'] = 999;

    const rest = parcel.withoutWhatTheyHave(whole, claimed);
    assert.deepEqual(rest.files.map((f) => f.path), ['top.json'],
      'the one whose size disagrees is the one that is sent');
  });

  test('and the folder that lands afterwards holds the new bytes, not the old', async () => {
    const parcel = await import('../parcel.mjs');
    const target = join(into, 'changed-underneath');

    // Stop it, then change a file it had already carried.
    const first = await parcel.unwrap(sendButStopAfter(parcel, from, 200_000), target, {
      keep: true, forOffer: 'offer-2',
    });
    assert.equal(first.resumable, true);

    const held = await parcel.whatIsAlreadyHere(target, { forOffer: 'offer-2' });
    const changed = Object.keys(held.have)[0];
    await writeFile(join(from, changed),
      Buffer.concat([Buffer.from('// changed\n'), randomBytes(50_000)]));

    const whole = await parcel.survey(from, { everything: true });
    const rest = parcel.withoutWhatTheyHave(whole, held.have);
    assert.equal(rest.files.some((f) => f.path === changed), true,
      `${changed} changed and must be sent again`);

    const out = await parcel.unwrap(parcel.wrap(from, { everything: true, seen: rest }), target, {
      have: held, keep: true, forOffer: 'offer-2',
    });
    assert.equal(out.ok, true, out.sentence);

    const landed = await readFile(join(target, changed));
    assert.equal(landed.subarray(0, 11).toString(), '// changed\n',
      'the old bytes were kept, which is the silent fault');
    assert.equal(out.bytes, whole.bytes);
  });
});

describe('nothing is kept when keeping was not asked for', () => {
  test('a stopped transfer with keep off leaves the disk as it found it', async () => {
    const parcel = await import('../parcel.mjs');
    const target = join(into, 'no-keeping');

    const out = await parcel.unwrap(sendButStopAfter(parcel, from, 200_000), target, { keep: false });

    assert.equal(out.ok, false);
    assert.notEqual(out.resumable, true);
    assert.equal(existsSync(parcel.halfOf(target)), false, 'nothing left lying about');
    assert.equal(existsSync(target), false);
  });
});
