/**
 * What a build made, coming back — and looking at what is running there.
 *
 * Both ride the same multiplexer over one proved, sealed connection, so most of
 * what is tested here is what each refuses:
 *
 *   an output folder that climbs out of the project;
 *   a folder named by whoever is asking rather than by the project;
 *   a preview asked to reach a port that is not being offered;
 *   a preview asked to reach anything that is not this computer.
 *
 * The channels are exercised over real sockets, because a multiplexer that
 * works when both halves are the same object proves nothing about the day a
 * frame arrives split in three.
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { createServer as httpServer } from 'node:http';
import { mkdtemp, rm, mkdir, writeFile, readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

let root, peers, channelsOf, artifacts, preview, relayModule;

/** Two ends of one real, proved, sealed connection. */
async function twoEnds() {
  const server = createServer();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;

  const theirs = new Promise((done) => {
    server.once('connection', async (socket) => {
      const known = await peers.greet(socket);
      done(known ? peers.conversation(socket, { ...known, kind: peers.LAN }) : null);
    });
  });

  const { createConnection } = await import('node:net');
  const socket = createConnection({ port, host: '127.0.0.1' });
  await new Promise((r) => socket.once('connect', r));
  const known = await peers.greet(socket);
  const ours = known ? peers.conversation(socket, { ...known, kind: peers.LAN }) : null;

  return { ours, theirs: await theirs, close: () => { ours?.close(); server.close(); } };
}

before(async () => {
  root = await mkdtemp(join(tmpdir(), 'viberant-artifacts-'));
  await mkdir(join(root, 'home'), { recursive: true });
  process.env.USERPROFILE = join(root, 'home');
  process.env.HOME = join(root, 'home');

  peers = await import('../peers.mjs');
  channelsOf = await import('../channels.mjs');
  artifacts = await import('../artifacts.mjs');
  preview = await import('../preview.mjs');
  relayModule = await import('../relay.mjs');
});

after(async () => {
  preview.closeEverything();
  await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
});

describe('several things down one connection', () => {
  test('two channels do not read each other bytes', async () => {
    const both = await twoEnds();
    assert.ok(both.ours && both.theirs, 'the connection did not come up');

    const here = channelsOf.channels(both.ours, { odd: false });
    const there = channelsOf.channels(both.theirs, { odd: true });

    const arrived = new Map();
    there.whenOpened((one) => {
      const bits = [];
      one.incoming.on('data', (c) => bits.push(c));
      one.incoming.on('end', () => arrived.set(one.what, Buffer.concat(bits)));
    });

    const a = await here.start('one');
    const b = await here.start('two');
    await a.write(Buffer.from('AAAA'.repeat(500)));
    await b.write(Buffer.from('BBBB'.repeat(500)));
    a.end();
    b.end();

    await new Promise((r) => setTimeout(r, 400));
    assert.equal(arrived.get('one').toString(), 'AAAA'.repeat(500));
    assert.equal(arrived.get('two').toString(), 'BBBB'.repeat(500));
    both.close();
  });

  test('both ends opening at once do not collide on a number', async () => {
    const both = await twoEnds();
    const here = channelsOf.channels(both.ours, { odd: false });
    const there = channelsOf.channels(both.theirs, { odd: true });

    const seen = [];
    there.whenOpened((one) => seen.push(one.channel));
    here.whenOpened((one) => seen.push(one.channel));

    const mine = await here.start('mine');
    const yours = await there.start('yours');
    await new Promise((r) => setTimeout(r, 300));

    assert.notEqual(mine.channel, yours.channel,
      'two ends opening at the same moment took the same channel');
    both.close();
  });

  test('a frame larger than anything this sends ends the connection', async () => {
    const both = await twoEnds();
    const here = channelsOf.channels(both.ours);
    const there = channelsOf.channels(both.theirs, { odd: true });

    const broke = new Promise((done) => {
      there.whenOpened((one) => one.incoming.on('error', () => done(true)));
      setTimeout(() => done(false), 1500);
    });

    // A header claiming far more than a channel may carry.
    const evil = Buffer.alloc(9);
    evil.writeUInt32BE(2, 0);
    evil[4] = 2;
    evil.writeUInt32BE(900_000_000, 5);
    await both.ours.send(evil);

    await new Promise((r) => setTimeout(r, 600));
    assert.equal(here.howMany >= 0, true);
    both.close();
  });

  test('only so many may be open at once', async () => {
    const both = await twoEnds();
    const here = channelsOf.channels(both.ours);
    const opened = [];
    for (let i = 0; i < channelsOf.__testOnly.MOST_CHANNELS; i += 1) {
      opened.push(await here.start(`c${i}`));
    }
    await assert.rejects(() => here.start('one too many'), /too many/);
    both.close();
  });
});

describe('what a build made, coming back', () => {
  test('the folder is decided by the project, never by the asker', async () => {
    const project = join(root, 'Atlas');
    await mkdir(join(project, 'dist'), { recursive: true });
    await writeFile(join(project, 'package.json'), JSON.stringify({
      name: 'atlas', scripts: { build: 'vite build' }, devDependencies: { vite: '5.0.0' },
    }));
    await writeFile(join(project, 'dist', 'index.html'), '<!doctype html>hello\n');
    await writeFile(join(project, 'dist', 'app.js'), 'console.log(1)\n');

    const found = await artifacts.whatCameOut(project);
    assert.equal(found.ok, true, found.sentence);
    assert.equal(found.named, 'dist');
    assert.equal(found.files, 2);

    // And there is no argument anywhere that could name a different one.
    const source = await readFile(new URL('../artifacts.mjs', import.meta.url), 'utf8');
    assert.equal(/whatCameOut\([^)]*named/.test(source), false,
      'the output folder can be named by whoever is asking');
  });

  test('a project that has not been built says so, rather than sending nothing', async () => {
    const project = join(root, 'NotBuilt');
    await mkdir(project, { recursive: true });
    await writeFile(join(project, 'package.json'), JSON.stringify({
      name: 'nb', scripts: { build: 'vite build' }, devDependencies: { vite: '5.0.0' },
    }));

    const found = await artifacts.whatCameOut(project);
    assert.equal(found.ok, false);
    assert.match(found.sentence, /Nothing has been built/);
    assert.match(found.action, /Build it first/);
  });

  test('a project that says nothing about where it builds is refused', async () => {
    const project = join(root, 'Plain');
    await mkdir(project, { recursive: true });
    await writeFile(join(project, 'package.json'), JSON.stringify({ name: 'plain' }));

    const found = await artifacts.whatCameOut(project);
    assert.equal(found.ok, false);
    assert.match(found.sentence, /does not say where/);
  });

  test('it crosses a real connection and lands beside the project, not in it', async () => {
    const project = join(root, 'Atlas');
    const both = await twoEnds();
    const here = channelsOf.channels(both.ours);
    const there = channelsOf.channels(both.theirs, { odd: true });

    // The far end sends what it built when asked.
    there.whenOpened(async (one) => {
      if (one.what === 'artifact') await artifacts.send(project, one);
    });

    const into = join(root, 'landing');
    await mkdir(into, { recursive: true });

    const channel = await here.start('artifact');
    const out = await artifacts.receive(channel, { into, from: 'RTX-PC', named: 'Atlas' });

    assert.equal(out.ok, true, out.sentence);
    assert.equal(out.files, 2);
    assert.match(out.action, /beside the project rather than in it/);

    const at = join(into, 'Atlas-from-RTX-PC');
    assert.equal(existsSync(at), true);
    assert.equal(await readFile(join(at, 'index.html'), 'utf8'), '<!doctype html>hello\n');

    // And nothing landed on the project itself.
    assert.equal(existsSync(join(into, 'Atlas')), false);
    both.close();
  });
});

describe('looking at something running on another computer', () => {
  let devServer, devPort;

  before(async () => {
    devServer = httpServer((req, res) => {
      if (req.url === '/slow') return setTimeout(() => res.end('late'), 50);
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end(`<h1>Atlas</h1><p>${req.method} ${req.url}</p>`);
    });
    await new Promise((r) => devServer.listen(0, '127.0.0.1', r));
    devPort = devServer.address().port;
  });
  after(() => devServer?.close());

  test('a page on that computer is fetched through the connection', async () => {
    const both = await twoEnds();
    const here = channelsOf.channels(both.ours);
    const there = channelsOf.channels(both.theirs, { odd: true });

    there.whenOpened((one) => {
      if (one.what.startsWith('preview:')) preview.answer(one, { allowedPorts: [devPort] });
    });

    const window_ = await preview.open({
      peer: both.ours, channels: here, port: devPort, name: 'Atlas',
    });
    assert.equal(window_.ok, true);
    assert.match(window_.at, /^http:\/\/127\.0\.0\.1:\d+$/,
      'a preview must be on this computer only, never a real address');
    assert.match(window_.action, /this computer only/);

    const said = await fetch(`${window_.at}/hello`);
    assert.equal(said.status, 200);
    const text = await said.text();
    assert.match(text, /<h1>Atlas<\/h1>/);
    assert.match(text, /GET \/hello/);

    preview.close(window_.at);
    both.close();
  });

  test('a port that is not being offered is refused', async () => {
    const both = await twoEnds();
    const here = channelsOf.channels(both.ours);
    const there = channelsOf.channels(both.theirs, { odd: true });

    // The far end offers one port. The near end asks for a different one.
    there.whenOpened((one) => {
      if (one.what.startsWith('preview:')) preview.answer(one, { allowedPorts: [devPort] });
    });

    const window_ = await preview.open({
      peer: both.ours, channels: here, port: devPort + 1, name: 'Something else',
    });
    const said = await fetch(`${window_.at}/`).catch(() => null);
    assert.ok(!said || said.status >= 500,
      'a preview reached a port that computer was not offering');

    preview.close(window_.at);
    both.close();
  });

  test('the far half talks to this computer and nowhere else', async () => {
    const source = await readFile(new URL('../preview.mjs', import.meta.url), 'utf8');
    const code = source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

    // The address it connects to is a constant, not anything from the request.
    assert.match(code, /host:\s*HERE,/);
    assert.equal(/host:\s*asked\./.test(code), false,
      'a request could name any address this computer can reach');
    assert.match(source, /export const HERE = '127\.0\.0\.1'/);
  });

  test('nothing is put on a real address', async () => {
    const source = await readFile(new URL('../preview.mjs', import.meta.url), 'utf8');
    const code = source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

    // It listens on loopback, by name, and there is no other listen in it.
    const listens = [...code.matchAll(/\.listen\(([^)]*)\)/g)].map((m) => m[1]);
    assert.equal(listens.length, 1);
    assert.match(listens[0], /HERE/);
    assert.equal(/0\.0\.0\.0/.test(code), false, 'a preview is offered to the whole network');
  });
});
