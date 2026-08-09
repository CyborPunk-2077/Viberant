/**
 * A file two people changed, and the one thing that must never happen to it.
 *
 * Everything else here can be retried. This cannot: somebody's afternoon is in
 * that file, and a sync that quietly replaces it has destroyed work in a way no
 * amount of good behaviour afterwards makes up for.
 *
 * So the rule is one sentence: **a file somebody chose to keep is left exactly
 * as it is, whatever arrives.**
 *
 * The obvious way of doing that does not work, and this holds the reason as
 * well as the behaviour. Declaring "I already have one of those" is how
 * resuming says *do not send me that*, and it is not the same claim: the far
 * end works out what to send from a list it was given before anybody chose, and
 * two versions of the same file are usually the same size. Measured, the file
 * was sent, written, and somebody's own version was gone.
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
let source;

before(async () => { source = await readFile(join(here, '..', 'sync.mjs'), 'utf8'); });

const bringing = () => {
  const at = source.indexOf('export async function bring(');
  const body = source.slice(at);
  return body.slice(0, body.indexOf('\n}\n'));
};

describe('what somebody chose to keep is held, not asked for', () => {
  test('the bytes are read before anything is written', () => {
    const mine = bringing();

    assert.match(mine, /const held = new Map\(\)/,
      'nothing holds on to what was chosen, so it depends on the far end obeying');
    assert.ok(mine.indexOf('const held = new Map()') < mine.indexOf('parcelOf.unwrap'),
      'the file is read after the transfer has already written over it');
  });

  test('and put back before anything is measured', () => {
    const mine = bringing();

    assert.match(mine, /putTheFileBack\(joinPath\(into, path\), bytes\)/,
      'what was held is never written back');
    assert.ok(mine.indexOf('putTheFileBack') < mine.indexOf('const landed = await manifest'),
      'the check on what landed runs before the kept files are put back, so it measures the wrong tree');
  });

  test('nothing chosen to keep is ever in what is asked for', () => {
    const mine = bringing();
    assert.match(mine, /toSend: \(head\.toSend \?\? \[\]\)\.filter\(\(path\) => !mineToKeep\.has\(path\)\)/,
      'a file somebody keeps is still counted as something to bring over');
  });

  test('and keeping nothing is the same as it always was', () => {
    // The ordinary sync, which every existing test covers, must not change
    // shape because a decision can now be made.
    const mine = bringing();
    assert.match(mine, /keepMine = \[\]/, 'keeping nothing is not the default');
  });
});

describe('a way back exists before a byte lands', () => {
  test('anything about to be written over is kept first', () => {
    const mine = bringing();

    assert.match(mine, /if \(snapshotWith && work\.toSend\.length\)/);
    assert.match(mine, /work\.toSend\.filter\(\(path\) => path in \(mine\.files \?\? \{\}\)\)/,
      'a file that is about to be replaced is not the one being kept');
    assert.ok(mine.indexOf('snapshotWith') < mine.indexOf('parcelOf.unwrap'),
      'the copy is taken after the writing, which is not a copy of anything');
  });

  test('and a sync that fails still says where the way back is', () => {
    const mine = bringing();
    assert.match(mine, /return \{ \.\.\.out, wayBack \}/,
      'a failed sync loses the record of what it kept first');
  });
});

describe('what came over is checked against what was there', () => {
  test('the count and the size both have to agree', () => {
    const mine = bringing();
    assert.match(mine, /hereFiles !== wantedFiles \|\| hereBytes !== wantedBytes/,
      'a sync can report success without the tree matching');
  });

  test('and a failure says nothing was lost, when nothing was', () => {
    const mine = bringing();
    assert.match(mine, /wayBack\?\.taken/,
      'somebody whose sync failed is not told their work is still there');
  });
});

describe('the transfer is the one that already existed', () => {
  test('nothing here opens a socket or writes its own protocol', () => {
    // A second transfer implementation is two sets of integrity checks, two
    // resume ledgers, and one of them always rots.
    for (const never of [/createServer/, /createConnection/, /createSocket/, /net\./]) {
      assert.equal(never.test(source), false, `sync grew its own transport: ${never}`);
    }
    assert.match(source, /parcelOf\.unwrap/, 'it no longer goes through the one unwrap');
    assert.match(source, /parcelOf\.wrap/, 'it no longer goes through the one wrap');
  });
});
