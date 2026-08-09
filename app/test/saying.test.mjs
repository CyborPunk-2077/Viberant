/**
 * Saying something to a workspace, and hearing it once.
 *
 * Notes used to travel through GitHub: written, committed, sent, and read back
 * by whoever synced next, which could be minutes. Nobody types a sentence to
 * somebody in the next room and expects it to go via a hosting service.
 *
 * What is held here is the part that makes a stream safe rather than the part
 * that makes it fast. A stream reconnects and replays what it thinks was
 * missed; two computers tell each other the same thing; a page is open twice.
 * All three end with the same note arriving more than once, and a note that
 * appears twice is worse than one that appears late.
 */

import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
let root, chatter;

before(async () => {
  root = await mkdtemp(join(tmpdir(), 'viberant-saying-'));
  await mkdir(join(root, 'home'), { recursive: true });
  process.env.USERPROFILE = join(root, 'home');
  process.env.HOME = join(root, 'home');
  chatter = await import('../chatter.mjs');
});

after(async () => {
  await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
});

beforeEach(async () => { await chatter.forgetAll(); });

const aNote = (text, over = {}) => chatter.anEvent({
  kind: 'note', workspace: 'ws-1', from: 'mine', fromName: 'Danni-PC', text, ...over,
});

describe('nothing is heard twice', () => {
  test('the same event written down twice is written down once', async () => {
    const one = aNote('hello');

    assert.equal((await chatter.remember(one)).kept, true);
    assert.equal((await chatter.remember(one)).kept, false, 'it was written down again');
    assert.equal((await chatter.remember({ ...one })).already, true,
      'a copy of the same event was treated as a new one');

    assert.equal((await chatter.lately({ workspace: 'ws-1' })).length, 1);
  });

  test('and two different ones both are', async () => {
    await chatter.remember(aNote('one'));
    await chatter.remember(aNote('two'));
    assert.equal((await chatter.lately({ workspace: 'ws-1' })).length, 2);
  });

  test('every event carries something to recognise it by', () => {
    const one = aNote('hello');
    assert.ok(one.id, 'no identifier, so nothing could tell it from another');
    assert.ok(one.at, 'no moment, so nothing could put it in order');
    assert.notEqual(aNote('hello').id, aNote('hello').id, 'two notes share an identifier');
  });

  test('and something with neither is refused rather than kept', async () => {
    assert.equal((await chatter.remember({ text: 'no identifier' })).ok, false);
    assert.equal((await chatter.remember(null)).ok, false);
    assert.equal((await chatter.remember({ id: 'x' })).ok, false, 'kept without saying what it is');
  });
});

describe('what arrived late lands where it belongs', () => {
  test('order is by when it was said, not when it was heard', async () => {
    const early = aNote('said first', { at: 1000 });
    const late = aNote('said second', { at: 2000 });

    // Heard the wrong way round, which is what a reconnect does.
    await chatter.remember(late);
    await chatter.remember(early);

    const all = await chatter.lately({ workspace: 'ws-1' });
    assert.deepEqual(all.map((one) => one.text), ['said first', 'said second']);
  });

  test('one workspace never hears another', async () => {
    await chatter.remember(aNote('ours'));
    await chatter.remember(aNote('theirs', { workspace: 'ws-2' }));

    assert.deepEqual((await chatter.lately({ workspace: 'ws-1' })).map((o) => o.text), ['ours']);
    assert.deepEqual((await chatter.lately({ workspace: 'ws-2' })).map((o) => o.text), ['theirs']);
  });

  test('it is still there after everything is read back from disk', async () => {
    await chatter.remember(aNote('written down'));

    // What another run of the app would read.
    const text = await readFile(chatter.CHATTER_FILE, 'utf8');
    assert.match(text, /written down/);
  });
});

describe('a listener that goes away is forgotten', () => {
  test('what is said reaches whoever is listening', async () => {
    const heard = [];
    const stop = chatter.listen((one) => heard.push(one.text));

    await chatter.remember(aNote('to everybody'));
    assert.deepEqual(heard, ['to everybody']);
    stop();
  });

  test('and stops reaching them once they stop', async () => {
    const heard = [];
    const stop = chatter.listen((one) => heard.push(one.text));
    stop();

    await chatter.remember(aNote('after they left'));
    assert.deepEqual(heard, [], 'a page that closed was still being written to');
    assert.equal(chatter.howManyListening(), 0, 'a listener was left behind');
  });

  test('and one that throws is let go rather than kept forever', async () => {
    chatter.listen(() => { throw new Error('that page is gone'); });
    await chatter.remember(aNote('into the void'));
    assert.equal(chatter.howManyListening(), 0, 'a broken listener is still being written to');
  });
});

describe('the stream is not a second way in', () => {
  test('saying something is membership-checked like every other message', async () => {
    /*
     * The one path allowed to skip that check is `joining.mjs`, it can do one
     * thing, and this is not it. A workspace that could be *told* things by a
     * stranger is a workspace anybody can put words into.
     */
    const source = await readFile(join(here, '..', 'server.mjs'), 'utf8');
    const branch = source.slice(source.indexOf("if (asked.what === 'said')"));
    const mine = branch.slice(0, branch.indexOf('\n  if ('));

    assert.match(mine, /!ws\?\.devices\?\.\[from\] \|\| membersOf\.isRevoked\(ws, from\)/,
      'anybody can say something into this workspace');
    assert.match(mine, /asked\.event\?\.workspace !== ws\.id/,
      'an event for another workspace is accepted into this one');
    assert.match(mine, /\bfrom,/,
      'whoever it claims to be from is taken on trust');
  });

  test('and it does not go through GitHub', async () => {
    const source = await readFile(join(here, '..', 'server.mjs'), 'utf8');
    const at = source.indexOf("async 'POST /workspace/say'");
    const mine = source.slice(at, source.indexOf('\n  },', at));

    assert.equal(/workspace\.say|github|push|pull/i.test(mine), false,
      'a note still travels by way of a hosting service');
    assert.match(mine, /sayItToTheOthers/, 'nothing hands it to the other computers');
  });
});
