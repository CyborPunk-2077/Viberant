import assert from 'node:assert/strict';
import { generateKeyPairSync, createHash, sign } from 'node:crypto';
import { EventEmitter, once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

import { dialWebSocketRelay } from '../cloudflare-relay.mjs';
import { WorkspacePlane } from '../../deploy/cloudflare-workspace/worker.mjs';

class FakeStorage {
  constructor() { this.values = new Map(); }
  async get(key) { return this.values.get(key); }
  async put(key, value) { this.values.set(key, structuredClone(value)); }
  async delete(keys) {
    for (const key of Array.isArray(keys) ? keys : [keys]) this.values.delete(key);
  }
  async list({ prefix = '', limit = Infinity } = {}) {
    return new Map([...this.values].filter(([key]) => key.startsWith(prefix)).slice(0, limit));
  }
}

function signingCard() {
  const signing = generateKeyPairSync('ed25519');
  const agreeing = generateKeyPairSync('x25519');
  const signPublic = signing.publicKey.export({ format: 'der', type: 'spki' }).toString('base64');
  return {
    privateKey: signing.privateKey,
    card: {
      deviceId: createHash('sha256').update(signPublic).digest('hex').slice(0, 32),
      signPublic,
      agreePublic: agreeing.publicKey.export({ format: 'der', type: 'spki' }).toString('base64'),
      displayName: 'Cloud computer',
    },
  };
}

function signedRequest(identity, what, body) {
  const said = JSON.stringify({ ...body, when: Date.now() });
  const proof = sign(null, Buffer.from(`${what}|${said}`), identity.privateKey).toString('base64');
  return new Request('https://viberant.internal/plane', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-viberant-path': what,
      'x-viberant-address': '203.0.113.9',
      'x-viberant-relay': 'wss://workspace.example/relay',
    },
    body: JSON.stringify({ said, proof, from: identity.card }),
  });
}

test('Cloudflare keeps invitation state in a Durable Object and still checks device signatures', async () => {
  const storage = new FakeStorage();
  const ctx = { storage };
  const identity = signingCard();
  const workspace = '12345678-1234-1234-1234-123456789abc';
  const scope = 'a'.repeat(64);
  const mark = 'b'.repeat(64);

  let plane = new WorkspacePlane(ctx, {});
  const announced = await plane.fetch(signedRequest(identity, 'announce', {
    workspace, scope, card: identity.card, direct: [],
  }));
  assert.equal(announced.status, 200);
  assert.equal((await announced.json()).ok, true);

  const offered = await plane.fetch(signedRequest(identity, 'offer-invite', {
    workspace, scope, mark, owner: identity.card, expiresAt: Date.now() + 60_000,
  }));
  assert.equal((await offered.json()).ok, true);

  // A new instance represents eviction/restart; the same storage is retained.
  plane = new WorkspacePlane(ctx, {});
  const found = await plane.fetch(signedRequest(identity, 'find-invite', { mark }));
  const invitation = await found.json();
  assert.equal(invitation.ok, true);
  assert.equal(invitation.invitation.workspace, workspace);
  assert.equal(invitation.invitation.relay.url, 'wss://workspace.example/relay');
});

class FakeWebSocket extends EventEmitter {
  static instance = null;
  constructor(url) {
    super();
    this.url = url;
    this.readyState = 1;
    this.bufferedAmount = 0;
    this.sent = [];
    FakeWebSocket.instance = this;
  }
  addEventListener(kind, fn) { this.on(kind, fn); }
  removeEventListener(kind, fn) { this.off(kind, fn); }
  send(bytes) { this.sent.push(Buffer.from(bytes)); }
  close() { this.readyState = 3; this.emit('close', {}); }
  message(data) { this.emit('message', { data }); }
}

test('the WSS fallback is the same encrypted byte stream expected by peers', async () => {
  const connecting = dialWebSocketRelay({
    url: 'wss://workspace.example/relay', ticket: 'c'.repeat(48), WebSocketClass: FakeWebSocket,
  });
  FakeWebSocket.instance.message(JSON.stringify({ waiting: true }));
  FakeWebSocket.instance.message(JSON.stringify({ joined: true }));
  const joined = await connecting;
  assert.ok(joined?.socket);

  joined.socket.write(Buffer.from('sealed bytes'));
  assert.deepEqual(FakeWebSocket.instance.sent[0], Buffer.from('sealed bytes'));
  const received = once(joined.socket, 'data');
  FakeWebSocket.instance.message(Uint8Array.from([4, 5, 6]).buffer);
  assert.deepEqual((await received)[0], Buffer.from([4, 5, 6]));
  joined.socket.destroy();
});

test('the deployment is free-plan SQLite Durable Objects with hibernating WebSockets', async () => {
  const config = await readFile(new URL('../../deploy/cloudflare-workspace/wrangler.jsonc', import.meta.url), 'utf8');
  const worker = await readFile(new URL('../../deploy/cloudflare-workspace/worker.mjs', import.meta.url), 'utf8');
  assert.match(config, /new_sqlite_classes/);
  assert.match(config, /WorkspacePlane/);
  assert.match(config, /RelayPair/);
  assert.match(worker, /acceptWebSocket/);
  assert.doesNotMatch(worker, /storage\.(?:put|get)\([^\n]*(?:project|chat|file|build)/i,
    'the cloud Worker must not grow a project, chat, file or build store');
});
