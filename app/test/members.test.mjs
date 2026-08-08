/**
 * Who is in a workspace, and what that does and does not entitle them to.
 *
 * The whole of this file is about defaults. A permission system is only as good
 * as what it says when nobody has said anything, and the answer here has to be
 * **no** — particularly for the three capabilities that run code on somebody
 * else's computer. Joining a workspace has never been a reason to get a
 * terminal on a stranger's machine, and the tests below are what stop that from
 * quietly becoming true later.
 */

import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let root, members;

const aDevice = (id, name) => ({
  deviceId: id, signPublic: `sign-${id}`, agreePublic: `agree-${id}`, displayName: name,
});

before(async () => {
  root = await mkdtemp(join(tmpdir(), 'viberant-members-'));
  await mkdir(join(root, 'home'), { recursive: true });
  process.env.USERPROFILE = join(root, 'home');
  process.env.HOME = join(root, 'home');
  members = await import('../members.mjs');
});

after(async () => {
  await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
});

beforeEach(async () => { await members.forgetAll(); });

/** A workspace with an owner and one invited member on another computer. */
async function twoPeople() {
  const made = await members.create({
    name: 'Atlas', owner: 'danni', device: aDevice('dev-danni', 'Danni-PC'),
  });
  const asked = await members.invite({ workspace: made.workspace, by: 'danni' });
  const joined = await members.redeem({
    workspace: made.workspace,
    code: asked.code,
    person: 'rahul',
    device: aDevice('dev-rahul', 'Rahul-Laptop'),
  });
  return joined.workspace;
}

describe('a workspace has an owner, and the owner is not everybody', () => {
  test('making one puts your own computer in it, trusted', async () => {
    const made = await members.create({
      name: 'Atlas', owner: 'danni', device: aDevice('dev-danni', 'Danni-PC'),
    });
    assert.equal(made.ok, true);
    assert.equal(made.workspace.members.danni.role, 'owner');
    assert.equal(made.workspace.devices['dev-danni'].trusted, true,
      'refusing you your own computer is security theatre');
    assert.equal((await members.current()).id, made.workspace.id);
  });

  test('a workspace needs a name', async () => {
    assert.equal((await members.create({ name: '  ', owner: 'd', device: aDevice('x', 'x') })).ok, false);
  });
});

describe('an invitation is short lived, single use, and never the secret', () => {
  test('it reads aloud, and what is kept is not the code', async () => {
    const made = await members.create({ name: 'Atlas', owner: 'danni', device: aDevice('d', 'D') });
    const asked = await members.invite({ workspace: made.workspace, by: 'danni' });

    assert.match(asked.code, /^[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/,
      'nothing in it can be mistaken for something else down a phone');
    assert.ok(asked.expiresAt - Date.now() <= members.INVITE_LASTS);

    const onDisk = await readFile(members.BOOK_FILE, 'utf8');
    assert.equal(onDisk.includes(asked.code), false,
      'the code is on the disk in the clear, so reading one file is enough to join');
  });

  test('one person may use it, and only one', async () => {
    const made = await members.create({ name: 'Atlas', owner: 'danni', device: aDevice('d', 'D') });
    const asked = await members.invite({ workspace: made.workspace, by: 'danni' });

    const first = await members.redeem({
      workspace: made.workspace, code: asked.code, person: 'rahul', device: aDevice('r', 'R'),
    });
    assert.equal(first.ok, true);

    const second = await members.redeem({
      workspace: first.workspace, code: asked.code, person: 'someone-else', device: aDevice('s', 'S'),
    });
    assert.equal(second.ok, false, 'an invitation that works twice is a password');
  });

  test('one that has run out does not work', async () => {
    const made = await members.create({ name: 'Atlas', owner: 'danni', device: aDevice('d', 'D') });
    const asked = await members.invite({ workspace: made.workspace, by: 'danni' });

    const ws = await members.current();
    for (const one of Object.values(ws.invites)) one.expiresAt = Date.now() - 1;
    await members.save(ws);

    const out = await members.redeem({
      workspace: ws, code: asked.code, person: 'rahul', device: aDevice('r', 'R'),
    });
    assert.equal(out.ok, false);
  });

  test('one that was cancelled does not work', async () => {
    const made = await members.create({ name: 'Atlas', owner: 'danni', device: aDevice('d', 'D') });
    const asked = await members.invite({ workspace: made.workspace, by: 'danni' });
    const ws = await members.current();

    const [of] = Object.keys(ws.invites);
    assert.equal((await members.cancelInvite(ws, of)).ok, true);

    const out = await members.redeem({
      workspace: await members.current(), code: asked.code, person: 'r', device: aDevice('r', 'R'),
    });
    assert.equal(out.ok, false);
  });

  test('guessing is counted and cut off', async () => {
    const made = await members.create({ name: 'Atlas', owner: 'danni', device: aDevice('d', 'D') });
    await members.invite({ workspace: made.workspace, by: 'danni' });

    let stopped = false;
    for (let i = 0; i < members.GUESSES * members.INVITES_AT_ONCE + 2; i += 1) {
      const out = await members.redeem({
        workspace: await members.current(),
        code: `AAAA-BBB${i % 9 + 2}`,
        person: 'guesser',
        device: aDevice(`g${i}`, 'G'),
      });
      if (/Too many/.test(out.sentence)) stopped = true;
    }
    assert.equal(stopped, true, 'a code can be guessed at forever');
  });

  test('only so many may be waiting at once', async () => {
    const made = await members.create({ name: 'Atlas', owner: 'danni', device: aDevice('d', 'D') });
    let ws = made.workspace;
    for (let i = 0; i < members.INVITES_AT_ONCE; i += 1) {
      assert.equal((await members.invite({ workspace: ws, by: 'danni' })).ok, true);
      ws = await members.current();
    }
    assert.equal((await members.invite({ workspace: ws, by: 'danni' })).ok, false);
  });
});

describe('joining a workspace does not hand anybody a terminal', () => {
  test('a new member may see and take what is offered, and nothing else', async () => {
    const ws = await twoPeople();

    assert.equal(members.may(ws, 'dev-rahul', 'seeOffered'), true);
    assert.equal(members.may(ws, 'dev-rahul', 'bring'), true);
    assert.equal(members.may(ws, 'dev-rahul', 'offer'), true);

    for (const runs of ['remoteTerminal', 'remoteRun', 'remoteBuild']) {
      assert.equal(members.may(ws, 'dev-rahul', runs), false,
        `${runs} came free with joining, which is the whole thing this must never do`);
    }
    assert.equal(members.may(ws, 'dev-rahul', 'manageMembers'), false);
  });

  test('the owner may, on their own computer', async () => {
    const ws = await twoPeople();
    for (const c of members.CAPABILITIES) {
      assert.equal(members.may(ws, 'dev-danni', c), true, `an owner cannot ${c} on their own machine`);
    }
  });

  test('a capability nobody has heard of is refused, not allowed', async () => {
    const ws = await twoPeople();
    assert.equal(members.may(ws, 'dev-danni', 'deleteEverything'), false);
    assert.equal(members.may(ws, 'dev-danni', ''), false);
    assert.equal(members.may(null, 'dev-danni', 'bring'), false);
    assert.equal(members.may(ws, null, 'bring'), false);
    assert.equal(members.may(ws, 'a-device-nobody-added', 'seeOffered'), false);
  });

  test('read only can already be described, so adding it later changes one list', () => {
    const may = members.WHAT_ROLES_MAY_DO.readOnly;
    assert.equal(may.seeOffered, true);
    for (const not of ['bring', 'offer', 'remoteTerminal', 'remoteRun', 'remoteBuild', 'manageMembers']) {
      assert.equal(may[not], false, `read only may ${not}`);
    }
  });
});

describe('running code needs to be granted, one computer at a time', () => {
  test('the owner can allow it, and then it is allowed', async () => {
    let ws = await twoPeople();
    assert.equal(members.may(ws, 'dev-rahul', 'remoteBuild'), false);

    assert.equal((await members.allow(ws, 'dev-rahul', 'remoteBuild', true)).ok, true);
    ws = await members.current();

    assert.equal(members.may(ws, 'dev-rahul', 'remoteBuild'), true);
    assert.equal(members.may(ws, 'dev-rahul', 'remoteTerminal'), false,
      'allowing one thing must not allow the others');
  });

  test('and can take it away again', async () => {
    let ws = await twoPeople();
    await members.allow(ws, 'dev-rahul', 'remoteRun', true);
    ws = await members.current();
    assert.equal(members.may(ws, 'dev-rahul', 'remoteRun'), true);

    await members.allow(ws, 'dev-rahul', 'remoteRun', false);
    ws = await members.current();
    assert.equal(members.may(ws, 'dev-rahul', 'remoteRun'), false);
  });

  test('an untrusted computer stays refused even if its role says otherwise', async () => {
    const ws = await twoPeople();
    // Promote them to owner without trusting the machine.
    ws.members.rahul.role = 'owner';
    await members.save(ws);
    const after_ = await members.current();

    assert.equal(after_.devices['dev-rahul'].trusted, false);
    assert.equal(members.may(after_, 'dev-rahul', 'remoteTerminal'), false,
      'a role must not be able to bypass the per-computer decision');
    assert.equal(members.may(after_, 'dev-rahul', 'bring'), true,
      'while the things that are not running code still work');
  });
});

describe('revoking works, and reaches nothing it should not', () => {
  test('a revoked computer fails every check afterwards', async () => {
    let ws = await twoPeople();
    assert.equal((await members.revoke(ws, 'dev-rahul')).ok, true);
    ws = await members.current();

    for (const c of members.CAPABILITIES) {
      assert.equal(members.may(ws, 'dev-rahul', c), false, `a revoked computer may still ${c}`);
    }
    assert.equal(members.isRevoked(ws, 'dev-rahul'), true);
  });

  test('a revoked computer cannot rejoin by asking again', async () => {
    let ws = await twoPeople();
    await members.revoke(ws, 'dev-rahul');
    ws = await members.current();

    // A fresh invitation, and the same computer trying to use it.
    const asked = await members.invite({ workspace: ws, by: 'danni' });
    await members.redeem({
      workspace: await members.current(),
      code: asked.code,
      person: 'rahul-again',
      device: aDevice('dev-rahul', 'Rahul-Laptop'),
    });

    assert.equal(members.may(await members.current(), 'dev-rahul', 'seeOffered'), false,
      'a revoked computer walked back in through the front door');
  });

  test('revoking a person takes their computers with them', async () => {
    let ws = await twoPeople();
    await members.revoke(ws, 'rahul');
    ws = await members.current();

    assert.equal(ws.members.rahul, undefined);
    assert.equal(members.may(ws, 'dev-rahul', 'seeOffered'), false);
  });

  test('and says out loud that nothing of theirs was touched', async () => {
    const ws = await twoPeople();
    const out = await members.revoke(ws, 'dev-rahul');
    assert.match(out.action, /Nothing on that computer was touched/);
    assert.match(out.action, /nothing of theirs was deleted/);
  });
});
