/**
 * A sync between two real computers, and the rest of the test matrix.
 *
 * The parts of the matrix that can honestly happen on one machine: a sync
 * across a relay between two processes with two identities; a transfer
 * interrupted by the app *stopping* rather than by the wire going; several
 * errands at once; and a project whose names are as long as a filesystem will
 * take.
 *
 * The claim worth proving here is the last step of a sync, which nothing else
 * proves: **the folder that results is the project.** Everything before it
 * checks that what was promised arrived. A sync is the only operation that
 * deliberately does not send everything, so it is the only one where the stream
 * can be perfect and the folder still wrong.
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, writeFile, readFile, readdir, utimes, cp } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { fork } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const APP = join(here, '..');

let root, relayRunning, relayPort;
let peers, relayModule, parcel, syncing, channelsOf, snapshots;

async function everythingIn(at, prefix = '') {
  const out = new Map();
  for (const e of await readdir(at, { withFileTypes: true })) {
    const named = prefix ? `${prefix}/${e.name}` : e.name;
    if (e.isDirectory()) for (const [k, v] of await everythingIn(join(at, e.name), named)) out.set(k, v);
    else out.set(named, await readFile(join(at, e.name)));
  }
  return out;
}

function anotherComputer(home) {
  const child = fork(join(APP, 'test', 'helpers', 'a-computer.mjs'), [], {
    env: { ...process.env, USERPROFILE: home, HOME: home },
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });
  const answers = new Map();
  let n = 0;
  child.on('message', (m) => {
    const waiting = answers.get(m.id);
    if (waiting) { answers.delete(m.id); waiting(m); }
  });
  return {
    ask(what, body = {}) {
      const id = (n += 1);
      return new Promise((done) => {
        answers.set(id, done);
        child.send({ id, what, ...body });
        setTimeout(() => {
          if (answers.has(id)) { answers.delete(id); done({ ok: false, why: 'no answer' }); }
        }, 30000);
      });
    },
    stop() { child.kill(); },
  };
}

before(async () => {
  root = await mkdtemp(join(tmpdir(), 'viberant-across-'));
  await mkdir(join(root, 'home-a'), { recursive: true });
  await mkdir(join(root, 'home-b'), { recursive: true });
  process.env.USERPROFILE = join(root, 'home-a');
  process.env.HOME = join(root, 'home-a');

  peers = await import('../peers.mjs');
  relayModule = await import('../relay.mjs');
  parcel = await import('../parcel.mjs');
  syncing = await import('../sync.mjs');
  channelsOf = await import('../channels.mjs');
  snapshots = await import('../snapshots.mjs');

  relayRunning = relayModule.start({ port: 0, host: '127.0.0.1' });
  await relayRunning.listening;
  relayPort = relayRunning.server.address().port;
});

after(async () => {
  await relayRunning?.stop();
  await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
});

/** Connect to the second computer over the relay, and hand back the channels. */
async function reachOther(other, dir) {
  /**
   * Tried twice, because a first connection to a computer that is still coming
   * up is a real thing rather than a flaw in the test — it is why
   * `anywhere.reach` tries three ways rather than one, and why the app says a
   * computer "will appear here when it is" instead of failing outright.
   */
  for (let go = 0; go < 2; go += 1) {
    const ticket = randomBytes(16).toString('hex');
    const serving = other.ask('serveSync', { relayPort, ticket, dir });
    await new Promise((r) => setTimeout(r, 250 * (go + 1)));

    const socket = await relayModule.dialRelay({ host: '127.0.0.1', port: relayPort, ticket });
    if (!socket) continue;

    const known = await peers.greet(socket);
    if (!known) { socket.destroy(); continue; }

    const peer = peers.conversation(socket, { ...known, kind: peers.RELAY });
    return { peer, post: channelsOf.channels(peer, { odd: false }), serving };
  }
  throw new assert.AssertionError({ message: 'the two computers never connected' });
}

describe('a sync between two computers, over a relay', () => {
  let other;
  before(async () => {
    other = anotherComputer(join(root, 'home-b'));
    // It has a key to make on its first run, and the first question must not
    // arrive before it can answer one.
    await other.ask('card');
  });
  after(() => other?.stop());

  /** Two copies of one project, made the same and then drifted apart. */
  async function twoCopies(name) {
    const theirs = join(root, `${name}-theirs`);
    const mine = join(root, `${name}-mine`);

    await mkdir(join(theirs, 'src'), { recursive: true });
    await mkdir(join(theirs, 'empty-on-purpose'), { recursive: true });
    for (let i = 0; i < 8; i += 1) {
      await writeFile(join(theirs, 'src', `f-${i}.bin`), randomBytes(120_000));
    }
    await writeFile(join(theirs, 'package.json'), '{"name":"atlas"}\n');

    await cp(theirs, mine, { recursive: true });
    // The same moment on both, which is what two copies of one project are.
    const when = new Date(Date.now() - 120_000);
    for (const at of [theirs, mine]) {
      for (let i = 0; i < 8; i += 1) await utimes(join(at, 'src', `f-${i}.bin`), when, when);
      await utimes(join(at, 'package.json'), when, when);
    }
    return { theirs, mine };
  }

  test('only what changed crosses, and the folder that results is the project', async () => {
    const { theirs, mine } = await twoCopies('Atlas');

    // Two files change on their side.
    await writeFile(join(theirs, 'src', 'f-2.bin'), randomBytes(50_000));
    await writeFile(join(theirs, 'src', 'brand-new.bin'), randomBytes(30_000));

    const { peer, post, serving } = await reachOther(other, theirs);
    const channel = await post.start('sync:whatever');

    const said = [];
    const out = await syncing.bring({
      channel,
      into: mine,
      snapshotWith: snapshots.before,
      onProgress: (t) => said.push(t),
    });
    peer.close();
    const served = await serving;

    assert.equal(out.ok, true, out.sentence);
    assert.equal(out.changed, 2, 'more than the two changed files crossed');
    assert.ok(out.unchanged > out.bytes * 5,
      `${out.unchanged} stayed against ${out.bytes} moving — the whole point of a sync`);
    assert.equal(served.changed, 2);

    // And what is here now is what is there.
    const wanted = await everythingIn(theirs);
    const landed = await everythingIn(mine);
    assert.deepEqual([...landed.keys()].sort(), [...wanted.keys()].sort());
    for (const [named, bytes] of wanted) {
      assert.equal(Buffer.compare(landed.get(named), bytes), 0, `${named} is not what was there`);
    }
    assert.equal(existsSync(join(mine, 'empty-on-purpose')), true);
    assert.ok(said.some((t) => /unchanged/.test(t)), 'it never said what it was doing');
  });

  test('a way back is kept for whatever it replaced', async () => {
    const { theirs, mine } = await twoCopies('Beta');
    const was = await readFile(join(mine, 'package.json'));

    await writeFile(join(theirs, 'package.json'), '{"name":"atlas","changed":true}\n');

    const { peer, post, serving } = await reachOther(other, theirs);
    const channel = await post.start('sync:whatever');
    const out = await syncing.bring({ channel, into: mine, snapshotWith: snapshots.before });
    peer.close();
    await serving;

    assert.equal(out.ok, true, out.sentence);
    assert.equal(out.wayBack?.taken, true, 'a file was replaced with no way back');

    const back = await snapshots.restore(out.wayBack.id);
    assert.equal(back.ok, true);
    assert.equal(Buffer.compare(await readFile(join(mine, 'package.json')), was), 0);
  });

  test('nothing changed means nothing crosses', async () => {
    const { theirs, mine } = await twoCopies('Same');

    const { peer, post, serving } = await reachOther(other, theirs);
    const channel = await post.start('sync:whatever');
    const out = await syncing.bring({ channel, into: mine, snapshotWith: snapshots.before });
    peer.close();
    const served = await serving;

    assert.equal(out.ok, true, out.sentence);
    assert.equal(out.changed, 0);
    assert.equal(served.bytes, 0, 'bytes moved for a project that had not changed');
    assert.match(out.sentence, /Nothing had changed/);
    assert.equal(out.wayBack, null, 'a way back was taken for nothing');
  });

  test('a project whose names are as long as a filesystem will take', async () => {
    const deep = join(root, 'Long-theirs');
    const long = 'a-rather-long-directory-name-that-somebody-really-did-use';
    const nested = join(deep, long, long.replace(/a/g, 'b'), long.replace(/a/g, 'c'));
    await mkdir(nested, { recursive: true });
    await writeFile(join(nested, `${'a-very-long-file-name-indeed'.repeat(2)}.bin`), randomBytes(4000));
    await writeFile(join(deep, 'package.json'), '{"name":"long"}\n');

    const mine = join(root, 'Long-mine');
    await mkdir(mine, { recursive: true });

    const { peer, post, serving } = await reachOther(other, deep);
    const channel = await post.start('sync:whatever');
    const out = await syncing.bring({ channel, into: mine, snapshotWith: snapshots.before });
    peer.close();
    await serving;

    assert.equal(out.ok, true, out.sentence);
    const wanted = await everythingIn(deep);
    const landed = await everythingIn(mine);
    assert.deepEqual([...landed.keys()].sort(), [...wanted.keys()].sort());
  });
});

describe('the app stopping is not the same as the wire going', () => {
  test('a half-finished folder survives a restart, and carries on', async () => {
    const from = join(root, 'Restart');
    await mkdir(join(from, 'src'), { recursive: true });
    for (let i = 0; i < 10; i += 1) {
      await writeFile(join(from, 'src', `r-${i}.bin`), randomBytes(40_000));
    }

    const target = join(root, 'restart-landing', 'Restart');
    await mkdir(dirname(target), { recursive: true });

    /**
     * Four files, and then the wire stops with no closing line.
     *
     * A parcel of exactly four files is a *complete* parcel of four files, which
     * arrives perfectly and is not an interruption at all — the first version of
     * this proved a restart worked by never interrupting anything. So the four
     * are poured and the stream is then destroyed with an error, which is what a
     * process going away looks like from the other end.
     */
    const all = await parcel.survey(from, { everything: true });
    const part = { ...all, files: all.files.slice(0, 4) };
    part.bytes = part.files.reduce((s, o) => s + o.size, 0);

    const { PassThrough } = await import('node:stream');
    const wire = new PassThrough();
    const full = parcel.wrap(from, { everything: true, seen: part });

    // Everything but the last hundred bytes, so the closing line never lands —
    // held back rather than timed, because a race decides differently each run.
    const bits = [];
    for await (const chunk of full) bits.push(chunk);
    const whole = Buffer.concat(bits);

    // The reader is started first, so the error has somebody expecting it —
    // destroying a stream nobody is listening to throws where nothing catches,
    // which is the whole of D-77 in one line.
    const first = parcel.unwrap(wire, target, { keep: true, forOffer: 'restart' });
    wire.write(whole.subarray(0, whole.length - 100));

    // Waited for rather than raced: destroying the stream in the same tick
    // throws the buffered bytes away with it, and the point of this test is
    // what happens to bytes that *did* land.
    for (let waited = 0; waited < 60; waited += 1) {
      const held = await parcel.whatIsAlreadyHere(target, { forOffer: 'restart' });
      if (held && Object.keys(held.have).length >= 3) break;
      await new Promise((r) => setTimeout(r, 50));
    }
    wire.destroy(new Error('the app went away'));
    const stopped = await first;
    assert.equal(stopped.ok, false, 'a cut transfer reported success');
    assert.equal(stopped.resumable, true, 'nothing was kept');

    /**
     * A restart, as far as this is concerned: nothing in memory, everything
     * read back off the disk. The ledger is a file for exactly this reason —
     * anything held only in a running process is gone when the process is.
     */
    const fresh = await import(`../parcel.mjs?restarted=${Date.now()}`);
    const held = await fresh.whatIsAlreadyHere(target, { forOffer: 'restart' });
    assert.ok(held, 'nothing survived the restart');
    assert.ok(Object.keys(held.have).length >= 3,
      `only ${Object.keys(held.have).length} files survived being written down`);

    const rest = fresh.withoutWhatTheyHave(await fresh.survey(from, { everything: true }), held.have);
    const out = await fresh.unwrap(
      fresh.wrap(from, { everything: true, seen: rest }),
      target,
      { have: held, keep: true, forOffer: 'restart' },
    );

    assert.equal(out.ok, true, out.sentence);
    assert.ok(out.carriedOver >= 3, `it carried over only ${out.carriedOver} from the previous run`);

    const wanted = await everythingIn(from);
    const landed = await everythingIn(target);
    for (const [named, bytes] of wanted) {
      assert.equal(Buffer.compare(landed.get(named), bytes), 0, `${named} is a mixture of two runs`);
    }
  });
});

describe('several errands at once', () => {
  test('four transfers into four folders do not tread on each other', async () => {
    const jobs = [];
    for (let n = 0; n < 4; n += 1) {
      const from = join(root, `Many-${n}`);
      await mkdir(join(from, 'src'), { recursive: true });
      for (let i = 0; i < 5; i += 1) {
        await writeFile(join(from, 'src', `m-${i}.bin`), randomBytes(60_000));
      }
      jobs.push({ from, into: join(root, `many-landing-${n}`, `Many-${n}`) });
    }

    const out = await Promise.all(jobs.map(({ from, into }) => parcel.unwrap(
      parcel.wrap(from, { everything: true }), into, { keep: true, forOffer: `many-${from}` },
    )));

    for (const one of out) assert.equal(one.ok, true, one.sentence);

    for (const { from, into } of jobs) {
      const wanted = await everythingIn(from);
      const landed = await everythingIn(into);
      assert.deepEqual([...landed.keys()].sort(), [...wanted.keys()].sort());
      for (const [named, bytes] of wanted) {
        assert.equal(Buffer.compare(landed.get(named), bytes), 0,
          `${named} in ${into} came from somewhere else`);
      }
    }
  });

  // Two transfers into one folder are refused one level up, where a transfer is
  // an errand with a name rather than a stream — `whole.test.mjs` already asks
  // that, against the real guard. Asking it again here with a stand-in stream
  // proved nothing and hung, which is worse than not asking.
});
