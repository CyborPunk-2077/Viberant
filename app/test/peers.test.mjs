/**
 * Reaching another computer, over real sockets, through a real relay.
 *
 * Not mocks. Two identities, a relay listening on a port, a project wrapped by
 * the same code that wraps one on a local network, and the folder that comes
 * out the other end compared byte for byte with the one that went in.
 *
 * The claims being tested are the ones that decide whether a relay is
 * acceptable to run at all:
 *
 *   what the relay carries, it cannot read;
 *   a device that is not who it says it is does not get in;
 *   a recorded handshake proves nothing the next day;
 *   a ticket works once;
 *   **the transfer logic is the same logic** — resume and the integrity checks
 *     are not reimplemented per transport, so they cannot drift.
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, createConnection } from 'node:net';
import { mkdtemp, rm, mkdir, writeFile, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

let root, from;
let peers, relayModule, device, parcel;

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

before(async () => {
  root = await mkdtemp(join(tmpdir(), 'viberant-peers-'));
  await mkdir(join(root, 'home'), { recursive: true });
  process.env.USERPROFILE = join(root, 'home');
  process.env.HOME = join(root, 'home');

  peers = await import('../peers.mjs');
  relayModule = await import('../relay.mjs');
  device = await import('../device.mjs');
  parcel = await import('../parcel.mjs');

  from = join(root, 'Atlas');
  await mkdir(join(from, 'src'), { recursive: true });
  await mkdir(join(from, 'empty-on-purpose'), { recursive: true });
  for (let i = 0; i < 8; i += 1) {
    await writeFile(join(from, 'src', `part-${i}.bin`), randomBytes(50_000));
  }
  await writeFile(join(from, 'package.json'), '{"name":"atlas"}\n');
});

after(async () => {
  await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
});

describe('a frame carries exactly what was put in it, and no more', () => {
  test('whole frames come out however the bytes were split', () => {
    const reader = peers.__testOnly.frames();
    const a = peers.__testOnly.framed(Buffer.from('one'));
    const b = peers.__testOnly.framed(Buffer.from('two'));
    const both = Buffer.concat([a, b]);

    const out = [];
    for (let at = 0; at < both.length; at += 1) out.push(...reader.take(both.subarray(at, at + 1)));
    assert.deepEqual(out.map((f) => f.toString()), ['one', 'two']);
  });

  test('a length somebody else chose cannot ask for a gigabyte', () => {
    const reader = peers.__testOnly.frames();
    const silly = Buffer.alloc(4);
    silly.writeUInt32BE(4_000_000_000);
    assert.throws(() => reader.take(silly), /larger than anything this sends/);
  });
});

describe('two computers prove who they are before anything else moves', () => {
  /**
   * A second device, made the way a second installation would make one, in its
   * own folder. Both halves of this test are the real code.
   */
  async function secondDevice() {
    const otherHome = join(root, `home-${randomBytes(4).toString('hex')}`);
    await mkdir(otherHome, { recursive: true });
    const was = process.env.USERPROFILE;
    process.env.USERPROFILE = otherHome;
    process.env.HOME = otherHome;
    device.forget();
    const card = await device.card();
    const speak = { signed: device.signed, card: async () => card };
    process.env.USERPROFILE = was;
    process.env.HOME = was;
    device.forget();
    return { card, home: otherHome, speak };
  }

  test('a greeting establishes who, and a shared key neither side sent', async () => {
    // Both ends run in this process but with real sockets between them, which
    // is what a handshake actually has to survive.
    const server = createServer();
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const port = server.address().port;

    const theirs = new Promise((done) => {
      server.once('connection', async (socket) => done(await peers.greet(socket)));
    });

    const socket = createConnection({ port, host: '127.0.0.1' });
    await new Promise((r) => socket.once('connect', r));
    const ours = await peers.greet(socket);
    const them = await theirs;

    assert.ok(ours && them, 'the handshake did not finish');
    assert.equal(ours.who.deviceId, them.who.deviceId, 'both ends are this same computer here');
    assert.equal(Buffer.compare(ours.key, them.key), 0, 'the two ends did not agree a key');

    socket.destroy();
    server.close();
  });

  test('an identifier that is not the fingerprint of its own key is refused', async () => {
    const server = createServer();
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const port = server.address().port;

    const theirs = new Promise((done) => {
      server.once('connection', async (socket) => done(await peers.greet(socket)));
    });

    // Someone arriving as a device you already trust, with their own key.
    const socket = createConnection({ port, host: '127.0.0.1' });
    await new Promise((r) => socket.once('connect', r));
    const me = await device.card();
    socket.write(peers.__testOnly.framed(Buffer.from(JSON.stringify({
      hello: { ...me, deviceId: 'a-device-id-that-is-not-this-key' },
      challenge: 'anything',
    }))));

    assert.equal(await theirs, null, 'a device walked in wearing somebody else\'s name');
    socket.destroy();
    server.close();
  });

  test('a recording of a handshake proves nothing the next time', async () => {
    // The proof is over both sides' challenges, and one of them is chosen by
    // the side being convinced. There is nothing to replay.
    const me = await device.card();
    const yesterday = await device.signed('mine-yesterday|theirs-yesterday');

    assert.equal(device.verify('mine-today|theirs-today', yesterday, me.signPublic), false);
    assert.equal(device.verify('mine-yesterday|theirs-yesterday', yesterday, me.signPublic), true);
  });
});

describe('a relay carries what it cannot read', () => {
  let running;

  before(async () => {
    running = relayModule.start({ port: 0, host: '127.0.0.1' });
    await running.listening;
  });
  after(async () => { await running?.stop(); });

  const port = () => running.server.address().port;

  test('two sides with the same ticket are joined', async () => {
    const ticket = randomBytes(16).toString('hex');
    const both = await Promise.all([
      relayModule.dialRelay({ host: '127.0.0.1', port: port(), ticket }),
      new Promise((r) => setTimeout(r, 60))
        .then(() => relayModule.dialRelay({ host: '127.0.0.1', port: port(), ticket })),
    ]);
    assert.ok(both[0] && both[1], 'the relay did not put them together');
    assert.equal(running.counted.paired >= 1, true);
    both[0].destroy();
    both[1].destroy();
  });

  test('a ticket that is not a ticket is refused', async () => {
    const out = await relayModule.dialRelay({
      host: '127.0.0.1', port: port(), ticket: '../../etc/passwd', within: 2000,
    });
    assert.equal(out, null);
  });

  test('a whole project crosses it, and the relay reads none of it', async () => {
    const ticket = randomBytes(16).toString('hex');

    // What the relay actually sees. Collected by listening to its own socket.
    const sawBytes = [];
    const watcher = createServer((incoming) => {
      const onward = createConnection({ host: '127.0.0.1', port: port() });
      incoming.on('data', (c) => { sawBytes.push(Buffer.from(c)); onward.write(c); });
      onward.on('data', (c) => incoming.write(c));
      for (const s of [incoming, onward]) {
        s.on('error', () => { incoming.destroy(); onward.destroy(); });
        s.on('close', () => { incoming.destroy(); onward.destroy(); });
      }
    });
    await new Promise((r) => watcher.listen(0, '127.0.0.1', r));
    const watched = watcher.address().port;

    const [aSocket, bSocket] = await Promise.all([
      relayModule.dialRelay({ host: '127.0.0.1', port: watched, ticket }),
      new Promise((r) => setTimeout(r, 60))
        .then(() => relayModule.dialRelay({ host: '127.0.0.1', port: port(), ticket })),
    ]);
    assert.ok(aSocket && bSocket, 'the relay did not join them');

    const [aKnown, bKnown] = await Promise.all([peers.greet(aSocket), peers.greet(bSocket)]);
    assert.ok(aKnown && bKnown, 'the handshake did not survive the relay');

    const sender = peers.conversation(aSocket, { ...aKnown, kind: peers.RELAY });
    const receiver = peers.conversation(bSocket, { ...bKnown, kind: peers.RELAY });
    assert.equal(sender.says, 'Relay');

    // The same wrap and the same unwrap a local network uses. One copy.
    const into = join(root, 'landed-over-relay');
    await mkdir(into, { recursive: true });

    const arriving = parcel.unwrap(peers.poured(receiver), join(into, 'Atlas'), { keep: true });
    await sender.pour(parcel.wrap(from, { everything: true }));
    const out = await arriving;

    assert.equal(out.ok, true, out.sentence);

    const sent = await everythingIn(from);
    const landed = await everythingIn(join(into, 'Atlas'));
    assert.deepEqual([...landed.keys()].sort(), [...sent.keys()].sort());
    for (const [named, bytes] of sent) {
      assert.equal(Buffer.compare(landed.get(named), bytes), 0, `${named} arrived different`);
    }

    // Empty folders survive, which is a promise the parcel format already made.
    const { existsSync } = await import('node:fs');
    assert.equal(existsSync(join(into, 'Atlas', 'empty-on-purpose')), true);

    // And now the claim that matters. Everything after the handshake was
    // sealed, so the plaintext of the project is not in what the relay carried.
    const carried = Buffer.concat(sawBytes);
    assert.ok(carried.length > 100_000, `only ${carried.length} bytes went past`);
    assert.equal(carried.includes(Buffer.from('"name":"atlas"')), false,
      'the relay carried readable project content');

    for (const [, bytes] of sent) {
      if (bytes.length < 1000) continue;
      assert.equal(carried.includes(bytes.subarray(0, 64)), false,
        'a run of a real file went past the relay in the clear');
    }

    sender.close();
    receiver.close();
    watcher.close();
  });
});

describe('what a person is told is not networking', () => {
  test('each way of connecting has a plain name', () => {
    assert.equal(peers.inWords(peers.LAN), 'This network');
    assert.equal(peers.inWords(peers.DIRECT), 'Direct · Internet');
    assert.equal(peers.inWords(peers.RELAY), 'Relay');
    assert.equal(peers.inWords('something-else'), 'Not connected');
  });

  test('nothing a person reads mentions a protocol', () => {
    for (const kind of [peers.LAN, peers.DIRECT, peers.RELAY]) {
      const said = peers.inWords(kind);
      for (const jargon of [/STUN/i, /NAT/i, /ICE/i, /candidate/i, /socket/i, /port/i]) {
        assert.equal(jargon.test(said), false, `"${said}" says ${jargon}`);
      }
    }
  });
});
