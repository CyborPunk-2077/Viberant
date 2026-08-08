/**
 * The workspace, kept from growing forever.
 *
 * Being about writes a small save every couple of minutes. Nobody reads one,
 * and left alone it is a quarter of a million saves a year in a project every
 * computer keeps a copy of. Two things stop that: computers that stopped coming
 * have their word dropped, and past five hundred saves the whole thing is
 * folded back into one.
 *
 * Both throw something away, which is why neither is believed here. Each runs
 * against a real workspace on disk, with a real second computer's files in it,
 * and what survives is checked rather than assumed.
 *
 * The rule that makes all of it acceptable is the one worth testing hardest:
 * **nothing in this folder is anybody's work.** A test below proves the fold
 * refuses to send anywhere that is not this product's own plumbing.
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const run = promisify(execFile);

let root, house, HERE, elsewhere;

/** Past the line, for a test. The line itself is five hundred; what is being
 *  proved is the behaviour at it, and five hundred real saves take a minute
 *  and a half to make for no extra confidence. */
const PAST = 12;

/** A workspace, its remote, and two computers in it. */
async function build() {
  // Somewhere for it to send to, which is what a fold has to be careful about.
  elsewhere = join(root, 'viberant-workspace.git');
  await run('git', ['init', '--bare', '--quiet', '--initial-branch=main', elsewhere]);

  HERE = join(house, '.viberant', 'workspace');
  await mkdir(HERE, { recursive: true });
  const git = (...a) => run('git', a, { cwd: HERE });

  await git('init', '--quiet', '--initial-branch=main');
  await git('config', 'user.name', 'A Computer');
  await git('config', 'user.email', 'computer@example.com');
  await git('remote', 'add', 'origin', elsewhere);

  await mkdir(join(HERE, 'machines'), { recursive: true });
  await mkdir(join(HERE, 'shared'), { recursive: true });
  await mkdir(join(HERE, 'said'), { recursive: true });

  const day = 24 * 60 * 60 * 1000;
  const now = Date.now();

  // This computer, here a moment ago.
  await writeFile(join(HERE, 'machines', 'mine.json'),
    JSON.stringify({ id: 'mine', name: 'danni', lastHere: now }));
  await writeFile(join(HERE, 'shared', 'mine.json'), JSON.stringify([{ name: 'a-project' }]));

  // Another, here yesterday.
  await writeFile(join(HERE, 'machines', 'friend.json'),
    JSON.stringify({ id: 'friend', name: 'SERVER', lastHere: now - day }));
  await writeFile(join(HERE, 'shared', 'friend.json'), JSON.stringify([{ name: 'media' }]));

  // And one nobody has seen since last year.
  await writeFile(join(HERE, 'machines', 'ghost.json'),
    JSON.stringify({ id: 'ghost', name: 'an old laptop', lastHere: now - 200 * day }));
  await writeFile(join(HERE, 'shared', 'ghost.json'), JSON.stringify([{ name: 'gone' }]));
  await writeFile(join(HERE, 'said', 'ghost.jsonl'), `${JSON.stringify({ at: 1, text: 'hello' })}\n`);

  await git('add', '--all');
  await git('commit', '--quiet', '-m', 'first');
  await git('push', '--quiet', '--set-upstream', 'origin', 'main');
  return git;
}

before(async () => {
  root = await mkdtemp(join(tmpdir(), 'viberant-tidy-'));
  house = join(root, 'home');
  await mkdir(house, { recursive: true });
  process.env.USERPROFILE = house;
  process.env.HOME = house;
});

after(async () => {
  await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
});

describe('computers that stopped coming have their word dropped', () => {
  test('the one nobody has seen goes, and the ones here stay', async () => {
    await build();
    const { __testOnly } = await import('../workspace.mjs');

    assert.equal(await __testOnly.prune('mine'), true, 'there was something to do');

    assert.equal(existsSync(join(HERE, 'machines', 'ghost.json')), false);
    assert.equal(existsSync(join(HERE, 'shared', 'ghost.json')), false,
      'what it was offering points at a folder that is not there any more');
    assert.equal(existsSync(join(HERE, 'said', 'ghost.jsonl')), false);

    assert.equal(existsSync(join(HERE, 'machines', 'mine.json')), true);
    assert.equal(existsSync(join(HERE, 'machines', 'friend.json')), true,
      'here yesterday is here');
  });

  test('this computer never drops its own, however wrong the clock is', async () => {
    const { __testOnly } = await import('../workspace.mjs');

    // A clock that says this computer was last about two years ago. Common
    // enough, and being erased by one is not recoverable from the inside.
    await writeFile(join(HERE, 'machines', 'mine.json'),
      JSON.stringify({ id: 'mine', name: 'danni', lastHere: Date.now() - 700 * 24 * 60 * 60 * 1000 }));

    await __testOnly.prune('mine');
    assert.equal(existsSync(join(HERE, 'machines', 'mine.json')), true);
    assert.equal(existsSync(join(HERE, 'shared', 'mine.json')), true);

    await writeFile(join(HERE, 'machines', 'mine.json'),
      JSON.stringify({ id: 'mine', name: 'danni', lastHere: Date.now() }));
  });

  test('a conversation is trimmed to what anybody scrolls back through', async () => {
    const { __testOnly } = await import('../workspace.mjs');
    const many = Array.from({ length: 1200 }, (_, i) => JSON.stringify({ at: i, text: `line ${i}` }));
    await writeFile(join(HERE, 'said', 'friend.jsonl'), `${many.join('\n')}\n`);

    assert.equal(await __testOnly.prune('mine'), true);

    const left = (await readFile(join(HERE, 'said', 'friend.jsonl'), 'utf8'))
      .split('\n').filter((l) => l.trim());
    assert.equal(left.length, __testOnly.KEEP_SAID);
    // The newest, which is the half worth keeping.
    assert.equal(JSON.parse(left[left.length - 1]).text, 'line 1199');
  });

  test('with nothing to do it says so, rather than writing a save about nothing', async () => {
    const { __testOnly } = await import('../workspace.mjs');
    assert.equal(await __testOnly.prune('mine'), false);
  });
});

describe('a history nobody reads is folded back into one', () => {
  test('below the line it is left alone', async () => {
    const { __testOnly } = await import('../workspace.mjs');
    assert.equal(await __testOnly.tidy(), false, 'a handful of saves is not a problem');
    assert.ok(__testOnly.TOO_MANY_SAVES >= 100, 'and the real line is nowhere near a handful');
  });

  test('past the line, every file survives and the history does not', async () => {
    const { __testOnly } = await import('../workspace.mjs');
    const git = (...a) => run('git', a, { cwd: HERE });

    // Enough saves to be past a line, written the way the real ones are. The
    // line itself is a number; what has to be right is what happens at it, so
    // it is asked for here rather than making five hundred real saves.
    for (let i = 0; i < PAST + 2; i += 1) {
      await writeFile(join(HERE, 'machines', 'mine.json'),
        JSON.stringify({ id: 'mine', name: 'danni', lastHere: Date.now() + i }));
      await git('add', '--all');
      await git('commit', '--quiet', '--no-verify', '-m', 'danni is here');
    }
    await git('push', '--quiet');

    const before = Number((await git('rev-list', '--count', 'HEAD')).stdout.trim());
    assert.ok(before > PAST, `only ${before} saves`);

    assert.equal(await __testOnly.tidy(PAST), true);

    assert.equal(Number((await git('rev-list', '--count', 'HEAD')).stdout.trim()), 1,
      'what is lost is the list of moments, and only that');

    // What is kept is every file exactly as it stands.
    for (const f of ['machines/mine.json', 'machines/friend.json', 'shared/mine.json',
      'shared/friend.json', 'said/friend.jsonl']) {
      assert.equal(existsSync(join(HERE, f)), true, `${f} did not survive the fold`);
    }

    // And the other computers can reach it.
    const there = await run('git', ['rev-list', '--count', 'main'], { cwd: elsewhere });
    assert.equal(Number(there.stdout.trim()), 1, 'the fold reached GitHub');
  });

  test('the branch still knows where it sends, so ordinary saves keep working', async () => {
    const git = (...a) => run('git', a, { cwd: HERE });
    const upstream = await git('rev-parse', '--abbrev-ref', 'main@{upstream}');
    assert.equal(upstream.stdout.trim(), 'origin/main');

    await writeFile(join(HERE, 'said', 'mine.jsonl'), `${JSON.stringify({ at: 2, text: 'still here' })}\n`);
    await git('add', '--all');
    await git('commit', '--quiet', '--no-verify', '-m', 'danni said something');
    await git('push', '--quiet');

    const there = await run('git', ['rev-list', '--count', 'main'], { cwd: elsewhere });
    assert.equal(Number(there.stdout.trim()), 2);
  });
});

/**
 * The one irreversible step in the product.
 *
 * Folding replaces what is on GitHub. That is only ever acceptable against this
 * product's own plumbing, and the guard is not care — it is two checks that a
 * test can stand on.
 */
describe('the fold cannot land anywhere that is not the plumbing', () => {
  test('it refuses outright when the address is somebody\'s project', async () => {
    const { __testOnly } = await import('../workspace.mjs');
    const git = (...a) => run('git', a, { cwd: HERE });

    const somebodys = join(root, 'someones-real-project.git');
    await run('git', ['init', '--bare', '--quiet', '--initial-branch=main', somebodys]);
    await git('remote', 'set-url', 'origin', somebodys);

    // Well past the line, so nothing but the address is standing in the way.
    for (let i = 0; i < PAST + 2; i += 1) {
      await writeFile(join(HERE, 'machines', 'mine.json'),
        JSON.stringify({ id: 'mine', name: 'danni', lastHere: Date.now() + i }));
      await git('add', '--all');
      await git('commit', '--quiet', '--no-verify', '-m', 'danni is here');
    }

    assert.equal(await __testOnly.tidy(PAST), false, 'it must not touch a project');
    assert.equal(existsSync(join(HERE, 'machines', 'friend.json')), true,
      'and it must leave this computer exactly as it found it');

    const there = await run('git', ['rev-list', '--count', 'main'], { cwd: somebodys })
      .catch(() => ({ stdout: '0' }));
    assert.equal(Number(there.stdout.trim()), 0, 'nothing reached it');

    await git('remote', 'set-url', 'origin', elsewhere);
  });

  test('it refuses while anything is unwritten, so a save is never dropped', async () => {
    const { __testOnly } = await import('../workspace.mjs');
    await writeFile(join(HERE, 'machines', 'mine.json'),
      JSON.stringify({ id: 'mine', name: 'danni', lastHere: Date.now(), note: 'not yet kept' }));

    assert.equal(await __testOnly.tidy(PAST), false);

    const held = JSON.parse(await readFile(join(HERE, 'machines', 'mine.json'), 'utf8'));
    assert.equal(held.note, 'not yet kept', 'what was unwritten is still there');
  });
});

/**
 * Coming back from a history that no longer lines up.
 *
 * The reason this is allowed at all: nothing in the folder is anybody's work.
 * Without it, one fold by one computer wedges every other computer forever, in
 * silence — which is the exact shape of fault this codebase has paid for twice.
 */
describe('a computer whose copy no longer lines up takes the other one whole', () => {
  test('it recovers instead of never pulling again', async () => {
    const { __testOnly } = await import('../workspace.mjs');
    const git = (...a) => run('git', a, { cwd: HERE });

    await git('checkout', '--quiet', '--force', 'main');
    await git('reset', '--hard', '--quiet');
    await git('fetch', '--quiet', 'origin');
    await git('reset', '--hard', '--quiet', 'origin/main');

    // Another computer folds: a brand new history, sharing nothing with ours.
    const other = join(root, 'other-computer');
    await run('git', ['clone', '--quiet', elsewhere, other]);
    const theirs = (...a) => run('git', a, { cwd: other });
    await theirs('config', 'user.name', 'Another');
    await theirs('config', 'user.email', 'another@example.com');
    await theirs('checkout', '--quiet', '--orphan', 'folded');
    await writeFile(join(other, 'machines', 'friend.json'),
      JSON.stringify({ id: 'friend', name: 'SERVER', lastHere: Date.now() }));
    await theirs('add', '--all');
    await theirs('commit', '--quiet', '-m', 'Everything the computers know, as it stands now');
    await theirs('branch', '-M', 'main');
    await theirs('push', '--quiet', '--force', 'origin', 'main');

    const foldedTo = (await theirs('rev-parse', 'HEAD')).stdout.trim();

    // An ordinary pull cannot follow that. It has to end up there anyway.
    assert.equal(await __testOnly.pull(), true);
    assert.equal((await git('rev-parse', 'HEAD')).stdout.trim(), foldedTo);

    // And nothing is left half-done behind it.
    const state = await git('status', '--porcelain');
    assert.equal(state.stdout.trim(), '', 'no rebase left standing');
  });
});
