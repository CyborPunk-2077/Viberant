/**
 * Two computers changing the same project.
 *
 * This is the only thing in the product that can destroy work, so the tests are
 * about refusing rather than about doing. Each one asks the same question in a
 * different way: can this lose something somebody wrote?
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm, mkdir, writeFile, readFile, utimes } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const run = promisify(execFile);
let root, oldHome;
const restore = (name, was) => { if (was === undefined) delete process.env[name]; else process.env[name] = was; };

before(async () => {
  root = await mkdtemp(join(tmpdir(), 'viberant-live-'));
  oldHome = { HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE };
  process.env.HOME = join(root, 'home');
  process.env.USERPROFILE = join(root, 'home');
  await mkdir(join(root, 'home'), { recursive: true });
});

after(async () => {
  restore('HOME', oldHome.HOME);
  restore('USERPROFILE', oldHome.USERPROFILE);
  await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
});

async function project(name, { dirty = false } = {}) {
  const dir = join(root, name);
  await mkdir(join(dir, 'src'), { recursive: true });
  await writeFile(join(dir, 'src', 'a.js'), 'export const a = 1\n');
  await writeFile(join(dir, 'readme.md'), '# thing\n');
  const git = (...a) => run('git', a, { cwd: dir });
  await git('init', '--quiet', '-b', 'main');
  await git('config', 'user.email', 'd@l');
  await git('config', 'user.name', 'D');
  await git('add', '-A');
  await git('commit', '--quiet', '-m', 'First');
  if (dirty) await writeFile(join(dir, 'src', 'a.js'), 'export const a = 2 // not saved\n');
  return dir;
}

// ---------------------------------------------------------------------------

describe('telling whether two folders are the same', () => {
  test('the same folder gives the same answer twice, and it costs nothing to ask', async () => {
    const fp = await import('../fingerprint.mjs');
    const dir = await project('steady');
    const a = await fp.of(dir);
    const b = await fp.of(dir);
    assert.equal(a.mark, b.mark);
    assert.equal(a.files, 2, 'the folders that get rebuilt anyway are not counted');
    assert.deepEqual(fp.compare(a, b), { same: true, know: true });
  });

  test('a changed file changes the answer', async () => {
    const fp = await import('../fingerprint.mjs');
    const dir = await project('moving');
    const before = await fp.of(dir);
    await writeFile(join(dir, 'src', 'a.js'), 'export const a = 99\n');
    const after = await fp.of(dir);
    assert.notEqual(before.mark, after.mark);
    assert.equal(fp.compare(before, after).same, false);
  });

  test('which one is newer is only claimed when it is worth claiming', async () => {
    const fp = await import('../fingerprint.mjs');
    const mine = { mark: 'a', files: 2, bytes: 10, newest: 1_000_000 };

    const wellAhead = fp.compare(mine, { mark: 'b', files: 4, bytes: 20, newest: 1_000_000 + 600_000 });
    assert.equal(wellAhead.theirsIsNewer, true);
    assert.equal(wellAhead.tooCloseToCall, false);
    assert.equal(wellAhead.files, 2);

    const seconds = fp.compare(mine, { mark: 'b', files: 2, bytes: 11, newest: 1_000_000 + 5_000 });
    assert.equal(seconds.tooCloseToCall, true,
      'two clocks and two people are not synchronised well enough to call that');
  });
});

describe('bringing another computer\'s copy across', () => {
  test('it refuses outright while you have unsaved work', async () => {
    const live = await import('../live.mjs');
    const jobs = await import('../jobs.mjs');
    const dir = await project('busy', { dirty: true });

    const job = jobs.begin({ what: 'test', where: dir });
    const r = await live.take({ name: 'busy', from: 'somebody', path: dir, job, jobs });

    assert.equal(r.ok, false);
    assert.match(r.sentence, /unsaved change/);
    assert.match(r.action, /Save your work first/);
    assert.equal(await readFile(join(dir, 'src', 'a.js'), 'utf8'), 'export const a = 2 // not saved\n',
      'and the unsaved work is exactly where it was');
  });

  test('a project that is not here is not silently created over the top of nothing', async () => {
    const live = await import('../live.mjs');
    const jobs = await import('../jobs.mjs');
    const job = jobs.begin({ what: 'test', where: root });
    const r = await live.take({ name: 'ghost', from: 'somebody', path: join(root, 'not-here'), job, jobs });
    assert.equal(r.ok, false);
    assert.match(r.sentence, /not on this computer/);
    assert.ok(r.action);
  });

  test('when the other computer cannot be reached, your copy is put back exactly as it was', async () => {
    const live = await import('../live.mjs');
    const jobs = await import('../jobs.mjs');
    const dir = await project('saved');

    const before = await readFile(join(dir, 'readme.md'), 'utf8');
    const job = jobs.begin({ what: 'test', where: dir });
    // Nobody is on the network in a test, so this is the failure path.
    const r = await live.take({ name: 'saved', from: 'nobody-at-all', path: dir, job, jobs });

    assert.equal(r.ok, false);
    assert.ok(existsSync(dir), 'the folder is still there');
    assert.equal(await readFile(join(dir, 'readme.md'), 'utf8'), before,
      'with exactly what was in it');
    assert.ok(existsSync(join(dir, 'src', 'a.js')));
  });

  test('nothing is ever raised as news without a person deciding what to do', async () => {
    const live = await import('../live.mjs');
    const r = await live.look({ mine: [] });
    // With no network there is nothing to say, and nothing was done about it.
    assert.equal(Array.isArray(r.news), true);
    assert.equal(r.news.length, 0);
  });

  test('a difference you have looked at and left alone stops being raised', async () => {
    const live = await import('../live.mjs');
    const r = live.leaveItAlone({ from: 'lap', name: 'thing', mark: 'abc' });
    assert.equal(r.ok, true);
    assert.match(r.sentence, /until it changes again/);
  });
});
