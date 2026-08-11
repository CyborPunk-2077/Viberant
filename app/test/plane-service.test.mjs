import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import * as device from '../device.mjs';
import { start } from '../plane-service.mjs';

let running;
let address;

before(async () => {
  running = start({ port: 0, host: '127.0.0.1' });
  const at = await running.listening;
  address = `http://127.0.0.1:${at.port}`;
});

after(async () => running.stop());

function identity(name) {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const signPublic = publicKey.export({ format: 'der', type: 'spki' }).toString('base64');
  return {
    privateKey,
    card: {
      deviceId: device.fingerprint(signPublic), signPublic,
      agreePublic: signPublic, displayName: name,
    },
  };
}

async function ask(who, what, body) {
  const said = JSON.stringify({ ...body, when: Date.now() });
  const proof = sign(null, Buffer.from(`${what}|${said}`), who.privateKey).toString('base64');
  const response = await fetch(`${address}/${what}`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ said, proof, from: who.card }),
  });
  return { status: response.status, body: await response.json() };
}

describe('hosted Workspace introduction service', () => {
  test('signed members see presence and receive the same one-use relay ticket', async () => {
    const a = identity('A');
    const b = identity('B');
    const workspace = '1234567890abcdef1234567890abcdef';
    const scope = 'a'.repeat(64);

    assert.equal((await ask(a, 'announce', { workspace, scope, card: a.card })).body.ok, true);
    assert.equal((await ask(b, 'announce', { workspace, scope, card: b.card })).body.ok, true);
    const seen = await ask(a, 'who-is-about', { workspace, scope, notMe: a.card.deviceId });
    assert.deepEqual(seen.body.devices.map((one) => one.deviceId), [b.card.deviceId]);

    const waiting = ask(b, 'wait-for-ticket', {
      workspace, scope, deviceId: b.card.deviceId,
    });
    const made = await ask(a, 'ticket', {
      workspace, scope, from: a.card.deviceId, to: b.card.deviceId,
      relay: { host: 'relay.example', port: 47780 },
    });
    assert.equal(made.body.ok, true);
    const delivered = await waiting;
    assert.equal(delivered.body.ticket.ticket, made.body.ticket);
    assert.equal(delivered.body.ticket.from, a.card.deviceId);
    assert.deepEqual(delivered.body.ticket.relay, { host: 'relay.example', port: 47780 });
  });

  test('a different workspace capability and an unsigned caller are refused', async () => {
    const a = identity('A');
    const workspace = 'fedcba0987654321fedcba0987654321';
    const scope = 'b'.repeat(64);
    await ask(a, 'announce', { workspace, scope, card: a.card });
    assert.equal((await ask(a, 'who-is-about', { workspace, scope: 'c'.repeat(64) })).status, 403);

    const response = await fetch(`${address}/who-is-about`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
    });
    assert.equal(response.status, 401);
  });

  test('an Internet invitation reveals no code and introduces the joiner over the relay', async () => {
    const owner = identity('Owner');
    const joiner = identity('Joiner');
    const workspace = '00112233445566778899aabbccddeeff';
    const scope = 'd'.repeat(64);
    const mark = 'e'.repeat(64);
    const relay = { host: 'relay.example', port: 47780 };

    await ask(owner, 'announce', { workspace, scope, card: owner.card });
    const offered = await ask(owner, 'offer-invite', {
      workspace, scope, mark, expiresAt: Date.now() + 60_000, owner: owner.card, relay,
    });
    assert.equal(offered.body.ok, true);

    const found = await ask(joiner, 'find-invite', { mark });
    assert.equal(found.body.ok, true);
    assert.equal(found.body.invitation.owner.deviceId, owner.card.deviceId);
    assert.equal(JSON.stringify(found.body).includes('JOIN-CODE'), false);

    const waiting = ask(owner, 'wait-for-ticket', {
      workspace, scope, deviceId: owner.card.deviceId,
    });
    const made = await ask(joiner, 'join-ticket', { mark });
    assert.equal(made.body.ok, true);
    assert.equal(made.body.owner.deviceId, owner.card.deviceId);
    const delivered = await waiting;
    assert.equal(delivered.body.ticket.kind, 'join');
    assert.equal(delivered.body.ticket.from, joiner.card.deviceId);
    assert.equal(delivered.body.ticket.mark, mark);
  });

  test('registered workspace capabilities and live invitations survive a service restart', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'viberant-plane-state-'));
    const stateFile = join(folder, 'plane.json');
    const owner = identity('Durable owner');
    const joiner = identity('Joiner');
    const workspace = '11223344556677889900aabbccddeeff';
    const scope = 'f'.repeat(64);
    const mark = '1'.repeat(64);
    let durable = start({ port: 0, host: '127.0.0.1', stateFile });
    let at = await durable.listening;
    const oldAddress = address;
    address = `http://127.0.0.1:${at.port}`;
    await ask(owner, 'announce', { workspace, scope, card: owner.card });
    await ask(owner, 'offer-invite', {
      workspace, scope, mark, expiresAt: Date.now() + 60_000, owner: owner.card,
      relay: { host: 'relay.example', port: 47780 },
    });
    await durable.stop();

    durable = start({ port: 0, host: '127.0.0.1', stateFile });
    at = await durable.listening;
    address = `http://127.0.0.1:${at.port}`;
    const found = await ask(joiner, 'find-invite', { mark });
    assert.equal(found.body.ok, true);
    assert.equal((await ask(owner, 'who-is-about', { workspace, scope: '2'.repeat(64) })).status, 403);
    await durable.stop();
    address = oldAddress;
    await rm(folder, { recursive: true, force: true });
  });
});
