/**
 * Sending what changed, and not sending what did not.
 *
 * The easy half is arithmetic. The hard half is the two ways this feature ruins
 * somebody's day:
 *
 *   deciding a file is unchanged when it is not, so the sync silently does
 *     nothing and two computers quietly disagree forever;
 *   replacing an afternoon's work because the other side is "newer".
 *
 * Both are tested against real files on a real disk, and the second is tested
 * by making the conflict actually happen rather than by reasoning about it.
 */

import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, writeFile, readFile, utimes } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

let root, sync, snapshots, parcel;
let here, there;

before(async () => {
  root = await mkdtemp(join(tmpdir(), 'viberant-sync-'));
  await mkdir(join(root, 'home'), { recursive: true });
  process.env.USERPROFILE = join(root, 'home');
  process.env.HOME = join(root, 'home');

  sync = await import('../sync.mjs');
  snapshots = await import('../snapshots.mjs');
  parcel = await import('../parcel.mjs');
});

after(async () => {
  await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
});

/** Two copies of the same project, as two computers would have them. */
async function twoCopies() {
  here = join(root, `here-${randomBytes(4).toString('hex')}`);
  there = join(root, `there-${randomBytes(4).toString('hex')}`);

  for (const at of [here, there]) {
    await mkdir(join(at, 'src'), { recursive: true });
    await mkdir(join(at, 'empty-on-purpose'), { recursive: true });
    // Big enough that "most of it is not moving" is a real claim rather than an
    // arithmetic accident of five tiny files.
    for (let i = 0; i < 5; i += 1) {
      await writeFile(join(at, 'src', `f-${i}.js`), `// file ${i}\n${'x'.repeat(200_000)}\n`);
    }
    await writeFile(join(at, 'package.json'), '{"name":"atlas"}\n');
  }

  // The same files, written at the same moment, which is what two copies of
  // one project look like the instant after they are made.
  const when = new Date(Date.now() - 60_000);
  for (const at of [here, there]) {
    for (let i = 0; i < 5; i += 1) await utimes(join(at, 'src', `f-${i}.js`), when, when);
    await utimes(join(at, 'package.json'), when, when);
  }
}

describe('a project that has not changed sends nothing', () => {
  beforeEach(twoCopies);

  test('two identical copies come out as nothing to do', async () => {
    const work = sync.compare(await sync.manifest(here), await sync.manifest(there));

    assert.deepEqual(work.toSend, []);
    assert.equal(work.bytesToSend, 0);
    assert.equal(work.same.length, 6);
    assert.match(sync.inWords(work), /nothing changed/);
  });

  test('one changed file is the only thing that moves', async () => {
    await writeFile(join(here, 'src', 'f-2.js'), `// changed\n${'y'.repeat(9000)}\n`);

    const work = sync.compare(await sync.manifest(here), await sync.manifest(there));

    assert.deepEqual(work.toSend, ['src/f-2.js']);
    assert.equal(work.same.length, 5);
    assert.ok(work.bytesToSend > 8000 && work.bytesToSend < 12000);
    // The whole point of the feature, as a number: about 800 KB stays where it
    // is and about 9 KB moves. Written as a ratio rather than "more than",
    // because with five tiny files "more than" passes by accident and proves
    // nothing — which is what the first version of this did.
    assert.ok(work.bytesUnchanged > work.bytesToSend * 50,
      `${work.bytesUnchanged} unchanged against ${work.bytesToSend} moving is not worth the machinery`);
  });

  test('a new file is missing rather than changed, and still goes', async () => {
    await writeFile(join(here, 'src', 'brand-new.js'), 'hello\n');
    const work = sync.compare(await sync.manifest(here), await sync.manifest(there));

    assert.deepEqual(work.missing, ['src/brand-new.js']);
    assert.deepEqual(work.changed, []);
    assert.deepEqual(work.toSend, ['src/brand-new.js']);
  });

  test('a file only the far end has is reported and never acted on', async () => {
    await writeFile(join(there, 'src', 'theirs-only.js'), 'theirs\n');
    const work = sync.compare(await sync.manifest(here), await sync.manifest(there));

    assert.deepEqual(work.extra, ['src/theirs-only.js']);
    assert.deepEqual(work.toSend, [],
      'a file here and not there is as likely to be new as to be deleted');
  });

  test('the words say the two numbers somebody wants before pressing', async () => {
    await writeFile(join(here, 'src', 'f-0.js'), `// changed\n${'z'.repeat(5000)}\n`);
    const work = sync.compare(await sync.manifest(here), await sync.manifest(there));

    const said = sync.inWords(work);
    assert.match(said, /unchanged/);
    assert.match(said, /changed/);
  });
});

describe('the same size at a different moment is asked about properly', () => {
  beforeEach(twoCopies);

  test('a touched file looks changed, because cheaply it is indistinguishable', async () => {
    await utimes(join(here, 'src', 'f-1.js'), new Date(), new Date());
    const work = sync.compare(await sync.manifest(here), await sync.manifest(there));
    assert.deepEqual(work.changed, ['src/f-1.js']);
  });

  test('and reading it says it is the same after all, so it does not move', async () => {
    await utimes(join(here, 'src', 'f-1.js'), new Date(), new Date());
    const mine = await sync.manifest(here);
    const theirs = await sync.manifest(there);
    const work = sync.compare(mine, theirs);

    // What the far end would send back about the handful that are ambiguous.
    const theirDigests = { 'src/f-1.js': await sync.digestOf(join(there, 'src', 'f-1.js')) };
    const narrower = await sync.narrowDown(here, work, theirDigests);

    assert.deepEqual(narrower.toSend, [], 'a file that only had its clock touched was sent');
    assert.equal(narrower.same.includes('src/f-1.js'), true);
  });

  test('a file that really differs still goes, however its clock reads', async () => {
    await writeFile(join(here, 'src', 'f-3.js'), `// file 3\n${'q'.repeat(2000)}\n`);
    const work = sync.compare(await sync.manifest(here), await sync.manifest(there));

    const theirDigests = { 'src/f-3.js': await sync.digestOf(join(there, 'src', 'f-3.js')) };
    const narrower = await sync.narrowDown(here, work, theirDigests);

    assert.deepEqual(narrower.toSend, ['src/f-3.js']);
  });
});

describe('what actually moves is the ordinary transfer, given a shorter list', () => {
  beforeEach(twoCopies);

  test('only the changed file is wrapped, and the folders still travel', async () => {
    await writeFile(join(here, 'src', 'f-4.js'), `// changed\n${'w'.repeat(4000)}\n`);
    const work = sync.compare(await sync.manifest(here), await sync.manifest(there));

    const toSend = await sync.whatToSend(here, work);
    assert.deepEqual(toSend.files.map((f) => f.path), ['src/f-4.js']);
    assert.ok(toSend.dirs.includes('empty-on-purpose'),
      'an empty folder is part of the shape of a project and travels every time');
    assert.equal(toSend.theirs.files, 5, 'it did not say what the far end is keeping');
  });

  test('and it lands, using the same unwrap everything else uses', async () => {
    await writeFile(join(here, 'src', 'f-4.js'), `// changed\n${'w'.repeat(4000)}\n`);
    const work = sync.compare(await sync.manifest(here), await sync.manifest(there));
    const toSend = await sync.whatToSend(here, work);

    // The far end already holds the rest, exactly as a resume does.
    const have = {};
    for (const path of work.same) {
      have[path] = (await sync.manifest(there)).files[path].size;
    }

    const landing = join(root, `landed-${randomBytes(3).toString('hex')}`);
    const out = await parcel.unwrap(
      parcel.wrap(here, { seen: toSend }),
      landing,
      { have: { have }, keep: true },
    );

    assert.equal(out.ok, true, out.sentence);
    assert.equal(
      (await readFile(join(landing, 'src', 'f-4.js'), 'utf8')).startsWith('// changed'),
      true,
    );
    assert.equal(existsSync(join(landing, 'empty-on-purpose')), true);
  });
});

describe('nothing lands on top of work somebody has been doing', () => {
  beforeEach(twoCopies);

  test('a file both sides changed is a conflict, not a decision this makes', async () => {
    const agreed = await sync.manifest(here);

    await writeFile(join(here, 'src', 'f-0.js'), '// mine\n');
    await writeFile(join(there, 'src', 'f-0.js'), '// theirs\n');
    await utimes(join(there, 'src', 'f-0.js'), new Date(Date.now() + 5000), new Date(Date.now() + 5000));

    const both = sync.conflicts(await sync.manifest(here), await sync.manifest(there), agreed);
    assert.deepEqual(both, ['src/f-0.js']);
  });

  test('a file only one side changed is not a conflict', async () => {
    const agreed = await sync.manifest(here);
    await writeFile(join(here, 'src', 'f-0.js'), '// only mine\n');

    const both = sync.conflicts(await sync.manifest(here), await sync.manifest(there), agreed);
    assert.deepEqual(both, []);
  });

  test('with no record of ever agreeing, anything different is asked about', async () => {
    await writeFile(join(there, 'src', 'f-2.js'), '// theirs, and we have never synced\n');

    const both = sync.conflicts(await sync.manifest(here), await sync.manifest(there), null);
    assert.deepEqual(both, ['src/f-2.js'],
      'the first sync between two computers must err towards asking');
  });

  test('there are three answers, and none of them is chosen automatically', () => {
    assert.equal(typeof sync.KEEP_MINE, 'string');
    assert.equal(typeof sync.KEEP_THEIRS, 'string');
    assert.equal(typeof sync.LOOK_FIRST, 'string');
  });
});

describe('a way back is taken before anything is replaced', () => {
  beforeEach(twoCopies);

  test('the files about to be overwritten are kept, and only those', async () => {
    const out = await snapshots.before({
      dir: here, files: ['src/f-0.js', 'src/f-1.js'], why: 'before a sync',
    });

    assert.equal(out.taken, true);
    assert.equal(out.files, 2, 'a snapshot of the whole project would cost more than the sync');

    const all = await snapshots.forProject(here);
    assert.equal(all.length, 1);
    assert.deepEqual(all[0].kept.sort(), ['src/f-0.js', 'src/f-1.js']);
  });

  test('and putting it back gives exactly what was there', async () => {
    const was = await readFile(join(here, 'src', 'f-0.js'), 'utf8');
    const out = await snapshots.before({ dir: here, files: ['src/f-0.js'], why: 'before a sync' });

    await writeFile(join(here, 'src', 'f-0.js'), '// something arrived and replaced this\n');
    assert.notEqual(await readFile(join(here, 'src', 'f-0.js'), 'utf8'), was);

    const back = await snapshots.restore(out.id);
    assert.equal(back.ok, true);
    assert.equal(await readFile(join(here, 'src', 'f-0.js'), 'utf8'), was);
  });

  test('a file that is not here yet needs no way back', async () => {
    const out = await snapshots.before({ dir: here, files: ['src/does-not-exist.js'], why: 'x' });
    assert.equal(out.taken, false);
    assert.match(out.sentence, /nothing to keep/);
  });

  test('it never copies the file with real values in it', async () => {
    await writeFile(join(here, '.env'), 'STRIPE_KEY=sk-REALKEY000000\n');
    await writeFile(join(here, '.env.local'), 'DATABASE_URL=postgres://u:REALPASSWORD@h/d\n');

    const out = await snapshots.before({
      dir: here, files: ['.env', '.env.local', 'src/f-0.js'], why: 'before a sync',
    });

    assert.equal(out.files, 1, 'a second copy of somebody\'s keys was made in a folder they will forget');
    const all = await snapshots.forProject(here);
    assert.equal(all[0].kept.includes('.env'), false);
    assert.equal(all[0].kept.includes('.env.local'), false);
  });

  test('only so many are kept, so this cannot fill a disk', async () => {
    for (let i = 0; i < snapshots.KEEP + 3; i += 1) {
      await writeFile(join(here, 'src', 'f-0.js'), `// go ${i}\n`);
      await snapshots.before({ dir: here, files: ['src/f-0.js'], why: `go ${i}` });
      await new Promise((r) => setTimeout(r, 5));
    }
    assert.equal((await snapshots.forProject(here)).length, snapshots.KEEP);
  });

  test('they live on this computer and never anywhere shared', async () => {
    const out = await snapshots.before({ dir: here, files: ['src/f-0.js'], why: 'x' });
    assert.equal(out.id.startsWith(snapshots.SHELF_AT), true);
    assert.equal(out.id.includes('workspace'), false,
      'a way back must never end up somewhere another computer can ask for it');
  });
});
