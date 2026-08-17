/**
 * Being reachable is not being heard, and a door is not hung once for ever.
 *
 * This file exists because of one fault that hid behind every other test for
 * months. Two computers could see each other, list each other, dial each other
 * and be answered by each other — and one of them could not be *told* anything.
 * Presence is what a screen shows; delivery is what makes a workspace a
 * workspace, and they are separate facts.
 *
 * The cause: the door that decides who is welcome was hung once, when the
 * workspace was made, and closed over the member list as it stood at that
 * moment. So the computer that **creates** a workspace refuses every computer
 * that joins afterwards, for as long as it stays open. It cut the other way
 * too, and that half is worse: a computer revoked while the app was running
 * went on being let in until somebody restarted it.
 *
 * `workspace-flow.test.mjs` proves the behaviour against two running copies.
 * What is held here is the *shape* — the things that would have to be true
 * again for that fault to return, decided by reading rather than by running,
 * because a shape can rot back into place long after the behaviour test was
 * written and still pass everything for a while.
 */

import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/*
 * The end of a function is found below by looking for a line that is only its
 * closing brace. On a computer whose files carry a carriage return as well,
 * that line is never found and the slice becomes the whole rest of the file —
 * so a check that this one function never does something quietly becomes a
 * search of everything after it. Made the same first.
 */
const sameLines = (text) => text.replaceAll('\r\n', '\n');

const here = dirname(fileURLToPath(import.meta.url));
const app = join(here, '..');

let server; let anywhere; let peers; let members;

before(async () => {
  [server, anywhere, peers, members] = await Promise.all([
    readFile(join(app, 'server.mjs'), 'utf8').then(sameLines),
    readFile(join(app, 'anywhere.mjs'), 'utf8').then(sameLines),
    readFile(join(app, 'peers.mjs'), 'utf8').then(sameLines),
    readFile(join(app, 'members.mjs'), 'utf8').then(sameLines),
  ]);
});

/** The body of one function, from its name to the line that closes it. */
function bodyOf(text, opening) {
  const at = text.indexOf(opening);
  if (at === -1) return null;
  const ends = text.indexOf('\n}\n', at);
  return ends === -1 ? text.slice(at) : text.slice(at, ends);
}

// ---------------------------------------------------------------------------

describe('the door asks who is welcome, rather than remembering', () => {
  /**
   * The exact fault, in one assertion.
   *
   * `beAbout` hangs the door once — `if (!listening)` — so anything it reads
   * from its own arguments is frozen at that moment. The member list is the one
   * thing that must not be.
   */
  test('what it allows is not the workspace it was handed', () => {
    const it = bodyOf(anywhere, 'export async function beAbout(');
    assert.ok(it, 'beAbout is no longer where the door is hung');

    const allow = it.slice(it.indexOf('allow:'), it.indexOf('});', it.indexOf('allow:')));
    assert.ok(allow.length > 20, 'the door no longer decides who is welcome');

    assert.match(allow, /members\.now\(\)/,
      'the door reads a workspace it was handed rather than the one that exists now, '
      + 'so everybody who joins after it opened is refused until the app restarts');
    assert.equal(/\bws\.devices\b/.test(allow), false,
      'the captured workspace is still being read for who is a member');
  });

  /**
   * Waiting in the socket handler is the other way to get this wrong, and it
   * was tried: the far end says what it wants immediately after the handshake,
   * and an `await` here lands between the greeting and the listener that would
   * have heard it. Every connection was then accepted and sat silent.
   */
  test('and it answers without waiting, because waiting loses what comes next', () => {
    const it = bodyOf(peers, 'export function listenDirect(');
    assert.ok(it, 'listenDirect is no longer where connections are taken');
    assert.match(it, /if \(allow && !allow\(known\.who\)\)/,
      'deciding who is welcome now waits on something, which drops the first thing said');
  });

  test('and being welcome is still decided by the workspace, not by having knocked', () => {
    const it = bodyOf(anywhere, 'export async function beAbout(');
    const allow = it.slice(it.indexOf('allow:'), it.indexOf('});', it.indexOf('allow:')));

    // Both halves. Being listed is not enough if the listing has been revoked.
    assert.match(allow, /devices\?\.\[who\.deviceId\]/, 'anybody who knocks is let in');
    assert.match(allow, /isRevoked/, 'a revoked computer is still let in');
  });

  /**
   * The synchronous answer has to be kept in step by something that cannot be
   * forgotten. Both of these are the only ways the book is read or written.
   */
  test('the answer it reads is refreshed by every read and every write', () => {
    assert.match(members, /export const now = \(\) =>/,
      'there is no answer that can be given without waiting');

    const book = bodyOf(members, 'async function book()');
    const keep = bodyOf(members, 'async function keep(state)');
    assert.match(book, /holdOnTo\(/, 'reading the book does not refresh what is answered');
    assert.match(keep, /holdOnTo\(/, 'writing the book does not refresh what is answered');
  });
});

describe('one kind of message, one handler', () => {
  /**
   * `said` was answered twice: once for a workspace event and once for what a
   * remote terminal printed. The first shadowed the second entirely, so a
   * question about a terminal arrived as an event with no event in it and was
   * refused, and nothing anywhere said why.
   */
  test('nothing is answered in two places', () => {
    const it = bodyOf(server, 'async function answerPeer(');
    assert.ok(it, 'answerPeer is no longer where peers are answered');

    const kinds = [...it.matchAll(/asked\.what === '([^']+)'/g)].map((m) => m[1]);
    assert.ok(kinds.length >= 5, `only ${kinds.length} kinds of message are answered`);

    const twice = kinds.filter((one, i) => kinds.indexOf(one) !== i);
    assert.deepEqual(twice, [],
      `answered in more than one place, so only the first can ever run: ${twice.join(', ')}`);
  });

  /**
   * Fixing delivery must not become fixing it by letting more people in.
   *
   * Every branch either decides for itself, or hands the workspace *and* the
   * computer that is asking to something that decides — `doNamed` does the
   * second, through `mayAsk`. What is refused is answering without either.
   */
  test('and every one of them still decides whether that computer may', () => {
    const it = bodyOf(server, 'async function answerPeer(');
    const branches = it.split(/if \(asked\.what === '/).slice(1);
    assert.ok(branches.length >= 5, `only ${branches.length} kinds are answered`);

    for (const branch of branches) {
      const kind = branch.slice(0, branch.indexOf("'"));
      const decidesHere = /ws\?\.devices\?\.\[from\]|membersOf\.may\(/.test(branch);
      const handsItOn = /workspace: ws,[\s\S]{0,80}fromDevice: from/.test(branch);
      assert.ok(decidesHere || handsItOn,
        `'${kind}' answers without anybody deciding whether that computer may`);
    }
  });
});

describe('what was reached is not what was delivered', () => {
  /**
   * Opening a connection and being told the far end wrote it down are two
   * different facts. Counting the first as the second is what made a note
   * report success while nobody had it.
   */
  test('a message is counted when the far end says it kept it', () => {
    const it = bodyOf(server, 'async function sayItToTheOthers(');
    assert.ok(it, 'saying something to the others is no longer its own thing');

    assert.match(it, /if \(said\?\.ok\) reached \+= 1/,
      'it counts computers it managed to open a connection to, which is not the same '
      + 'as computers that have the thing');
    assert.ok(it.indexOf('askPeer') < it.indexOf('reached += 1'),
      'it counts before it has asked');
  });

  /*
   * And the test that proves it end to end must ask both ways. One direction
   * worked throughout, so any test that only asked one of them passed.
   */
  test('the errand between two running copies asks both ways', async () => {
    const flow = await readFile(join(app, 'test', 'workspace-flow.test.mjs'), 'utf8');
    assert.match(flow, /a message reaches the other computer, and it reaches back/,
      'nothing proves a message goes both ways');
    assert.match(flow, /oneWay\(A, B/, 'nothing sends from the one that made the workspace');
    assert.match(flow, /oneWay\(B, A/, 'nothing sends from the one that joined it');

    assert.match(flow, /a change on one computer reaches the other on its own/,
      'nothing proves a change crosses without being asked for');
    assert.match(flow, /and the same is true the other way round/,
      'the change is only proved to cross one way');

    // Read off the stream a page holds, not out of a route made for a test.
    assert.match(flow, /path: '\/events'/,
      'what arrives is checked somewhere other than where a screen would see it');
  });
});
