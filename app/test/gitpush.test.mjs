/**
 * The one button, and the one decision behind it.
 *
 * Every fault this file exists for is the same shape: **the account named in
 * Viberant was not the account the work went to.** It happened four ways, and
 * all four are held here.
 *
 *   A project taken from somebody else kept their address, and pressing send
 *   aimed at them rather than at you.
 *
 *   A name already in use was quietly turned into a second name nobody was
 *   shown, so somebody's project appeared somewhere they could not predict.
 *
 *   This computer's own password store answered before Viberant could, with
 *   whoever was last signed in to it.
 *
 *   A held answer about who you are outlived the account it was about, so a
 *   switch followed straight away by a send used the account before it.
 *
 * Nothing here reaches GitHub. GitHub is stood in for by a set of real
 * repositories on disk and one function answering the questions the manager
 * asks over the network — so what is proved is the deciding *and* the sending,
 * against real histories, with no network and nothing to clean up afterwards.
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { platform } from 'node:process';

const run = promisify(execFile);
const WINDOWS = platform === 'win32';
const forward = (p) => String(p).replaceAll('\\', '/');

let root, house, over, work, github, signin, gitRuntime, world, realFetch;

// ---------------------------------------------------------------------------
// A GitHub that is entirely on this computer
// ---------------------------------------------------------------------------

/** What one ask over the network comes back as. */
const answer = (status, body) => ({
  ok: status < 400,
  status,
  headers: new Map(),
  text: async () => JSON.stringify(body ?? null),
});

/**
 * The far end: which key belongs to which account, and what is on each.
 *
 * A key is what decides who is asking, exactly as it does at the real far end.
 * That is the whole point of the stand-in — an ask carrying the wrong account's
 * key answers as the wrong account, so nothing here can pass by accident.
 */
function pretendGitHub() {
  const state = { keys: new Map(), projects: new Map(), made: [] };

  globalThis.fetch = async (where, options = {}) => {
    const address = String(where);
    const method = String(options.method ?? 'GET').toUpperCase();
    const carried = String(options.headers?.authorization ?? '').replace(/^Bearer\s+/i, '');
    const asking = state.keys.get(carried) ?? null;
    if (!asking) return answer(401, { message: 'Bad credentials' });

    if (/\/user$/.test(address)) return answer(200, { login: asking, id: asking.length });

    if (/\/user\/repos$/.test(address) && method === 'POST') {
      const asked = JSON.parse(String(options.body ?? '{}'));
      const key = `${asking}/${asked.name}`.toLowerCase();
      if (state.projects.has(key)) return answer(422, { message: 'name already exists on this account' });
      await bareAt(asking, asked.name);
      state.projects.set(key, { owner: asking, name: asked.name, size: 0, private: asked.private !== false, writers: [] });
      state.made.push(`${asking}/${asked.name}`);
      return answer(201, {
        name: asked.name, owner: { login: asking },
        clone_url: `https://github.com/${asking}/${asked.name}.git`,
      });
    }

    const looked = address.match(/\/repos\/([^/?]+)\/([^/?]+)$/);
    if (looked && method === 'GET') {
      const held = state.projects.get(`${looked[1]}/${looked[2]}`.toLowerCase());
      if (!held) return answer(404, { message: 'Not Found' });
      const may = held.owner.toLowerCase() === asking.toLowerCase()
        || (held.writers ?? []).some((one) => one.toLowerCase() === asking.toLowerCase());
      // Private and not yours reads as absent, which is what the real one does.
      if (held.private && !may) return answer(404, { message: 'Not Found' });
      return answer(200, {
        name: held.name,
        owner: { login: held.owner },
        html_url: `https://github.com/${held.owner}/${held.name}`,
        default_branch: 'main',
        size: held.size ?? 0,
        private: !!held.private,
        permissions: { admin: may, maintain: may, push: may, pull: true },
      });
    }

    return answer(404, { message: 'Not Found' });
  };

  return state;
}

/** A project on the pretend GitHub, as a real history with nothing checked out. */
async function bareAt(owner, name) {
  const at = join(over, owner, `${name}.git`);
  await mkdir(join(over, owner), { recursive: true });
  await run('git', ['init', '--bare', '--quiet', '--initial-branch=main', at]);
  return at;
}

/** The same, with work in it that came from somewhere of its own. */
async function bareHolding(owner, name, files) {
  const at = await bareAt(owner, name);
  const scratch = join(root, 'filling', `${owner}-${name}`);
  await mkdir(scratch, { recursive: true });
  for (const [file, body] of Object.entries(files)) await writeFile(join(scratch, file), body);
  const git = (...a) => run('git', a, { cwd: scratch, env: process.env });
  await git('init', '--quiet', '--initial-branch=main');
  await git('add', '--all');
  await git('commit', '--quiet', '-m', 'what was already there');
  await git('remote', 'add', 'origin', at);
  await git('push', '--quiet', 'origin', 'main');
  return at;
}

/** A folder on this computer with a history and, if given, an address. */
async function projectAt(name, { remote = null, files = { 'a.txt': 'work\n' } } = {}) {
  const at = join(work, name);
  await mkdir(at, { recursive: true });
  for (const [file, body] of Object.entries(files)) await writeFile(join(at, file), body);
  const git = (...a) => run('git', a, { cwd: at, env: process.env });
  await git('init', '--quiet', '--initial-branch=main');
  await git('add', '--all');
  await git('commit', '--quiet', '-m', 'first');
  if (remote) await git('remote', 'add', 'origin', remote);
  return at;
}

/** A folder with nothing in it but files. */
async function folderAt(name, files) {
  const at = join(work, name);
  await mkdir(at, { recursive: true });
  for (const [file, body] of Object.entries(files)) {
    if (file.includes('/')) await mkdir(join(at, file.split('/')[0]), { recursive: true });
    await writeFile(join(at, file), body);
  }
  return at;
}

/** Put accounts on this computer, the way a sign-in leaves them. */
async function connect(accounts, active) {
  await mkdir(join(house, '.viberant'), { recursive: true });
  await writeFile(join(house, '.viberant', 'github-accounts.json'), JSON.stringify({
    active,
    accounts: accounts.map(({ name, key }) => ({
      name, id: 1, picture: null, at: Date.now(),
      token: `plain:${Buffer.from(key, 'utf8').toString('base64')}`,
    })),
  }), 'utf8');
  github.forgetWho();
}

const remoteOf = async (at) => (await run('git', ['config', '--get', 'remote.origin.url'], { cwd: at })).stdout.trim();
const remotesOf = async (at) => (await run('git', ['remote'], { cwd: at })).stdout.trim().split('\n').filter(Boolean);
const linesOn = async (at) => (await run('git', ['log', '--format=%s'], { cwd: at })).stdout.trim().split('\n');

// ---------------------------------------------------------------------------

before(async () => {
  root = await mkdtemp(join(tmpdir(), 'viberant-push-'));
  house = join(root, 'home');
  over = join(root, 'pretend-github');
  work = join(root, 'work');
  for (const one of [house, over, work]) await mkdir(one, { recursive: true });

  process.env.USERPROFILE = house;
  process.env.HOME = house;

  /*
   * The pretend far end, reached by its real address.
   *
   * Every address the manager writes into a project is the real one, so what is
   * tested is what a person's project would actually say. Only the moment of
   * reaching out is bent, by one line of this computer's own arrangement, and
   * the address written down is unaffected by it.
   */
  const arrangement = join(root, 'gitconfig');
  await writeFile(arrangement, [
    '[user]', '\tname = A Person', '\temail = person@example.com',
    '[init]', '\tdefaultBranch = main',
    `[url "${forward(over)}/"]`, '\tinsteadOf = https://github.com/',
    '',
  ].join('\n'), 'utf8');
  process.env.GIT_CONFIG_GLOBAL = arrangement;
  process.env.GIT_CONFIG_NOSYSTEM = '1';

  realFetch = globalThis.fetch;
  world = pretendGitHub();
  world.keys.set('key-for-you', 'YouHere');
  world.keys.set('key-for-somebody', 'SomebodyElse');

  [github, signin, gitRuntime] = await Promise.all([
    import('../github.mjs'), import('../signin.mjs'), import('../git-runtime.mjs'),
  ]);
  await connect([{ name: 'YouHere', key: 'key-for-you' }], 'YouHere');
});

after(async () => {
  globalThis.fetch = realFetch;
  delete process.env.GIT_CONFIG_GLOBAL;
  delete process.env.GIT_CONFIG_NOSYSTEM;
  await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
});

// ---------------------------------------------------------------------------

describe('one press, when the project is already yours', () => {
  test('your own address is a destination, and nothing is asked', async () => {
    await bareAt('YouHere', 'ready');
    world.projects.set('youhere/ready', { owner: 'YouHere', name: 'ready', size: 0, private: true, writers: [] });
    const at = await projectAt('ready', { remote: 'https://github.com/YouHere/ready.git' });

    const going = await github.destinationFor(at, { fresh: true });
    assert.equal(going.plan, 'direct', 'a project on the account in use asked a question it should not have');
    assert.equal(going.needsName, undefined);

    await writeFile(join(at, 'b.txt'), 'more\n');
    const out = await github.saveAndSend(at, { message: 'Added the second thing' });
    assert.equal(out.ok, true, out.sentence);
    assert.equal(out.sent, true);
    assert.equal(out.where, 'YouHere/ready');
    assert.equal(await remoteOf(at), 'https://github.com/YouHere/ready.git', 'it repointed a project it had no reason to touch');
  });
});

describe('a project that came from somebody else', () => {
  test('it asks where it should go, and changes nothing until it is told', async () => {
    world.projects.set('somebodyelse/borrowed', {
      owner: 'SomebodyElse', name: 'borrowed', size: 12, private: false, writers: [],
    });
    const at = await projectAt('borrowed', { remote: 'https://github.com/SomebodyElse/borrowed.git' });

    const going = await github.destinationFor(at, { fresh: true });
    assert.equal(going.plan, 'name');
    assert.equal(going.reason, 'another-account');
    assert.equal(going.suggested, 'borrowed');

    await writeFile(join(at, 'mine.txt'), 'my work\n');
    const asked = await github.saveAndSend(at, { message: 'My own work' });
    assert.equal(asked.needsName, true, 'it decided a destination on somebody behalf');
    assert.equal(asked.sent, false);
    assert.equal(asked.saved, false, 'it changed something before it had an answer');
    assert.equal(await remoteOf(at), 'https://github.com/SomebodyElse/borrowed.git',
      'it repointed the project before anybody chose where it should go');
  });

  test('given a name, it goes to the account in use and keeps where it came from', async () => {
    const at = join(work, 'borrowed');
    const out = await github.saveAndSend(at, { message: 'My own work', name: 'borrowed-mine' });

    assert.equal(out.ok, true, out.sentence);
    assert.equal(out.sent, true);
    assert.equal(out.where, 'YouHere/borrowed-mine');
    assert.deepEqual(out.movedTo, { owner: 'YouHere', repo: 'borrowed-mine', from: 'SomebodyElse/borrowed' });

    // The two addresses a foreign project ends up with, under the names every
    // other tool expects: yours to send to, theirs kept beside it.
    assert.equal(await remoteOf(at), 'https://github.com/YouHere/borrowed-mine.git');
    assert.deepEqual((await remotesOf(at)).sort(), ['origin', 'upstream'],
      'where the work came from was thrown away to make a send succeed');
    assert.equal(
      (await run('git', ['config', '--get', 'remote.upstream.url'], { cwd: at })).stdout.trim(),
      'https://github.com/SomebodyElse/borrowed.git');
    assert.equal(world.made.includes('YouHere/borrowed-mine'), true);

    // And it arrived, in the history that stands in for the far end.
    const there = join(over, 'YouHere', 'borrowed-mine.git');
    assert.match((await run('git', ['log', '--format=%s'], { cwd: there })).stdout, /My own work/);
  });

  test('and the next press goes straight there, with nothing asked again', async () => {
    const at = join(work, 'borrowed');
    const going = await github.destinationFor(at, { fresh: true });
    assert.equal(going.plan, 'direct');

    await writeFile(join(at, 'again.txt'), 'again\n');
    const out = await github.saveAndSend(at, { message: 'Carried on' });
    assert.equal(out.sent, true, out.sentence);
    assert.equal(out.movedTo, undefined);
  });

  test('nothing was ever sent to the account it came from', async () => {
    const theirs = join(over, 'SomebodyElse');
    assert.equal(existsSync(theirs), false,
      'work belonging to the person here reached the account the project was copied from');
  });
});

describe('one brought down from the GitHub explorer', () => {
  test('after it arrives it is an ordinary project, and behaves like one', async () => {
    await bareHolding('SomebodyElse', 'explored', { 'theirs.txt': 'their work\n' });
    world.projects.set('somebodyelse/explored', {
      owner: 'SomebodyElse', name: 'explored', size: 20, private: false, writers: [],
    });

    const brought = await github.bringDown({ url: 'https://github.com/SomebodyElse/explored.git', into: work });
    assert.equal(brought.ok, true, brought.sentence);
    assert.equal(await remoteOf(brought.path), 'https://github.com/SomebodyElse/explored.git');

    const going = await github.destinationFor(brought.path, { fresh: true });
    assert.equal(going.plan, 'name', 'a project brought down from somebody else was about to be sent back at them');
    assert.equal(going.reason, 'another-account');

    await writeFile(join(brought.path, 'mine.txt'), 'what I did\n');
    const out = await github.saveAndSend(brought.path, { message: 'What I changed', name: 'explored-mine' });
    assert.equal(out.ok, true, out.sentence);
    assert.equal(out.where, 'YouHere/explored-mine');
  });
});

describe('a folder that keeps no history at all', () => {
  test('it asks for a name first, and leaves the folder exactly as it found it', async () => {
    const at = await folderAt('bare-folder', {
      'index.js': 'console.log(1)\n',
      '.gitignore': 'node_modules/\nsecret.env\n',
      'secret.env': 'KEY=do-not-send\n',
      'node_modules/thing.js': 'x\n',
    });

    const going = await github.destinationFor(at, { fresh: true });
    assert.equal(going.plan, 'name');
    assert.equal(going.reason, 'no-history');

    const asked = await github.saveAndSend(at, { message: 'First' });
    assert.equal(asked.needsName, true);
    assert.equal(existsSync(join(at, '.git')), false, 'it began keeping a history before anybody agreed to one');
  });

  test('given a name it starts one, sends it, and leaves out what should stay here', async () => {
    const at = join(work, 'bare-folder');
    const out = await github.saveAndSend(at, { message: 'First save', name: 'bare-folder' });
    assert.equal(out.ok, true, out.sentence);
    assert.equal(out.sent, true);
    assert.equal(out.where, 'YouHere/bare-folder');

    const inside = (await run('git', ['ls-tree', '-r', 'HEAD', '--name-only'], { cwd: at })).stdout;
    assert.match(inside, /index\.js/);
    assert.equal(/secret\.env/.test(inside), false, 'something the project said to keep here was sent anyway');
    assert.equal(/node_modules/.test(inside), false, 'something the project said to keep here was sent anyway');
  });
});

describe('a project with a history and nowhere to send it', () => {
  test('it asks for a name rather than choosing one out of the folder', async () => {
    const at = await projectAt('unconnected');
    const going = await github.destinationFor(at, { fresh: true });
    assert.equal(going.plan, 'name');
    assert.equal(going.reason, 'no-destination');
    assert.equal(going.suggested, 'unconnected');

    const out = await github.saveAndSend(at, { message: 'Send it', name: 'called-something-else' });
    assert.equal(out.ok, true, out.sentence);
    assert.equal(out.where, 'YouHere/called-something-else',
      'the name somebody typed was not the name it went under');
    assert.equal(await remoteOf(at), 'https://github.com/YouHere/called-something-else.git');
  });
});

describe('the account in use decides, and switching accounts changes nothing on its own', () => {
  test('a project pointed at another account is not rewritten by looking at it', async () => {
    world.projects.set('anotherofmine/shifted', {
      owner: 'AnotherOfMine', name: 'shifted', size: 8, private: true, writers: [],
    });
    const at = await projectAt('shifted', { remote: 'https://github.com/AnotherOfMine/shifted.git' });

    const going = await github.destinationFor(at, { fresh: true });
    assert.equal(going.plan, 'name');
    assert.equal(going.reason, 'another-account');
    assert.equal(await remoteOf(at), 'https://github.com/AnotherOfMine/shifted.git',
      'switching accounts rewrote a project by itself');
    assert.deepEqual(await remotesOf(at), ['origin'], 'it left something behind in the project');
  });

  test('the account named here is the account an ask to GitHub is made as', async () => {
    await connect([
      { name: 'YouHere', key: 'key-for-you' },
      { name: 'SomebodyElse', key: 'key-for-somebody' },
    ], 'YouHere');
    assert.equal((await github.session({ fresh: true })).login, 'YouHere');

    // Changed underneath, by anything at all rather than by one polite route.
    // A held answer that outlives the account it was about is the fault.
    await signin.switchTo('SomebodyElse');
    assert.equal((await github.session()).login, 'SomebodyElse',
      'the app named one account while every ask was being made as another');

    await signin.switchTo('YouHere');
    assert.equal((await github.session()).login, 'YouHere');
  });

  test('an account chosen but not here is nobody, never the next one along', async () => {
    await mkdir(join(house, '.viberant'), { recursive: true });
    await writeFile(join(house, '.viberant', 'github-accounts.json'), JSON.stringify({
      active: 'GoneFromHere',
      accounts: [{ name: 'SomebodyElse', id: 1, at: Date.now(), token: `plain:${Buffer.from('key-for-somebody').toString('base64')}` }],
    }), 'utf8');
    github.forgetWho();

    assert.equal(await signin.activeToken(), null,
      'a book in an odd state quietly sends somebody work as a different account');
    assert.equal((await signin.accounts()).active, null,
      'the screen would name an account that nothing is actually using');

    await connect([{ name: 'YouHere', key: 'key-for-you' }], 'YouHere');
  });
});

describe('a name already holding something else', () => {
  test('it is refused and another asked for, never worked around', async () => {
    await bareHolding('YouHere', 'taken', { 'unrelated.txt': 'nothing to do with it\n' });
    world.projects.set('youhere/taken', { owner: 'YouHere', name: 'taken', size: 30, private: true, writers: [] });
    const before = await linesOn(join(over, 'YouHere', 'taken.git'));

    const at = await projectAt('wants-taken', { files: { 'mine.txt': 'entirely my own\n' } });
    const out = await github.saveAndSend(at, { message: 'Mine', name: 'taken' });

    assert.equal(out.ok, false);
    assert.equal(out.sent, false);
    assert.equal(out.nameTaken, true);
    assert.equal(out.needsName, true, 'there is no way onwards from the refusal');
    assert.ok(out.sentence && out.action);

    assert.deepEqual(await linesOn(join(over, 'YouHere', 'taken.git')), before,
      'a name collision was resolved by writing over what was already there');
    assert.equal((await remotesOf(at)).includes('origin'), false,
      'it pointed the project at a destination it had just refused');
    assert.equal(world.made.includes('YouHere/taken-from-someone'), false);
  });

  test('and no second name is invented on somebody behalf', async () => {
    const invented = world.made.filter((one) => /-from-/.test(one));
    assert.deepEqual(invented, [],
      'a project was put somewhere the person was never shown and could not predict');
  });

  test('another name works, and the first is left alone', async () => {
    const at = join(work, 'wants-taken');
    const out = await github.saveAndSend(at, { message: 'Mine', name: 'taken-2' });
    assert.equal(out.ok, true, out.sentence);
    assert.equal(out.where, 'YouHere/taken-2');
  });
});

describe('a shared project this app was told to use', () => {
  /**
   * The one case where another account's address is a destination.
   *
   * A workspace agrees on one project and every member sends to it. That is a
   * choice somebody made here, written down in the project — not an address the
   * work merely arrived with. Both halves have to hold: the choice, and the
   * account in use being allowed to write to it.
   */
  test('being told to use it is what makes it a destination, not having come from it', async () => {
    await bareHolding('SomebodyElse', 'shared-work', { 'start.txt': 'ours\n' });
    world.projects.set('somebodyelse/shared-work', {
      owner: 'SomebodyElse', name: 'shared-work', size: 9, private: false, writers: ['YouHere'],
    });

    const brought = await github.bringDown({ url: 'https://github.com/SomebodyElse/shared-work.git', into: work });
    assert.equal(brought.ok, true, brought.sentence);

    // Copied, and nothing more: it asks, because nobody has chosen it yet.
    assert.equal((await github.destinationFor(brought.path, { fresh: true })).plan, 'name');

    const joined = await github.connectExisting(brought.path, { owner: 'SomebodyElse', repo: 'shared-work' });
    assert.equal(joined.ok, true, joined.sentence);

    assert.equal((await github.destinationFor(brought.path, { fresh: true })).plan, 'direct',
      'a shared project the workspace agreed on started asking where to go');
  });

  test('and it stops being one the moment this account may no longer write to it', async () => {
    const at = join(work, 'shared-work');
    world.projects.get('somebodyelse/shared-work').writers = [];

    const going = await github.destinationFor(at, { fresh: true });
    assert.equal(going.plan, 'name');
    assert.equal(going.reason, 'another-account');
  });
});

describe('this computer password store cannot choose who sends', () => {
  test('whatever it holds is taken out of the decision, for one command', async () => {
    const at = await projectAt('guarded');
    await run('git', ['config', 'credential.helper', 'manager'], { cwd: at });

    const said = (await gitRuntime.run(at, 'config', '--list')).stdout;
    const helpers = said.split('\n').filter((l) => l.startsWith('credential.helper='));
    assert.ok(helpers.length >= 2, 'the helper this computer keeps was not answered at all');
    assert.equal(helpers.at(-1), 'credential.helper=',
      'the store this computer keeps still gets asked before Viberant does, '
      + 'and answers with whoever was last signed in to it');
  });

  test('the key handed to a send is the one for the account named here', () => {
    const askpass = '/somewhere/ask';
    const mine = gitRuntime.invocation({ args: ['push'], token: 'key-for-you', askpass, connected: true });
    assert.deepEqual(mine.args, ['-c', 'credential.helper=', 'push']);
    assert.equal(mine.env.GIT_ASKPASS, askpass);
    assert.equal(mine.env.VIBERANT_GITHUB_TOKEN, 'key-for-you');
    assert.equal(mine.env.GIT_TERMINAL_PROMPT, '0');
  });

  test('a key that could not be produced falls back to nobody, never to the store', () => {
    const stuck = gitRuntime.invocation({ args: ['push'], token: null, askpass: '/somewhere/ask', connected: true });
    assert.deepEqual(stuck.args, ['-c', 'credential.helper=', 'push'],
      'no key of ours, so the computer store answers — as somebody else');
    assert.equal(stuck.env.GIT_ASKPASS, undefined);
  });

  test('and somebody with no account here keeps their own arrangement', () => {
    const theirs = gitRuntime.invocation({ args: ['fetch'], token: null, askpass: null, connected: false });
    assert.deepEqual(theirs.args, ['fetch']);
    assert.equal(theirs.env.GIT_ASKPASS, undefined);
  });

  test('the thing that answers hands back the key it was given, and nothing else', async () => {
    const askpass = gitRuntime.askpassFile();
    const env = { ...process.env, VIBERANT_GITHUB_TOKEN: 'key-for-you', VIBERANT_GITHUB_USER: 'x-access-token' };
    // Run the way the tool that asks runs it, rather than through a shell that
    // would rewrite the quoting around a folder name with spaces in it.
    const asked = async (prompt) => (WINDOWS
      ? await run(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', `""${askpass}" ${prompt}"`],
        { env, windowsVerbatimArguments: true, windowsHide: true })
      : await run(askpass, [prompt], { env })).stdout.trim();

    assert.equal(await asked('Password'), 'key-for-you');
    assert.equal(await asked('Username'), 'x-access-token');
  });
});
