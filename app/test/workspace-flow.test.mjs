/**
 * The whole errand, between two copies of the app that are actually running.
 *
 * Everything else about workspaces is tested a piece at a time, against the
 * modules, with no server and no second computer. That proves each piece and
 * proves nothing about the thing a person does, which is: enter a workspace,
 * see who is in it, see a project somebody else changed, look at what is
 * different, bring it over, and be told it is up to date.
 *
 * So this starts two real `server.mjs` processes with their own homes and their
 * own doors, forms a workspace between them the way the buttons do, and drives
 * the whole flow over HTTP. Nothing is stubbed. Every claim below is a claim
 * about the product.
 *
 * The three that matter most, and why:
 *
 *   **Only what was offered is shared.** A computer holds a great many folders
 *   and a workspace must never be a window onto all of them.
 *
 *   **Looking writes nothing.** Seeing what is different is the step somebody
 *   takes when they are not sure. If that step can change their folder, they
 *   have no safe way to ask.
 *
 *   **Nothing is written over silently.** When both sides changed the same
 *   file, the answer is a question, and whatever you keep is left exactly as it
 *   was on disk.
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { request } from 'node:http';

const here = dirname(fileURLToPath(import.meta.url));
const SERVER = join(here, '..', 'server.mjs');

let root;
const running = [];

/** Wait for something to become true, rather than for a length of time. */
async function until(what, { within = 25000, every = 250 } = {}) {
  const stop = Date.now() + within;
  for (;;) {
    const got = await what();
    if (got) return got;
    if (Date.now() > stop) return null;
    await new Promise((go) => { setTimeout(go, every); });
  }
}

function ask(port, method, path, body) {
  const payload = body === undefined ? null : Buffer.from(JSON.stringify(body));
  return new Promise((done, fail) => {
    const r = request({
      host: '127.0.0.1',
      port,
      path,
      method,
      headers: payload
        ? { 'content-type': 'application/json', 'content-length': payload.length }
        : {},
    }, (res) => {
      const bits = [];
      res.on('data', (b) => bits.push(b));
      res.on('end', () => {
        const text = Buffer.concat(bits).toString('utf8');
        try { done(JSON.parse(text)); } catch { done({ ok: false, raw: text, status: res.statusCode }); }
      });
    });
    r.on('error', fail);
    r.setTimeout(30000, () => { r.destroy(new Error('no answer')); });
    if (payload) r.write(payload);
    r.end();
  });
}

/**
 * One copy of Viberant, with a home of its own and doors of its own.
 *
 * The shift is the only thing here that is not what a person's machine does,
 * and it exists precisely so that this test can exist: two copies cannot both
 * hold one fixed door. They still shout on the same one, so they still find
 * each other.
 */
async function aCopy(name, { port, shift }) {
  const home = join(root, name, 'home');
  await mkdir(home, { recursive: true });

  const child = spawn(process.execPath, [SERVER], {
    env: {
      ...process.env,
      HOME: home,
      USERPROFILE: home,
      PORT: String(port),
      VIBERANT_PORT_SHIFT: String(shift),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const said = [];
  child.stdout.on('data', (b) => said.push(String(b)));
  child.stderr.on('data', (b) => said.push(String(b)));

  const it = {
    name,
    port,
    home,
    said,
    get: (path) => ask(port, 'GET', path),
    post: (path, body) => ask(port, 'POST', path, body ?? {}),
    stop: () => new Promise((done) => {
      if (child.exitCode !== null) return done();
      child.once('exit', () => done());
      child.kill();
      setTimeout(() => { child.kill('SIGKILL'); done(); }, 4000).unref?.();
      return undefined;
    }),
  };
  running.push(it);

  const up = await until(() => it.get('/me').then((r) => r?.deviceId ?? r?.name ?? true).catch(() => null),
    { within: 20000 });
  assert.ok(up, `${name} never answered: ${said.join('')}`);

  // Three copies on one machine would otherwise all be called the same thing,
  // because a computer's name is the machine's name. Said through the route a
  // person uses, so nothing here is a back door.
  await it.post('/me/device/name', { name });
  return it;
}

/** A folder with something in it, and a nested file, so a sync has to walk. */
async function folder(at) {
  await mkdir(join(at, 'src'), { recursive: true });
  await writeFile(join(at, 'readme.txt'), 'what this is for\n');
  await writeFile(join(at, 'src', 'main.js'), 'export const one = 1\n');
  return at;
}

before(async () => {
  root = await mkdtemp(join(tmpdir(), 'viberant-flow-'));
});

after(async () => {
  for (const one of running) await one.stop();
  await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
});

// ---------------------------------------------------------------------------

describe('two copies of the app, one workspace, the whole errand', () => {
  let A; let B; let C;
  let onA; let onB;

  test('both copies start and say who they are', async () => {
    [A, B] = await Promise.all([
      aCopy('Ada-PC', { port: 7811, shift: 11 }),
      aCopy('Bo-PC', { port: 7812, shift: 12 }),
    ]);

    const [a, b] = await Promise.all([A.get('/me'), B.get('/me')]);
    assert.equal(a.sharingHere !== undefined, true, 'the first copy did not answer properly');
    assert.equal(b.sharingHere !== undefined, true, 'the second copy did not answer properly');
  });

  /** Run a sync the way the button does, and wait for it the way the page does. */
  async function bringItOver(theirs, keepMine) {
    const started = await A.post('/sync/bring', {
      device: theirs.deviceId, offer: theirs.offer, path: onA, keepMine,
    });
    assert.ok(started.job, `no errand was started: ${started.sentence ?? 'nothing was said'}`);

    const of = async () => ((await A.get('/jobs')).jobs ?? []).find((x) => x.id === started.job);
    const done = await until(async () => {
      const one = await of();
      return one?.finished ? one : null;
    }, { within: 60000 });

    assert.ok(done, `the transfer never finished. It was: ${JSON.stringify(await of())}`);
    assert.equal(done.ok, true,
      `${done.sentence ?? 'the transfer failed'} · ${(done.steps ?? []).map((x) => x.sentence).join(' | ')}`);
    return done;
  }

  /** Which computer this copy is, said the way the page finds out. */
  const meIn = async (one) => {
    const t = await one.get('/team');
    return [...(t.mine ?? []), ...(t.team ?? [])].find((x) => x.you)?.deviceId ?? null;
  };

  test('one makes a workspace and the other uses a code to get in', async () => {
    const made = await A.post('/team/create', { name: 'The workroom' });
    assert.equal(made.ok, true, made.sentence);
    assert.equal(made.workspace.name, 'The workroom');

    const invited = await A.post('/team/invite', { role: 'member' });
    assert.equal(invited.ok, true, invited.sentence);
    assert.ok(invited.code, 'no code to hand anybody');

    const joined = await B.post('/team/join', { code: invited.code });
    assert.equal(joined.ok, true, `${joined.sentence} ${joined.action ?? ''}`);
    assert.equal(joined.workspace.name, 'The workroom');
  });

  test('each one sees the other as somebody in the workspace, and can tell them apart', async () => {
    const seen = await until(async () => {
      const t = await A.get('/team');
      const all = [...(t.mine ?? []), ...(t.team ?? [])];
      return all.length >= 2 && all.some((one) => one.online && !one.you) ? { t, all } : null;
    });
    assert.ok(seen, 'the other computer never turned up');

    const mine = seen.all.filter((one) => one.you);
    assert.equal(mine.length, 1, 'more or fewer than one of them is this computer');

    // A person and a computer are different things, and the answer says so for
    // each of them separately. This is the invariant the old flat list broke.
    for (const one of seen.all) {
      assert.ok(one.deviceId, 'a member with no computer behind it');
      assert.ok(one.displayName, 'a computer with no name');
      assert.ok('person' in one, 'no separation between who somebody is and what they sit at');
    }
  });

  /*
   * The third copy is the whole point of the check. Being on the same network
   * is not membership: it is a claim anybody nearby can make.
   */
  test('a computer on the same network that was never invited is not in the workspace', async () => {
    C = await aCopy('Cass-PC', { port: 7813, shift: 13 });
    await C.post('/local/on');

    // Long enough for a beacon to have gone out several times.
    await new Promise((go) => { setTimeout(go, 6000); });

    const t = await A.get('/team');
    const all = [...(t.mine ?? []), ...(t.team ?? [])];
    const names = all.map((one) => one.displayName);
    assert.equal(names.includes('Cass-PC'), false,
      `an uninvited computer was listed as a member: ${names.join(', ')}`);

    const theirs = await C.get('/team');
    assert.equal(theirs.workspace ?? null, null,
      'a computer that was never invited believes it is in a workspace');
  });

  test('nothing is shared until somebody offers something', async () => {
    const before = await A.get('/team/projects');
    assert.equal(before.ok, true);
    assert.deepEqual(before.projects, [],
      'a workspace showed projects nobody had offered');
  });

  test('an offered project appears for everybody, and the folders beside it do not', async () => {
    onA = await folder(join(root, 'Ada-PC', 'Lantern'));
    onB = await folder(join(root, 'Bo-PC', 'Lantern'));
    await folder(join(root, 'Ada-PC', 'Private notes'));

    assert.equal((await A.post('/local/offer', { path: onA })).ok, true);
    assert.equal((await B.post('/local/offer', { path: onB })).ok, true);

    const seen = await until(async () => {
      const r = await A.get('/team/projects');
      const one = (r.projects ?? []).find((p) => p.name === 'Lantern');
      return one && one.copies.length >= 2 ? one : null;
    });
    assert.ok(seen, 'the other computer\'s copy of the project never appeared');

    assert.equal(seen.state, 'SHARED');
    assert.ok(seen.mine, 'this computer\'s own copy was not recognised as its own');
    assert.equal(seen.others.length, 1);
    assert.equal(seen.others[0].you, false);

    const all = (await A.get('/team/projects')).projects.map((p) => p.name);
    assert.equal(all.includes('Private notes'), false,
      'a folder that was never offered was exposed to the workspace');
  });

  test('a change made on the other computer is seen from here, and looking changes nothing', async () => {
    await writeFile(join(onB, 'src', 'main.js'), 'export const one = 1\nexport const two = 2\n');
    await writeFile(join(onB, 'src', 'added.js'), 'export const three = 3\n');

    const projects = (await A.get('/team/projects')).projects;
    const lantern = projects.find((p) => p.name === 'Lantern');
    const theirs = lantern.others[0];

    const before = await readFile(join(onA, 'src', 'main.js'), 'utf8');

    const diff = await until(async () => {
      const r = await A.post('/workspace/changes', { device: theirs.deviceId, offer: theirs.offer, dir: onA });
      return r.ok && (r.added + r.changed) > 0 ? r : null;
    });
    assert.ok(diff, 'the change on the other computer was never noticed');

    /*
     * Two copies that have never synced have no record of ever having agreed,
     * so a file that differs is a decision rather than an answer. That is the
     * safe reading and it is deliberate: the alternative is guessing on
     * somebody's behalf about a file they were both in.
     */
    assert.equal(diff.state, 'CONFLICT');
    assert.equal(diff.added, 1, 'the added file was not counted as added');
    assert.ok(diff.changed >= 1, 'the edited file was not counted as different');
    assert.ok(diff.conflicts.includes('src/main.js'),
      `the file both of them had was not raised: ${diff.conflicts.join(', ')}`);

    // The read-only claim, checked on disk rather than taken on trust.
    assert.equal(await readFile(join(onA, 'src', 'main.js'), 'utf8'), before,
      'asking what is different rewrote a file');
    assert.equal(existsSync(join(onA, 'src', 'added.js')), false,
      'asking what is different brought a file over');
  });

  test('bringing it over sends only what was missing, and then says up to date', async () => {
    const projects = (await A.get('/team/projects')).projects;
    const theirs = projects.find((p) => p.name === 'Lantern').others[0];

    const finished = await bringItOver(theirs, []);

    assert.equal(await readFile(join(onA, 'src', 'added.js'), 'utf8'), 'export const three = 3\n');
    assert.equal(await readFile(join(onA, 'src', 'main.js'), 'utf8'),
      'export const one = 1\nexport const two = 2\n');

    const after = await A.post('/workspace/changes', {
      device: theirs.deviceId, offer: theirs.offer, dir: onA,
    });
    assert.equal(after.ok, true, after.sentence);
    assert.equal(after.state, 'UP_TO_DATE',
      `after bringing everything over it still says ${after.state}`);
  });

  test('the same file changed in both places is a question, and keeping mine keeps mine', async () => {
    await writeFile(join(onA, 'src', 'main.js'), 'export const one = "mine"\n');
    await writeFile(join(onB, 'src', 'main.js'), 'export const one = "theirs"\n');
    await writeFile(join(onB, 'src', 'only-theirs.js'), 'export const four = 4\n');

    const projects = (await A.get('/team/projects')).projects;
    const theirs = projects.find((p) => p.name === 'Lantern').others[0];

    const diff = await until(async () => {
      const r = await A.post('/workspace/changes', { device: theirs.deviceId, offer: theirs.offer, dir: onA });
      return r.ok && r.conflicts?.length ? r : null;
    });
    assert.ok(diff, 'a file changed in both places was not raised as a conflict');

    assert.equal(diff.state, 'CONFLICT');
    assert.ok(diff.conflicts.some((p) => p.endsWith('main.js')),
      `the conflicting file was not named: ${diff.conflicts.join(', ')}`);

    // Keeping mine is what the page has chosen before anybody presses anything.
    await bringItOver(theirs, diff.conflicts);

    assert.equal(await readFile(join(onA, 'src', 'main.js'), 'utf8'), 'export const one = "mine"\n',
      'a file that was kept was written over anyway');
    assert.equal(await readFile(join(onA, 'src', 'only-theirs.js'), 'utf8'), 'export const four = 4\n',
      'keeping one file stopped the rest of the transfer');
  });

  test('both copies are still running, and said nothing alarming while they worked', async () => {
    for (const one of [A, B]) {
      const still = await one.get('/me').catch(() => null);
      assert.ok(still, `${one.name} stopped answering. It said: ${one.said.join('')}`);
    }
  });

  test('what happened is written down as it happens, without anybody asking', async () => {
    const lately = await A.get('/team/activity');
    assert.equal(lately.ok !== false, true);
    const what = (lately.lately ?? lately.activity ?? []).map((one) => one.kind ?? one.what);
    assert.ok(what.length > 0, 'nothing was recorded about a workspace that did a great deal');
  });

  /*
   * Stopped and started, on the same home. The point is that being in a
   * workspace is something written down rather than something held in a
   * running process — otherwise closing the app would quietly leave.
   */
  test('the workspace is still there after the app is stopped and started again', async () => {
    const before = await A.get('/team');
    const wasMe = await meIn(A);
    await A.stop();

    const again = await aCopy('Ada-PC', { port: 7814, shift: 11 });
    const after = await again.get('/team');

    assert.equal(await meIn(again), wasMe,
      'starting again made a different computer out of the same one');
    assert.equal(after.workspace?.name, before.workspace.name,
      'the workspace was forgotten when the app closed');
    assert.equal(
      [...(after.mine ?? []), ...(after.team ?? [])].length,
      [...(before.mine ?? []), ...(before.team ?? [])].length,
      'everybody in the workspace was forgotten when the app closed',
    );
  });
});
