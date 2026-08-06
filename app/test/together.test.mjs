/**
 * More than one computer, and where you have got to on each thing.
 *
 * The fold is the part that has to be right: two computers writing at the same
 * moment, and one picture read out of what they both left behind. It is tested
 * on its own, with no network and no second computer, because that is the only
 * way to prove it for the case that actually matters — the one where both of
 * them wrote.
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let root, oldHome;

const restore = (name, was) => { if (was === undefined) delete process.env[name]; else process.env[name] = was; };

before(async () => {
  root = await mkdtemp(join(tmpdir(), 'viberant-together-'));
  oldHome = { HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE };
  const house = join(root, 'home');
  process.env.HOME = house;
  process.env.USERPROFILE = house;
  await mkdir(house, { recursive: true });
});

after(async () => {
  restore('HOME', oldHome.HOME);
  restore('USERPROFILE', oldHome.USERPROFILE);
  await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
});

const now = 1_800_000_000_000;
const file = (from, value) => ({ from, text: JSON.stringify(value) });

// ---------------------------------------------------------------------------

describe('two computers, one picture', () => {
  test('each computer is named, and which one you are sitting at is never in doubt', async () => {
    const { fold } = await import('../workspace.mjs');
    const r = fold({
      machines: [
        file('desk', { id: 'desk', name: 'The desktop', kind: 'Windows', lastHere: now - 1000 }),
        file('lap', { id: 'lap', name: 'The laptop', kind: 'Windows', lastHere: now - 20 * 60_000 }),
      ],
    }, 'desk', now);

    assert.deepEqual(r.machines.map((m) => m.name), ['The desktop', 'The laptop']);
    assert.equal(r.machines[0].you, true);
    assert.equal(r.machines[1].you, false);
  });

  test('being about is a fact about the last few minutes, not a claim', async () => {
    const { fold } = await import('../workspace.mjs');
    const r = fold({
      machines: [
        file('a', { id: 'a', name: 'Recent', lastHere: now - 60_000 }),
        file('b', { id: 'b', name: 'Hours ago', lastHere: now - 5 * 3600_000 }),
        file('c', { id: 'c', name: 'Never said', lastHere: null }),
      ],
    }, 'a', now);

    const here = Object.fromEntries(r.machines.map((m) => [m.name, m.hereNow]));
    assert.equal(here.Recent, true);
    assert.equal(here['Hours ago'], false);
    assert.equal(here['Never said'], false);
  });

  test('every project says which computer it came from', async () => {
    const { fold } = await import('../workspace.mjs');
    const r = fold({
      machines: [
        file('desk', { id: 'desk', name: 'The desktop', lastHere: now }),
        file('lap', { id: 'lap', name: 'The laptop', lastHere: now }),
      ],
      shared: [
        file('desk', [{ id: 'p1', name: 'exporter', url: 'https://github.com/me/exporter' }]),
        file('lap', [{ id: 'p2', name: 'blog', url: 'https://github.com/me/blog' }]),
      ],
    }, 'desk', now);

    const from = Object.fromEntries(r.projects.map((p) => [p.name, p.fromName]));
    assert.equal(from.exporter, 'The desktop');
    assert.equal(from.blog, 'The laptop');
    assert.equal(r.projects.find((p) => p.name === 'exporter').yours, true);
    assert.equal(r.projects.find((p) => p.name === 'blog').yours, false);
  });

  test('a project from a computer that has since left is still honest about where it came from', async () => {
    const { fold } = await import('../workspace.mjs');
    const r = fold({
      machines: [file('desk', { id: 'desk', name: 'The desktop', lastHere: now })],
      shared: [file('gone', [{ id: 'p', name: 'orphan' }])],
    }, 'desk', now);
    assert.match(r.projects[0].fromName, /has left/);
  });

  test('what was said comes back in the order it was said, whoever said it', async () => {
    const { fold } = await import('../workspace.mjs');
    const line = (at, text) => JSON.stringify({ at, text });
    const r = fold({
      machines: [
        file('desk', { id: 'desk', name: 'The desktop', lastHere: now }),
        file('lap', { id: 'lap', name: 'The laptop', lastHere: now }),
      ],
      said: [
        { from: 'desk', text: `${line(3, 'third')}\n${line(1, 'first')}\n` },
        { from: 'lap', text: `${line(2, 'second')}\n` },
      ],
    }, 'desk', now);

    assert.deepEqual(r.said.map((s) => s.text), ['first', 'second', 'third']);
    assert.deepEqual(r.said.map((s) => s.you), [true, false, true]);
    assert.equal(r.said[1].fromName, 'The laptop');
  });

  test('a half-written file is skipped rather than taking the whole picture down', async () => {
    const { fold } = await import('../workspace.mjs');
    const r = fold({
      machines: [
        { from: 'broken', text: '{"id":"broken","name":"Half w' },
        file('good', { id: 'good', name: 'The good one', lastHere: now }),
      ],
      said: [{ from: 'good', text: '{"at":1,"text":"fine"}\nnot json at all\n' }],
    }, 'good', now);

    assert.deepEqual(r.machines.map((m) => m.name), ['The good one']);
    assert.deepEqual(r.said.map((s) => s.text), ['fine']);
  });
});

describe('joining, before anything has been joined', () => {
  test('nothing claims to be joined until it is', async () => {
    const { state } = await import('../workspace.mjs');
    const s = await state();
    assert.equal(s.joined, false);
  });

  test('saying something with nowhere to say it is declined plainly', async () => {
    const { say } = await import('../workspace.mjs');
    const r = await say({ machine: 'x', text: 'hello?' });
    assert.equal(r.ok, false);
    assert.ok(r.sentence && r.action);
  });

  test('a project with no copy on GitHub cannot travel, and is told so', async () => {
    const { bring } = await import('../workspace.mjs');
    const r = await bring({ entry: { name: 'local-only', url: null }, into: root });
    assert.equal(r.ok, false);
    assert.match(r.sentence, /no copy on GitHub/);
    assert.ok(r.action);
  });
});

describe('two computers, actually meeting', () => {
  /**
   * The whole mechanism, end to end, with a plain folder standing in for
   * GitHub. Nothing here reaches the network — what is being proved is that two
   * computers writing into the same place at the same time both end up seeing
   * everything, and that neither one's writing gets in the other's way.
   */
  let meeting, second;

  const git = async (dir, ...a) => {
    const { execFile } = await import('node:child_process');
    const { promisify } = await import('node:util');
    return promisify(execFile)('git', a, { cwd: dir });
  };

  test('one computer joins a workspace and offers a project', async () => {
    const { writeFile: write } = await import('node:fs/promises');
    const house = join(root, 'home', '.viberant');

    meeting = join(root, 'pretend-github.git');
    await git(root, 'init', '--quiet', '--bare', '-b', 'main', meeting);
    await mkdir(house, { recursive: true });
    await git(root, 'clone', '--quiet', meeting, join(house, 'workspace'));
    await git(join(house, 'workspace'), 'config', 'user.email', 'd@l');
    await git(join(house, 'workspace'), 'config', 'user.name', 'D');
    await write(join(house, 'workspace.json'),
      JSON.stringify({ account: 'me', full: 'me/viberant-workspace', name: 'The desktop' }), 'utf8');

    const { sync } = await import('../workspace.mjs');
    const r = await sync({
      machine: 'desk',
      name: 'The desktop',
      project: 'exporter',
      sharing: [{ id: 'p1', name: 'exporter', url: 'https://github.com/me/exporter', says: 'Everything here is saved.' }],
      force: true,
    });

    assert.equal(r.ok, true, r.sentence);
    assert.deepEqual(r.machines.map((m) => m.name), ['The desktop']);
    assert.deepEqual(r.projects.map((p) => p.name), ['exporter']);
    assert.equal(r.machines[0].workingOn, 'exporter');
  });

  test('and what it wrote is really there, where the other computer will find it', async () => {
    const { stdout } = await git(meeting, 'ls-tree', '-r', '--name-only', 'main');
    const files = stdout.trim().split('\n');
    assert.ok(files.includes('machines/desk.json'), 'who it is');
    assert.ok(files.includes('shared/desk.json'), 'and what it is offering');
  });

  test('a second computer turns up, and neither one gets in the other one\'s way', async () => {
    const { writeFile: write } = await import('node:fs/promises');
    second = join(root, 'the-laptop');
    await git(root, 'clone', '--quiet', meeting, second);
    await git(second, 'config', 'user.email', 'd@l');
    await git(second, 'config', 'user.name', 'D');

    await mkdir(join(second, 'machines'), { recursive: true });
    await mkdir(join(second, 'shared'), { recursive: true });
    await mkdir(join(second, 'said'), { recursive: true });
    await write(join(second, 'machines', 'lap.json'),
      JSON.stringify({ id: 'lap', name: 'The laptop', kind: 'Windows', lastHere: Date.now() }), 'utf8');
    await write(join(second, 'shared', 'lap.json'),
      JSON.stringify([{ id: 'p2', name: 'blog', url: 'https://github.com/me/blog' }]), 'utf8');
    await write(join(second, 'said', 'lap.jsonl'),
      `${JSON.stringify({ at: 1000, fromName: 'The laptop', text: 'Left the blog half done.' })}\n`, 'utf8');
    await git(second, 'add', '--all');
    await git(second, 'commit', '--quiet', '-m', 'The laptop is here');
    await git(second, 'push', '--quiet');

    const { sync } = await import('../workspace.mjs');
    const r = await sync({ machine: 'desk', name: 'The desktop', force: true });

    assert.equal(r.ok, true);
    assert.deepEqual(r.machines.map((m) => m.name).sort(), ['The desktop', 'The laptop']);
    assert.deepEqual(r.projects.map((p) => p.name).sort(), ['blog', 'exporter']);
    assert.equal(r.projects.find((p) => p.name === 'blog').fromName, 'The laptop');
    assert.equal(r.projects.find((p) => p.name === 'blog').yours, false);
  });

  test('saying something reaches the other computer', async () => {
    const { say } = await import('../workspace.mjs');
    const r = await say({ machine: 'desk', name: 'The desktop', text: 'Picking the blog up here.' });
    assert.equal(r.ok, true, r.sentence);
    assert.deepEqual(r.said.map((s) => s.text), ['Left the blog half done.', 'Picking the blog up here.']);

    await git(second, 'pull', '--quiet', '--rebase');
    const { readFile } = await import('node:fs/promises');
    const there = await readFile(join(second, 'said', 'desk.jsonl'), 'utf8');
    assert.match(there, /Picking the blog up here/);
  });

  test('leaving takes this computer out and leaves everything else alone', async () => {
    const { leave } = await import('../workspace.mjs');
    const r = await leave({ machine: 'desk' });
    assert.equal(r.ok, true);
    assert.match(r.sentence, /Nothing on it was touched/);

    const { stdout } = await git(meeting, 'ls-tree', '-r', '--name-only', 'main');
    const files = stdout.trim().split('\n');
    assert.ok(!files.includes('machines/desk.json'), 'this computer is gone from the list');
    assert.ok(files.includes('machines/lap.json'), 'and the other one is untouched');
    assert.ok(files.includes('said/desk.jsonl'), 'what was said stays said');
  });
});

describe('where you have got to with a project', () => {
  test('a project can be marked, and the mark comes back with it', async () => {
    const { remember, mark, remembered, MARKS } = await import('../projects.mjs');
    const dir = join(root, 'marked');
    await mkdir(dir, { recursive: true });
    await remember(dir);

    const r = await mark(dir, 'working');
    assert.equal(r.ok, true, r.sentence);
    assert.match(r.sentence, /working on it/i);
    assert.equal((await remembered()).find((p) => p.path === dir).mark, 'working');

    await mark(dir, 'finished');
    assert.equal((await remembered()).find((p) => p.path === dir).mark, 'finished');

    await mark(dir, null);
    assert.equal((await remembered()).find((p) => p.path === dir).mark, null);
    assert.ok(MARKS.every((m) => m.name && m.blurb));
  });

  test('a mark that is not one of the marks is declined', async () => {
    const { mark } = await import('../projects.mjs');
    const dir = join(root, 'marked');
    const r = await mark(dir, 'brilliant');
    assert.equal(r.ok, false);
    assert.ok(r.action);
  });

  test('opening a project again does not lose what you decided about it', async () => {
    const { remember, mark, keepPrivate, remembered } = await import('../projects.mjs');
    const dir = join(root, 'kept');
    await mkdir(dir, { recursive: true });
    await remember(dir);
    await mark(dir, 'waiting');
    await keepPrivate(dir, true);

    await remember(dir);
    const p = (await remembered()).find((x) => x.path === dir);
    assert.equal(p.mark, 'waiting', 'the mark survived being opened again');
    assert.equal(p.private, true, 'and so did keeping it private');
  });

  test('a project is visible to your other computers unless you say otherwise', async () => {
    const { remember, remembered } = await import('../projects.mjs');
    const dir = join(root, 'ordinary');
    await mkdir(dir, { recursive: true });
    await remember(dir);

    const p = (await remembered()).find((x) => x.path === dir);
    assert.ok(!p.private,
      'they are your own computers — hiding your work from yourself is a strange place to start');
  });

  test('making one private, and letting it be seen again, is said plainly both ways', async () => {
    const { remember, keepPrivate } = await import('../projects.mjs');
    const dir = join(root, 'secret');
    await mkdir(dir, { recursive: true });
    await remember(dir);

    const hidden = await keepPrivate(dir, true);
    assert.match(hidden.sentence, /private to this computer/);
    const shown = await keepPrivate(dir, false);
    assert.match(shown.sentence, /visible to your other computers/);
  });
});
