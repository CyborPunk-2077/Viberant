var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// worker.mjs
var PLANE_PATHS = /* @__PURE__ */ new Set([
  "announce",
  "who-is-about",
  "ticket",
  "wait-for-ticket",
  "forget",
  "offer-invite",
  "find-invite",
  "join-ticket"
]);
var STILL_HERE = 9e4;
var NOT_TOO_OLD = 12e4;
var TICKET_LASTS = 6e4;
var MOST_BODY = 256 * 1024;
var MOST_RELAY_MESSAGE = 9 * 1024 * 1024;
var RATE_WINDOW = 6e4;
var MOST_REQUESTS = 240;
var MOST_JOIN_REQUESTS = 30;
var encoder = new TextEncoder();
var json = /* @__PURE__ */ __name((body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer"
  }
}), "json");
function bytesFromBase64(text) {
  try {
    const raw = atob(String(text));
    const out = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}
__name(bytesFromBase64, "bytesFromBase64");
var hex = /* @__PURE__ */ __name((bytes) => [...bytes].map((one) => one.toString(16).padStart(2, "0")).join(""), "hex");
async function hashText(text) {
  return hex(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(String(text)))));
}
__name(hashText, "hashText");
async function signedRequest(request, what) {
  let envelope;
  try {
    if (Number(request.headers.get("content-length") || 0) > MOST_BODY) return null;
    const text = await request.text();
    if (text.length > MOST_BODY) return null;
    envelope = JSON.parse(text);
  } catch {
    return null;
  }
  const { said, proof, from } = envelope ?? {};
  if (!from?.deviceId || !from?.signPublic || !from?.agreePublic || !said || !proof) return null;
  if ((await hashText(from.signPublic)).slice(0, 32) !== from.deviceId) return null;
  let body;
  try {
    body = JSON.parse(said);
  } catch {
    return null;
  }
  if (!Number.isFinite(body?.when) || Math.abs(Date.now() - body.when) > NOT_TOO_OLD) return null;
  try {
    const keyBytes = bytesFromBase64(from.signPublic);
    const signature = bytesFromBase64(proof);
    if (!keyBytes || !signature) return null;
    const key = await crypto.subtle.importKey("spki", keyBytes, { name: "Ed25519" }, false, ["verify"]);
    const valid = await crypto.subtle.verify("Ed25519", key, signature, encoder.encode(`${what}|${said}`));
    return valid ? { body, from } : null;
  } catch {
    return null;
  }
}
__name(signedRequest, "signedRequest");
function safeDirect(many) {
  if (!Array.isArray(many)) return [];
  return many.slice(0, 8).map((one) => ({
    host: String(one?.host ?? "").slice(0, 253),
    port: Number(one?.port) || 0
  })).filter((one) => one.host && one.port > 0 && one.port <= 65535);
}
__name(safeDirect, "safeDirect");
function ticketId() {
  return hex(crypto.getRandomValues(new Uint8Array(24)));
}
__name(ticketId, "ticketId");
var worker_default = {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/^\/+|\/+$/g, "");
    if (request.method === "GET" && path === "health") {
      return json({ ok: true, service: "viberant-workspace-cloudflare", storage: "durable-objects" });
    }
    const plane = env.WORKSPACE_PLANE.get(env.WORKSPACE_PLANE.idFromName("viberant-production"));
    if (request.method === "POST" && PLANE_PATHS.has(path)) {
      const headers = new Headers(request.headers);
      headers.set("x-viberant-path", path);
      headers.set("x-viberant-address", request.headers.get("cf-connecting-ip") || "unknown");
      const relay = new URL(request.url);
      relay.protocol = "wss:";
      relay.pathname = "/relay";
      relay.search = "";
      relay.hash = "";
      headers.set("x-viberant-relay", relay.toString().replace(/\/$/, ""));
      return plane.fetch(new Request("https://viberant.internal/plane", {
        method: "POST",
        headers,
        body: request.body
      }));
    }
    if (request.method === "GET" && path === "relay") {
      if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
        return json({ ok: false }, 426);
      }
      const ticket = String(url.searchParams.get("ticket") ?? "");
      if (!/^[0-9a-f]{48}$/.test(ticket)) return json({ ok: false }, 403);
      const permitted = await plane.fetch(new Request("https://viberant.internal/relay-authorize", {
        method: "POST",
        body: JSON.stringify({ ticket })
      }));
      if (!permitted.ok || !(await permitted.json()).ok) return json({ ok: false }, 403);
      const pair = env.RELAY_PAIR.get(env.RELAY_PAIR.idFromName(ticket));
      return pair.fetch(request);
    }
    return json({ ok: false }, 404);
  }
};
var WorkspacePlane = class {
  static {
    __name(this, "WorkspacePlane");
  }
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.waiters = /* @__PURE__ */ new Map();
    this.rates = /* @__PURE__ */ new Map();
  }
  tooMany(address, path) {
    const now = Date.now();
    const kind = path === "find-invite" || path === "join-ticket" ? "join" : "ordinary";
    const key = `${String(address).slice(0, 80)}:${kind}`;
    const recent = (this.rates.get(key) ?? []).filter((at) => now - at < RATE_WINDOW);
    recent.push(now);
    this.rates.set(key, recent);
    if (this.rates.size > 1e4) {
      for (const [held, times] of this.rates) {
        if (!times.some((at) => now - at < RATE_WINDOW)) this.rates.delete(held);
      }
    }
    return recent.length > (kind === "join" ? MOST_JOIN_REQUESTS : MOST_REQUESTS);
  }
  async scopeAllows(workspace, scope, path) {
    if (!/^[0-9a-f-]{16,128}$/i.test(workspace) || !/^[0-9a-f]{32,128}$/i.test(scope)) return false;
    const key = `scope:${workspace}`;
    const proof = await hashText(scope);
    const known = await this.ctx.storage.get(key);
    if (!known && path === "announce") await this.ctx.storage.put(key, proof);
    return (known ?? (path === "announce" ? proof : null)) === proof;
  }
  async relayTicket(workspace, from, to) {
    await this.pruneRelayTickets();
    const ticket = ticketId();
    await this.ctx.storage.put(`relay:${ticket}`, {
      workspace,
      from,
      to,
      expiresAt: Date.now() + TICKET_LASTS
    });
    return ticket;
  }
  async pruneRelayTickets() {
    const records = await this.ctx.storage.list({ prefix: "relay:", limit: 128 });
    const stale = [];
    for (const [key, one] of records) {
      if (Number(one?.expiresAt) <= Date.now()) stale.push(key);
    }
    if (stale.length) await this.ctx.storage.delete(stale);
  }
  async deliver(workspace, deviceId, ticket) {
    const key = `${workspace}:${deviceId}`;
    const waiting = this.waiters.get(key);
    if (waiting) {
      this.waiters.delete(key);
      clearTimeout(waiting.timer);
      waiting.done(ticket);
      return;
    }
    const storageKey = `pending:${workspace}:${deviceId}`;
    const pending = await this.ctx.storage.get(storageKey) ?? [];
    await this.ctx.storage.put(storageKey, [...pending, ticket].slice(-8));
  }
  async takePending(workspace, deviceId) {
    const key = `pending:${workspace}:${deviceId}`;
    const pending = await this.ctx.storage.get(key) ?? [];
    const now = Date.now();
    const live = pending.filter((one) => now - Number(one.at) < TICKET_LASTS);
    const first = live.shift() ?? null;
    if (live.length) await this.ctx.storage.put(key, live);
    else await this.ctx.storage.delete(key);
    return first;
  }
  async fetch(request) {
    const internal = new URL(request.url).pathname === "/relay-authorize";
    if (internal) {
      let ticket;
      try {
        ticket = String((await request.json()).ticket ?? "");
      } catch {
        return json({ ok: false }, 400);
      }
      const held = await this.ctx.storage.get(`relay:${ticket}`);
      if (!held || Number(held.expiresAt) <= Date.now()) {
        await this.ctx.storage.delete(`relay:${ticket}`);
        return json({ ok: false }, 403);
      }
      await this.pruneRelayTickets();
      return json({ ok: true });
    }
    const path = request.headers.get("x-viberant-path") || "";
    if (!PLANE_PATHS.has(path)) return json({ ok: false }, 404);
    if (this.tooMany(request.headers.get("x-viberant-address"), path)) return json({ ok: false }, 429);
    const signed = await signedRequest(request, path);
    if (!signed) return json({ ok: false }, 401);
    const { body, from } = signed;
    if (path === "find-invite") {
      const mark = String(body.mark ?? "");
      const invitation = await this.ctx.storage.get(`invite:${mark}`);
      if (!invitation || Number(invitation.expiresAt) <= Date.now()) {
        await this.ctx.storage.delete(`invite:${mark}`);
        return json({ ok: false });
      }
      return json({ ok: true, invitation });
    }
    if (path === "join-ticket") {
      const mark = String(body.mark ?? "");
      const invitation = await this.ctx.storage.get(`invite:${mark}`);
      if (!invitation || Number(invitation.expiresAt) <= Date.now()) {
        await this.ctx.storage.delete(`invite:${mark}`);
        return json({ ok: false });
      }
      await this.ctx.storage.delete(`invite:${mark}`);
      const ticket = await this.relayTicket(invitation.workspace, from.deviceId, invitation.owner.deviceId);
      await this.deliver(invitation.workspace, invitation.owner.deviceId, {
        kind: "join",
        ticket,
        workspace: invitation.workspace,
        mark,
        from: from.deviceId,
        card: from,
        to: invitation.owner.deviceId,
        relay: invitation.relay,
        at: Date.now()
      });
      return json({ ok: true, ticket, owner: invitation.owner, relay: invitation.relay });
    }
    const workspace = String(body.workspace ?? "");
    const scope = String(body.scope ?? "");
    if (!await this.scopeAllows(workspace, scope, path)) return json({ ok: false }, 403);
    if (path === "announce") {
      if (body.card?.deviceId !== from.deviceId) return json({ ok: false }, 403);
      const direct = safeDirect(body.direct);
      await this.ctx.storage.put(`about:${workspace}:${from.deviceId}`, {
        workspace,
        card: from,
        addresses: Array.isArray(body.addresses) ? body.addresses.slice(0, 8).map((one) => String(one).slice(0, 253)) : [],
        directPort: Number(body.directPort) || null,
        direct,
        at: Date.now()
      });
      return json({ ok: true, at: Date.now() });
    }
    if (path === "who-is-about") {
      const records = await this.ctx.storage.list({ prefix: `about:${workspace}:` });
      const now = Date.now();
      const devices = [];
      const stale = [];
      for (const [key, one] of records) {
        if (now - Number(one.at) >= STILL_HERE * 4) stale.push(key);
        if (body.notMe && one.card?.deviceId === body.notMe) continue;
        devices.push({
          ...one.card,
          addresses: one.addresses,
          directPort: one.directPort,
          direct: one.direct,
          hereNow: now - Number(one.at) < STILL_HERE,
          lastHere: one.at
        });
      }
      if (stale.length) await this.ctx.storage.delete(stale);
      return json({ ok: true, devices });
    }
    if (path === "ticket") {
      if (body.from !== from.deviceId || !body.to || body.to === body.from) return json({ ok: false }, 403);
      const relay = { kind: "websocket", url: request.headers.get("x-viberant-relay") };
      const ticket = await this.relayTicket(workspace, from.deviceId, String(body.to));
      await this.deliver(workspace, String(body.to), {
        ticket,
        workspace,
        from: from.deviceId,
        to: String(body.to),
        relay,
        at: Date.now()
      });
      return json({ ok: true, ticket });
    }
    if (path === "wait-for-ticket") {
      if (body.deviceId !== from.deviceId) return json({ ok: false }, 403);
      const ready = await this.takePending(workspace, from.deviceId);
      if (ready) return json({ ok: true, ticket: ready });
      const key = `${workspace}:${from.deviceId}`;
      let settleWaiting;
      const waiting = new Promise((done) => {
        let settled = false;
        settleWaiting = /* @__PURE__ */ __name((value) => {
          if (settled) return;
          settled = true;
          const held = this.waiters.get(key);
          if (held?.finish === settleWaiting) this.waiters.delete(key);
          clearTimeout(timer);
          done(value);
        }, "settleWaiting");
        const old = this.waiters.get(key);
        if (old) {
          clearTimeout(old.timer);
          old.done(null);
        }
        const timer = setTimeout(() => {
          settleWaiting(null);
        }, 2e4);
        this.waiters.set(key, { done: settleWaiting, finish: settleWaiting, timer });
      });
      const raced = await this.takePending(workspace, from.deviceId);
      if (raced) settleWaiting(raced);
      const ticket = await waiting;
      return json({ ok: true, ticket });
    }
    if (path === "offer-invite") {
      if (body.owner?.deviceId !== from.deviceId || !/^[0-9a-f]{64}$/i.test(String(body.mark ?? ""))) {
        return json({ ok: false }, 403);
      }
      const expiresAt = Number(body.expiresAt);
      if (!Number.isFinite(expiresAt) || expiresAt <= Date.now() || expiresAt > Date.now() + 15 * 6e4) {
        return json({ ok: false }, 400);
      }
      await this.ctx.storage.put(`invite:${body.mark}`, {
        workspace,
        mark: body.mark,
        expiresAt,
        owner: from,
        relay: { kind: "websocket", url: request.headers.get("x-viberant-relay") }
      });
      return json({ ok: true });
    }
    if (path === "forget") {
      if (body.deviceId !== from.deviceId) return json({ ok: false }, 403);
      await this.ctx.storage.delete(`about:${workspace}:${from.deviceId}`);
      return json({ ok: true });
    }
    return json({ ok: false }, 404);
  }
};
var RelayPair = class {
  static {
    __name(this, "RelayPair");
  }
  constructor(ctx) {
    this.ctx = ctx;
  }
  async fetch(request) {
    if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") return json({ ok: false }, 426);
    const connected = this.ctx.getWebSockets();
    if (connected.length >= 2) return json({ ok: false }, 409);
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.serializeAttachment({ paired: connected.length === 1 });
    this.ctx.acceptWebSocket(server);
    if (!connected.length) {
      server.send(JSON.stringify({ waiting: true }));
    } else {
      const first = connected[0];
      first.serializeAttachment({ paired: true });
      server.serializeAttachment({ paired: true });
      first.send(JSON.stringify({ joined: true }));
      server.send(JSON.stringify({ joined: true }));
    }
    return new Response(null, { status: 101, webSocket: client });
  }
  webSocketMessage(socket, message) {
    const bytes = typeof message === "string" ? encoder.encode(message).byteLength : message.byteLength;
    if (bytes > MOST_RELAY_MESSAGE || !socket.deserializeAttachment()?.paired) {
      socket.close(1009, "message refused");
      return;
    }
    const other = this.ctx.getWebSockets().find((one) => one !== socket);
    if (!other || !other.deserializeAttachment()?.paired) {
      socket.close(1011, "other computer left");
      return;
    }
    try {
      other.send(message);
    } catch {
      socket.close(1011, "relay interrupted");
    }
  }
  webSocketClose(socket, code, reason) {
    const other = this.ctx.getWebSockets().find((one) => one !== socket);
    try {
      other?.close(code || 1e3, String(reason || "other computer left").slice(0, 120));
    } catch {
    }
  }
  webSocketError(socket) {
    const other = this.ctx.getWebSockets().find((one) => one !== socket);
    try {
      other?.close(1011, "relay interrupted");
    } catch {
    }
  }
};
var __testOnly = { signedRequest, hashText, PLANE_PATHS };
export {
  RelayPair,
  WorkspacePlane,
  __testOnly,
  worker_default as default
};
//# sourceMappingURL=worker.js.map
