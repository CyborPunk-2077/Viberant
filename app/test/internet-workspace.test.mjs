import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { request } from 'node:http';

import { start as startPlane } from '../plane-service.mjs';
import { start as startRelay } from '../relay.mjs';

// Decoded, not sliced off the address by hand: a folder with a space in its
// name arrives here as %20, and the copy that gets started is then a file that
// is not there.
const SERVER = fileURLToPath(new URL('../server.mjs', import.meta.url));
const run = promisify(execFile);
let root;
let plane;
let relay;
const children = [];

const pause = (ms) => new Promise((done) => setTimeout(done, ms));

function ask(port, method, path, body) {
  const payload = body === undefined ? null : Buffer.from(JSON.stringify(body));
  return new Promise((done, fail) => {
    const req = request({
      host: '127.0.0.1', port, path, method,
      headers: payload ? { 'content-type': 'application/json', 'content-length': payload.length } : {},
    }, (res) => {
      const parts = [];
      res.on('data', (part) => parts.push(part));
      res.on('end', () => {
        try { done(JSON.parse(Buffer.concat(parts).toString('utf8'))); } catch { done({ ok: false }); }
      });
    });
    req.on('error', fail);
    req.setTimeout(70_000, () => req.destroy(new Error('no answer')));
    if (payload) req.write(payload);
    req.end();
  });
}

async function until(fn, within = 30_000) {
  const end = Date.now() + within;
  while (Date.now() < end) {
    const value = await fn().catch(() => null);
    if (value) return value;
    await pause(150);
  }
  return null;
}

async function copy(name, port, shift) {
  const home = join(root, name, 'home');
  await mkdir(home, { recursive: true });
  const child = spawn(process.execPath, [SERVER], {
    env: { ...process.env, HOME: home, USERPROFILE: home, PORT: String(port), VIBERANT_PORT_SHIFT: String(shift) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const output = [];
  child.stdout.on('data', (part) => output.push(String(part)));
  child.stderr.on('data', (part) => output.push(String(part)));
  children.push(child);
  const app = {
    port, home, output,
    get: (path) => ask(port, 'GET', path),
    post: (path, body) => ask(port, 'POST', path, body),
  };
  assert.ok(await until(() => app.get('/me').then((one) => one.machine ? one : null)), `copy ${name} did not start`);
  return app;
}

before(async () => {
  root = await mkdtemp(join(tmpdir(), 'viberant-internet-workspace-'));
  plane = startPlane({ port: 0, host: '127.0.0.1' });
  relay = startRelay({ port: 0, host: '127.0.0.1' });
  await Promise.all([plane.listening, relay.listening]);
});

after(async () => {
  for (const child of children) child.kill();
  await Promise.allSettled([plane.stop(), relay.stop()]);
  await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
});

test('join, chat, and offered projects cross the relay with LAN sharing off', async () => {
  const A = await copy('A', 7881, 160);
  const B = await copy('B', 7882, 190);
  const planePort = plane.server.address().port;
  const relayPort = relay.server.address().port;

  for (const app of [A, B]) {
    assert.equal((await app.post('/settings', { id: 'workspaceService', value: `http://127.0.0.1:${planePort}` })).ok, true);
    assert.equal((await app.post('/settings', { id: 'relayService', value: `127.0.0.1:${relayPort}` })).ok, true);
  }

  assert.equal((await A.post('/team/create', { name: 'Across Internet' })).ok, true);
  const invited = await A.post('/team/invite', { role: 'member' });
  assert.equal(invited.ok, true, invited.sentence);
  const joined = await B.post('/team/join', { code: invited.code });
  assert.equal(joined.ok, true, `${joined.sentence}\nA: ${A.output.join('')}\nB: ${B.output.join('')}`);

  const project = join(B.home, 'OfferedProject');
  await mkdir(project, { recursive: true });
  await writeFile(join(project, 'hello.txt'), 'across the relay\n', 'utf8');
  await run('git', ['init', '--quiet', '--initial-branch=main'], { cwd: project });
  await run('git', ['remote', 'add', 'origin', 'https://github.com/viberant-team/offered-project.git'], { cwd: project });
  assert.equal((await B.post('/local/offer', { path: project, kind: 'project' })).ok, true);

  for (const app of [A, B]) {
    assert.equal((await app.post('/settings', { id: 'localSharing', value: false })).ok, true);
  }

  const sent = await A.post('/workspace/say', { text: 'internet-workspace-message' });
  assert.equal(sent.ok, true, sent.sentence);
  assert.equal(sent.reached, 1);
  const note = await until(async () => (await B.get('/workspace/notes')).notes
    ?.find((one) => one.text === 'internet-workspace-message'));
  assert.ok(note, `message did not arrive: ${A.output.join('')} ${B.output.join('')}`);

  const shared = await until(async () => (await A.get('/team/projects')).projects
    ?.find((one) => one.name === 'OfferedProject'));
  assert.ok(shared, `remote offer did not appear: ${A.output.join('')} ${B.output.join('')}`);
  assert.equal(shared.copies.some((one) => !one.you), true);
  assert.equal(shared.github.state, 'SHARED');
  assert.equal(`${shared.github.owner}/${shared.github.repo}`, 'viberant-team/offered-project');
});
