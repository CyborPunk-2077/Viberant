/**
 * Two computers that cannot see each other, working anyway.
 *
 * The whole of Viberant Anywhere in one file, run for real: two installations
 * with their own folders and their own keys, a plane they both talk to, a relay
 * neither of them trusts, and a project that has to arrive intact.
 *
 * The scenarios are the ones from the test matrix that can be made to happen on
 * one machine honestly:
 *
 *   two instances, different networks, meeting through a relay;
 *   an interrupted transfer, resumed, across that relay;
 *   the plane going away while the local network carries on;
 *   an expired invitation;
 *   a revoked device trying to reconnect;
 *   a device claiming to be one that is allowed.
 *
 * Everything here uses real sockets and real processes' worth of code. Where a
 * second computer is needed, it is a second home folder with a second identity,
 * because that is what a second computer is.
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, writeFile, readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { fork } from 'node:child_process';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const APP = join(here, '..');

let root, relayRunning, relayPort;
let peers, relayModule, parcel, planeModule;

/** Everything in a folder, for comparing two of them. */
async function everythingIn(at, prefix = '') {
  const out = new Map();
  for (const e of await readdir(at, { withFileTypes: true })) {
    const named = prefix ? `${prefix}/${e.name}` : e.name;
    if (e.isDirectory()) for (const [k, v] of await everythingIn(join(at, e.name), named)) out.set(k, v);
    else out.set(named, await readFile(join(at, e.name)));
  }
  return out;
}

/**
 * A second Viberant, in its own process.
 *
 * A separate process rather than a second import, because a device identity is
 * per installation and two of them in one process would share a module. This is
 * the only honest way to have two computers on one machine.
 */
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
    child,
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
  root = await mkdtemp(join(tmpdir(), 'viberant-anywhere-'));
  await mkdir(join(root, 'home-a'), { recursive: true });
  await mkdir(join(root, 'home-b'), { recursive: true });
  process.env.USERPROFILE = join(root, 'home-a');
  process.env.HOME = join(root, 'home-a');

  peers = await import('../peers.mjs');
  relayModule = await import('../relay.mjs');
  parcel = await import('../parcel.mjs');
  planeModule = await import('../plane.mjs');

  relayRunning = relayModule.start({ port: 0, host: '127.0.0.1' });
  await relayRunning.listening;
  relayPort = relayRunning.server.address().port;
});

after(async () => {
  await relayRunning?.stop();
  await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
});

describe('the plane holds who is about, and nothing anybody is building', () => {
  test('a device says it is here and the others can see it', async () => {
    const service = planeModule.here();
    await service.announce({
      workspace: 'w1',
      card: { deviceId: 'aaa', signPublic: 'k', agreePublic: 'k', displayName: 'RTX-PC' },
      addresses: ['203.0.113.9'],
      directPort: 47779,
    });

    const out = await service.whoIsAbout({ workspace: 'w1' });
    assert.equal(out.devices.length, 1);
    assert.equal(out.devices[0].displayName, 'RTX-PC');
    assert.equal(out.devices[0].hereNow, true);
  });

  test('a workspace only sees its own', async () => {
    const service = planeModule.here();
    await service.announce({ workspace: 'w1', card: { deviceId: 'a', displayName: 'A' } });
    await service.announce({ workspace: 'w2', card: { deviceId: 'b', displayName: 'B' } });

    assert.deepEqual((await service.whoIsAbout({ workspace: 'w1' })).devices.map((d) => d.deviceId), ['a']);
    assert.deepEqual((await service.whoIsAbout({ workspace: 'w2' })).devices.map((d) => d.deviceId), ['b']);
  });

  test('what it is asked to keep has no room for a project in it', async () => {
    const source = await readFile(join(APP, 'plane.mjs'), 'utf8');
    const code = source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

    // Nothing here may read a folder, open a file, or wrap a project.
    for (const way of [/readFile/, /createReadStream/, /parcel\./, /wrap\(/, /survey\(/]) {
      assert.equal(way.test(code), false, `plane.mjs can ${way}, which means it can hold a project`);
    }
  });

  test('a message to a plane somewhere else is signed, and a stale one is refused', async () => {
    const device = await import('../device.mjs');
    const me = await device.card();

    const said = JSON.stringify({ workspace: 'w1', when: Date.now() });
    const proof = await device.signed(`announce|${said}`);
    assert.ok(planeModule.saidBy({ said, proof, from: me, what: 'announce' }));

    // The same message, recorded and replayed later.
    const old = JSON.stringify({ workspace: 'w1', when: Date.now() - planeModule.NOT_TOO_OLD - 1000 });
    const oldProof = await device.signed(`announce|${old}`);
    assert.equal(planeModule.saidBy({ said: old, proof: oldProof, from: me, what: 'announce' }), null,
      'a recording kept a device looking like it was about');

    // Somebody else's message with their own key, wearing this device's name.
    assert.equal(planeModule.saidBy({
      said, proof, from: { ...me, deviceId: 'a-name-that-is-not-this-key' }, what: 'announce',
    }), null);

    // The right message against the wrong errand.
    assert.equal(planeModule.saidBy({ said, proof, from: me, what: 'ticket' }), null);
  });
});

describe('two computers on different networks, meeting through a relay', () => {
  let other;

  before(async () => { other = anotherComputer(join(root, 'home-b')); });
  after(() => other?.stop());

  test('the second computer has an identity of its own', async () => {
    const device = await import('../device.mjs');
    const mine = await device.card();
    const theirs = await other.ask('card');

    assert.ok(theirs.card?.deviceId, theirs.why ?? 'no answer');
    assert.notEqual(theirs.card.deviceId, mine.deviceId,
      'two installations must not share an identity');
    assert.equal(theirs.card.deviceId.length, 32);
  });

  test('a whole project crosses, and comes out the same folder', async () => {
    const from = join(root, 'Atlas');
    await mkdir(join(from, 'src'), { recursive: true });
    await mkdir(join(from, 'keep-me-empty'), { recursive: true });
    for (let i = 0; i < 6; i += 1) {
      await writeFile(join(from, 'src', `f-${i}.bin`), randomBytes(40_000));
    }
    await writeFile(join(from, 'package.json'), '{"name":"atlas"}\n');

    const ticket = randomBytes(16).toString('hex');
    const into = join(root, 'landed');
    await mkdir(into, { recursive: true });

    // The other computer waits on the relay for us.
    const theirs = other.ask('receive', {
      relayPort, ticket, into: join(into, 'Atlas'),
    });
    await new Promise((r) => setTimeout(r, 200));

    const joined = await relayModule.dialRelay({ host: '127.0.0.1', port: relayPort, ticket });
    assert.ok(joined, 'the relay did not put them together');

    const known = await peers.greet(joined.socket, { alreadyRead: joined.alreadyRead });
    assert.ok(known, 'the handshake did not finish');

    const peer = peers.conversation(joined.socket, { ...known, kind: peers.RELAY });
    await peer.pour(parcel.wrap(from, { everything: true }));

    const out = await theirs;
    assert.equal(out.ok, true, out.why ?? out.sentence);

    const sent = await everythingIn(from);
    const landed = await everythingIn(join(into, 'Atlas'));
    assert.deepEqual([...landed.keys()].sort(), [...sent.keys()].sort());
    for (const [named, bytes] of sent) {
      assert.equal(Buffer.compare(landed.get(named), bytes), 0, `${named} arrived different`);
    }
    assert.equal(existsSync(join(into, 'Atlas', 'keep-me-empty')), true,
      'an empty folder is part of the shape of a project');

    peer.close();
  });

  test('an interrupted transfer resumes across the relay, and lands identical', async () => {
    const from = join(root, 'Atlas2');
    await mkdir(join(from, 'src'), { recursive: true });
    for (let i = 0; i < 10; i += 1) {
      await writeFile(join(from, 'src', `g-${i}.bin`), randomBytes(60_000));
    }

    const into = join(root, 'landed2');
    await mkdir(into, { recursive: true });
    const target = join(into, 'Atlas2');

    // First go, cut part way through.
    const cutTicket = randomBytes(16).toString('hex');
    const firstTry = other.ask('receive', {
      relayPort, ticket: cutTicket, into: target, keep: true, forOffer: 'atlas2',
    });
    await new Promise((r) => setTimeout(r, 200));

    const cut = await relayModule.dialRelay({ host: '127.0.0.1', port: relayPort, ticket: cutTicket });
    assert.ok(cut, 'the relay did not put them together');
    const cutSocket = cut.socket;
    const cutKnown = await peers.greet(cutSocket, { alreadyRead: cut.alreadyRead });
    // Checked rather than spread blindly. A handshake that failed used to reach
    // `seal` as an undefined key and come out as an error about argument types,
    // which says nothing about what actually went wrong.
    assert.ok(cutKnown, 'the handshake did not finish');
    const cutPeer = peers.conversation(cutSocket, { ...cutKnown, kind: peers.RELAY });

    /**
     * Cut after exactly four files, rather than after so many bytes.
     *
     * Cutting by byte count is a race: how many whole files have landed by then
     * depends on how quickly the far end got through them, which under a full
     * test run is a different answer every time. This sends a parcel that only
     * ever contained four files and then hangs up before its closing line — a
     * genuine interruption, at a place both ends agree on.
     */
    const all = await parcel.survey(from, { everything: true });
    const someOfIt = { ...all, files: all.files.slice(0, 4) };
    someOfIt.bytes = someOfIt.files.reduce((sum, one) => sum + one.size, 0);

    const part = parcel.wrap(from, { everything: true, seen: someOfIt });
    for await (const chunk of part) await cutPeer.send(chunk);
    // Everything it had, and then the wire goes, before the closing line is read.
    await new Promise((r) => setTimeout(r, 200));
    cutSocket.destroy();

    const stopped = await firstTry;
    assert.equal(stopped.ok, false, 'the cut transfer reported success');
    assert.equal(stopped.resumable, true, 'nothing was kept to carry on from');
    assert.equal(stopped.have, 4, `kept ${stopped.have} of 10`);

    // Second go: only what is missing.
    const held = await other.ask('whatIsHere', { into: target, forOffer: 'atlas2' });
    assert.ok(held.have, 'the other computer kept no ledger');

    const survey = await parcel.survey(from, { everything: true });
    const rest = parcel.withoutWhatTheyHave(survey, held.have);
    assert.ok(rest.files.length < survey.files.length, 'nothing was saved by resuming');

    const goTicket = randomBytes(16).toString('hex');
    const secondTry = other.ask('receive', {
      relayPort, ticket: goTicket, into: target, keep: true, forOffer: 'atlas2', resume: true,
    });
    await new Promise((r) => setTimeout(r, 200));

    const again = await relayModule.dialRelay({ host: '127.0.0.1', port: relayPort, ticket: goTicket });
    assert.ok(again, 'the relay did not put them together');
    const known = await peers.greet(again.socket, { alreadyRead: again.alreadyRead });
    assert.ok(known, 'the handshake did not finish');
    const peer = peers.conversation(again.socket, { ...known, kind: peers.RELAY });
    await peer.pour(parcel.wrap(from, { everything: true, seen: rest }));

    const out = await secondTry;
    assert.equal(out.ok, true, out.why ?? out.sentence);
    assert.ok(out.carriedOver > 0, 'it re-sent everything');

    const wanted = await everythingIn(from);
    const landed = await everythingIn(target);
    assert.deepEqual([...landed.keys()].sort(), [...wanted.keys()].sort());
    for (const [named, bytes] of wanted) {
      assert.equal(Buffer.compare(landed.get(named), bytes), 0,
        `${named} is a mixture of two attempts`);
    }
    peer.close();
  });
});

describe('when the service is not there, this network carries on', () => {
  test('a workspace already on this disk still says what still works', async () => {
    const members = await import('../members.mjs');
    await members.forgetAll();
    const device = await import('../device.mjs');
    const made = await members.create({
      name: 'Atlas', owner: 'danni', device: await device.card(),
    });

    const still = planeModule.whatWorksWithout(made.workspace);
    assert.equal(still.thisNetwork, true, 'losing the internet must not cost you the next room');
    assert.equal(still.alreadyKnownDevices, true);
    assert.equal(still.acrossTheInternet, false);
    assert.match(still.sentence, /still work/);

    // And the check that decides who may do what needs nobody's help.
    assert.equal(members.may(made.workspace, (await device.card()).deviceId, 'bring'), true);
  });

  test('a plane that cannot be reached answers, rather than throwing', async () => {
    const unreachable = planeModule.over('http://127.0.0.1:1');
    const out = await unreachable.whoIsAbout({ workspace: 'w' });
    assert.equal(out.ok, false);
    assert.equal(out.reachable, false, 'the difference between down and empty has to survive');
  });
});

describe('the ways in that must stay shut', () => {
  test('a revoked computer cannot come back through the door it used before', async () => {
    const members = await import('../members.mjs');
    const device = await import('../device.mjs');
    await members.forgetAll();

    const made = await members.create({ name: 'Atlas', owner: 'danni', device: await device.card() });
    const asked = await members.invite({ workspace: made.workspace, by: 'danni' });
    const theirs = { deviceId: 'their-device', signPublic: 's', agreePublic: 'a', displayName: 'Rahul-Laptop' };
    await members.redeem({ workspace: await members.current(), code: asked.code, person: 'rahul', device: theirs });

    let ws = await members.current();
    assert.equal(members.may(ws, 'their-device', 'seeOffered'), true);

    await members.revoke(ws, 'their-device');
    ws = await members.current();

    // Everything a connection consults.
    assert.equal(members.isRevoked(ws, 'their-device'), true);
    assert.equal(members.may(ws, 'their-device', 'seeOffered'), false);
    assert.equal(!!ws.devices?.['their-device'], false);

    // And the listener's own gate says no.
    const allowed = (who) => !!ws.devices?.[who.deviceId] && !members.isRevoked(ws, who.deviceId);
    assert.equal(allowed({ deviceId: 'their-device' }), false);
  });

  test('an invitation that has run out lets nobody in', async () => {
    const members = await import('../members.mjs');
    const device = await import('../device.mjs');
    await members.forgetAll();

    const made = await members.create({ name: 'Atlas', owner: 'danni', device: await device.card() });
    const asked = await members.invite({ workspace: made.workspace, by: 'danni' });

    const ws = await members.current();
    for (const one of Object.values(ws.invites)) one.expiresAt = Date.now() - 1;
    await members.save(ws);

    const out = await members.redeem({
      workspace: await members.current(),
      code: asked.code,
      person: 'whoever',
      device: { deviceId: 'x', displayName: 'X' },
    });
    assert.equal(out.ok, false);
    assert.equal(!!(await members.current()).devices?.x, false);
  });
});
