/**
 * What has happened here, and the much longer list of what is never written.
 *
 * The temptation with a workspace is a feed: somebody opened a file, somebody
 * is looking at a project, somebody has been idle for eleven minutes. That is a
 * surveillance product wearing a collaboration product's clothes, and the line
 * between the two is exactly this file.
 *
 * So the tests are about the shape rather than the arithmetic: a closed list of
 * kinds, every line an event that measurably occurred, nothing inferred, and
 * nothing that could reconstruct what somebody was doing.
 */

import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
let root, activity;

before(async () => {
  root = await mkdtemp(join(tmpdir(), 'viberant-activity-'));
  await mkdir(join(root, 'home'), { recursive: true });
  process.env.USERPROFILE = join(root, 'home');
  process.env.HOME = join(root, 'home');
  activity = await import('../activity.mjs');
});

after(async () => {
  await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
});

beforeEach(async () => { await activity.forget(); });

describe('every line is something that measurably happened', () => {
  test('the things worth writing down read as sentences', async () => {
    await activity.remember('joined', { who: 'rahul', what: 'Atlas' });
    await activity.remember('connected', { who: 'RTX-PC', how: 'Direct · Internet' });
    await activity.remember('synced', { who: 'RTX-PC', what: 'Atlas' });
    await activity.remember('built', { who: 'RTX-PC', what: 'Atlas' });
    await activity.remember('revoked', { who: 'an old laptop' });

    const said = (await activity.recently()).map((one) => one.sentence);
    assert.equal(said.length, 5);
    assert.match(said.join('\n'), /rahul joined Atlas/);
    assert.match(said.join('\n'), /RTX-PC connected — direct/);
    assert.match(said.join('\n'), /Atlas caught up with RTX-PC/);
    assert.match(said.join('\n'), /an old laptop was taken out of the workspace/);
  });

  test('newest first, because that is the question somebody is asking', async () => {
    await activity.remember('joined', { who: 'first' });
    await new Promise((r) => setTimeout(r, 5));
    await activity.remember('joined', { who: 'second' });

    const said = await activity.recently();
    assert.match(said[0].sentence, /second/);
  });

  test('a kind nobody chose the words for is dropped, not written as itself', async () => {
    const out = await activity.remember('somebody is probably looking at Atlas', { who: 'rahul' });
    assert.equal(out.ok, false);
    assert.deepEqual(await activity.recently(), []);
  });

  test('the words live in one place, so history is never rewritten to change them', async () => {
    await activity.remember('built', { who: 'RTX-PC', what: 'Atlas' });
    await activity.save();

    const onDisk = JSON.parse(await readFile(activity.BOOK_AT, 'utf8'));
    assert.equal('sentence' in onDisk[0], false,
      'the sentence is stored, so changing the wording would rewrite what happened');
    assert.deepEqual(Object.keys(onDisk[0]).sort(), ['at', 'how', 'kind', 'what', 'who']);
  });

  test('it cannot grow without limit', async () => {
    for (let i = 0; i < activity.KEEP + 40; i += 1) {
      await activity.remember('connected', { who: `c${i}` });
    }
    const all = await activity.recently(1000);
    assert.equal(all.length, Math.min(activity.KEEP, 1000));
  });
});

describe('nothing here is watching anybody', () => {
  test('there is no kind for anything that would have to be inferred', () => {
    const kinds = Object.keys(activity.KINDS).join(' ').toLowerCase();
    for (const never of ['editing', 'viewing', 'looking', 'idle', 'typing', 'online for', 'away']) {
      assert.equal(kinds.includes(never), false,
        `there is a kind for "${never}", which nothing can honestly measure`);
    }
  });

  test('every kind is something a computer did, at a moment it did it', () => {
    // Each of these is an event with an instant. None of them is a state
    // somebody would have to be watched to know.
    for (const [kind, words] of Object.entries(activity.KINDS)) {
      const said = words({ who: 'somebody', what: 'a project', how: 'Relay' });
      assert.ok(said && said.length > 4, `${kind} says nothing`);
      assert.equal(/is currently|right now|for \d+ minutes/.test(said), false,
        `${kind} describes a state rather than an event`);
    }
  });

  test('it is on this computer and nothing in it can reach the network', async () => {
    const source = await readFile(join(here, '..', 'activity.mjs'), 'utf8');
    const code = source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

    for (const way of [/fetch\(/, /XMLHttpRequest/, /createConnection/, /\.send\(/]) {
      assert.equal(way.test(code), false, `activity.mjs can ${way}`);
    }
  });

  test('what is kept about a person is a name they chose and nothing else', async () => {
    await activity.remember('joined', {
      who: 'rahul',
      what: 'Atlas',
      // Anything else offered is not kept, because there is nowhere for it.
      address: '203.0.113.9',
      path: 'D:/Projects/Atlas/src/secret.js',
    });
    await activity.save();

    const onDisk = await readFile(activity.BOOK_AT, 'utf8');
    assert.equal(onDisk.includes('203.0.113.9'), false);
    assert.equal(onDisk.includes('secret.js'), false);
  });
});
