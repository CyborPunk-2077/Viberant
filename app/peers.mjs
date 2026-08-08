/**
 * Reaching one of your computers, wherever it is.
 *
 * Three ways, tried in this order and named in these words on screen:
 *
 *   **LAN** — the same network. Fastest, private by construction, and the one
 *     that already worked. Nothing about this file replaces it.
 *   **Direct** — across the internet, straight to the other computer.
 *   **Relay** — across the internet, through a machine in the middle that
 *     forwards bytes it cannot read.
 *
 * **There is one copy of the transfer logic.** `parcel.mjs` wraps a folder into
 * a stream and unwraps a stream into a folder; it does not know or care which
 * of these three carried it, and resuming and the three-way verification work
 * the same on all of them. Anything else would mean the same arithmetic written
 * three times and wrong in two of them.
 *
 * **The relay is not trusted and does not have to be.** Both ends agree a key
 * with X25519 before anything is sent, and everything after the handshake is
 * sealed with it. The relay sees the length of each box and nothing else. That
 * is the whole reason a relay is acceptable at all: it is a postal service, not
 * a confidant.
 *
 * What this deliberately does not do: invent NAT traversal. Learning this
 * computer's address as the outside world sees it is done with STUN — a
 * protocol somebody else specified, with a client implemented here in about
 * forty lines. Where that address turns out to be reachable, a direct
 * connection is tried. Where it is not, the relay is used, and the relay is not
 * a fallback anybody should feel bad about: it is how this works on the
 * networks most people actually have.
 */

import { createConnection, createServer } from 'node:net';
import { createSocket } from 'node:dgram';
import { randomBytes } from 'node:crypto';
import { PassThrough } from 'node:stream';

import * as device from './device.mjs';

/** What kind of connection this is, in the words the page uses. */
export const LAN = 'lan';
export const DIRECT = 'direct';
export const RELAY = 'relay';

/** How a connection kind reads to a person. */
export const inWords = (kind) => ({
  [LAN]: 'This network',
  [DIRECT]: 'Direct · Internet',
  [RELAY]: 'Relay',
}[kind] ?? 'Not connected');

/** The port a Viberant listens on for direct connections from outside. */
export const DIRECT_PORT = 47779;

/** How long anything gets to answer before the next way is tried. */
const ANSWER_WITHIN = 5000;

// ---------------------------------------------------------------------------
// Where the outside world thinks this computer is
// ---------------------------------------------------------------------------

/**
 * Public STUN servers, which every video call on earth already uses.
 *
 * Several, because one being down is ordinary. Nothing of yours goes to them:
 * a binding request carries a random transaction identifier and no more, and
 * what comes back is the address they saw it arrive from.
 */
export const STUN_SERVERS = [
  { host: 'stun.l.google.com', port: 19302 },
  { host: 'stun1.l.google.com', port: 19302 },
  { host: 'stun.cloudflare.com', port: 3478 },
];

/**
 * Ask a STUN server what address it sees, per RFC 5389.
 *
 * The request is twenty bytes: a type, a length, the magic cookie everybody
 * uses, and twelve random bytes that tie the answer to the question. The answer
 * carries an XOR-MAPPED-ADDRESS attribute, which is the address with the cookie
 * mixed into it — done that way so middleboxes rewriting addresses in packets
 * do not helpfully rewrite this one too.
 */
export function askStun({ host, port }, { within = 2500 } = {}) {
  return new Promise((done) => {
    const socket = createSocket('udp4');
    const cookie = 0x2112A442;
    const asking = randomBytes(12);

    const request = Buffer.alloc(20);
    request.writeUInt16BE(0x0001, 0);   // a binding request
    request.writeUInt16BE(0, 2);        // with no attributes
    request.writeUInt32BE(cookie, 4);
    asking.copy(request, 8);

    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(waiting);
      try { socket.close(); } catch { /* already shut */ }
      done(value);
    };

    const waiting = setTimeout(() => finish(null), within);

    socket.on('error', () => finish(null));
    socket.on('message', (reply) => {
      if (reply.length < 20) return finish(null);
      if (reply.readUInt32BE(4) !== cookie) return finish(null);
      if (!reply.subarray(8, 20).equals(asking)) return finish(null);

      let at = 20;
      const end = 20 + reply.readUInt16BE(2);
      while (at + 4 <= end && at + 4 <= reply.length) {
        const kind = reply.readUInt16BE(at);
        const size = reply.readUInt16BE(at + 2);
        const body = reply.subarray(at + 4, at + 4 + size);

        // 0x0020 is XOR-MAPPED-ADDRESS; 0x0001 is the older plain one.
        if ((kind === 0x0020 || kind === 0x0001) && body.length >= 8 && body[1] === 0x01) {
          const mix = kind === 0x0020;
          const p = body.readUInt16BE(2) ^ (mix ? cookie >>> 16 : 0);
          const raw = body.readUInt32BE(4) ^ (mix ? cookie : 0);
          const address = [raw >>> 24, (raw >>> 16) & 255, (raw >>> 8) & 255, raw & 255].join('.');
          return finish({ address, port: p });
        }
        at += 4 + size + ((4 - (size % 4)) % 4);
      }
      finish(null);
    });

    socket.send(request, port, host, (e) => { if (e) finish(null); });
  });
}

/**
 * This computer's address as the internet sees it, if anybody will say.
 *
 * Held for a few minutes: it changes when the connection does, and asking on
 * every question would be several round trips for an answer that has not moved.
 */
let outsideAddress = null;
let askedAt = 0;
const ADDRESS_LASTS = 5 * 60 * 1000;

export async function whereTheInternetSeesMe({ force = false } = {}) {
  if (!force && outsideAddress && Date.now() - askedAt < ADDRESS_LASTS) return outsideAddress;

  for (const server of STUN_SERVERS) {
    const seen = await askStun(server);
    if (seen) {
      outsideAddress = seen;
      askedAt = Date.now();
      return seen;
    }
  }
  outsideAddress = null;
  askedAt = Date.now();
  return null;
}

export const forgetAddress = () => { outsideAddress = null; askedAt = 0; };

// ---------------------------------------------------------------------------
// Frames
// ---------------------------------------------------------------------------

/**
 * A length in front of every box.
 *
 * TCP is a stream of bytes with no idea where one message stops, and the relay
 * has to know how much to forward without being able to read any of it. Four
 * bytes of length, then that many bytes, with a ceiling — a length field
 * somebody else chooses is a way to ask this computer for a gigabyte of memory.
 */
export const MOST_IN_ONE_FRAME = 8 * 1024 * 1024;

export function framed(bytes) {
  const size = Buffer.alloc(4);
  size.writeUInt32BE(bytes.length);
  return Buffer.concat([size, Buffer.from(bytes)]);
}

/** Pull whole frames out of a stream, and refuse a silly one. */
export function frames() {
  let holding = Buffer.alloc(0);
  return {
    take(chunk) {
      holding = holding.length ? Buffer.concat([holding, chunk]) : chunk;
      const out = [];
      for (;;) {
        if (holding.length < 4) return out;
        const size = holding.readUInt32BE(0);
        if (size > MOST_IN_ONE_FRAME) throw new Error('a frame larger than anything this sends');
        if (holding.length < 4 + size) return out;
        out.push(holding.subarray(4, 4 + size));
        holding = holding.subarray(4 + size);
      }
    },
    get waiting() { return holding.length; },
    /** Bytes read off the wire but not yet part of a whole frame. */
    get rest() { return holding; },
  };
}

// ---------------------------------------------------------------------------
// The handshake
// ---------------------------------------------------------------------------

/**
 * Proving who is at each end, before a byte of anything else moves.
 *
 * Each side sends its card and a signature over both sides' random challenges.
 * Signing something the *other* side chose is what makes this not replayable:
 * a recording of yesterday's handshake proves nothing today, because today's
 * challenge is different.
 *
 * The workspace decides whether the device on the other end is allowed here.
 * This function only establishes *who* it is; `members.may` decides what that
 * entitles them to, and the two are deliberately separate.
 */
export async function greet(socket, { expect = null, mine = null } = {}) {
  const me = mine ?? await device.card();
  const myChallenge = randomBytes(32).toString('base64');

  const reader = frames();
  const queue = [];
  let waiting = null;
  let broke = null;

  const push = (f) => { if (waiting) { const w = waiting; waiting = null; w(f); } else queue.push(f); };
  const next = () => (queue.length
    ? Promise.resolve(queue.shift())
    : new Promise((r) => { waiting = r; }));

  const onData = (chunk) => {
    try { for (const f of reader.take(chunk)) push(f); } catch (e) { broke = e; socket.destroy(); }
  };
  socket.on('data', onData);
  socket.on('error', (e) => { broke ??= e; push(null); });
  socket.on('close', () => push(null));

  socket.write(framed(Buffer.from(JSON.stringify({ hello: me, challenge: myChallenge }))));

  const said = await Promise.race([
    next(),
    new Promise((r) => setTimeout(() => r(null), ANSWER_WITHIN)),
  ]);
  if (!said || broke) { socket.off('data', onData); return null; }

  let theirs;
  try { theirs = JSON.parse(said.toString()); } catch { socket.off('data', onData); return null; }
  if (!theirs?.hello?.signPublic || !theirs?.challenge) { socket.off('data', onData); return null; }

  // The identifier has to be the fingerprint of the key that came with it, or
  // anybody could arrive claiming to be a device you already trust.
  if (device.fingerprint(theirs.hello.signPublic) !== theirs.hello.deviceId) {
    socket.off('data', onData);
    return null;
  }
  if (expect && theirs.hello.deviceId !== expect) { socket.off('data', onData); return null; }

  /**
   * The one string both ends sign, and it has to be the *same* string.
   *
   * Written first as `mine|theirs`, which each side computes differently: A
   * signs A|B and B signs B|A, so each then checks the other's signature
   * against a transcript the other never signed and both refuse. It failed
   * closed, which is the right way for a handshake to be wrong, and it failed
   * every time, which is the right way for a bug to be.
   *
   * Sorted rather than ordered by who dialled, because both ends have to reach
   * it without knowing which of them that was.
   */
  const both = [myChallenge, theirs.challenge].sort().join('|');
  socket.write(framed(Buffer.from(JSON.stringify({ proof: await device.signed(both) }))));

  const theirProof = await Promise.race([
    next(),
    new Promise((r) => setTimeout(() => r(null), ANSWER_WITHIN)),
  ]);
  socket.off('data', onData);
  if (!theirProof || broke) return null;

  let proof;
  try { proof = JSON.parse(theirProof.toString()); } catch { return null; }
  if (!device.verify(both, proof?.proof ?? '', theirs.hello.signPublic)) return null;

  // The key both ends now share. The salt is both challenges, so this
  // conversation's key is this conversation's alone.
  const key = await device.sharedWith(theirs.hello.agreePublic, { salt: both });

  return { who: theirs.hello, key, leftOver: queue.filter(Boolean) };
}

// ---------------------------------------------------------------------------
// A connection, whichever way it was made
// ---------------------------------------------------------------------------

/**
 * One peer, one connection, one way of reading and writing it.
 *
 * Everything above this line is about getting a socket. Everything that uses a
 * peer works through what this returns, so a transfer does not know whether it
 * is on a local network or going through a relay in another country.
 */
export function conversation(socket, { key, who, kind, leftOver = [] }) {
  const incoming = new PassThrough();
  const reader = frames();
  let shut = false;

  const feed = (frame) => {
    const plain = device.open(key, frame);
    // A box that will not open is not a hiccup. Either something changed it in
    // flight or it was never for us, and both mean this conversation is over.
    if (!plain) return close(new Error('something arrived that would not open'));
    incoming.write(plain);
  };

  for (const f of leftOver) feed(f);

  socket.on('data', (chunk) => {
    try { for (const f of reader.take(chunk)) feed(f); } catch (e) { close(e); }
  });
  socket.on('error', (e) => close(e));
  socket.on('close', () => close(null));

  function close(why) {
    if (shut) return;
    shut = true;
    if (why) incoming.destroy(why); else incoming.end();
    try { socket.destroy(); } catch { /* already gone */ }
  }

  return {
    who,
    kind,
    /** What the person sees. Never a port, never an address. */
    says: inWords(kind),
    incoming,

    /** Send some bytes, sealed. Waits when the wire is behind. */
    send(bytes) {
      if (shut) return Promise.reject(new Error('that connection is closed'));
      const box = framed(device.seal(key, bytes));
      return new Promise((done, fail) => {
        socket.write(box, (e) => (e ? fail(e) : done()));
      });
    },

    /**
     * Pour a whole stream down it, in pieces small enough to seal.
     *
     * This is how a project crosses: `parcel.wrap` produces a stream, and it
     * arrives at the other end as a stream, and neither end has any idea a
     * relay was involved.
     */
    async pour(stream) {
      for await (const chunk of stream) {
        for (let at = 0; at < chunk.length; at += PIECE) {
          await this.send(chunk.subarray(at, Math.min(at + PIECE, chunk.length)));
        }
      }
      await this.send(Buffer.from(DONE));
    },

    close: () => close(null),
    get open() { return !shut; },
  };
}

/** Small enough to seal cheaply, large enough not to be all overhead. */
const PIECE = 256 * 1024;

/** The last thing a poured stream says, so the far end knows it ended. */
export const DONE = ' viberant-end ';

/** Turn what arrives back into a stream, stopping where the sender stopped. */
export function poured(conversation) {
  const out = new PassThrough();
  const marker = Buffer.from(DONE);
  let held = Buffer.alloc(0);

  conversation.incoming.on('data', (chunk) => {
    held = held.length ? Buffer.concat([held, chunk]) : chunk;
    const at = held.indexOf(marker);
    if (at === -1) {
      // Keep back as much as the marker could be split across.
      const keep = Math.max(0, held.length - marker.length + 1);
      if (keep > 0) { out.write(held.subarray(0, keep)); held = held.subarray(keep); }
      return;
    }
    out.write(held.subarray(0, at));
    held = Buffer.alloc(0);
    out.end();
  });
  conversation.incoming.on('end', () => out.end());
  conversation.incoming.on('error', (e) => out.destroy(e));

  return out;
}

// ---------------------------------------------------------------------------
// Making one
// ---------------------------------------------------------------------------

/** Try to reach a peer straight across the internet. */
export function dialDirect({ address, port = DIRECT_PORT, expect }) {
  return new Promise((done) => {
    let settled = false;
    const finish = (v) => { if (!settled) { settled = true; clearTimeout(waiting); done(v); } };

    const socket = createConnection({ host: address, port });
    const waiting = setTimeout(() => { socket.destroy(); finish(null); }, ANSWER_WITHIN);

    socket.once('error', () => finish(null));
    socket.once('connect', async () => {
      clearTimeout(waiting);
      const known = await greet(socket, { expect });
      if (!known) { socket.destroy(); return finish(null); }
      finish(conversation(socket, { ...known, kind: DIRECT }));
    });
  });
}

/** Listen for peers arriving straight across the internet. */
export function listenDirect({ port = DIRECT_PORT, arriving, allow = null }) {
  const server = createServer(async (socket) => {
    socket.setNoDelay(true);
    const known = await greet(socket);
    if (!known) return socket.destroy();
    // The workspace decides. A greeting proves who; it never proves welcome.
    if (allow && !allow(known.who)) return socket.destroy();
    arriving(conversation(socket, { ...known, kind: DIRECT }));
  });
  server.on('error', () => { /* a port already taken is not a reason to stop */ });
  server.listen(port);
  return server;
}

export const __testOnly = { frames, framed, PIECE };
