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
 *
 * **The shifts are spaced twenty apart, and that is not arbitrary.** The door
 * that carries folders and the door that takes a direct connection are one
 * apart — so two copies whose shifts differ by one give the first copy's
 * direct door the same number as the second copy's carrier. One of them loses
 * the binding, and what it looks like from the outside is a computer that is
 * plainly present and cannot be reached at all. Measured: with shifts eleven
 * and twelve, the second copy could not reach the first by any of the three
 * ways; spaced out, both reach each other.
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

  const arrived = [];
  const streamSaid = [];
  let stream = null;

  const it = {
    name,
    port,
    home,
    said,
    arrived,
    streamSaid,
    /** Everything of one kind that has reached this page, oldest first. */
    heard: (kind) => arrived.filter((one) => one.kind === kind),
    closeStream: () => stream?.destroy(),
    get: (path) => ask(port, 'GET', path),
    post: (path, body) => ask(port, 'POST', path, body ?? {}),
    stop: () => new Promise((done) => {
      stream?.destroy();
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

  /**
   * The stream, listened to the way the page listens to it.
   *
   * Not a route invented for the test and not the file on disk: `/events` is
   * what the open page holds, so what arrives here is what would reach a
   * screen. It is opened once and left open, which is also the claim —
   * anything that turns up in it turned up without being asked for.
   */
  stream = request({ host: '127.0.0.1', port, path: '/events', method: 'GET' }, (res) => {
    streamSaid.push(`status ${res.statusCode}`);
    res.on('close', () => streamSaid.push('closed'));
    let held = '';
    res.on('data', (b) => {
      held += b.toString();
      for (;;) {
        const at = held.indexOf('\n');
        if (at === -1) return;
        const line = held.slice(0, at).trim();
        held = held.slice(at + 1);
        if (!line.startsWith('data:')) continue;
        try { arrived.push(JSON.parse(line.slice(5).trim())); } catch { /* a heartbeat */ }
      }
    });
  });
  stream.on('error', (e) => streamSaid.push(`error ${e.message}`));
  stream.end();



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
      aCopy('Ada-PC', { port: 7811, shift: 20 }),
      aCopy('Bo-PC', { port: 7812, shift: 40 }),
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

  /** Each of them seeing the other, which is not the same as one of them seeing. */
  const bothSee = () => until(async () => {
    const [ta, tb] = await Promise.all([A.get('/team'), B.get('/team')]);
    const sees = (t) => [...(t.mine ?? []), ...(t.team ?? [])].some((d) => !d.you && d.online);
    return sees(ta) && sees(tb) ? { ta, tb } : null;
  });

  /*
   * Both ways, deliberately. One of them seeing the other was true for a long
   * time while the reverse was not, and every test that only asked one of them
   * passed throughout.
   */
  test('each one sees the other as somebody in the workspace, and can tell them apart', async () => {
    assert.ok(await bothSee(), 'they did not both come to see each other');

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
  /**
   * A message goes both ways, and being reachable is not the same as being heard.
   *
   * **This is the test the whole flagship was missing.** Everything before it
   * passed while a computer could be seen, listed, dialled and answered by —
   * and still could not be *told* anything. The two are separate facts and only
   * the second one matters: presence is what a screen shows, delivery is what
   * makes a workspace a workspace.
   *
   * The fault it holds down: the door that decides who is welcome was hung
   * once, when the workspace was made, and closed over the member list as it
   * was at that moment. So the computer that *creates* a workspace refuses
   * every computer that joins afterwards, for as long as it stays open. It
   * could reach them; they could not reach it. Nothing said so — every list
   * was correct, every dot was green, and everything went one way.
   *
   * Both directions are required here because one direction always worked.
   */
  test('a message reaches the other computer, and it reaches back', async () => {
    assert.ok(await bothSee(), 'they cannot both see each other, so this is about presence');

    const oneWay = async (from, to, text) => {
      const out = await from.post('/workspace/say', { text });
      assert.equal(out.ok, true, out.sentence);

      /*
       * Two separate claims, and the second is the one that was never checked.
       * Saying it reached somebody is what the sender believes; the far end
       * holding it is what actually happened.
       */
      assert.equal(out.reached, 1,
        `${from.name} says it reached ${out.reached} computers rather than one. `
        + 'It can see the other one, so this is delivery rather than presence.');

      const landed = await until(
        () => {
          const got = to.heard('note').filter((one) => one.text === text);
          return got.length ? got : null;
        },
        { within: 15000 },
      );
      assert.ok(landed, `${to.name} never heard what ${from.name} said, `
        + `though ${from.name} was told it had arrived. `
        + `${to.name} has heard ${to.arrived.length} things: `
        + `${JSON.stringify(to.arrived.map((x) => x.kind))} `
        + `stream: ${JSON.stringify(to.streamSaid)}`);
      assert.equal(landed.length, 1, `${to.name} heard it ${landed.length} times`);
      return landed[0];
    };

    const there = await oneWay(A, B, 'a word from Ada');
    const back = await oneWay(B, A, 'a word from Bo');

    // Whoever it says it is from is whoever the connection was actually with,
    // not whoever the message claimed.
    assert.equal(there.fromName, 'Ada-PC');
    assert.equal(back.fromName, 'Bo-PC');
    assert.notEqual(there.id, back.id);
  });

  /*
   * Said twice, kept once. A stream that reconnects replays what it thinks was
   * missed, and both ends write the same event down.
   */
  test('and three said arrive as three, not as six', async () => {
    for (let i = 0; i < 3; i += 1) await A.post('/workspace/say', { text: 'the same words' });

    const said = await until(
      () => {
        const got = B.heard('note').filter((one) => one.text === 'the same words');
        return got.length >= 3 ? got : null;
      },
      { within: 15000 },
    );

    assert.ok(said, 'three said and fewer than three arrived');
    assert.equal(said.length, 3, `three notes arrived as ${said.length}`);
    assert.equal(new Set(said.map((one) => one.id)).size, 3,
      'the same note was written down more than once');
  });

  test('a computer on the same network that was never invited is not in the workspace', async () => {
    C = await aCopy('Cass-PC', { port: 7813, shift: 60 });
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

    // Shared, and nothing said about it yet, which is not the same as behind.
    assert.equal(seen.state, 'UP_TO_DATE');
    assert.ok(seen.mine, 'this computer\'s own copy was not recognised as its own');
    assert.equal(seen.others.length, 1);
    assert.equal(seen.others[0].you, false);

    const all = (await A.get('/team/projects')).projects.map((p) => p.name);
    assert.equal(all.includes('Private notes'), false,
      'a folder that was never offered was exposed to the workspace');
  });

  /**
   * A change becomes a summary, counted from the disk it happened on.
   *
   * "Somebody changed Viberant" is a notification. "One added, one rewritten"
   * is something a person can decide about without opening anything. The
   * numbers come from the folder held against itself two seconds earlier,
   * which is the only honest source: nothing here can know which file anybody
   * has open, and a manager that guessed would be wrong in front of somebody
   * looking at their own screen.
   *
   * Checked on the computer that made the change, because that is where the
   * counting happens. Whether the summary then reaches the other computer is a
   * separate matter and is measured separately — see the one below it.
   */
  test('a change becomes one summary, counted honestly from the disk it happened on', async () => {
    await writeFile(join(onB, 'src', 'added.js'), 'export const three = 3\n');
    await writeFile(join(onB, 'src', 'main.js'), 'export const one = 1\nexport const two = 2\n');

    const seen = await until(async () => {
      const r = await B.get('/team/projects');
      const one = (r.projects ?? []).find((p) => p.name === 'Lantern');
      const own = one?.copies?.find((c) => c.you);
      return own?.lastChanged ? { r, own } : null;
    }, { within: 40000 });
    assert.ok(seen, 'changing an offered folder produced no summary at all');

    // One added and one rewritten, from an edit that did exactly that. Nothing
    // was deleted, and nought is a fact that must not be rounded into a guess.
    assert.equal(seen.own.added, 1, 'the added file was not counted as added');
    assert.equal(seen.own.modified, 1, 'the rewritten file was not counted as rewritten');
    assert.equal(seen.own.gone, 0, 'something was reported as deleted that was not');

    assert.ok((seen.own.which ?? []).some((f) => f.endsWith('added.js')),
      `the names of what changed were not carried: ${JSON.stringify(seen.own.which)}`);
    assert.equal((seen.own.which ?? []).length <= 6, true,
      'every name was carried, which is a list rather than a summary');
  });

  /*
   * What somebody is working on, derived and never invented.
   *
   * The only honest answer available is which shared project their computer
   * last reported a change in, and when. Anything richer would need something
   * watching a screen, which is not a thing this is going to grow.
   */
  test('and what somebody is working on is derived, never invented', async () => {
    const r = await B.get('/team/projects');
    const theirs = Object.values(r.doing ?? {}).find((one) => one.device === 'Bo-PC');
    assert.ok(theirs, `nobody was reported as working on anything: ${JSON.stringify(r.doing)}`);

    assert.equal(theirs.project, 'Lantern');
    assert.ok(theirs.at > Date.now() - 120000, 'the moment given is not recent enough to be this edit');

    // Nothing anywhere in the answer claims to know about a file being open,
    // an editor, or anything that would need watching somebody work.
    const said = JSON.stringify(r);
    for (const never of [/editing/i, /has open/i, /typing/i, /cursor/i, /viewing/i]) {
      assert.equal(never.test(said), false,
        `something was invented about what somebody is doing: ${never}`);
    }
  });

  /**
   * The change crosses, on its own, and arrives as something worth reading.
   *
   * This is the flagship in one test. A folder is edited on one computer; the
   * watcher there notices it has settled, counts what moved, and says so; and
   * it turns up on the other computer's stream — the same stream an open page
   * holds — with nobody pressing anything and nothing polling for it.
   *
   * Both directions, because for a long time only one of them worked and
   * nothing said so.
   */
  const changeCrosses = async (from, to, at, project) => {
    const before = to.heard('project.changed').length;

    await writeFile(join(at, 'src', `${project}-added.js`), 'export const four = 4\n');
    await writeFile(join(at, 'src', 'main.js'), `export const one = 1 // ${project}\n`);

    const got = await until(
      () => {
        const all = to.heard('project.changed');
        return all.length > before ? all[all.length - 1] : null;
      },
      { within: 40000 },
    );

    assert.ok(got, `${to.name} was never told that ${from.name} changed anything`);
    assert.equal(got.project, 'Lantern');
    assert.equal(got.fromName, from.name,
      'the change is attributed to somebody other than the computer it came from');
    assert.equal(got.added, 1, `it says ${got.added} added rather than the one that was`);
    assert.equal(got.modified, 1, `it says ${got.modified} rewritten rather than the one that was`);
    assert.equal(got.gone, 0, 'it says something was deleted that was not');
    assert.ok((got.which ?? []).some((f) => f.endsWith(`${project}-added.js`)),
      `the names of what changed did not come with it: ${JSON.stringify(got.which)}`);
    return got;
  };

  test('a change on one computer reaches the other on its own', async () => {
    assert.ok(await bothSee(), 'they cannot both see each other');
    await changeCrosses(B, A, onB, 'fromB');
  });

  test('and the same is true the other way round', async () => {
    await changeCrosses(A, B, onA, 'fromA');
  });

  /*
   * What the screen makes of it: the project says somebody is waiting, names
   * them, and carries the counts through to what a person reads.
   */
  test('and the workspace says which project, from whom, and how much', async () => {
    const seen = await until(async () => {
      const r = await A.get('/team/projects');
      const one = (r.projects ?? []).find((p) => p.name === 'Lantern');
      return one?.waitingOn ? one : null;
    }, { within: 20000 });

    assert.ok(seen, 'the project never came to say anything was waiting');
    assert.equal(seen.state, 'CHANGES_AVAILABLE');
    assert.equal(seen.waitingOn.device, 'Bo-PC');
    assert.equal(seen.waitingOn.you, false);
    assert.ok(seen.waitingOn.added >= 1 || seen.waitingOn.modified >= 1,
      'it knows something is waiting and cannot say what');
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
    assert.ok(diff.added >= 1, 'a file only they have was not counted as one to bring over');
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

  /**
   * The screen has to end where the errand ends: up to date.
   *
   * Two separate claims, and the second is the one that was broken. The two
   * folders matching is what `/workspace/changes` answers. **What the workspace
   * says about the project** is a fold over what has been said out loud, and it
   * only settles if the finished sync was written down against the project's
   * name. It was written down against the *path* — because the name was taken
   * from whichever project happened to be open, and a sync is very often run
   * with nothing open at all. Nothing matched it, and a sync that had worked
   * perfectly left the screen saying changes were still waiting.
   */
  test('and the workspace itself then says up to date', async () => {
    const settled = await until(async () => {
      const r = await A.get('/team/projects');
      const one = (r.projects ?? []).find((p) => p.name === 'Lantern');
      return one?.state === 'UP_TO_DATE' ? { r, one } : null;
    }, { within: 30000 });

    assert.ok(settled, 'the project still says changes are waiting after they were brought over');
    assert.equal(settled.one.waitingOn, null, 'it still names somebody as waited on');
    assert.ok(settled.one.syncedAt, 'nothing was written down about the sync having happened');
    assert.equal(settled.r.needsAttention, 0, 'the workspace still says something needs attention');
  });

  /**
   * A sync landing is not somebody's work, and must not come back as work.
   *
   * The folder a sync writes into is a folder this computer is offering, so the
   * watcher notices it move — quite correctly — and would tell everybody,
   * including the computer the files just came from, which then sees changes
   * waiting from us that are its own work returning. Measured before the fix:
   * bring four files over and the far end immediately reports one added and
   * three rewritten, waiting.
   *
   * What stops it is not a window of time — a window swallows whatever somebody
   * types inside it, and typing straight after a sync is the ordinary case. The
   * baseline is moved to what the sync wrote, so the settle it causes finds
   * nothing different and says nothing, while the next real edit is still
   * counted from there.
   */
  test('and what the sync wrote does not come back as somebody changing it', async () => {
    const quiet = await until(async () => {
      const r = await B.get('/team/projects');
      const one = (r.projects ?? []).find((p) => p.name === 'Lantern');
      const ours = (one?.copies ?? []).find((c) => !c.you && c.waiting);
      return ours ? { bad: ours } : { ok: true };
    }, { within: 12000, every: 1500 });

    assert.ok(quiet?.ok !== undefined || !quiet?.bad,
      `${quiet?.bad?.device} is reported as having changes waiting, which is the sync `
      + 'that just landed there coming back as work');
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

    const again = await aCopy('Ada-PC', { port: 7814, shift: 20 });
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
