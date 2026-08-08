/**
 * Whether there is a newer one, and the line this stops at.
 *
 * Two things are being held here, and the second is the important one.
 *
 * The first is arithmetic: 0.10.0 is newer than 0.9.0, which string comparison
 * gets backwards. Getting it backwards means telling somebody they are behind
 * when they are ahead, which is the same class of lie as the two this project
 * has already caught and fixed.
 *
 * The second is that **there is no code here that downloads or runs anything.**
 * An updater that fetches and executes is four lines and is the most dangerous
 * four lines in a desktop application: whoever can answer that request once
 * runs whatever they like on this computer, as you, forever. The protection is
 * a signature, that signature does not exist yet, and until it does the only
 * honest thing is to stop. A test can hold that, so a test does.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

describe('which one is newer is read the way a person reads it', () => {
  test('ten comes after nine, which is the whole reason this is a function', async () => {
    const { newerThan } = await import('../newer.mjs');
    assert.equal(newerThan('0.10.0', '0.9.0'), true);
    assert.equal(newerThan('0.9.0', '0.10.0'), false);
    assert.equal(newerThan('1.0.0', '0.99.99'), true);
    assert.equal(newerThan('0.2.10', '0.2.9'), true);
  });

  test('the same one is not newer than itself', async () => {
    const { newerThan } = await import('../newer.mjs');
    assert.equal(newerThan('0.1.0', '0.1.0'), false);
    assert.equal(newerThan('v0.1.0', '0.1.0'), false, 'however it is written');
  });

  test('something named oddly reads as nothing rather than as something', async () => {
    const { newerThan } = await import('../newer.mjs');
    for (const odd of ['latest', '', null, undefined, 'nightly-2026-08-01', '2.0']) {
      assert.equal(newerThan(odd, '0.1.0'), false, String(odd));
      assert.equal(newerThan('0.1.0', odd), false, String(odd));
    }
  });
});

describe('a check that could not happen says so, rather than saying you are up to date', () => {
  test('there are three answers and not two', async () => {
    const { check, forget } = await import('../newer.mjs');
    forget();

    // Nothing here reaches the network; whatever this computer answers, the
    // shape has to carry whether it actually knows.
    const answer = await check('0.1.0', { force: true });
    assert.equal(answer.ok, true);
    assert.equal(typeof answer.known, 'boolean');
    assert.ok(answer.sentence, 'always a sentence');

    // Nothing released yet is a thing this computer knows, not a thing it
    // failed to find out. Telling somebody to check they are online when the
    // truth is that no version exists is the wrong advice, confidently.
    if (answer.known === true) {
      assert.equal(answer.action, null, 'nothing to do about being up to date');
    }

    if (!answer.known) {
      assert.ok(answer.action, 'and something to do about it');
      assert.notEqual(answer.newer, true, 'it must not claim there is a newer one');
      assert.match(answer.sentence, /could not be checked|could not be read/);
    }
  });

  test('the answer is kept for a while, so the page can ask freely', async () => {
    const { check } = await import('../newer.mjs');
    const one = await check('0.1.0');
    const two = await check('0.1.0');
    assert.deepEqual(one, two);
  });
});

/**
 * The refusal, held structurally.
 *
 * This is the test that matters. It reads the module and asserts there is
 * nothing in it that could fetch a file and run it — not because somebody is
 * expected to add one by accident, but because "we decided not to" is a note in
 * a comment and this is a fact about the code.
 */
describe('nothing here can download and run anything', () => {
  test('the module has no way to fetch a file or start a program', async () => {
    const source = await readFile(join(here, '..', 'newer.mjs'), 'utf8');
    const code = source
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/^\s*\/\/.*$/gm, ' ');

    // No way to bring a file down, and nowhere to put one if it did.
    for (const way of [/fetch\(/, /https?\.get/, /createWriteStream/, /writeFile/,
      /unzip/, /chmod/, /msiexec/, /\.exe\b/, /\.msi\b/]) {
      assert.equal(way.test(code), false,
        `newer.mjs must not be able to ${way} — an update path that runs unsigned code is worse than none`);
    }

    // And exactly one way to start a program, pointed at exactly one command.
    const starts = [...code.matchAll(/\brun\(\s*'([^']+)'\s*,\s*\[\s*'([^']+)',\s*'([^']+)'/g)]
      .map((m) => `${m[1]} ${m[2]} ${m[3]}`);
    assert.deepEqual(starts, ['gh release view'],
      'the only program it starts is the one that asks what has been released');

    for (const worse of ['spawn(', 'execSync', 'execFileSync', 'child_process\').exec']) {
      assert.equal(code.includes(worse), false, `newer.mjs must not use ${worse}`);
    }
  });

  test('it says what is missing and who can supply it, rather than "not implemented"', async () => {
    const { signing } = await import('../newer.mjs');
    const s = signing();
    assert.equal(s.ready, false);
    assert.ok(s.sentence && s.action);
    assert.ok(s.needs.length >= 3, 'the requirement is written down, not shrugged at');
    for (const line of s.needs) assert.ok(line.length > 20, line);
  });

  test('the page is told the same thing the code decided', async () => {
    const page = await readFile(join(here, '..', 'ui', 'app.js'), 'utf8');
    assert.match(page, /newer\.signing|n\.signing/,
      'the reason belongs on screen, not only in a comment');
  });
});
