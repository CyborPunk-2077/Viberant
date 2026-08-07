/**
 * Nothing reaches another computer that was not offered to it.
 *
 * This is the test for the fault that mattered most, because it is the one
 * where the product was wrong about something a person cares about rather than
 * merely awkward. Another computer's screen showed:
 *
 *   1MS22AI · Contacts · Download · Viberant
 *
 * Two of those are Windows' own folders. Nobody offered them. They were there
 * because being in the projects list *was* the offer, and the only way out was
 * to notice and object to each one.
 *
 * So the rule under test is not "private works". It is the stronger one:
 * **being in the list means nothing, and only offering means anything.**
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let root, house, projectsFile;

/** The list of projects this computer keeps, written the way the app writes it. */
const remember = async (entries) => {
  await writeFile(projectsFile, JSON.stringify(entries, null, 2), 'utf8');
};

before(async () => {
  root = await mkdtemp(join(tmpdir(), 'viberant-offered-'));
  house = join(root, 'home', '.viberant');
  await mkdir(house, { recursive: true });
  projectsFile = join(house, 'projects.json');
  process.env.USERPROFILE = join(root, 'home');
  process.env.HOME = join(root, 'home');
});

after(async () => {
  await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
});

/** A folder on disk that could plausibly be a project. */
const folder = async (name) => {
  const at = join(root, name);
  await mkdir(at, { recursive: true });
  await writeFile(join(at, 'a.txt'), 'something');
  return at;
};

describe('only what was offered leaves this computer', () => {
  test('a project in the list is not offered merely for being in the list', async () => {
    const { isShared } = await import('../projects.mjs');

    // Exactly the shape the real file had on the computer where this was found:
    // folders opened once, never offered, no `shared` written against them.
    const asFound = [
      { path: await folder('1MS22AI'), name: '1MS22AI' },
      { path: await folder('Contacts'), name: 'Contacts' },
      { path: await folder('Download'), name: 'Download' },
      { path: await folder('Viberant'), name: 'Viberant' },
    ];

    assert.deepEqual(asFound.filter(isShared), [],
      'a list written before this rule existed offers nothing at all');
  });

  test('offering one offers exactly one', async () => {
    const { share, isShared, remembered } = await import('../projects.mjs');
    const a = await folder('Folder A');
    const b = await folder('Project B');
    await remember([{ path: a, name: 'Folder A' }, { path: b, name: 'Project B' }]);

    const said = await share(a, true);
    assert.equal(said.ok, true, said.sentence);

    assert.deepEqual((await remembered()).filter(isShared).map((p) => p.name), ['Folder A']);
  });

  test('and offering the second offers both, and no more', async () => {
    const { share, isShared, remembered } = await import('../projects.mjs');
    const b = (await remembered()).find((p) => p.name === 'Project B');
    await share(b.path, true);

    assert.deepEqual((await remembered()).filter(isShared).map((p) => p.name).sort(),
      ['Folder A', 'Project B']);
  });

  test('stopping one leaves the other, and touches nothing on disk', async () => {
    const { share, isShared, remembered } = await import('../projects.mjs');
    const a = (await remembered()).find((p) => p.name === 'Folder A');

    const said = await share(a.path, false);
    assert.equal(said.ok, true);
    assert.match(said.sentence, /Nothing on this computer was touched/);

    assert.deepEqual((await remembered()).filter(isShared).map((p) => p.name), ['Project B']);

    // Stopping is not deleting, and the two must never be the same gesture.
    assert.equal(await readFile(join(a.path, 'a.txt'), 'utf8'), 'something');
  });

  test('the old word and the new one never disagree', async () => {
    const { share, remembered } = await import('../projects.mjs');
    const b = (await remembered()).find((p) => p.name === 'Project B');

    await share(b.path, false);
    let one = (await remembered()).find((p) => p.name === 'Project B');
    assert.equal(one.shared, false);
    assert.equal(one.private, true, 'anything still reading the old word agrees');

    await share(b.path, true);
    one = (await remembered()).find((p) => p.name === 'Project B');
    assert.equal(one.shared, true);
    assert.equal(one.private, false);
  });

  test('offering something this computer is not keeping is refused, not invented', async () => {
    const { share } = await import('../projects.mjs');
    const r = await share(join(root, 'never-opened'), true);
    assert.equal(r.ok, false);
    assert.ok(r.sentence && r.action, 'one sentence about what is true, and one thing to do');
  });
});
