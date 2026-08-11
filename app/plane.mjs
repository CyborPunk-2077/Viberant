/**
 * The one small service, and everything it is deliberately not.
 *
 * Two computers on different networks cannot find each other without something
 * that knows where both of them are. That is the whole job. So this is the
 * smallest thing that does it, and the list of what it holds is short enough to
 * read:
 *
 *   who is in a workspace, and their public keys;
 *   which devices are about, and roughly where;
 *   invitations that have not been used yet;
 *   a ticket, when two computers need a relay to introduce them.
 *
 * **It never holds a project, a file, a build, a log, or a line of anybody's
 * source.** Those go from one computer to the other and nowhere else. If this
 * service were read end to end by somebody who should not have it, they would
 * learn who works with whom and nothing about what anybody is building — and
 * that is a property of what is sent, not a promise about how it is stored.
 *
 * **It is replaceable.** Everything below talks to one small interface. The one
 * that ships is `here`, which runs inside this app on your own computer and is
 * enough for two machines on one network and for every test in this repository.
 * `over(address)` talks to a real one somewhere. Nothing in the app knows which
 * it has, and nothing anywhere names a cloud vendor.
 *
 * **And it is allowed to be missing.** A workspace this computer has already
 * joined keeps working on the local network with the plane switched off — the
 * membership is on this disk and the keys are on this disk, so the check that
 * matters can be made without asking anybody. Losing the internet must not
 * cost you the computer on the other side of the room.
 */

import { randomBytes } from 'node:crypto';

import * as device from './device.mjs';
import * as services from './services.mjs';

/** How long a device counts as being about after its last word. */
export const STILL_HERE = 90 * 1000;
/** How often a device says it is here. */
export const SAY_HELLO_EVERY = 30 * 1000;

/**
 * The plane that runs inside this app.
 *
 * Enough for one person's computers on one network, for a workspace that has
 * already been joined, and for every test here. It is not a stub: it is the
 * real implementation of the real interface, and the only thing a hosted one
 * adds is being reachable from somewhere else.
 */
export function here({ invitations: seededInvitations = [], onInvitationsChanged = null } = {}) {
  const about = new Map();
  const pending = new Map();
  const waiters = new Map();
  const invitations = new Map(seededInvitations
    .filter((one) => one?.mark && Number(one.expiresAt) > Date.now())
    .map((one) => [one.mark, one]));
  const invitationsChanged = () => onInvitationsChanged?.(
    [...invitations.values()].filter((one) => Number(one.expiresAt) > Date.now()),
  );

  const takeTicket = (deviceId, workspace) => {
    const mine = pending.get(deviceId) ?? [];
    const at = mine.findIndex((one) => one.workspace === workspace && Date.now() - one.at < STILL_HERE);
    if (at < 0) return null;
    const [ticket] = mine.splice(at, 1);
    if (mine.length) pending.set(deviceId, mine); else pending.delete(deviceId);
    return ticket;
  };

  const deliver = (to, ticket) => {
    const waiting = waiters.get(to) ?? [];
    const one = waiting.findIndex((waiter) => waiter.workspace === ticket.workspace);
    if (one >= 0) {
      const [waiter] = waiting.splice(one, 1);
      if (waiting.length) waiters.set(to, waiting); else waiters.delete(to);
      clearTimeout(waiter.timer);
      waiter.done({ ok: true, ticket });
      return;
    }
    pending.set(to, [...(pending.get(to) ?? []), ticket].slice(-8));
  };

  return {
    kind: 'here',
    reachable: true,

    async announce({ workspace, card, addresses = [], directPort = null, direct = [] }) {
      const at = Date.now();
      about.set(card.deviceId, {
        workspace, card, addresses, directPort, direct, at,
      });
      return { ok: true, at };
    },

    async whoIsAbout({ workspace, notMe = null }) {
      const now = Date.now();
      const out = [];
      for (const one of about.values()) {
        if (one.workspace !== workspace) continue;
        if (notMe && one.card.deviceId === notMe) continue;
        out.push({
          ...one.card,
          addresses: one.addresses,
          directPort: one.directPort,
          direct: one.direct,
          hereNow: now - one.at < STILL_HERE,
          lastHere: one.at,
        });
      }
      return { ok: true, devices: out };
    },

    async ticketFor({ workspace, from, to, relay }) {
      const id = randomBytes(24).toString('hex');
      deliver(to, { ticket: id, workspace, from, to, relay, at: Date.now() });
      return { ok: true, ticket: id };
    },

    async waitForTicket({ workspace, deviceId, within = 20_000 }) {
      const ready = takeTicket(deviceId, workspace);
      if (ready) return { ok: true, ticket: ready };
      return new Promise((done) => {
        const waiter = { workspace, done, timer: null };
        waiter.timer = setTimeout(() => {
          const mine = (waiters.get(deviceId) ?? []).filter((one) => one !== waiter);
          if (mine.length) waiters.set(deviceId, mine); else waiters.delete(deviceId);
          done({ ok: true, ticket: null });
        }, Math.max(100, Math.min(25_000, Number(within) || 20_000)));
        waiter.timer.unref?.();
        waiters.set(deviceId, [...(waiters.get(deviceId) ?? []), waiter]);
      });
    },

    async offerInvitation({ workspace, mark, expiresAt, owner, relay }) {
      invitations.set(mark, { workspace, mark, expiresAt, owner, relay });
      invitationsChanged();
      return { ok: true };
    },

    async findInvitation({ mark }) {
      const one = invitations.get(mark);
      if (!one || Date.now() >= one.expiresAt) {
        invitations.delete(mark);
        invitationsChanged();
        return { ok: false };
      }
      return { ok: true, invitation: one };
    },

    async ticketToJoin({ mark, from }) {
      const found = await this.findInvitation({ mark });
      if (!found.ok) return found;
      const one = found.invitation;
      // A public introduction is deliberately one-use. The workspace's own
      // invitation record remains the final authority and can be re-advertised
      // if this relay attempt never reaches the owner.
      invitations.delete(mark);
      invitationsChanged();
      const id = randomBytes(24).toString('hex');
      deliver(one.owner.deviceId, {
        kind: 'join', ticket: id, workspace: one.workspace, mark,
        from: from.deviceId, card: from, to: one.owner.deviceId,
        relay: one.relay, at: Date.now(),
      });
      return { ok: true, ticket: id, owner: one.owner, relay: one.relay };
    },

    async forget(which) {
      about.delete(typeof which === 'object' ? which.deviceId : which);
      return { ok: true };
    },

    durableState() {
      return { invitations: [...invitations.values()] };
    },
  };
}

/**
 * A plane somewhere else, spoken to over ordinary requests.
 *
 * Every message is signed by the device making it, and the signature covers
 * what was asked and when — so a recording of somebody's announcement is not a
 * way to keep their computer looking like it is about, and a plane that has
 * been taken over still cannot say something as one of your devices.
 */
export function over(address, { within = 6000 } = {}) {
  const at = String(address ?? '').replace(/\/+$/, '');
  let allowed = false;
  try {
    const url = new URL(at);
    allowed = url.protocol === 'https:'
      || ['127.0.0.1', 'localhost', '::1'].includes(url.hostname)
      || process.env.VIBERANT_ALLOW_INSECURE_WORKSPACE_SERVICE === '1';
  } catch { allowed = false; }

  const ask = async (what, body, timeout = within) => {
    if (!allowed) return { ok: false, reachable: false };
    try {
      const me = await device.card();
      const when = Date.now();
      const said = JSON.stringify({ ...body, when });
      const proof = await device.signed(`${what}|${said}`);

      const answer = await fetch(`${at}/${what}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ said, proof, from: me }),
        signal: AbortSignal.timeout(timeout),
      });
      if (!answer.ok) return { ok: false, reachable: true };
      return { ...(await answer.json()), reachable: true };
    } catch {
      // A plane that cannot be reached is a fact, not a failure. Everything
      // that calls this carries on with what this computer already knows.
      return { ok: false, reachable: false };
    }
  };

  return {
    kind: 'over',
    address: at,
    get reachable() { return true; },
    announce: (what) => ask('announce', what),
    whoIsAbout: (what) => ask('who-is-about', what),
    ticketFor: (what) => ask('ticket', what),
    waitForTicket: (what) => ask('wait-for-ticket', what, Math.max(within, 25_000)),
    offerInvitation: (what) => ask('offer-invite', what),
    findInvitation: (what) => ask('find-invite', what),
    ticketToJoin: (what) => ask('join-ticket', what),
    forget: (what) => ask('forget', typeof what === 'object' ? what : { deviceId: what }),
  };
}

/**
 * Check something a device said to a plane.
 *
 * Written here rather than only in a server, so the rule is the same wherever
 * a plane runs and anybody writing one has it. What is checked: the message is
 * signed by the key it claims, the identifier really is that key's fingerprint,
 * and it was said recently enough not to be a recording.
 */
export const NOT_TOO_OLD = 2 * 60 * 1000;

export function saidBy({ said, proof, from, what }, now = Date.now()) {
  if (!from?.signPublic || !from?.deviceId || !said || !proof) return null;
  if (device.fingerprint(from.signPublic) !== from.deviceId) return null;
  if (!device.verify(`${what}|${said}`, proof, from.signPublic)) return null;

  let body;
  try { body = JSON.parse(said); } catch { return null; }
  if (typeof body?.when !== 'number') return null;
  if (Math.abs(now - body.when) > NOT_TOO_OLD) return null;

  return { from, body };
}

// ---------------------------------------------------------------------------
// Which one this computer is using
// ---------------------------------------------------------------------------

let chosen = null;

/**
 * The plane in use.
 *
 * Set from a setting, so pointing this at a different one is a line in a
 * settings file and not a change to any code that matters. With nothing set it
 * is the one that runs here — which is the right default: it needs no account,
 * costs nothing, and works on the network somebody is already on.
 */
export async function plane() {
  if (chosen) return chosen;
  const settings = await import('./settings.mjs');
  const address = String((await settings.get('workspaceService')) || await services.workspaceService()).trim();
  chosen = address ? over(address) : here();
  return chosen;
}

/** Point at a different one, or back at the local one. */
export function use(one) { chosen = one; }
export function reset() { chosen = null; }

/**
 * What this computer can still do with no plane at all.
 *
 * Said as a shape rather than left to be worked out at each call site, because
 * the answer has to be the same everywhere: a workspace already on this disk
 * stays usable on this network, and only reaching a computer somewhere else
 * needs anybody's help.
 */
export function whatWorksWithout(workspace) {
  return {
    thisNetwork: !!workspace,
    alreadyKnownDevices: !!workspace,
    acrossTheInternet: false,
    invitingSomebody: false,
    sentence: workspace
      ? 'Your computers on this network still work. Reaching one somewhere else needs the connection back.'
      : 'This computer is not in a workspace yet.',
  };
}

export const __testOnly = { STILL_HERE };
