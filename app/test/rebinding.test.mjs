/**
 * Pointing a project at a repository that is already there.
 *
 * The old shape was to create and read the failure, which cannot tell three
 * very different situations apart: a name already used by a project of yours, a
 * name used by somebody else's, and a name that failed for an unrelated reason.
 * All three came out as "a project of that name may already be there. Try
 * another name" — which is wrong advice in the first case, and the first case
 * is the common one.
 *
 * So it looks first. What is tested here is the deciding, against real
 * repositories on disk, because the deciding is where the damage would be.
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const run = promisify(execFile);
let root, github;

/** A folder with a history in it. */
async function aProject(name, files = { 'a.txt': 'one\n' }) {
  const at = join(root, name);
  await mkdir(at, { recursive: true });
  for (const [f, body] of Object.entries(files)) await writeFile(join(at, f), body);
  await run('git', ['init', '--quiet', '--initial-branch=main'], { cwd: at });
  await run('git', ['config', 'user.name', 'A Person'], { cwd: at });
  await run('git', ['config', 'user.email', 'a@example.com'], { cwd: at });
  await run('git', ['add', '--all'], { cwd: at });
  await run('git', ['commit', '--quiet', '-m', 'first'], { cwd: at });
  return at;
}

before(async () => {
  root = await mkdtemp(join(tmpdir(), 'viberant-rebind-'));
  await mkdir(join(root, 'home'), { recursive: true });
  process.env.USERPROFILE = join(root, 'home');
  process.env.HOME = join(root, 'home');
  github = await import('../github.mjs');
});

after(async () => {
  await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
});

describe('two histories are compared before anything is pushed', () => {
  test('a copy of the same project is ahead, not unrelated', async () => {
    const mine = await aProject('mine');
    const theirs = join(root, 'theirs.git');
    await run('git', ['init', '--bare', '--quiet', '--initial-branch=main', theirs]);
    await run('git', ['remote', 'add', 'origin', theirs], { cwd: mine });
    await run('git', ['push', '--quiet', 'origin', 'main'], { cwd: mine });

    await writeFile(join(mine, 'b.txt'), 'two\n');
    await run('git', ['add', '--all'], { cwd: mine });
    await run('git', ['commit', '--quiet', '-m', 'second'], { cwd: mine });

    const how = await github.howTheyCompare(mine, theirs);
    assert.equal(how.ok, true);
    assert.equal(how.unrelated, false, 'a project and its own copy read as unrelated');
    assert.equal(how.ahead, 1);
    assert.equal(how.behind, 0);
  });

  test('a project that has moved on is behind, and that is worth saying', async () => {
    const mine = await aProject('behind');
    const theirs = join(root, 'behind.git');
    await run('git', ['init', '--bare', '--quiet', '--initial-branch=main', theirs]);
    await run('git', ['remote', 'add', 'origin', theirs], { cwd: mine });
    await run('git', ['push', '--quiet', 'origin', 'main'], { cwd: mine });

    // Somebody else pushes, from a second clone.
    const other = join(root, 'behind-clone');
    await run('git', ['clone', '--quiet', theirs, other]);
    await run('git', ['config', 'user.name', 'B'], { cwd: other });
    await run('git', ['config', 'user.email', 'b@example.com'], { cwd: other });
    await writeFile(join(other, 'c.txt'), 'three\n');
    await run('git', ['add', '--all'], { cwd: other });
    await run('git', ['commit', '--quiet', '-m', 'theirs'], { cwd: other });
    await run('git', ['push', '--quiet'], { cwd: other });

    const how = await github.howTheyCompare(mine, theirs);
    assert.equal(how.unrelated, false);
    assert.equal(how.behind, 1, 'it did not notice work it does not have');
  });

  test('two projects sharing only a name read as unrelated', async () => {
    const mine = await aProject('unrelated-mine', { 'mine.txt': 'mine\n' });
    const stranger = await aProject('unrelated-theirs', { 'theirs.txt': 'theirs\n' });
    const bare = join(root, 'unrelated.git');
    await run('git', ['init', '--bare', '--quiet', '--initial-branch=main', bare]);
    await run('git', ['remote', 'add', 'origin', bare], { cwd: stranger });
    await run('git', ['push', '--quiet', 'origin', 'main'], { cwd: stranger });

    const how = await github.howTheyCompare(mine, bare);
    assert.equal(how.ok, true);
    assert.equal(how.unrelated, true,
      'two projects with no shared commit were about to be pushed over each other');
  });

  test('an empty one to point at is the easy case', async () => {
    const mine = await aProject('into-empty');
    const bare = join(root, 'empty.git');
    await run('git', ['init', '--bare', '--quiet', '--initial-branch=main', bare]);

    const how = await github.howTheyCompare(mine, bare);
    assert.equal(how.ok, true);
    assert.equal(how.empty, true);
  });

  test('one that cannot be reached says so rather than guessing', async () => {
    const mine = await aProject('unreachable');
    const how = await github.howTheyCompare(mine, join(root, 'not-a-repository'));
    assert.equal(how.ok, false);
    assert.equal(how.reachable, false);
  });

  test('nothing is left behind by asking', async () => {
    const mine = await aProject('tidy');
    const bare = join(root, 'tidy.git');
    await run('git', ['init', '--bare', '--quiet', '--initial-branch=main', bare]);
    await github.howTheyCompare(mine, bare);

    const remotes = (await run('git', ['remote'], { cwd: mine })).stdout
      .trim().split('\n').filter(Boolean);
    assert.equal(remotes.some((r) => r.startsWith('viberant-checking')), false,
      'asking the question left a remote behind in somebody project');
  });
});

describe('what happens when a name is already taken', () => {
  test('it looks before it creates', async () => {
    const source = await readFile(new URL('../github.mjs', import.meta.url), 'utf8');
    const body = source.slice(source.indexOf('export async function connectTo'));
    assert.ok(body.indexOf('repoThere(') < body.indexOf("'repo', 'create'"),
      'it still creates first and reads the failure');
  });

  test('a repository you cannot write to is refused for that reason', async () => {
    const source = await readFile(new URL('../github.mjs', import.meta.url), 'utf8');
    assert.match(source, /if \(!there\.canWrite\)/,
      'one you can see and cannot send to is treated as though it were fine');
    assert.match(source, /cannot send to it/);
  });

  test('unrelated histories are offered rather than resolved', async () => {
    const source = await readFile(new URL('../github.mjs', import.meta.url), 'utf8');
    assert.match(source, /needsChoice: true/);
    assert.match(source, /Nothing has been changed/);
  });

  test('nothing about connecting a project can force a push', async () => {
    const source = await readFile(new URL('../github.mjs', import.meta.url), 'utf8');
    const body = source.slice(source.indexOf('export async function connectTo'),
      source.indexOf('export async function accounts'));
    assert.equal(/--force/.test(body), false, 'connecting a project can force a push');
  });

  test('where it used to go is kept, both ways through', async () => {
    const source = await readFile(new URL('../github.mjs', import.meta.url), 'utf8');
    const body = source.slice(source.indexOf('export async function connectTo'),
      source.indexOf('export async function accounts'));
    // Once for the existing-repository path and once for the newly made one.
    assert.equal([...body.matchAll(/where-it-used-to-go/g)].length >= 4, true,
      'one of the two paths throws away where the work used to go');
  });
});
