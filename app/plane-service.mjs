/**
 * The public, replaceable Workspace introduction service.
 *
 * It stores presence and one-use relay introductions only. Project bytes,
 * chat, changes, and workspace files never pass through it. Every request is
 * signed by a device, then scoped by the workspace capability that existing
 * members derive from their local membership record.
 */
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { here, saidBy } from './plane.mjs';

export const PLANE_PORT = 47781;
const MOST_BODY = 256 * 1024;
const WINDOW = 60_000;
const MOST_REQUESTS = 240;
const MOST_JOIN_REQUESTS = 30;

const hash = (value) => createHash('sha256').update(String(value)).digest('hex');

function relayFrom(value) {
  if (value?.url) {
    try {
      const url = new URL(String(value.url));
      const local = ['127.0.0.1', 'localhost', '::1'].includes(url.hostname);
      if (url.protocol !== 'wss:' && !(url.protocol === 'ws:' && local)) return null;
      url.hash = '';
      return { kind: 'websocket', url: url.toString().replace(/\/$/, '') };
    } catch { return null; }
  }
  const relay = { host: String(value?.host ?? '').slice(0, 253), port: Number(value?.port) || 0 };
  return relay.host && relay.port > 0 && relay.port <= 65535 ? relay : null;
}

function readJson(request) {
  return new Promise((done) => {
    let held = '';
    let ended = false;
    const finish = (value) => { if (!ended) { ended = true; done(value); } };
    request.setEncoding('utf8');
    request.on('data', (part) => {
      held += part;
      if (held.length > MOST_BODY) { request.destroy(); finish(null); }
    });
    request.on('end', () => {
      try { finish(JSON.parse(held)); } catch { finish(null); }
    });
    request.on('error', () => finish(null));
  });
}

const answer = (response, status, body) => {
  if (response.writableEnded) return;
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  response.end(JSON.stringify(body));
};

function loadState(stateFile) {
  if (!stateFile || !existsSync(stateFile)) return {};
  try { return JSON.parse(readFileSync(stateFile, 'utf8')); } catch { return {}; }
}

/** Start an HTTP control plane. `port: 0` is useful for tests. */
export function start({ port = PLANE_PORT, host = '0.0.0.0', stateFile = null } = {}) {
  const saved = loadState(stateFile);
  const scopes = new Map(Object.entries(saved.scopes ?? {}));
  let saveChain = Promise.resolve();
  let service;
  const persist = () => {
    if (!stateFile) return;
    const state = {
      version: 1,
      scopes: Object.fromEntries(scopes),
      invitations: service?.durableState().invitations ?? [],
    };
    saveChain = saveChain.then(async () => {
      await mkdir(dirname(stateFile), { recursive: true });
      const temporary = `${stateFile}.${process.pid}.new`;
      await writeFile(temporary, `${JSON.stringify(state)}\n`, { encoding: 'utf8', mode: 0o600 });
      await rename(temporary, stateFile);
    }).catch(() => null);
  };
  service = here({ invitations: saved.invitations ?? [], onInvitationsChanged: persist });
  const requests = new Map();

  const tooMany = (request, path) => {
    const now = Date.now();
    const forwarded = process.env.VIBERANT_TRUST_PROXY === '1'
      ? String(request.headers['x-forwarded-for'] ?? '').split(',')[0].trim()
      : '';
    const address = forwarded || String(request.socket.remoteAddress ?? 'unknown');
    const key = `${address}:${path === 'find-invite' || path === 'join-ticket' ? 'join' : 'ordinary'}`;
    const recent = (requests.get(key) ?? []).filter((at) => now - at < WINDOW);
    recent.push(now);
    requests.set(key, recent);
    if (requests.size > 10_000) {
      for (const [held, times] of requests) {
        if (!times.some((at) => now - at < WINDOW)) requests.delete(held);
      }
    }
    return recent.length > (key.endsWith(':join') ? MOST_JOIN_REQUESTS : MOST_REQUESTS);
  };

  const server = createServer(async (request, response) => {
    const path = new URL(request.url ?? '/', 'http://plane.invalid').pathname.replace(/^\//, '');
    if (request.method === 'GET' && path === 'health') {
      return answer(response, 200, { ok: true, service: 'workspace-introduction' });
    }
    if (request.method !== 'POST'
      || !['announce', 'who-is-about', 'ticket', 'wait-for-ticket', 'forget',
        'offer-invite', 'find-invite', 'join-ticket'].includes(path)) {
      return answer(response, 404, { ok: false });
    }
    if (tooMany(request, path)) return answer(response, 429, { ok: false });

    const envelope = await readJson(request);
    const signed = saidBy({ ...envelope, what: path });
    if (!signed) return answer(response, 401, { ok: false });

    const { body, from } = signed;
    if (path === 'find-invite') {
      return answer(response, 200, await service.findInvitation({ mark: String(body.mark ?? '') }));
    }
    if (path === 'join-ticket') {
      return answer(response, 200, await service.ticketToJoin({ mark: String(body.mark ?? ''), from }));
    }

    const workspace = String(body.workspace ?? '');
    const scope = String(body.scope ?? '');
    if (!/^[0-9a-f-]{16,128}$/i.test(workspace) || !/^[0-9a-f]{32,128}$/i.test(scope)) {
      return answer(response, 403, { ok: false });
    }

    const proof = hash(scope);
    const known = scopes.get(workspace);
    // A random workspace identifier plus its derived capability is the
    // rendezvous boundary. The first signed announcement registers it; every
    // later reader or writer has to present the same capability.
    if (!known && path === 'announce') { scopes.set(workspace, proof); persist(); }
    if ((known ?? proof) !== proof || (!known && path !== 'announce')) {
      return answer(response, 403, { ok: false });
    }

    let out;
    if (path === 'announce') {
      if (body.card?.deviceId !== from.deviceId) return answer(response, 403, { ok: false });
      out = await service.announce({
        workspace, card: from,
        addresses: Array.isArray(body.addresses) ? body.addresses.slice(0, 8) : [],
        directPort: Number(body.directPort) || null,
        direct: Array.isArray(body.direct) ? body.direct.slice(0, 8).map((one) => ({
          host: String(one?.host ?? '').slice(0, 253),
          port: Number(one?.port) || 0,
        })).filter((one) => one.host && one.port > 0 && one.port <= 65535) : [],
      });
    } else if (path === 'who-is-about') {
      out = await service.whoIsAbout({ workspace, notMe: body.notMe ?? null });
    } else if (path === 'ticket') {
      if (body.from !== from.deviceId || !body.to || body.to === body.from) {
        return answer(response, 403, { ok: false });
      }
      const relay = relayFrom(body.relay);
      if (!relay) return answer(response, 400, { ok: false });
      out = await service.ticketFor({ workspace, from: from.deviceId, to: body.to, relay });
    } else if (path === 'wait-for-ticket') {
      if (body.deviceId !== from.deviceId) return answer(response, 403, { ok: false });
      out = await service.waitForTicket({ workspace, deviceId: from.deviceId, within: 20_000 });
    } else if (path === 'offer-invite') {
      if (body.owner?.deviceId !== from.deviceId || !/^[0-9a-f]{64}$/i.test(String(body.mark ?? ''))) {
        return answer(response, 403, { ok: false });
      }
      const relay = relayFrom(body.relay);
      if (!relay) return answer(response, 400, { ok: false });
      const expiresAt = Number(body.expiresAt);
      if (!Number.isFinite(expiresAt) || expiresAt <= Date.now() || expiresAt > Date.now() + 15 * 60_000) {
        return answer(response, 400, { ok: false });
      }
      out = await service.offerInvitation({
        workspace, mark: body.mark, expiresAt, owner: from, relay,
      });
    } else {
      if (body.deviceId !== from.deviceId) return answer(response, 403, { ok: false });
      out = await service.forget(from.deviceId);
    }
    return answer(response, 200, out);
  });

  const listening = new Promise((done, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => done(server.address()));
  });
  return {
    server,
    listening,
    stop: () => new Promise((done) => server.close(async () => { await saveChain; done(); })),
  };
}

if (process.argv[1] && process.argv[1].endsWith('plane-service.mjs')) {
  const stateFile = process.env.VIBERANT_PLANE_STATE
    || join(process.cwd(), 'data', 'workspace-plane.json');
  mkdirSync(dirname(stateFile), { recursive: true });
  const running = start({ port: Number(process.env.PORT || PLANE_PORT), stateFile });
  const address = await running.listening;
  process.stdout.write(`workspace introduction service listening on ${address.port}\n`);
}
