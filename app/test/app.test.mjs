/**
 * The manager, driven the way a person drives it.
 *
 * Starts the real server, points it at a real project with a real tool on the
 * path, and walks the whole errand through: find the project, open it, start an
 * app in it, save and send. If this passes, the thing works — not the parts,
 * the thing.
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm, writeFile, mkdir, chmod, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const run = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const SERVER = join(here, '..', 'server.mjs');
const PORT = 7802;
const at = (p) => `http://127.0.0.1:${PORT}${p}`;

let root, projectDir, house, bin, server, shared;

const get = async (p) => (await fetch(at(p))).json();
const post = async (p, body) => (await fetch(at(p), {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
})).json();
const settle = (ms) => new Promise((r) => setTimeout(r, ms));

before(async () => {
  root = await mkdtemp(join(tmpdir(), 'viberant-mgr-e2e-'));
  house = join(root, 'home');
  bin = join(root, 'bin');
  const workspace = join(root, 'code');
  projectDir = join(workspace, 'exporter');
  shared = join(root, 'shared.git');
  await mkdir(projectDir, { recursive: true });
  await mkdir(bin, { recursive: true });
  await mkdir(house, { recursive: true });

  const git = (...a) => run('git', a, { cwd: projectDir });
  await git('init', '--quiet', '-b', 'main');
  await git('config', 'user.email', 'dev@local');
  await git('config', 'user.name', 'Developer');
  await writeFile(join(projectDir, 'export.js'), 'export function exportAll() {}\n');
  await git('add', '-A');
  await git('commit', '--quiet', '-m', 'Set up the project');
  await run('git', ['init', '--quiet', '--bare', '-b', 'main', shared]);
  await git('remote', 'add', 'origin', shared);

  // A stand-in for a desktop AI app: it records the folder it was opened in.
  const tool = join(bin, 'cursor');
  await writeFile(tool, `#!/bin/bash\necho "$1" > ${join(root, 'opened-at.txt')}\n`);
  await chmod(tool, 0o755);

  server = spawn(process.execPath, [SERVER], {
    env: { ...process.env, HOME: house, PORT: String(PORT), PATH: `${bin}:${process.env.PATH}` },
    stdio: 'ignore',
  });
  for (let i = 0; i < 80; i++) {
    try { await get('/projects'); break; } catch { await settle(100); }
  }
});

after(async () => {
  server?.kill('SIGTERM');
  await settle(150);
  await rm(root, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------

describe('the errand, start to finish', () => {
  test('it opens with nothing, and does not pretend otherwise', async () => {
    const d = await get('/projects');
    assert.deepEqual(d.projects, []);
    assert.equal(d.current, null);
  });

  test('pointing it at a folder of folders finds the projects in it', async () => {
    const { found } = await get('/look?in=' + encodeURIComponent(join(root, 'code')));
    assert.deepEqual(found.map((f) => f.name), ['exporter']);
  });

  test('a folder that is not there is declined, not crashed on', async () => {
    const r = await post('/open', { path: join(root, 'nowhere') });
    assert.equal(r.ok, false);
    assert.ok(r.sentence && r.action);
  });

  test('opening a project says plainly where it stands', async () => {
    const r = await post('/open', { path: projectDir });
    assert.equal(r.ok, true);
    assert.equal(r.name, 'exporter');
    assert.equal(r.says, 'Everything here is saved.');
  });

  test('and it is remembered, so next time is one click', async () => {
    const d = await get('/projects');
    assert.deepEqual(d.projects.map((p) => p.name), ['exporter']);
    assert.equal(d.current, projectDir);
  });

  test('unsaved work is noticed and said in plain words', async () => {
    await writeFile(join(projectDir, 'progress.js'), 'export const bar = 1\n');
    const p = await get('/project');
    assert.equal(p.says, 'One file changed since you last saved.');
  });

  test('the apps on this computer are offered, with no favourite among them', async () => {
    const { tools } = await get('/tools');
    const names = tools.map((t) => t.name);
    assert.ok(names.includes('Cursor'), 'it found the app that is installed');
    assert.ok(!tools.some((t) => t.recommended || t.default),
      'nothing here is marked as the one you should use');
  });

  test('starting an app opens it already in the project folder', async () => {
    const r = await post('/launch', { tool: 'cursor' });
    assert.equal(r.ok, true, r.sentence);
    assert.equal(r.at, projectDir);

    await settle(400);
    const openedAt = (await readFile(join(root, 'opened-at.txt'), 'utf8')).trim();
    assert.equal(openedAt, projectDir, 'the app was handed the folder — no adding it by hand');
  });

  test('and that is remembered as something going on here', async () => {
    const p = await get('/project');
    const going = p.home.ranks.flatMap((r) => r.efforts);
    assert.equal(going.length, 1);
    assert.match(going[0].intent, /Cursor/);
    assert.equal(going[0].assistant, 'cursor');
  });

  test('an app that is not installed is declined plainly', async () => {
    const r = await post('/launch', { tool: 'windsurf' });
    assert.equal(r.ok, false);
    assert.match(r.sentence, /not seem to be installed/);
    assert.ok(r.action);
  });

  test('saving and sending is one press', async () => {
    const r = await post('/publish', { message: 'Added a progress bar' });
    assert.equal(r.ok, true, r.sentence);
    assert.equal(r.sent, true);

    const { stdout } = await run('git', ['log', '--format=%s'], { cwd: shared });
    assert.equal(stdout.trim().split('\n')[0], 'Added a progress bar');
  });

  test('and afterwards it says so', async () => {
    const p = await get('/project');
    assert.equal(p.says, 'Everything here is saved and sent.');
  });

  test('you can mark something finished, or drop it', async () => {
    const before = await get('/project');
    const it = before.home.ranks.flatMap((r) => r.efforts)[0];

    const after = await post('/done', { effort: it.id });
    assert.equal(after.ok, true);
    const settled = after.home.ranks.find((r) => r.name === 'settled');
    assert.ok(settled.efforts.some((e) => e.id === it.id));
  });

  test('everything that happened is on disk, in a file you can open', async () => {
    const store = join(house, '.viberant', 'projects', 'exporter.jsonl');
    assert.ok(existsSync(store));
    const lines = (await readFile(store, 'utf8')).trim().split('\n');
    for (const line of lines) assert.doesNotThrow(() => JSON.parse(line));

    const events = lines.map((l) => JSON.parse(l));
    assert.ok(events.some((e) => e.type === 'effort.judged' && e.actor === 'developer'));
    assert.ok(events.every((e) => e.id && e.at && e.machine));
  });

  test('nothing about the project itself was left behind by us', async () => {
    const { stdout } = await run('git', ['branch', '--format=%(refname:short)'], { cwd: projectDir });
    assert.deepEqual(stdout.trim().split('\n'), ['main']);
  });
});
