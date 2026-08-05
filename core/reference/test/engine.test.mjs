/**
 * The Workspace Engine, against real projects on a real disk.
 *
 * These tests do the thing rather than mock it: real projects, real isolated
 * ground, real settling, a real shared copy. The Engine is the only place in the
 * product where a mistake can damage the developer's actual work, so it is the
 * one place where testing against a substitute would be worth nothing.
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm, writeFile, readFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Engine } from '../src/engine.mjs';
import { checkSentence } from '../src/lexicon.mjs';
import { ulid } from '../src/identity.mjs';

const run = promisify(execFile);
let root;

before(async () => { root = await mkdtemp(join(tmpdir(), 'viberant-engine-')); });
after(async () => { await rm(root, { recursive: true, force: true }); });

/** A real project with a little history, the way a developer's would be. */
async function project(name) {
  const dir = join(root, name);
  await mkdir(dir, { recursive: true });
  const git = (...a) => run('git', a, { cwd: dir });
  await git('init', '--quiet', '-b', 'main');
  await git('config', 'user.email', 'dev@local');
  await git('config', 'user.name', 'Developer');
  await writeFile(join(dir, 'app.js'), 'export const version = 1;\n');
  await writeFile(join(dir, 'README.md'), '# A project\n');
  await git('add', '-A');
  await git('commit', '--quiet', '-m', 'Set up the project');
  return {
    dir,
    git,
    engine: new Engine({ project: ulid(), location: dir, groundRoot: join(root, name + '-ground') }),
    async log() {
      const { stdout } = await git('log', '--format=%s');
      return stdout.trim().split('\n').filter(Boolean);
    },
    async lanes() {
      const { stdout } = await git('branch', '--format=%(refname:short)');
      return stdout.trim().split('\n').filter(Boolean);
    },
  };
}

/** Stand in for an assistant doing work in an effort's ground. */
async function assistantWorks(ground, files) {
  for (const [name, body] of Object.entries(files)) {
    await writeFile(join(ground, name), body);
  }
}

// ---------------------------------------------------------------------------

describe('isolated ground', () => {
  test('an effort gets its own ground, derived from the project as it stands', async () => {
    const p = await project('p1');
    const effort = ulid();
    const r = await p.engine.prepare(effort);

    assert.equal(r.ok, true);
    assert.ok(existsSync(r.ground));
    assert.equal(await readFile(join(r.ground, 'app.js'), 'utf8'), 'export const version = 1;\n',
      'the effort starts from settled reality');
  });

  test('two efforts cannot reach each other', async () => {
    const p = await project('p2');
    const a = ulid(), b = ulid();
    const ga = (await p.engine.prepare(a)).ground;
    const gb = (await p.engine.prepare(b)).ground;

    await assistantWorks(ga, { 'app.js': 'export const version = 2; // A\n' });
    await assistantWorks(gb, { 'app.js': 'export const version = 3; // B\n' });

    assert.match(await readFile(join(ga, 'app.js'), 'utf8'), /\/\/ A/);
    assert.match(await readFile(join(gb, 'app.js'), 'utf8'), /\/\/ B/);
    assert.equal(await readFile(join(p.dir, 'app.js'), 'utf8'), 'export const version = 1;\n',
      'the project itself is untouched while efforts are in flight');
  });

  test('preparing twice is harmless', async () => {
    const p = await project('p3');
    const effort = ulid();
    const first = await p.engine.prepare(effort);
    const again = await p.engine.prepare(effort);
    assert.equal(again.ok, true);
    assert.equal(again.ground, first.ground);
  });

  test('a project with nothing saved in it is declined honestly', async () => {
    const dir = join(root, 'empty');
    await mkdir(dir, { recursive: true });
    await run('git', ['init', '--quiet', '-b', 'main'], { cwd: dir });
    const engine = new Engine({ project: ulid(), location: dir, groundRoot: join(root, 'empty-g') });
    const r = await engine.prepare(ulid());
    assert.equal(r.ok, false);
    assert.match(r.sentence, /no work saved/);
    assert.ok(r.action);
  });

  test('a folder that is not a project at all is declined honestly', async () => {
    const dir = join(root, 'plain');
    await mkdir(dir, { recursive: true });
    const engine = new Engine({ project: ulid(), location: dir, groundRoot: join(root, 'plain-g') });
    const r = await engine.prepare(ulid());
    assert.equal(r.ok, false);
    assert.ok(r.action);
  });
});

describe('describing what happened', () => {
  test('reports what was touched, in plain terms', async () => {
    const p = await project('p4');
    const effort = ulid();
    const { ground } = await p.engine.prepare(effort);
    await assistantWorks(ground, {
      'app.js': 'export const version = 2;\n',
      'billing.js': 'export function charge() {}\n',
    });

    const r = await p.engine.describe(effort);
    const byPath = Object.fromEntries(r.touched.map((t) => [t.path, t.kind]));
    assert.equal(byPath['app.js'], 'changed');
    assert.equal(byPath['billing.js'], 'added');
  });

  test('an effort that did nothing describes nothing', async () => {
    const p = await project('p5');
    const effort = ulid();
    await p.engine.prepare(effort);
    const r = await p.engine.describe(effort);
    assert.deepEqual(r.touched, []);
  });
});

describe('settling accepted work', () => {
  test('becomes exactly one entry, titled in the developer\'s own words', async () => {
    const p = await project('p6');
    const effort = ulid();
    const { ground } = await p.engine.prepare(effort);

    // An assistant works in fits and starts, as they do.
    await assistantWorks(ground, { 'billing.js': 'export function charge() {}\n' });
    await assistantWorks(ground, { 'billing.js': 'export function charge(amount) { return amount; }\n' });
    await assistantWorks(ground, { 'billing.test.js': 'test("charges", () => {});\n' });

    const r = await p.engine.settle(effort, 'make billing charge the right amount');
    assert.equal(r.ok, true);

    const entries = await p.log();
    assert.equal(entries.length, 2, 'one entry for the effort, on top of what was there');
    assert.equal(entries[0], 'make billing charge the right amount');
    assert.equal(await readFile(join(p.dir, 'billing.js'), 'utf8'),
      'export function charge(amount) { return amount; }\n');
  });

  test('leaves the project normal for people who do not use this app', async () => {
    const p = await project('p7');
    const effort = ulid();
    const { ground } = await p.engine.prepare(effort);
    await assistantWorks(ground, { 'app.js': 'export const version = 2;\n' });
    await p.engine.settle(effort, 'bump the version');

    assert.deepEqual(await p.lanes(), ['main'], 'nothing of ours is left behind');
    assert.equal(existsSync(ground), false, 'the ground is gone');

    const { stdout } = await p.git('status', '--porcelain');
    assert.equal(stdout.trim(), '', 'the project is clean');

    for (const entry of await p.log()) {
      assert.equal(checkSentence(entry).forbidden.length, 0,
        `a teammate would read: "${entry}"`);
    }
  });

  test('an effort that changed nothing is refused, kindly', async () => {
    const p = await project('p8');
    const effort = ulid();
    await p.engine.prepare(effort);
    const r = await p.engine.settle(effort, 'do the thing');
    assert.equal(r.ok, false);
    assert.match(r.sentence, /[Nn]othing changed/);
    assert.ok(r.action);
  });

  test('settling an effort that was never sent anywhere is refused, kindly', async () => {
    const p = await project('p9');
    const r = await p.engine.settle(ulid(), 'do the thing');
    assert.equal(r.ok, false);
    assert.ok(r.action);
  });

  test('work that collides with the project is refused honestly, not forced', async () => {
    const p = await project('p10');
    const effort = ulid();
    const { ground } = await p.engine.prepare(effort);
    await assistantWorks(ground, { 'app.js': 'export const version = 2; // from the effort\n' });

    // Meanwhile the developer changed the same thing themselves.
    await writeFile(join(p.dir, 'app.js'), 'export const version = 99; // by hand\n');
    await p.git('add', '-A');
    await p.git('commit', '--quiet', '-m', 'Set the version by hand');

    const r = await p.engine.settle(effort, 'bump the version');
    assert.equal(r.ok, false);
    assert.match(r.sentence, /same things/);
    assert.ok(r.action);

    const { stdout } = await p.git('status', '--porcelain');
    assert.equal(stdout.trim(), '', 'a refusal leaves the project exactly as it was');
    assert.equal(await readFile(join(p.dir, 'app.js'), 'utf8'),
      'export const version = 99; // by hand\n');
  });

  test('several efforts settle one after another without entangling', async () => {
    const p = await project('p11');
    const efforts = [ulid(), ulid(), ulid()];
    const grounds = [];
    for (const e of efforts) grounds.push((await p.engine.prepare(e)).ground);

    // Each works on its own file, in parallel, as they would.
    await assistantWorks(grounds[0], { 'a.js': 'export const a = 1;\n' });
    await assistantWorks(grounds[1], { 'b.js': 'export const b = 2;\n' });
    await assistantWorks(grounds[2], { 'c.js': 'export const c = 3;\n' });

    assert.equal((await p.engine.settle(efforts[0], 'add the first piece')).ok, true);
    assert.equal((await p.engine.settle(efforts[1], 'add the second piece')).ok, true);
    assert.equal((await p.engine.settle(efforts[2], 'add the third piece')).ok, true);

    for (const f of ['a.js', 'b.js', 'c.js']) {
      assert.ok(existsSync(join(p.dir, f)), `${f} arrived`);
    }
    assert.deepEqual((await p.log()).slice(0, 3),
      ['add the third piece', 'add the second piece', 'add the first piece']);
    assert.deepEqual(await p.lanes(), ['main']);
  });
});

describe('letting go', () => {
  test('abandoning touches nothing but the effort itself', async () => {
    const p = await project('p12');
    const keep = ulid(), drop = ulid();
    const gk = (await p.engine.prepare(keep)).ground;
    const gd = (await p.engine.prepare(drop)).ground;
    await assistantWorks(gk, { 'keep.js': 'export const keep = true;\n' });
    await assistantWorks(gd, { 'drop.js': 'export const drop = true;\n' });

    const r = await p.engine.abandon(drop);
    assert.equal(r.ok, true);

    assert.ok(existsSync(join(gk, 'keep.js')), 'the other effort is untouched');
    assert.equal(await readFile(join(p.dir, 'app.js'), 'utf8'), 'export const version = 1;\n',
      'the project never knew about it');
    assert.equal((await p.log()).length, 1);
  });

  test('an effort let go stays recoverable, then is reclaimed quietly', async () => {
    const p = await project('p13');
    const effort = ulid();
    const { ground } = await p.engine.prepare(effort);
    await assistantWorks(ground, { 'wip.js': 'export const wip = true;\n' });

    await p.engine.abandon(effort);
    const back = await p.engine.recover(effort);
    assert.equal(back.ok, true);
    assert.ok(existsSync(join(back.ground, 'wip.js')), 'everything is exactly as it was');

    await p.engine.release(effort);
    assert.equal(existsSync(ground), false);
    assert.deepEqual(await p.lanes(), ['main'], 'nothing of ours outlives it');

    const gone = await p.engine.recover(effort);
    assert.equal(gone.ok, false);
    assert.ok(gone.action);
  });
});

describe('sending to the shared copy', () => {
  test('settled work reaches the shared copy', async () => {
    const p = await project('p14');
    const shared = join(root, 'shared.git');
    await run('git', ['init', '--quiet', '--bare', '-b', 'main', shared]);
    await p.git('remote', 'add', 'origin', shared);

    const effort = ulid();
    const { ground } = await p.engine.prepare(effort);
    await assistantWorks(ground, { 'billing.js': 'export function charge() {}\n' });
    await p.engine.settle(effort, 'add billing');

    const r = await p.engine.publish();
    assert.equal(r.ok, true);

    const { stdout } = await run('git', ['log', '--format=%s'], { cwd: shared });
    assert.equal(stdout.trim().split('\n')[0], 'add billing',
      'the shared copy reads in the developer\'s own words');
  });

  test('a project with no shared copy says so plainly', async () => {
    const p = await project('p15');
    const r = await p.engine.publish();
    assert.equal(r.ok, false);
    assert.match(r.sentence, /no shared copy/);
    assert.ok(r.action);
  });

  test('an unreachable shared copy does not lose the settled work', async () => {
    const p = await project('p16');
    await p.git('remote', 'add', 'origin', join(root, 'nowhere-at-all.git'));
    const effort = ulid();
    const { ground } = await p.engine.prepare(effort);
    await assistantWorks(ground, { 'x.js': 'export const x = 1;\n' });
    await p.engine.settle(effort, 'add the thing');

    const r = await p.engine.publish();
    assert.equal(r.ok, false);
    assert.match(r.sentence, /settled here but not sent/);
    assert.equal((await p.log())[0], 'add the thing', 'the work is safely settled regardless');
  });
});

describe('the seam does not leak', () => {
  test('every sentence the Engine can say passes the vocabulary contract', async () => {
    // Drive every refusal path and check what comes out.
    const said = [];
    const collect = (r) => { if (r && r.ok === false) said.push(r); };

    const plain = join(root, 'leak-plain');
    await mkdir(plain, { recursive: true });
    const e1 = new Engine({ project: ulid(), location: plain, groundRoot: join(root, 'leak-g1') });
    collect(await e1.prepare(ulid()));

    const missing = new Engine({
      project: ulid(), location: join(root, 'not-here'), groundRoot: join(root, 'leak-g2'),
    });
    collect(await missing.prepare(ulid()));

    const p = await project('leak');
    collect(await p.engine.settle(ulid(), 'x'));
    const empty = ulid();
    await p.engine.prepare(empty);
    collect(await p.engine.settle(empty, 'x'));
    collect(await p.engine.publish());
    collect(await p.engine.recover(ulid()));

    assert.ok(said.length >= 5, `expected to exercise the refusal paths, got ${said.length}`);
    for (const r of said) {
      const s = checkSentence(r.sentence), a = checkSentence(r.action);
      assert.equal(s.ok, true, `sentence leaked: "${r.sentence}" — ${s.problems.join('; ')}`);
      assert.equal(a.ok, true, `action leaked: "${r.action}" — ${a.problems.join('; ')}`);
    }
  });

  test('what the Engine hands back is domain-shaped, not mechanism-shaped', async () => {
    const p = await project('shape');
    const effort = ulid();
    const prepared = await p.engine.prepare(effort);
    const { ground } = prepared;
    await assistantWorks(ground, { 'x.js': 'export const x = 1;\n' });
    const described = await p.engine.describe(effort);

    assert.deepEqual(Object.keys(prepared).sort(), ['ground', 'ok']);
    assert.deepEqual(Object.keys(described).sort(), ['hasWork', 'ok', 'touched']);
    for (const t of described.touched) {
      assert.deepEqual(Object.keys(t).sort(), ['kind', 'path']);
      assert.ok(['added', 'changed', 'removed'].includes(t.kind));
    }
  });

  test('the Engine can say how much room efforts are taking', async () => {
    const p = await project('room');
    const a = ulid(), b = ulid();
    await p.engine.prepare(a);
    await p.engine.prepare(b);
    const grounds = await p.engine.grounds();
    assert.equal(grounds.length, 2);
    assert.deepEqual(grounds.map((g) => g.effort).sort(), [a, b].sort());
  });
});
