/**
 * Running something on somebody else's computer.
 *
 * The most dangerous thing in the product, so the tests are mostly about what
 * is refused. Real processes, on this machine, started by the real code — a
 * mocked `spawn` would prove nothing about the one thing worth proving, which
 * is that the wrong caller never reaches it.
 *
 * The shape of every check: **the far end decides.** A caller asking nicely is
 * not authorisation. So every refusal below is made by the machine that would
 * do the work, from what it believes about the workspace on its own disk.
 */

import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let root, remote, members, jobs, project;

const aDevice = (id, name) => ({
  deviceId: id, signPublic: `s-${id}`, agreePublic: `a-${id}`, displayName: name,
});

/** A workspace with an owner's machine and a teammate's machine in it. */
async function twoComputers() {
  await members.forgetAll();
  const made = await members.create({
    name: 'Atlas', owner: 'danni', device: aDevice('mine', 'Danni-PC'),
  });
  const asked = await members.invite({ workspace: made.workspace, by: 'danni' });
  const joined = await members.redeem({
    workspace: await members.current(),
    code: asked.code,
    person: 'rahul',
    device: aDevice('theirs', 'Rahul-Laptop'),
  });
  return joined.workspace;
}

before(async () => {
  root = await mkdtemp(join(tmpdir(), 'viberant-remote-'));
  await mkdir(join(root, 'home'), { recursive: true });
  process.env.USERPROFILE = join(root, 'home');
  process.env.HOME = join(root, 'home');

  remote = await import('../remote.mjs');
  members = await import('../members.mjs');
  jobs = await import('../jobs.mjs');

  project = join(root, 'Atlas');
  await mkdir(project, { recursive: true });
  await writeFile(join(project, 'package.json'), JSON.stringify({
    name: 'atlas',
    scripts: {
      build: 'node -e "console.log(\'built ok\')"',
      dev: 'node -e "console.log(\'ready at http://localhost:5173/\')"',
      test: 'node -e "process.stderr.write(String.fromCharCode(88)); process.exit(3)"',
    },
    devDependencies: { vite: '5.0.0' },
  }, null, 2));
});

after(async () => {
  remote.closeEverything();
  await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
});

beforeEach(() => remote.closeEverything());

describe('joining a workspace is not a reason to run anything', () => {
  test('a member who has not been trusted is refused, with a sentence', async () => {
    const ws = await twoComputers();

    for (const kind of [remote.TERMINAL, remote.RUN, remote.BUILD]) {
      const out = remote.mayAsk({ workspace: ws, fromDevice: 'theirs', kind });
      assert.equal(out.ok, false, `${kind} was allowed by membership alone`);
      assert.match(out.sentence, /not allowed/);
      assert.match(out.action, /can allow it/);
    }
  });

  test('a computer nobody added is refused', async () => {
    const ws = await twoComputers();
    const out = remote.mayAsk({ workspace: ws, fromDevice: 'a-stranger', kind: remote.RUN });
    assert.equal(out.ok, false);
  });

  test('with no workspace at all, nothing is allowed', () => {
    const out = remote.mayAsk({ workspace: null, fromDevice: 'mine', kind: remote.TERMINAL });
    assert.equal(out.ok, false);
    assert.match(out.sentence, /not in a workspace/);
  });

  test('a revoked computer is refused even if it was allowed a moment ago', async () => {
    let ws = await twoComputers();
    await members.allow(ws, 'theirs', remote.BUILD, true);
    ws = await members.current();
    assert.equal(remote.mayAsk({ workspace: ws, fromDevice: 'theirs', kind: remote.BUILD }).ok, true);

    await members.revoke(ws, 'theirs');
    ws = await members.current();
    assert.equal(remote.mayAsk({ workspace: ws, fromDevice: 'theirs', kind: remote.BUILD }).ok, false);
  });

  test('being allowed one thing is not being allowed the others', async () => {
    let ws = await twoComputers();
    await members.allow(ws, 'theirs', remote.BUILD, true);
    ws = await members.current();

    assert.equal(remote.mayAsk({ workspace: ws, fromDevice: 'theirs', kind: remote.BUILD }).ok, true);
    assert.equal(remote.mayAsk({ workspace: ws, fromDevice: 'theirs', kind: remote.TERMINAL }).ok, false);
    assert.equal(remote.mayAsk({ workspace: ws, fromDevice: 'theirs', kind: remote.RUN }).ok, false);
  });
});

describe('a terminal, when somebody is allowed one', () => {
  test('the owner gets one on their own computer, and it answers', async () => {
    const ws = await twoComputers();
    let said = '';

    const out = remote.openTerminal({
      workspace: ws,
      fromDevice: 'mine',
      whoName: 'danni',
      where: project,
      onOutput: (t) => { said += t; },
    });
    assert.equal(out.ok, true, out.sentence);
    assert.equal(out.at, project, 'it opened somewhere other than where it was asked to');

    remote.typeInto(out.session, 'echo viberant-was-here\n');
    await new Promise((r) => setTimeout(r, 2500));

    assert.match(said, /viberant-was-here/, 'the terminal produced nothing');
    remote.closeTerminal(out.session);
  });

  test('it is visible while it is open, and gone afterwards', async () => {
    const ws = await twoComputers();
    const out = remote.openTerminal({
      workspace: ws, fromDevice: 'mine', whoName: 'danni', where: project, onOutput: () => {},
    });

    const open = remote.openSessions();
    assert.equal(open.length, 1);
    assert.equal(open[0].who, 'danni');
    assert.equal(open[0].kind, remote.TERMINAL);
    // What is shown is the fact of it, never what was typed or what came back.
    assert.equal('output' in open[0], false);
    assert.equal('lines' in open[0], false);

    remote.closeTerminal(out.session);
    assert.equal(remote.openSessions().length, 0);
  });

  test('a teammate who is not allowed one does not get one', async () => {
    const ws = await twoComputers();
    const out = remote.openTerminal({
      workspace: ws, fromDevice: 'theirs', whoName: 'rahul', where: project, onOutput: () => {},
    });
    assert.equal(out.ok, false);
    assert.equal(remote.openSessions().length, 0, 'a refused session still started a process');
  });

  test('typing into one that is closed does nothing', async () => {
    const out = remote.typeInto('not-a-session', 'rm -rf /\n');
    assert.equal(out.ok, false);
  });

  test('only so many may be open at once', async () => {
    const ws = await twoComputers();
    const opened = [];
    for (let i = 0; i < remote.__testOnly.AT_ONCE; i += 1) {
      const one = remote.openTerminal({
        workspace: ws, fromDevice: 'mine', whoName: 'danni', where: project, onOutput: () => {},
      });
      if (one.ok) opened.push(one.session);
    }
    const over = remote.mayAsk({ workspace: ws, fromDevice: 'someone-new', kind: remote.TERMINAL });
    assert.equal(over.ok, false);
    assert.match(over.sentence, /as much as it will at once/);

    for (const id of opened) remote.closeTerminal(id);
  });
});

describe('what a project may be asked to do comes out of the project', () => {
  test('the named things are read from the project, not from the request', async () => {
    const can = await remote.whatItCanDo(project);
    assert.equal(can.canBuild, true);
    assert.equal(can.canRun, true);
    assert.match(can.commands.build, /run build$/);
    assert.equal('rm -rf /' in can.commands, false);
  });

  test('a name the project does not have is refused, and says what it does have', async () => {
    const ws = await twoComputers();
    const out = await remote.doNamed({
      workspace: ws, fromDevice: 'mine', whoName: 'danni', dir: project, name: 'whatever-i-like',
    });
    assert.equal(out.ok, false);
    assert.match(out.sentence, /nothing called whatever-i-like/);
    assert.match(out.action, /build/);
  });

  test('nothing anybody sends becomes a command', async () => {
    const source = await import('node:fs/promises')
      .then((fs) => fs.readFile(new URL('../remote.mjs', import.meta.url), 'utf8'));
    const code = source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

    // Everything that starts a process, and what it is given.
    const starts = [...code.matchAll(/spawn\(\s*([^,]+),/g)].map((m) => m[1].trim());
    assert.deepEqual(starts.sort(), ['runner', 'shell.command'],
      'something starts a process from a value this did not choose');

    // `runner` may only ever come from the project's own list.
    assert.match(code, /const \[runner, \.\.\.args\] = command\.split\(' '\)/);
    assert.match(code, /const command = can\.commands\[name\]/);
  });

  test('a project that is not here says so rather than failing oddly', async () => {
    const ws = await twoComputers();
    const out = await remote.doNamed({
      workspace: ws, fromDevice: 'mine', whoName: 'danni', dir: join(root, 'nowhere'), name: 'build',
    });
    assert.equal(out.ok, false);
    assert.match(out.sentence, /not on this computer/);
    assert.match(out.action, /Send it over/);
  });
});

describe('building on a computer of yours', () => {
  test('it runs, it is a job, and the job says how it went', async () => {
    const ws = await twoComputers();
    const out = await remote.doNamed({
      workspace: ws, fromDevice: 'mine', whoName: 'danni', dir: project, name: 'build', kind: remote.BUILD,
    });
    assert.equal(out.ok, true, out.sentence);

    await new Promise((r) => setTimeout(r, 4000));

    const job = jobs.get(out.job);
    assert.ok(job, 'the build was not a job, so it cannot survive leaving the page');
    assert.equal(job.kind, 'build');
    assert.equal(job.ok, true, JSON.stringify(job.lines?.slice(-3)));
    assert.match((job.lines ?? []).join('\n'), /built ok/);
  });

  test('one that fails is reported as failing, with what it said', async () => {
    const ws = await twoComputers();
    const out = await remote.doNamed({
      workspace: ws, fromDevice: 'mine', whoName: 'danni', dir: project, name: 'test', kind: remote.BUILD,
    });
    assert.equal(out.ok, true, 'it should start');

    await new Promise((r) => setTimeout(r, 4000));
    const job = jobs.get(out.job);
    assert.equal(job.ok, false);
    assert.match(job.sentence, /stopped with a problem/);
  });

  test('a job outlives the thing that started it, which is what surviving navigation means', async () => {
    const ws = await twoComputers();
    const out = await remote.doNamed({
      workspace: ws, fromDevice: 'mine', whoName: 'danni', dir: project, name: 'build', kind: remote.BUILD,
    });
    await new Promise((r) => setTimeout(r, 4000));

    // Nothing was held by a page. The record is in the jobs list, by name.
    assert.ok(jobs.all().some((j) => j.id === out.job));
  });
});

describe('an address a development server mentions', () => {
  test('it is read out of what the server printed', () => {
    assert.deepEqual(remote.portsIn('  ➜  Local:   http://localhost:5173/'), [5173]);
    assert.deepEqual(remote.portsIn('listening on http://127.0.0.1:3000'), [3000]);
    assert.deepEqual(remote.portsIn('bound to 0.0.0.0:8080 ok'), [8080]);
  });

  test('and nothing else is treated as one', () => {
    assert.deepEqual(remote.portsIn('installed 5173 packages'), []);
    assert.deepEqual(remote.portsIn('took 1234 ms'), []);
    assert.deepEqual(remote.portsIn('version 1.2.3'), []);
    assert.deepEqual(remote.portsIn('http://example.com/localhost:99999'), []);
  });

  test('a running dev server offers the address it said, and only that', async () => {
    const ws = await twoComputers();
    const out = await remote.doNamed({
      workspace: ws, fromDevice: 'mine', whoName: 'danni', dir: project, name: 'dev', kind: remote.RUN,
    });
    assert.equal(out.ok, true);

    await new Promise((r) => setTimeout(r, 3000));
    const job = jobs.get(out.job);
    assert.match((job.lines ?? []).join('\n'), /localhost:5173/,
      'the address has to come from the server itself, not from a scan of this computer');
  });
});
