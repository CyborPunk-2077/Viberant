/**
 * Reaching one of your computers, without being asked how.
 *
 * The order is not a preference, it is three facts in a row:
 *
 *   **this network** is fastest and never leaves the building;
 *   **direct** is next, and works when both ends can be reached;
 *   **a relay** is last, and is how this works on the networks most people
 *     actually have — not a failure, and not something to apologise for.
 *
 * Each is tried and the first that answers is used. Nobody is asked which, and
 * nobody is shown a reason: what appears on screen is "Direct · Internet" or
 * "Relay", and everything underneath it lives in diagnostics.
 *
 * What comes back is the same kind of thing every time, so nothing above this
 * line knows or cares which happened. That is the whole point of the file: one
 * transfer, one sync, one remote build, three ways of getting there.
 */

import * as peers from './peers.mjs';
import * as relay from './relay.mjs';
import * as plane from './plane.mjs';
import * as members from './members.mjs';
import * as device from './device.mjs';
import * as lan from './lan.mjs';

/** Where relays are, when nobody has said otherwise. */
export const RELAYS = [];

/** How long the whole search gets before it gives up. */
const FIND_WITHIN = 25000;

/**
 * Everything known about the computers in this workspace.
 *
 * Folded from three places that each know part of it: the workspace itself
 * knows who is allowed, this network knows who is in the building, and the
 * plane knows who has said hello lately from anywhere. A computer on this
 * network is reported as being on this network even when the plane is down,
 * which is the whole of D-141 in one line.
 */
export async function around({ workspace = null } = {}) {
  const ws = workspace ?? await members.current();
  if (!ws) return { ok: true, mine: [], team: [], workspace: null };

  const me = await device.card();
  const near = new Map(lan.around().map((one) => [one.machine, one]));

  let said = { devices: [] };
  let planeReachable = true;
  try {
    const service = await plane.plane();
    const asked = await service.whoIsAbout({ workspace: ws.id, notMe: me.deviceId });
    planeReachable = asked.reachable !== false;
    said = asked.ok ? asked : { devices: [] };
  } catch { planeReachable = false; }

  const heard = new Map((said.devices ?? []).map((d) => [d.deviceId, d]));

  const mine = [];
  const team = [];

  for (const [id, one] of Object.entries(ws.devices ?? {})) {
    if (ws.revoked?.[id]) continue;

    const onThisNetwork = near.has(id);
    const elsewhere = heard.get(id);
    const kind = onThisNetwork ? peers.LAN
      : elsewhere?.hereNow ? (elsewhere.directPort ? peers.DIRECT : peers.RELAY)
        : null;

    const card = {
      deviceId: id,
      displayName: one.displayName,
      person: one.person,
      you: id === me.deviceId,
      online: id === me.deviceId || onThisNetwork || !!elsewhere?.hereNow,
      // What a person reads. Never a port and never an address.
      how: id === me.deviceId ? 'This computer' : peers.inWords(kind),
      lastHere: elsewhere?.lastHere ?? (onThisNetwork ? Date.now() : null),
      trusted: one.trusted === true,
    };

    (one.person === ws.devices[me.deviceId]?.person ? mine : team).push(card);
  }

  const order = (a, b) => Number(b.online) - Number(a.online)
    || String(a.displayName).localeCompare(String(b.displayName));

  return {
    ok: true,
    workspace: { id: ws.id, name: ws.name },
    mine: mine.sort((a, b) => Number(b.you) - Number(a.you) || order(a, b)),
    team: team.sort(order),
    // A fact for diagnostics, and a sentence for the page when it matters.
    service: planeReachable ? 'reachable' : 'not reachable',
    stillWorks: planeReachable ? null : plane.whatWorksWithout(ws),
  };
}

/**
 * Open a conversation with one of your computers.
 *
 * The three ways, in order, and the first that answers wins. Every one of them
 * ends in the same handshake, so whichever happened, both ends have proved who
 * they are and agreed a key before anything else is said.
 */
export async function reach(deviceId, { workspace = null, only = null } = {}) {
  const ws = workspace ?? await members.current();
  if (!ws) {
    return { ok: false, sentence: 'This computer is not in a workspace.', action: 'Make one, or join one.' };
  }
  if (members.isRevoked(ws, deviceId) || !ws.devices?.[deviceId]) {
    return {
      ok: false,
      sentence: 'That computer is not in this workspace any more.',
      action: 'Ask whoever owns the workspace to add it again.',
    };
  }

  const wanted = ws.devices[deviceId];
  const ways = only ? [only] : [peers.LAN, peers.DIRECT, peers.RELAY];
  const tried = [];

  for (const way of ways) {
    const got = await Promise.race([
      oneWay(way, { ws, deviceId, wanted }),
      new Promise((r) => setTimeout(() => r(null), FIND_WITHIN)),
    ]);
    tried.push(way);
    if (got) return { ok: true, peer: got, how: got.says, kind: got.kind, tried };
  }

  return {
    ok: false,
    tried,
    sentence: `${wanted.displayName} could not be reached.`,
    action: 'Check it is turned on with Viberant open. It will appear here when it is.',
  };
}

async function oneWay(way, { ws, deviceId, wanted }) {
  if (way === peers.LAN) {
    // The local network already had a way through, and it stays the way it
    // works. Nothing here reimplements it.
    const near = lan.around().find((one) => one.machine === deviceId);
    if (!near) return null;
    /*
     * The port that computer said it listens on, not the one this computer
     * happens to use.
     *
     * They are the same number on two real machines and different when two
     * copies share one, and assuming they match is what made the second copy
     * unreachable while looking perfectly present.
     */
    const door = near.directPort ?? peers.DIRECT_PORT;
    for (const address of near.addresses ?? []) {
      const got = await peers.dialDirect({ address, port: door, expect: deviceId });
      /*
       * Handed back as itself, with two facts attached.
       *
       * It used to be spread into a new object, and spreading keeps only what
       * an object owns — so every method the connection carries was quietly
       * left behind. What came back looked exactly like a peer, passed every
       * check, and then failed at the moment anybody tried to say anything
       * down it. The whole local-network path had been dead this way.
       */
      if (got) {
        got.kind = peers.LAN;
        got.says = peers.inWords(peers.LAN);
        return got;
      }
    }
    return null;
  }

  const service = await plane.plane();

  if (way === peers.DIRECT) {
    const asked = await service.whoIsAbout({ workspace: ws.id });
    const them = (asked.devices ?? []).find((d) => d.deviceId === deviceId);
    if (!them?.directPort || !them.addresses?.length) return null;

    for (const address of them.addresses) {
      const got = await peers.dialDirect({ address, port: them.directPort, expect: deviceId });
      if (got) return got;
    }
    return null;
  }

  if (way === peers.RELAY) {
    const where = await whichRelay();
    if (!where) return null;

    const me = await device.card();
    const asked = await service.ticketFor({ workspace: ws.id, from: me.deviceId, to: deviceId });
    if (!asked?.ok || !asked.ticket) return null;

    const joined = await relay.dialRelay({ host: where.host, port: where.port, ticket: asked.ticket });
    if (!joined) return null;

    // The relay hands over what it had already read, so nothing is lost in the
    // gap between one reader letting go and the next attaching.
    const known = await peers.greet(joined.socket, {
      expect: deviceId,
      alreadyRead: joined.alreadyRead,
    });
    if (!known) { joined.socket.destroy(); return null; }
    return peers.conversation(joined.socket, { ...known, kind: peers.RELAY });
  }

  return null;
}

/** Which relay to use, from the setting, or none. */
async function whichRelay() {
  const settings = await import('./settings.mjs');
  const said = String((await settings.get('relayService')) ?? '').trim();
  const from = said ? [said] : RELAYS;
  if (!from.length) return null;

  const [host, port] = from[0].split(':');
  return { host, port: Number(port) || relay.RELAY_PORT };
}

/**
 * Say hello, and listen for the others.
 *
 * The plane is told where this computer can be reached; nothing else is sent.
 * Failing to reach it is not an error and does not stop anything — the local
 * network carries on either way, which is the property that makes this safe to
 * depend on.
 */
let saying = null;
let listening = null;

export async function beAbout({ workspace = null } = {}) {
  const ws = workspace ?? await members.current();
  if (!ws) return { ok: false, sentence: 'This computer is not in a workspace.', action: 'Make one, or join one.' };

  const me = await device.card();

  if (!listening) {
    listening = peers.listenDirect({
      arriving: (peer) => arrived(peer, ws),
      // Who is allowed in, decided by the workspace and nothing else. Proving
      // who you are is not the same as being welcome, and this is the line.
      allow: (who) => !!ws.devices?.[who.deviceId] && !members.isRevoked(ws, who.deviceId),
    });
  }

  const hello = async () => {
    const seen = await peers.whereTheInternetSeesMe();
    const service = await plane.plane();
    await service.announce({
      workspace: ws.id,
      card: me,
      addresses: seen ? [seen.address] : [],
      directPort: seen ? peers.DIRECT_PORT : null,
    }).catch(() => null);
  };

  await hello();
  if (!saying) {
    saying = setInterval(() => { hello().catch(() => null); }, plane.SAY_HELLO_EVERY);
    saying.unref?.();
  }

  return { ok: true, sentence: `${me.displayName} is about.` };
}

/** Stop saying hello and stop listening. */
export async function stop() {
  if (saying) { clearInterval(saying); saying = null; }
  if (listening) { listening.close(); listening = null; }
  const me = await device.card().catch(() => null);
  if (me) await (await plane.plane()).forget(me.deviceId).catch(() => null);
  return { ok: true };
}

/** What to do with a computer that has arrived. Set by the server. */
let arrived = () => {};
export const whenSomebodyArrives = (fn) => { arrived = fn; };

export const __testOnly = { oneWay, whichRelay };
