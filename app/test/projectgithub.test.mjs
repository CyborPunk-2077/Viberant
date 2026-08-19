/**
 * The Project GitHub screen, driven the way the page drives it.
 *
 * Everything here goes through the real server over the real routes, against
 * real repositories on disk. That is deliberate and it is the point of the
 * file: the suite reached eight hundred green tests while three of these were
 * broken in front of somebody, because every one of them lived in the joins —
 * between a screen and a route, between a route and what it spread over its own
 * answer, between binding a button and drawing the page again.
 *
 * The three faults held here:
 *
 *   One press of *Open on GitHub* opened one browser tab per redraw.
 *
 *   A screen showing one project could send a different project's work,
 *   because the only thing that knew which was which was a variable that the
 *   answer arriving late had already overwritten.
 *
 *   A send reported success while the copy on GitHub stayed empty.
 *
 * No account is connected here, so nothing reaches GitHub: the destination is a
 * repository on this disk, which exercises the whole route, the whole decision
 * and a real send. The paths that need an account are held in `gitpush`.
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const run = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const SERVER = join(here, '..', 'server.mjs');
const PORT = 7809;
const at = (p) => `http://127.0.0.1:${PORT}${p}`;
const settle = (ms) => new Promise((r) => setTimeout(r, ms));

const get = async (p) => (await fetch(at(p))).json();
const post = async (p, body) => (await fetch(at(p), {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body ?? {}),
})).json();

let root, house, server, alpha, beta, alphaAway, betaAway;

/** A project with a history and, if given, somewhere of its own to send to. */
async function projectAt(name, { remote = null, files = { 'a.txt': 'one\n' } } = {}) {
  const dir = join(root, 'work', name);
  await mkdir(dir, { recursive: true });
  for (const [f, body] of Object.entries(files)) await writeFile(join(dir, f), body);
  const git = (...a) => run('git', a, { cwd: dir });
  await git('init', '--quiet', '--initial-branch=main');
  await git('config', 'user.email', 'p@example.com');
  await git('config', 'user.name', 'A Person');
  await git('add', '--all');
  await git('commit', '--quiet', '-m', 'first');
  if (remote) await git('remote', 'add', 'origin', remote);
  return dir;
}

/** Somewhere for a project to send to, on this disk. */
async function somewhere(name) {
  const bare = join(root, 'away', `${name}.git`);
  await mkdir(join(root, 'away'), { recursive: true });
  await run('git', ['init', '--bare', '--quiet', '--initial-branch=main', bare]);
  return bare;
}

const headOf = async (dir) => (await run('git', ['rev-parse', 'HEAD'], { cwd: dir })).stdout.trim();
const remoteHead = async (bare, branch = 'main') =>
  (await run('git', ['rev-parse', branch], { cwd: bare })).stdout.trim();

before(async () => {
  root = await mkdtemp(join(tmpdir(), 'viberant-pgh-'));
  house = join(root, 'home');
  await mkdir(house, { recursive: true });
  await mkdir(join(root, 'work'), { recursive: true });

  alphaAway = await somewhere('alpha');
  betaAway = await somewhere('beta');
  alpha = await projectAt('Alpha', { remote: alphaAway, files: { 'alpha.txt': 'alpha\n' } });
  beta = await projectAt('Beta', { remote: betaAway, files: { 'beta.txt': 'beta\n' } });

  server = spawn(process.execPath, [SERVER], {
    env: { ...process.env, HOME: house, USERPROFILE: house, PORT: String(PORT) },
    stdio: 'ignore',
  });
  for (let i = 0; i < 120; i++) {
    try { await get('/projects'); break; } catch { await settle(100); }
  }
});

after(async () => {
  server?.kill();
  await settle(300);
  await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
});

// ---------------------------------------------------------------------------

describe('the GitHub state on a project screen is that project s', () => {
  test('opening one project answers about that project, and only that one', async () => {
    await post('/open', { path: alpha });
    const one = await get('/project/destination');
    assert.equal(one.binding.localRoot.toLowerCase(), alpha.toLowerCase());
    assert.equal(one.binding.remote, alphaAway);

    await post('/open', { path: beta });
    const two = await get('/project/destination');
    assert.equal(two.binding.localRoot.toLowerCase(), beta.toLowerCase(),
      'the screen for one project was answering with another project s destination');
    assert.equal(two.binding.remote, betaAway);
  });

  test('and switching back and forth leaves nothing of the other behind', async () => {
    for (let i = 0; i < 4; i += 1) {
      await post('/open', { path: alpha });
      const a = await get('/project/destination');
      const aBinding = await get(`/project/binding?path=${encodeURIComponent(alpha)}`);
      assert.equal(a.binding.remote, alphaAway, `round ${i}: destination came from the other project`);
      assert.equal(aBinding.remote, alphaAway, `round ${i}: the card came from the other project`);

      await post('/open', { path: beta });
      const b = await get('/project/destination');
      const bBinding = await get(`/project/binding?path=${encodeURIComponent(beta)}`);
      assert.equal(b.binding.remote, betaAway, `round ${i}: destination came from the other project`);
      assert.equal(bBinding.remote, betaAway, `round ${i}: the card came from the other project`);
    }
  });

  /**
   * The fault the user saw, at the one boundary that can catch it.
   *
   * A page drawn for one project, left open while another is opened, and then
   * pressed. Nothing inside the page can tell that has happened — so the press
   * carries the project it was drawn for, and the manager refuses when that is
   * not the project it has open. Without this, the press sends whatever is open
   * now, under the name of whatever is on screen.
   */
  test('a press from a screen drawn for another project is refused, not obeyed', async () => {
    await post('/open', { path: beta });
    const stale = await post('/publish', { message: 'from a stale screen', dir: alpha });

    assert.equal(stale.ok, false, 'one project s screen sent another project s work');
    assert.match(stale.sentence, /Beta/);
    assert.ok(stale.action);

    // And nothing moved on either side.
    await assert.rejects(() => remoteHead(betaAway), 'work was sent by a press that should have been refused');
  });
});

describe('a send is only a send when the copy really has it', () => {
  test('sending puts this exact save on the other end', async () => {
    await post('/open', { path: alpha });
    await writeFile(join(alpha, 'more.txt'), 'more\n');

    const out = await post('/publish', { message: 'Added more', dir: alpha });
    assert.equal(out.ok, true, out.sentence);
    assert.equal(out.sent, true);
    assert.equal(out.saved, true);

    const mine = await headOf(alpha);
    assert.equal(out.at, mine, 'the answer did not say which save went');
    assert.equal(await remoteHead(alphaAway), mine,
      'it reported a send while the copy held something else');
  });

  test('with nothing new, it says so rather than claiming a save it did not make', async () => {
    await post('/open', { path: alpha });
    const out = await post('/publish', { message: 'nothing at all', dir: alpha });
    assert.equal(out.ok, true, out.sentence);
    assert.equal(out.saved, false,
      'it claimed to have saved something when there was nothing to save');
    assert.equal(out.sent, true);
  });

  /**
   * The answer says what happened. How things stand is underneath it.
   *
   * `GET /project` was spread over the top of the result and carries a field of
   * the same name, so "nothing was saved" came back as the words "Saved a
   * moment ago" — a string, where the page expected a yes or a no. Any future
   * field of the same name would have turned a refusal into a success the same
   * way, silently.
   */
  test('the state of the screen never writes over what happened', async () => {
    await post('/open', { path: alpha });
    const out = await post('/publish', { message: 'nothing at all', dir: alpha });
    assert.equal(typeof out.saved, 'boolean', `saved came back as ${JSON.stringify(out.saved)}`);
    assert.equal(typeof out.sent, 'boolean');
    assert.equal(typeof out.ok, 'boolean');
    assert.ok('situation' in out, 'and the screen still gets its picture');
  });

  test('a send that cannot reach the other end is a failure, never up to date', async () => {
    const gone = join(root, 'away', 'vanished.git');
    const orphan = await projectAt('Orphan', { remote: gone, files: { 'o.txt': 'o\n' } });
    await post('/open', { path: orphan });
    await writeFile(join(orphan, 'o.txt'), 'changed\n');

    const out = await post('/publish', { message: 'will not reach', dir: orphan });
    assert.equal(out.ok, false, 'a send to nowhere reported success');
    assert.equal(out.sent, false);
    assert.ok(out.sentence && out.action);
    assert.match(out.sentence, /Saved here/, 'and it still says what did happen');
  });
});

describe('which line a project is on is read, never assumed', () => {
  test('a project on its own line is sent on that line', async () => {
    const away = await somewhere('elsewhere');
    const dir = join(root, 'work', 'OnMaster');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'm.txt'), 'm\n');
    const git = (...a) => run('git', a, { cwd: dir });
    await git('init', '--quiet', '--initial-branch=master');
    await git('config', 'user.email', 'p@example.com');
    await git('config', 'user.name', 'A Person');
    await git('add', '--all');
    await git('commit', '--quiet', '-m', 'first');
    await git('remote', 'add', 'origin', away);

    await post('/open', { path: dir });
    const out = await post('/publish', { message: 'on its own line', dir });
    assert.equal(out.ok, true, out.sentence);
    assert.equal(out.branch, 'master', 'it sent on a line the project is not on');
    assert.equal(await remoteHead(away, 'master'), await headOf(dir));
  });

  /**
   * Parked on one point of its own history, which is a real state people reach
   * by looking at something older and forgetting.
   *
   * The old shape read the line as the word every tool uses for "no line" and
   * sent *that*, which makes a line of that name on the other end — a mess
   * nobody asked for and few would know how to undo. It is refused by name now,
   * and the check that matters is what is not on the far end afterwards.
   */
  test('a project parked on one point of its history is refused, not sent somewhere', async () => {
    const away = await somewhere('parked');
    const dir = await projectAt('Parked', { remote: away, files: { 'p.txt': 'one\n' } });
    await writeFile(join(dir, 'p.txt'), 'two\n');
    await run('git', ['add', '--all'], { cwd: dir });
    await run('git', ['commit', '--quiet', '-m', 'second'], { cwd: dir });
    await run('git', ['checkout', '--quiet', 'HEAD~1'], { cwd: dir });

    await post('/open', { path: dir });
    const out = await post('/publish', { message: 'from nowhere in particular', dir });
    assert.equal(out.ok, false, 'it sent from a project that is not on a line');
    assert.equal(out.sent, false);
    assert.match(out.sentence, /on a line/, 'it failed for some other reason than the real one');
    assert.ok(out.action);

    const there = (await run('git', ['for-each-ref', '--format=%(refname)'], { cwd: away })).stdout;
    assert.equal(there.trim(), '', 'it wrote a line onto the far end that nobody asked for');
  });

  test('a project with nothing saved in it yet is told so, not handed a refusal from Git', async () => {
    const away = await somewhere('unborn');
    const dir = join(root, 'work', 'Unborn');
    await mkdir(dir, { recursive: true });
    await run('git', ['init', '--quiet', '--initial-branch=main'], { cwd: dir });
    await run('git', ['config', 'user.email', 'p@example.com'], { cwd: dir });
    await run('git', ['config', 'user.name', 'A Person'], { cwd: dir });
    await run('git', ['remote', 'add', 'origin', away], { cwd: dir });

    await post('/open', { path: dir });
    const out = await post('/publish', { message: 'nothing here', dir });
    assert.equal(out.ok, false);
    assert.equal(out.sent, false);
    assert.match(out.sentence, /nothing saved in this project yet/,
      'an empty project produced whatever Git happened to say instead of a sentence');
  });
});

describe('one press is one errand, however many times the page was drawn', () => {
  /**
   * The real fault, held against the real function.
   *
   * Node has an `EventTarget` of its own, so the rule this file exists for can
   * be proved without a browser: bind the same action twenty times, the way
   * twenty redraws of one screen do, and one press must still be one errand.
   */
  test('binding the same action again replaces it rather than adding to it', async () => {
    const { bindTo, boundCount } = await import('../ui/bind.js');
    const button = new EventTarget();

    let opened = 0;
    for (let drawn = 0; drawn < 20; drawn += 1) {
      bindTo(button, 'click', () => { opened += 1; });
    }
    assert.equal(boundCount(button, 'click'), 1);

    button.dispatchEvent(new Event('click'));
    assert.equal(opened, 1,
      `one press opened ${opened} times — one per time the page had been drawn`);

    button.dispatchEvent(new Event('click'));
    button.dispatchEvent(new Event('click'));
    assert.equal(opened, 3, 'and every later press is still exactly one');
  });

  test('two kinds of event on one thing do not push each other off', () => {
    return import('../ui/bind.js').then(({ bindTo }) => {
      const box = new EventTarget();
      let clicked = 0; let typed = 0;
      bindTo(box, 'click', () => { clicked += 1; });
      bindTo(box, 'keydown', () => { typed += 1; });
      bindTo(box, 'click', () => { clicked += 1; });

      box.dispatchEvent(new Event('click'));
      box.dispatchEvent(new Event('keydown'));
      assert.equal(clicked, 1);
      assert.equal(typed, 1);
    });
  });

  test('nothing to bind to is not an error', async () => {
    const { bindTo } = await import('../ui/bind.js');
    assert.equal(bindTo(null, 'click', () => {}), null);
  });

  /**
   * And the page may not go back to binding the unsafe way.
   *
   * Writing an identical page is skipped, so the elements survive it — every
   * screen in this file binds over elements that may already be bound. One
   * `addEventListener` on an element is one press becoming two.
   */
  test('no screen binds to an element the way that accumulates', async () => {
    const text = await readFile(join(here, '..', 'ui', 'app.js'), 'utf8');
    const offences = [];
    for (const line of text.split(/\r?\n/)) {
      // Listeners on the window itself are attached once, when the file loads,
      // and two different ones of the same kind are meant to live together.
      if (/^\s*addEventListener\(/.test(line)) continue;
      if (/\.addEventListener\(/.test(line) && !/^\s*\*/.test(line)) offences.push(line.trim().slice(0, 90));
    }
    assert.deepEqual(offences, [],
      'an element-level listener is back, and it will stack up one per redraw');
  });
});
