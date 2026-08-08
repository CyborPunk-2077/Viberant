/**
 * Invitations that run out, and workspaces you can get out of.
 *
 * Two things people were stuck with: a code that said it expired in ten minutes
 * and then sat there forever, and no way at all to stop taking part in a
 * workspace once you were in one.
 *
 * The rule underneath both, and the only one worth being careful about:
 * **nothing here deletes anybody's work.** Leaving does not, closing does not,
 * and closing does not reach into the machines of people who joined.
 */

import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
let root, members;

const aDevice = (id, name) => ({
  deviceId: id, signPublic: `s-${id}`, agreePublic: `a-${id}`, displayName: name,
});

before(async () => {
  root = await mkdtemp(join(tmpdir(), 'viberant-leaving-'));
  await mkdir(join(root, 'home'), { recursive: true });
  process.env.USERPROFILE = join(root, 'home');
  process.env.HOME = join(root, 'home');
  members = await import('../members.mjs');
});

after(async () => {
  await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
});

beforeEach(async () => { await members.forgetAll(); });

async function aWorkspace() {
  const made = await members.create({
    name: 'Atlas', owner: 'danni', device: aDevice('mine', 'Danni-PC'),
  });
  return made.workspace;
}

describe('an invitation stops existing when it runs out', () => {
  test('one that has run out is not in the list any more', async () => {
    const ws = await aWorkspace();
    const asked = await members.invite({ workspace: ws, by: 'danni' });
    assert.equal(asked.ok, true);

    let now = await members.current();
    assert.equal((await members.liveInvites(now)).length, 1);

    for (const one of Object.values(now.invites)) one.expiresAt = Date.now() - 1;
    await members.save(now);

    now = await members.current();
    assert.deepEqual(await members.liveInvites(now), [],
      'a code that would be refused is still being offered');
  });

  test('and is thrown away rather than left lying about', async () => {
    const ws = await aWorkspace();
    await members.invite({ workspace: ws, by: 'danni' });

    let now = await members.current();
    for (const one of Object.values(now.invites)) one.expiresAt = Date.now() - 1;
    await members.save(now);

    now = await members.current();
    assert.equal(await members.sweepInvites(now), 1);
    assert.deepEqual(Object.keys((await members.current()).invites), []);
  });

  test('a restart does not give a dying code another ten minutes', async () => {
    const ws = await aWorkspace();
    const asked = await members.invite({ workspace: ws, by: 'danni' });

    // The clock that decides is the one written down, and it is on the disk.
    const onDisk = JSON.parse(await readFile(members.BOOK_FILE, 'utf8'));
    const [one] = Object.values(Object.values(onDisk.workspaces)[0].invites);
    assert.equal(one.expiresAt, asked.expiresAt,
      'the moment it runs out is not the one that was written down');
    assert.ok(one.expiresAt - Date.now() <= members.INVITE_LASTS);
  });

  test('a used one is swept too, so the list is only what is usable', async () => {
    const ws = await aWorkspace();
    const asked = await members.invite({ workspace: ws, by: 'danni' });
    await members.redeem({
      workspace: await members.current(),
      code: asked.code,
      person: 'rahul',
      device: aDevice('theirs', 'Rahul-Laptop'),
    });

    const now = await members.current();
    assert.deepEqual(await members.liveInvites(now), []);
  });
});

describe('leaving a workspace, from this computer', () => {
  test('this computer stops taking part and the workspace is gone from here', async () => {
    const ws = await aWorkspace();
    const out = await members.leave(ws.id, 'mine');

    assert.equal(out.ok, true);
    assert.equal(await members.current(), null);
    assert.match(out.action, /Nothing on it was touched/);
  });

  test('it never says or does anything about somebody files', async () => {
    const ws = await aWorkspace();
    const out = await members.leave(ws.id, 'mine');

    // The one fear that stops anybody pressing this, answered on the button.
    assert.match(out.action, /your projects, your files and your GitHub/i);

    const source = await readFile(join(here, '..', 'members.mjs'), 'utf8');
    const body = source.slice(source.indexOf('export async function leave'),
      source.indexOf('export async function close'));
    for (const never of [/\brm\(/, /unlink/, /rmdir/, /createWriteStream/]) {
      assert.equal(never.test(body), false, `leaving can ${never}`);
    }
  });

  test('leaving one of several leaves the others alone', async () => {
    const one = await aWorkspace();
    const two = await members.create({
      name: 'Second', owner: 'danni', device: aDevice('mine', 'Danni-PC'),
    });

    await members.leave(two.workspace.id, 'mine');
    const left = await members.all();
    assert.deepEqual(left.map((w) => w.name), ['Atlas']);
    assert.equal((await members.current()).id, one.id);
  });
});

describe('closing a workspace, as its owner', () => {
  test('only an owner may, and a member is told what they may do instead', async () => {
    const ws = await aWorkspace();
    const asked = await members.invite({ workspace: ws, by: 'danni' });
    await members.redeem({
      workspace: await members.current(),
      code: asked.code,
      person: 'rahul',
      device: aDevice('theirs', 'Rahul-Laptop'),
    });

    const out = await members.close((await members.current()).id, 'theirs');
    assert.equal(out.ok, false);
    assert.match(out.action, /leave it instead/);
    assert.ok(await members.current(), 'a member closed a workspace they do not own');
  });

  test('an owner may, and nothing about anybody work is touched', async () => {
    const ws = await aWorkspace();
    const out = await members.close(ws.id, 'mine');

    assert.equal(out.ok, true);
    assert.equal(await members.current(), null);
    assert.match(out.action, /files were deleted/i);

    const source = await readFile(join(here, '..', 'members.mjs'), 'utf8');
    const body = source.slice(source.indexOf('export async function close'),
      source.indexOf('export async function rename'));
    for (const never of [/\brm\(/, /unlink/, /rmdir/, /parcel/]) {
      assert.equal(never.test(body), false, `closing a workspace can ${never}`);
    }
  });
});

describe('renaming changes the name and nothing else', () => {
  test('it keeps everybody and every device', async () => {
    const ws = await aWorkspace();
    const before_ = Object.keys(ws.devices);

    assert.equal((await members.rename(ws.id, 'Atlas Two')).ok, true);
    const after_ = await members.current();

    assert.equal(after_.name, 'Atlas Two');
    assert.equal(after_.id, ws.id, 'renaming made a different workspace');
    assert.deepEqual(Object.keys(after_.devices), before_);
  });

  test('and a name is required', async () => {
    const ws = await aWorkspace();
    assert.equal((await members.rename(ws.id, '   ')).ok, false);
  });
});
