/**
 * Offering one file, and the two ways it was broken before anybody could try.
 *
 * The reported fault was: Offer → Offer a file → *something went wrong here*.
 * That sentence is what the server says when something threw where nothing was
 * expected to, and it is the least useful thing a person can be told. What had
 * actually happened was a name that did not exist, inside a template built
 * before the `try` that was supposed to catch a chooser refusing to open.
 *
 * The chooser never opened. Everything after it — the offer, the announcement,
 * the far end seeing it, the transfer — had always worked and had never been
 * reached. `workspace-flow.test.mjs` proves that half against two running
 * copies; this proves the half that could not be reached from a running copy at
 * all, because it needs somebody standing at a dialog.
 */

import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const app = join(here, '..');

let browse; let page;

before(async () => {
  browse = await import('../browse.mjs');
  page = await readFile(join(app, 'ui', 'app.js'), 'utf8');
});

describe('the words handed to the file chooser', () => {
  /**
   * The whole fault, in one line.
   *
   * A template built for its side effect is built nowhere a test can see, so
   * the mistake in it was invisible until somebody pressed the button. It is a
   * value now, and this reads it.
   */
  test('build without anything undefined in them', () => {
    const plain = browse.fileChooserScript(null);
    assert.match(plain, /ShowDialog/, 'it no longer opens a chooser');
    assert.equal(/undefined/.test(plain), false,
      'something in the words is a name that does not exist, which is exactly the fault');
  });

  test('and open nowhere in particular when nowhere was named', () => {
    assert.equal(/InitialDirectory/.test(browse.fileChooserScript(null)), false,
      'it insists on a starting folder even when it was given none');
  });

  test('and take a folder that was named', () => {
    const said = browse.fileChooserScript('D:\\Projects\\Viberant');
    assert.match(said, /InitialDirectory = 'D:\\Projects\\Viberant'/);
  });

  /*
   * A folder may contain an apostrophe, and a single-quoted PowerShell string
   * ends at the first one unless it is written twice.
   */
  test('and survive a folder with an apostrophe in its name', () => {
    const said = browse.fileChooserScript("C:\\Users\\It's Mine");
    assert.match(said, /InitialDirectory = 'C:\\Users\\It''s Mine'/,
      'the name ends the string early, and the rest of it becomes commands');
  });

  test('and say what the computer said when it will not open', async () => {
    const it = await readFile(join(app, 'browse.mjs'), 'utf8');
    const body = it.slice(it.indexOf('export async function chooseFile('));
    assert.match(body, /catch \(e\)/,
      'whatever went wrong is thrown away, so the only clue anybody gets is a guess');
    assert.match(body, /This computer said: \$\{e\.message\}/,
      'the reason is not passed on, which is how a name that did not exist looked '
      + 'like a chooser that would not open for months');
  });
});

describe('what a person can offer, and where it turns up', () => {
  test('one file and a whole folder are both offered through the same door', () => {
    assert.match(page, /post\('\/local\/offer', \{ path: chosen\.path, kind: 'file' \}\)/,
      'a file is offered some other way than a folder, which is two paths to keep working');
  });

  /**
   * Offered things belong to whoever is offering them.
   *
   * There used to be one section listing everything on every computer, which is
   * a page about the network rather than about anybody's work. What somebody
   * shares is now behind pressing them, asked of that computer at the moment it
   * is looked at.
   */
  test('and what somebody shares is asked of them, not remembered', () => {
    assert.match(page, /async function whatTheyShare\(/,
      'nothing shows what one computer is offering');
    assert.match(page, /get\(`\/local\/offers\?machine=/,
      'what it shows is not asked of that computer');
    assert.match(page, /sharesFrom: \{ deviceId: one\.deviceId/,
      'pressing a computer does not show what it is offering');

    // And never a wall of everything, which is what it replaced. Looked for as
    // something drawn rather than as a phrase, because the reasoning above is
    // written down in the source and would match itself.
    assert.equal(/>\s*Available from your other/i.test(page), false,
      'the one list of everything on every computer is back');
  });

  test('and bringing one uses the transfer that already exists', () => {
    const at = page.indexOf('async function whatTheyShare(');
    const body = page.slice(at, page.indexOf('\n}\n', at));
    assert.match(body, /post\('\/local\/take'/,
      'bringing a shared thing does not go through the one way things are brought');
    assert.equal(/createConnection|fetch\('http/.test(body), false,
      'it has grown a way of its own to move things');
  });
});
