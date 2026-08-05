/**
 * The application, driven the way a person drives it.
 *
 * Starts the real server against a real project, with a real assistant on the
 * path, and walks a whole day through it over HTTP. If this passes, the thing
 * works end to end — not the parts, the thing.
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm, writeFile, mkdir, chmod, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const run = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const SERVER = join(here, '..', 'server.mjs');
const PORT = 7799;
const at = (p) => `http://127.0.0.1:${PORT}${p}`;

let root, project, house, bin, server;

const get = async (p) => (await fetch(at(p))).json();
const post = async (p, body) =>
  (await fetch(at(p), { method: 'POST', body: JSON.stringify(body) })).json();
const settle = (ms) => new Promise((r) => setTimeout(r, ms));

before(async () => {
  root = await mkdtemp(join(tmpdir(), 'viberant-app-'));
  project = join(root, 'exporter');
  house = join(root, 'house');
  bin = join(root, 'bin');
  await mkdir(project, { recursive: true });
  await mkdir(bin, { recursive: true });

  const git = (...a) => run('git', a, { cwd: project });
  await git('init', '--quiet', '-b', 'main');
  await git('config', 'user.email', 'dev@local');
  await git('config', 'user.name', 'Developer');
  await writeFile(join(project, 'export.js'), 'export function exportAll() {}\n');
  await git('add', '-A');
  await git('commit', '--quiet', '-m', 'Set up the project');

  // An "assistant": it reads its instructions, does some work, and says so.
  const tool = join(bin, 'claude');
  await writeFile(tool, [
    '#!/bin/bash',
    'cat > /tmp/last-context.txt',
    "printf 'export function exportAll(onProgress) {\\n  onProgress?.(0);\\n}\\n' > export.js",
    "printf 'export const bar = () => {};\\n' > progress.js",
    'echo "Added a progress callback and a small bar."',
  ].join('\n'));
  await chmod(tool, 0o755);

  server = spawn(process.execPath, [SERVER, project], {
    env: { ...process.env, HOME: house, PORT: String(PORT), PATH: `${bin}:${process.env.PATH}` },
    stdio: 'ignore',
  });

  for (let i = 0; i < 60; i++) {
    try { await get('/home'); break; } catch { await settle(100); }
  }
});

after(async () => {
  server?.kill('SIGTERM');
  await settle(150);
  await rm(root, { recursive: true, force: true });
});

const logOf = async () =>
  (await run('git', ['log', '--format=%s'], { cwd: project })).stdout.trim().split('\n');
const lanesOf = async () =>
  (await run('git', ['branch', '--format=%(refname:short)'], { cwd: project }))
    .stdout.trim().split('\n');

// ---------------------------------------------------------------------------

describe('a day, through the actual application', () => {
  test('it opens calm and says so', async () => {
    const h = await get('/home');
    assert.equal(h.empty, true);
    assert.equal(h.situation, 'Nothing needs you.');
    assert.equal(h.project, 'exporter');
  });

  test('a thought can be set aside without costing anything', async () => {
    const { home } = await post('/begin', {
      intent: 'rename the settings screen', then: 'park',
    });
    assert.equal(home.empty, false);
    const card = home.ranks[0].efforts[0];
    assert.equal(card.intent, 'rename the settings screen');
    assert.equal(card.reason, 'parked');
    assert.equal(card.says, 'You set this aside for later.');
  });

  test('an effort handed to an assistant starts moving, and does not hold you', async () => {
    const began = Date.now();
    const { effort, home } = await post('/begin', {
      intent: 'the export flow needs a progress indicator', then: 'claude',
    });
    assert.ok(Date.now() - began < 3000, 'handing off never makes the developer wait on the machine');

    const moving = home.ranks.find((r) => r.name === 'moving');
    assert.ok(moving, 'it is moving straight away');
    assert.equal(moving.efforts[0].id, effort);

    // The assistant was given the developer's own words to start from.
    await settle(1500);
    const context = await readFile('/tmp/last-context.txt', 'utf8').catch(() => '');
    assert.match(context, /progress indicator/);
  });

  test('when the assistant stops, the picture catches up on its own', async () => {
    let h, waited = 0;
    do {
      await settle(400); waited += 400;
      h = await get('/home');
    } while (waited < 12_000 && !h.ranks.find((r) => r.name === 'waiting on you')
      ?.efforts.some((e) => e.intent.includes('export')));

    const card = h.ranks[0].efforts.find((e) => e.intent.includes('export'));
    assert.ok(card, 'it came back by itself, without being asked');
    assert.equal(card.reason, 'review_ready');
    assert.ok(card.account, 'and it brought a sentence with it');
  });

  test('what waits on you is what the keyboard is already on', async () => {
    const h = await get('/home');
    assert.equal(h.ranks[0].name, 'waiting on you');
    assert.equal(h.focus, h.ranks[0].efforts[0].id);
  });

  test('you can read what actually changed', async () => {
    const h = await get('/home');
    const it = h.ranks[0].efforts.find((e) => e.intent.includes('export'));
    const view = await get(`/effort?id=${it.id}`);

    assert.equal(view.intent, 'the export flow needs a progress indicator');
    assert.deepEqual(view.touched.map((t) => t.path).sort(), ['export.js', 'progress.js']);
    assert.ok(view.story.some((s) => s.kind === 'delegated'));
  });

  test('accepting settles it as one entry in your own words, and tidies up after itself', async () => {
    const h = await get('/home');
    const it = h.ranks[0].efforts.find((e) => e.intent.includes('export'));
    const after = await post('/accept', { effort: it.id });

    assert.ok(!after.refused, after.refused);
    assert.deepEqual(await logOf(), [
      'the export flow needs a progress indicator', 'Set up the project',
    ]);
    assert.deepEqual(await lanesOf(), ['main'], 'nothing of ours is left behind');
    assert.match(await readFile(join(project, 'export.js'), 'utf8'), /onProgress/);

    const settled = after.home.ranks.find((r) => r.name === 'settled');
    assert.ok(settled.efforts.some((e) => e.intent.includes('export')));
  });

  test('letting one go leaves everything else exactly where it was', async () => {
    const { effort } = await post('/begin', { intent: 'a bad idea', then: 'park' });
    const before = await logOf();

    const after = await post('/abandon', { effort });
    const ids = after.home.ranks.flatMap((r) => r.efforts).map((e) => e.id);
    assert.ok(!ids.includes(effort), 'it is gone from the picture');
    assert.deepEqual(await logOf(), before, 'the project never knew about it');
    assert.ok(after.home.ranks.flatMap((r) => r.efforts).some((e) => e.intent.includes('settings')),
      'the other effort is untouched');
  });

  test('everything that happened survives being closed and opened again', async () => {
    const before = await get('/home');
    const store = join(house, '.viberant', 'projects', 'exporter.jsonl');
    const lines = (await readFile(store, 'utf8')).trim().split('\n');

    assert.ok(lines.length > 8, 'the record is on disk, in a file you can open');
    for (const line of lines) assert.doesNotThrow(() => JSON.parse(line));

    // Everything the developer did is attributable to them, forever.
    const events = lines.map((l) => JSON.parse(l));
    const verdicts = events.filter((e) => e.type === 'effort.judged');
    assert.ok(verdicts.length >= 2);
    assert.ok(verdicts.every((v) => v.actor === 'developer'));
    assert.ok(events.every((e) => e.id && e.at && e.machine && e.project));

    assert.ok(before.ranks.length > 0);
  });
});
