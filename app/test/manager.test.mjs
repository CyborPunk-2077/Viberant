/**
 * The manager: projects, launching, publishing, and profiles.
 *
 * Profiles get the most attention here because they handle the only data in this
 * product that is genuinely painful to lose — your signed-in accounts. Every
 * test in that section is asking the same question: can this lose an account?
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm, writeFile, mkdir, readFile, chmod } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';

const run = promisify(execFile);
let root, oldHome;

const restore = (name, was) => {
  if (was === undefined) delete process.env[name]; else process.env[name] = was;
};

before(async () => {
  root = await mkdtemp(join(tmpdir(), 'viberant-mgr-'));
  // Windows reads the home directory from USERPROFILE and Linux from HOME.
  // Moving only one of them lets these tests write into a real home folder.
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

async function project(name, { withHistory = true } = {}) {
  const dir = join(root, name);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'index.js'), 'console.log(1)\n');
  if (withHistory) {
    const git = (...a) => run('git', a, { cwd: dir });
    await git('init', '--quiet', '-b', 'main');
    await git('config', 'user.email', 'd@l');
    await git('config', 'user.name', 'D');
    await git('add', '-A');
    await git('commit', '--quiet', '-m', 'First');
  }
  return dir;
}

// ---------------------------------------------------------------------------

describe('finding your projects', () => {
  test('a folder of folders is searched one level down', async () => {
    const { lookIn } = await import('../projects.mjs');
    await project('alpha');
    await project('beta');
    await mkdir(join(root, 'not-a-project'), { recursive: true });

    const found = await lookIn(root);
    const names = found.map((f) => f.name).sort();
    assert.ok(names.includes('alpha') && names.includes('beta'));
    assert.ok(!names.includes('not-a-project'), 'a plain folder is not a project');
  });

  test('a folder that is not there is not an error', async () => {
    const { lookIn } = await import('../projects.mjs');
    assert.deepEqual(await lookIn(join(root, 'nowhere')), []);
  });
});

describe('what is going on in a project, in plain words', () => {
  test('a clean project says so', async () => {
    const { situation, inWords } = await import('../projects.mjs');
    const dir = await project('clean');
    const s = await situation(dir);
    assert.equal(s.unsaved, 0);
    assert.equal(inWords(s), 'Everything here is saved.');
  });

  test('unsaved work is counted like a person counts', async () => {
    const { situation, inWords } = await import('../projects.mjs');
    const dir = await project('messy');
    await writeFile(join(dir, 'index.js'), 'console.log(2)\n');
    assert.equal(inWords(await situation(dir)), 'One file changed since you last saved.');

    await writeFile(join(dir, 'other.js'), 'x\n');
    assert.equal(inWords(await situation(dir)), '2 files changed since you last saved.');
  });

  test('a folder with no history says so without alarm', async () => {
    const { situation, inWords } = await import('../projects.mjs');
    const dir = await project('fresh', { withHistory: false });
    assert.equal(inWords(await situation(dir)), 'This folder does not keep a history yet.');
  });
});

describe('saving and sending in one go', () => {
  test('everything is saved and sent to the shared copy', async () => {
    const { publish } = await import('../projects.mjs');
    const dir = await project('sending');
    const shared = join(root, 'shared.git');
    await run('git', ['init', '--quiet', '--bare', '-b', 'main', shared]);
    await run('git', ['remote', 'add', 'origin', shared], { cwd: dir });

    await writeFile(join(dir, 'new.js'), 'export const a = 1\n');
    const r = await publish(dir, { message: 'Work from today' });

    assert.equal(r.ok, true, r.sentence);
    assert.equal(r.sent, true);
    const { stdout } = await run('git', ['log', '--format=%s'], { cwd: shared });
    assert.equal(stdout.trim().split('\n')[0], 'Work from today');
  });

  test('a folder with no history at all is set up first', async () => {
    const { publish, situation } = await import('../projects.mjs');
    const dir = await project('untracked', { withHistory: false });
    await run('git', ['config', '--global', 'user.email', 'd@l']).catch(() => {});
    await run('git', ['config', '--global', 'user.name', 'D']).catch(() => {});

    const r = await publish(dir, { message: 'First save', makeIfMissing: false });
    assert.equal(r.ok, true, r.sentence);
    assert.equal(r.saved, true);
    assert.equal(r.sent, false);
    assert.match(r.sentence, /no copy on GitHub yet|not signed in to GitHub/);
    assert.equal((await situation(dir)).tracked, true);
  });

  test('an unreachable shared copy still saves your work, and says so', async () => {
    const { publish } = await import('../projects.mjs');
    const dir = await project('offline');
    await run('git', ['remote', 'add', 'origin', join(root, 'nowhere.git')], { cwd: dir });
    await writeFile(join(dir, 'x.js'), 'x\n');

    const r = await publish(dir, { message: 'Saved anyway' });
    assert.equal(r.ok, false);
    assert.match(r.sentence, /Saved here, but GitHub could not be reached/);
    assert.ok(r.action);
    const { stdout } = await run('git', ['log', '--format=%s'], { cwd: dir });
    assert.equal(stdout.trim().split('\n')[0], 'Saved anyway', 'the work is safe regardless');
  });
});

describe('launching a tool in your project', () => {
  test('a tool that is not installed is declined plainly', async () => {
    const { launch } = await import('../tools.mjs');
    const dir = await project('launching');
    const r = await launch({ tool: { id: 'nope', name: 'Nope', kind: 'cli', bin: 'definitely-not-here' }, dir });
    assert.equal(r.ok, false);
    assert.match(r.sentence, /does not seem to be installed/);
    assert.ok(r.action);
  });

  test('an unknown tool is declined plainly', async () => {
    const { launch } = await import('../tools.mjs');
    const r = await launch({ tool: null, dir: root });
    assert.equal(r.ok, false);
    assert.ok(r.action);
  });

  test('a real tool starts, in the project folder', async () => {
    const { launch } = await import('../tools.mjs');
    const dir = await project('starting');
    const r = await launch({ tool: { id: 'echo', name: 'Echo', kind: 'app', bin: 'echo' }, dir });
    assert.equal(r.ok, true);
    assert.equal(r.at, dir);
  });
});

describe('more than one account, without signing out', () => {
  const tool = { id: 'testtool', name: 'Test Tool', kind: 'cli', bin: 'definitely-not-running-xyz', config: '.testtool' };
  const signedIn = () => join(homedir(), '.testtool');

  const signIn = async (who) => {
    await mkdir(signedIn(), { recursive: true });
    await writeFile(join(signedIn(), 'auth.json'), JSON.stringify({ account: who }), 'utf8');
  };
  const whoAmI = async () =>
    JSON.parse(await readFile(join(signedIn(), 'auth.json'), 'utf8')).account;

  test('the account you are signed in to can be kept under a name', async () => {
    const { save, list } = await import('../profiles.mjs');
    await signIn('work');

    const r = await save(tool, 'work');
    assert.equal(r.ok, true, r.sentence);

    const { profiles, active } = await list(tool);
    assert.deepEqual(profiles.map((p) => p.name), ['work']);
    assert.equal(active, 'work');
  });

  test('switching puts the other account back, and keeps the first one safe', async () => {
    const { save, use, list } = await import('../profiles.mjs');

    await signIn('personal');
    await save(tool, 'personal');
    assert.equal(await whoAmI(), 'personal');

    const r = await use(tool, 'work');
    assert.equal(r.ok, true, r.sentence);
    assert.equal(await whoAmI(), 'work', 'the other account is now in use');

    const { profiles, active } = await list(tool);
    assert.equal(active, 'work');
    assert.deepEqual(profiles.map((p) => p.name).sort(), ['personal', 'work'],
      'and nothing was lost on the way');

    await use(tool, 'personal');
    assert.equal(await whoAmI(), 'personal', 'and back again');
  });

  test('switching to an account that is gone changes nothing', async () => {
    const { use } = await import('../profiles.mjs');
    const before = await whoAmI();
    const r = await use(tool, 'never-existed');
    assert.equal(r.ok, false);
    assert.ok(r.action);
    assert.equal(await whoAmI(), before, 'you are still signed in to what you were');
  });

  test('the account in use cannot be thrown away by accident', async () => {
    const { forget, list } = await import('../profiles.mjs');
    const { active } = await list(tool);
    const r = await forget(tool, active);
    assert.equal(r.ok, false);
    assert.match(r.sentence, /using right now/);
    assert.ok(r.action);
  });

  test('an account you are not using can be thrown away', async () => {
    const { forget, list } = await import('../profiles.mjs');
    const r = await forget(tool, 'work');
    assert.equal(r.ok, true);
    assert.deepEqual((await list(tool)).profiles.map((p) => p.name), ['personal']);
  });

  test('a tool that is open is never swapped underneath', async () => {
    const { use, save } = await import('../profiles.mjs');
    const busy = { ...tool, id: 'busytool', bin: 'node', config: '.busytool' };
    await mkdir(join(homedir(), '.busytool'), { recursive: true });
    await writeFile(join(homedir(), '.busytool', 'auth.json'), '{"account":"a"}');
    await save(busy, 'a');

    const r = await use(busy, 'a');
    assert.equal(r.ok, false, 'node is running right now, so this must refuse');
    assert.match(r.sentence, /open right now/);
    assert.match(r.action, /Close/);
  });

  test('saving when you are not signed in says so, rather than saving nothing', async () => {
    const { save } = await import('../profiles.mjs');
    const unused = { id: 'unused', name: 'Unused', kind: 'cli', bin: 'x', config: '.never-signed-in' };
    const r = await save(unused, 'whatever');
    assert.equal(r.ok, false);
    assert.match(r.sentence, /not signed in/);
  });

  test('a tool we do not know the whereabouts of is honest about it', async () => {
    const { save, list } = await import('../profiles.mjs');
    const opaque = { id: 'opaque', name: 'Opaque', kind: 'app', bin: 'x' };
    const r = await save(opaque, 'x');
    assert.equal(r.ok, false);
    assert.match(r.sentence, /does not know where/);
    assert.deepEqual((await list(opaque)).profiles, []);
  });
});
