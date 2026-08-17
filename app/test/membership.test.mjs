/**
 * Being in a workspace, and every way of merely being nearby.
 *
 * The complaint was that people appeared in a workspace without having joined
 * one. That would make the whole thing meaningless: if being on the same
 * network, or signed in to the same account, or having been seen once before
 * puts you in somebody's workspace, then a workspace is not a decision anybody
 * made and joining is decoration.
 *
 * So the invariant is one sentence, and everything here is that sentence:
 * **a computer is in a workspace because it joined one, and for no other
 * reason.**
 */

import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
let root, members, anywhere;

/*
 * One function's worth of source, as it is written down.
 *
 * The end of a function is found below by looking for a line that is only its
 * closing brace. On a computer whose files end their lines with a carriage
 * return as well, that line is never found, and what gets read instead is the
 * whole rest of the file: "this function does not do that" quietly becomes a
 * search of everything after it, and passes or fails for the wrong reason.
 * Line endings are made the same first, so what is checked is the function
 * that was named.
 */
const sourceOf = async (name) => (await readFile(join(here, '..', name), 'utf8')).replaceAll('\r\n', '\n');

const aDevice = (id, name, person = 'danni') => ({
  deviceId: id, signPublic: `s-${id}`, agreePublic: `a-${id}`, displayName: name, person,
});

before(async () => {
  root = await mkdtemp(join(tmpdir(), 'viberant-member-'));
  await mkdir(join(root, 'home'), { recursive: true });
  process.env.USERPROFILE = join(root, 'home');
  process.env.HOME = join(root, 'home');
  members = await import('../members.mjs');
  anywhere = await import('../anywhere.mjs');
});

after(async () => {
  await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
});

beforeEach(async () => { await members.forgetAll(); });

const aWorkspace = async () => (await members.create({
  name: 'Atlas', owner: 'danni', device: aDevice('mine', 'Danni-PC'),
})).workspace;

describe('a workspace holds the computers that joined it, and no others', () => {
  test('a new workspace holds exactly one computer: the one that made it', async () => {
    const ws = await aWorkspace();
    assert.deepEqual(Object.keys(ws.devices), ['mine']);
  });

  test('another computer is not in it until it redeems a code', async () => {
    const ws = await aWorkspace();
    const theirs = aDevice('theirs', 'Rahul-Laptop', 'rahul');

    // Everything short of joining. None of it may put them in.
    assert.equal(Object.keys((await members.current()).devices).includes('theirs'), false);

    const asked = await members.invite({ workspace: await members.current(), by: 'danni' });
    assert.equal(asked.ok, true);
    assert.equal(Object.keys((await members.current()).devices).includes('theirs'), false,
      'making an invitation put somebody in the workspace before they used it');

    const joined = await members.redeem({
      workspace: await members.current(), code: asked.code, person: 'rahul', device: theirs,
    });
    assert.equal(joined.ok, true);
    assert.ok(Object.keys((await members.current()).devices).includes('theirs'));
    assert.ok(ws);
  });

  test('a code that has run out does not let anybody in', async () => {
    const ws = await aWorkspace();
    const asked = await members.invite({ workspace: ws, by: 'danni' });

    const now = await members.current();
    for (const one of Object.values(now.invites)) one.expiresAt = Date.now() - 1;
    await members.save(now);

    const tried = await members.redeem({
      workspace: await members.current(),
      code: asked.code,
      person: 'rahul',
      device: aDevice('theirs', 'Rahul-Laptop', 'rahul'),
    });

    assert.equal(tried.ok, false, 'an invitation that had run out still worked');
    assert.equal(Object.keys((await members.current()).devices).includes('theirs'), false);
  });

  test('and one already used does not let a second computer in', async () => {
    const ws = await aWorkspace();
    const asked = await members.invite({ workspace: ws, by: 'danni' });

    await members.redeem({
      workspace: await members.current(), code: asked.code, person: 'rahul',
      device: aDevice('first', 'First', 'rahul'),
    });
    const again = await members.redeem({
      workspace: await members.current(), code: asked.code, person: 'someone',
      device: aDevice('second', 'Second', 'someone'),
    });

    assert.equal(again.ok, false, 'one code let two computers in');
    assert.equal(Object.keys((await members.current()).devices).includes('second'), false);
  });

  test('a made-up code lets nobody in', async () => {
    await aWorkspace();
    const tried = await members.redeem({
      workspace: await members.current(),
      code: 'NOT-A-REAL-CODE',
      person: 'nobody',
      device: aDevice('made-up', 'Made Up', 'nobody'),
    });
    assert.equal(tried.ok, false);
    assert.equal(Object.keys((await members.current()).devices).includes('made-up'), false);
  });

  test('membership is written down, so it is still there after a restart', async () => {
    const ws = await aWorkspace();
    const asked = await members.invite({ workspace: ws, by: 'danni' });
    await members.redeem({
      workspace: await members.current(), code: asked.code, person: 'rahul',
      device: aDevice('theirs', 'Rahul-Laptop', 'rahul'),
    });

    // What is on the disk is what another run of the app would read.
    const onDisk = JSON.parse(await readFile(members.BOOK_FILE, 'utf8'));
    const saved = Object.values(onDisk.workspaces)[0];
    assert.ok(Object.keys(saved.devices).includes('theirs'),
      'somebody joined and it was never written down');
  });

  test('somebody taken out stops being in it', async () => {
    const ws = await aWorkspace();
    const asked = await members.invite({ workspace: ws, by: 'danni' });
    await members.redeem({
      workspace: await members.current(), code: asked.code, person: 'rahul',
      device: aDevice('theirs', 'Rahul-Laptop', 'rahul'),
    });

    await members.revoke(await members.current(), 'theirs');
    const now = await members.current();
    assert.equal(members.isRevoked(now, 'theirs'), true);

    const shown = await anywhere.around({ workspace: now });
    const named = [...shown.mine, ...shown.team].map((one) => one.deviceId);
    assert.equal(named.includes('theirs'), false, 'somebody taken out is still shown as being in');
  });
});

describe('getting in from a computer that has never seen the workspace', () => {
  test('a workspace handed over is written down, and the codes in it are not', async () => {
    // Invitations are somebody else's permission to join. A computer that has
    // just joined holding a list of live codes could let in people the owner
    // never invited, so whatever arrives in that field, nothing is kept.
    const handed = {
      id: 'ws-from-somewhere',
      name: 'Atlas',
      owner: 'danni',
      devices: { mine: { deviceId: 'mine', displayName: 'Danni-PC', person: 'danni' } },
      members: { danni: { person: 'danni', role: 'owner' } },
      invites: { abc: { of: 'abc', expiresAt: Date.now() + 60000, usedAt: null } },
    };

    const out = await members.remember(handed);
    assert.equal(out.ok, true);
    assert.deepEqual(out.workspace.invites, {}, 'live codes belonging to somebody else were kept');
    assert.equal((await members.current()).id, 'ws-from-somewhere');
  });

  test('and something that is not a workspace is refused', async () => {
    assert.equal((await members.remember({ id: 'x' })).ok, false);
    assert.equal((await members.remember(null)).ok, false);
  });

  test('the way in for joining can do one thing and only that thing', async () => {
    // The whole reason it is allowed to skip the membership check every other
    // message begins with. A second message on this path would be a way past
    // that check.
    const source = await readFile(join(here, '..', 'joining.mjs'), 'utf8');
    const door = source.slice(source.indexOf('const door = createServer'), source.indexOf('const up = await'));

    assert.match(door, /asked\.what !== 'join'/, 'it accepts something other than joining');
    assert.equal(/what === '(?!join)/.test(door), false, 'it answers a second kind of message');
    assert.match(door, /tooMany\(from\)/, 'nothing limits how many codes may be tried');
  });

  test('and it never reads a private key', async () => {
    const source = await readFile(join(here, '..', 'joining.mjs'), 'utf8');
    for (const never of [/signPrivate/, /agreePrivate/, /privateKey/, /secret\(/]) {
      assert.equal(never.test(source), false, `joining can reach ${never}`);
    }
  });

  test('a computer taken out does not get back in with a fresh code', async () => {
    const ws = await aWorkspace();
    const first = await members.invite({ workspace: ws, by: 'danni' });
    await members.redeem({
      workspace: await members.current(), code: first.code, person: 'rahul',
      device: aDevice('theirs', 'Rahul-Laptop', 'rahul'),
    });
    await members.revoke(await members.current(), 'theirs');

    const second = await members.invite({ workspace: await members.current(), by: 'danni' });
    const back = await members.redeem({
      workspace: await members.current(), code: second.code, person: 'rahul',
      device: aDevice('theirs', 'Rahul-Laptop', 'rahul'),
    });

    assert.equal(back.ok, false, 'a revoked computer let itself back in with a new code');
    assert.equal(back.wasRevoked, true);
    assert.equal(Object.keys((await members.current()).devices).includes('theirs'), false);
  });
});

describe('members recognise each other without GitHub in the middle', () => {
  test('every member works out the same value, and it is not a private key', async () => {
    /*
     * Computers that joined with a code could see each other in the list and
     * both said offline forever: recognising each other on a network needs a
     * shared value, and the only one there was came out of a private project on
     * GitHub, which a computer that joined by code has never seen.
     *
     * This one is derived from what every member holds and a stranger does not:
     * the workspace's own identifier and the public signing key of the computer
     * that made it.
     */
    const ws = await aWorkspace();
    const mine = members.beaconKey(await members.current());
    assert.ok(mine && mine.length >= 32, 'no value to recognise anybody by');

    const asked = await members.invite({ workspace: await members.current(), by: 'danni' });
    await members.redeem({
      workspace: await members.current(), code: asked.code, person: 'rahul',
      device: aDevice('theirs', 'Rahul-Laptop', 'rahul'),
    });

    // Somebody joining must not change it, or everybody would stop recognising
    // everybody the moment one person arrived.
    assert.equal(members.beaconKey(await members.current()), mine,
      'the value moved when somebody joined');
    assert.ok(ws);
  });

  test('a different workspace works out a different one', async () => {
    const one = members.beaconKey(await aWorkspace());
    await members.forgetAll();
    const two = members.beaconKey(await aWorkspace());
    assert.notEqual(one, two, 'two workspaces recognise each other');
  });

  test('and it is made of nothing secret', async () => {
    const source = await sourceOf('members.mjs');
    const body = source.slice(source.indexOf('export function beaconKey'));
    const mine = body.slice(0, body.indexOf('\n}\n'));

    assert.match(mine, /signPublic/, 'it is not built from a public key');
    for (const never of [/signPrivate/, /agreePrivate/, /privateKey/]) {
      assert.equal(never.test(mine), false, `recognising each other uses ${never}`);
    }
  });

  test('nothing without a workspace can produce one', () => {
    assert.equal(members.beaconKey(null), null);
    assert.equal(members.beaconKey({}), null);
    assert.equal(members.beaconKey({ id: 'x', devices: {} }), null);
  });
});

describe('what the workspace shows is what the workspace holds', () => {
  test('it is built from the members and from nothing else', async () => {
    // The one line that decides. Read from the source, because the fault being
    // held here is the kind that arrives when somebody folds a second list of
    // computers into this one for convenience.
    const source = await sourceOf('anywhere.mjs');
    const body = source.slice(source.indexOf('export async function around'));
    const mine = body.slice(0, body.indexOf('\n}\n'));

    assert.match(mine, /Object\.entries\(ws\.devices \?\? \{\}\)/,
      'the list of who is in the workspace comes from somewhere other than the workspace');
    assert.match(mine, /if \(ws\.revoked\?\.\[id\]\) continue;/,
      'somebody taken out would still be listed');
  });

  test('being on this network only says how somebody is reached, never whether they are in', async () => {
    const source = await sourceOf('anywhere.mjs');
    const body = source.slice(source.indexOf('export async function around'));
    const mine = body.slice(0, body.indexOf('\n}\n'));

    // `near` and what the service heard may decide `online` and `how`. Neither
    // may add a card of its own.
    const pushes = mine.match(/\.push\(/g) ?? [];
    assert.equal(pushes.length, 1, 'something other than the member loop adds to the list');
  });

  test('the page says plainly that an account is not a workspace', async () => {
    // The two used to sit under headings that read the same, which is how a
    // computer on the same GitHub account came to look like a member.
    const page = await readFile(join(here, '..', 'ui', 'app.js'), 'utf8');
    assert.match(page, /Also signed in to your GitHub account/,
      'the list of computers on an account is still titled as though they were in a workspace');
    assert.match(page, /Being on the same account is not being in a[\s\S]{0,24}workspace/,
      'nothing on the page says the difference out loud');
  });
});
