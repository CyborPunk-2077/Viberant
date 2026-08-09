/**
 * Getting into a workspace you have never seen.
 *
 * Everything else two computers say to each other begins with "are you in this
 * workspace" — which is the right question for every message except the one
 * whose whole job is to put somebody in it. That check is why joining could not
 * work at all: the code was permission to join, and nothing carried the
 * workspace across.
 *
 * So this is a separate, deliberately tiny way in, and it does exactly one
 * thing. It is not the channel the rest of the app uses and it never becomes
 * that channel: it hands over a workspace and closes.
 *
 * **The code is the whole of the authorisation.** It is ten characters read
 * aloud across a desk, it lasts ten minutes, it works once, and `members.redeem`
 * already refuses one that has run out, been used, or been made up. Nothing here
 * decides whether somebody may join; it only carries the question to the
 * computer that can answer it.
 *
 * What travels on the wire, in order:
 *
 *   a shout    the fingerprint of a code, and nothing else — anybody
 *              listening learns that somebody is joining something, which they
 *              could see anyway, and cannot join with it
 *   an answer  where to knock
 *   the ask    the real code, and the joining computer's public card
 *   the reply  the workspace: who is in it, what each may do, and the public
 *              halves of the keys they know each other by
 *
 * **No private key is ever in any of those.** They are made on each computer,
 * never leave it, and a test asserts that this file cannot read them.
 */

import { createServer, createConnection } from 'node:net';
import { createSocket } from 'node:dgram';
import { createHash } from 'node:crypto';
import { networkInterfaces } from 'node:os';

/** Its own door, so nothing about joining shares a path with anything else. */
export const SHOUT_PORT = 47779;

/** How long a joiner waits for anybody to answer before giving up. */
export const WAIT_FOR = 6000;

/** How many codes one computer may try in a minute, however many it shouts. */
export const TRIES_A_MINUTE = 12;

/**
 * The fingerprint of a code.
 *
 * The same one `members.mjs` writes into an invitation, so the owner can
 * recognise a shout without the code ever being broadcast. Knowing the
 * fingerprint is not knowing the code, and only the code redeems.
 */
export const markOf = (code) => createHash('sha256')
  .update(String(code ?? '').toUpperCase().replace(/[^0-9A-Z]/g, ''))
  .digest('hex');

const quiet = async (fn, fallback = null) => { try { return await fn(); } catch { return fallback; } };

/** Every address this computer can be reached at on a real network. */
function myAddresses() {
  const out = [];
  for (const many of Object.values(networkInterfaces())) {
    for (const one of many ?? []) {
      if (one.family !== 'IPv4' || one.internal) continue;
      out.push(one.address);
    }
  }
  return out;
}

/** One line of JSON, read off a socket, with a ceiling on how much is read. */
function oneLine(socket, { within = 8000, most = 256 * 1024 } = {}) {
  return new Promise((done) => {
    let held = '';
    let settled = false;

    const finish = (v) => {
      if (settled) return;
      settled = true;
      clearTimeout(waiting);
      socket.off('data', onData);
      done(v);
    };

    const onData = (chunk) => {
      held += chunk.toString('utf8');
      // A line that never ends is somebody filling this computer's memory.
      if (held.length > most) return finish(null);
      const at = held.indexOf('\n');
      if (at === -1) return;
      finish(quietly(held.slice(0, at)));
    };

    const waiting = setTimeout(() => finish(null), within);
    socket.on('data', onData);
    socket.once('error', () => finish(null));
    socket.once('close', () => finish(null));
  });
}

const quietly = (line) => { try { return JSON.parse(line); } catch { return null; } };

// ---------------------------------------------------------------------------
// Waiting to be joined
// ---------------------------------------------------------------------------

let listening = null;

/**
 * Answer people trying to join, for as long as there is a live invitation.
 *
 * Kept running rather than started per invitation, because the owner may hold
 * several at once and because starting a listener at the moment somebody reads
 * a code aloud is a race nobody should have to think about. It answers nothing
 * at all when there are no live invitations, which is the ordinary case.
 *
 * @param {Function} liveOnes  () => [{ of }] the invitations that still work
 * @param {Function} letThemIn (code, card, person) => redeem, on the real record
 * @param {Function} whoAmI    () => the name people will see
 */
export async function answerJoiners({ liveOnes, letThemIn, whoAmI }) {
  await stopAnswering();

  const tries = new Map();
  const tooMany = (from) => {
    const now = Date.now();
    const mine = (tries.get(from) ?? []).filter((at) => now - at < 60_000);
    mine.push(now);
    tries.set(from, mine);
    return mine.length > TRIES_A_MINUTE;
  };

  /*
   * The knocking, and the one thing it may ask for.
   *
   * Anything that is not a join is dropped without an answer. This socket must
   * never grow a second message: the whole reason it is allowed to skip the
   * membership check is that there is only one thing it can do.
   */
  const door = createServer(async (socket) => {
    socket.setTimeout(15_000, () => socket.destroy());

    const from = socket.remoteAddress ?? 'somewhere';
    const asked = await oneLine(socket);

    const no = (why) => {
      socket.end(`${JSON.stringify({ ok: false, sentence: why })}\n`);
    };

    if (!asked || asked.what !== 'join') return socket.destroy();
    if (tooMany(from)) return no('Too many tries from there just now.');
    if (typeof asked.code !== 'string' || asked.code.length > 64) return no('That is not a code.');
    if (!asked.card?.deviceId || !asked.card?.signPublic || !asked.card?.agreePublic) {
      return no('That computer did not say who it is.');
    }

    const out = await quiet(() => letThemIn(asked.code, asked.card, String(asked.person ?? '').slice(0, 80)));
    if (!out?.ok) return no(out?.sentence ?? 'That invitation does not work.');

    socket.end(`${JSON.stringify({ ok: true, workspace: publicPartOf(out.workspace) })}\n`);
  });

  const up = await new Promise((done) => {
    door.once('error', () => done(false));
    door.listen(0, '0.0.0.0', () => done(true));
  });
  if (!up) return { ok: false, sentence: 'This computer cannot listen for anybody joining.' };

  const shouts = createSocket({ type: 'udp4', reuseAddr: true });
  shouts.on('error', () => { /* a network that comes and goes is not an event */ });

  shouts.on('message', async (raw, where) => {
    const heard = quietly(raw.toString('utf8'));
    if (heard?.v !== 1 || heard.what !== 'looking-for') return;

    // Only somebody holding a code this workspace actually issued gets an
    // answer. Everybody else hears nothing at all, which is what stops this
    // being a way to find out that a workspace exists.
    const live = await quiet(() => liveOnes(), []);
    if (!(live ?? []).some((one) => one.of === heard.mark)) return;

    const back = Buffer.from(JSON.stringify({
      v: 1,
      what: 'over-here',
      mark: heard.mark,
      name: await quiet(() => whoAmI(), null),
      port: door.address()?.port,
      addresses: myAddresses(),
    }));
    shouts.send(back, where.port, where.address, () => {});
  });

  /*
   * Listening on a door somebody else already has is a fact, not a hang.
   *
   * This waited for a callback that never comes when the port is taken — the
   * error arrives on the socket instead, and the socket's handler swallowed it.
   * So the whole thing stopped there, forever, and took whatever was waiting on
   * it with it. Another copy of Viberant already answering is the ordinary way
   * to reach that, and it is not an error worth a sentence: the other copy is
   * answering.
   */
  const heard = await new Promise((done) => {
    let settled = false;
    const finish = (v) => { if (!settled) { settled = true; done(v); } };
    shouts.once('error', () => finish(false));
    shouts.bind(SHOUT_PORT, () => { shouts.setBroadcast(true); finish(true); });
  });

  if (!heard) {
    try { shouts.close(); } catch { /* never opened */ }
    await new Promise((done) => door.close(() => done()));
    return {
      ok: false,
      alreadyTaken: true,
      sentence: 'Another copy of Viberant on this computer is already listening for people joining.',
      action: 'Use that one to invite somebody.',
    };
  }

  listening = { door, shouts };
  return { ok: true, port: door.address()?.port };
}

export async function stopAnswering() {
  const was = listening;
  listening = null;
  if (!was) return;
  try { was.shouts.close(); } catch { /* already gone */ }
  await new Promise((done) => was.door.close(() => done()));
}

export const isAnswering = () => !!listening;

/**
 * The workspace as somebody joining it is allowed to see it.
 *
 * Everything needed to recognise the others and nothing else. Invitations do
 * not travel: they are somebody else's permission to join, and a joiner holding
 * a list of live codes could let in people the owner never invited.
 */
export function publicPartOf(workspace) {
  return {
    id: workspace.id,
    name: workspace.name,
    owner: workspace.owner,
    madeAt: workspace.madeAt,
    members: workspace.members ?? {},
    devices: workspace.devices ?? {},
    revoked: workspace.revoked ?? {},
    // Deliberately absent: `invites`, and anything not named above.
    invites: {},
  };
}

// ---------------------------------------------------------------------------
// Asking to be let in
// ---------------------------------------------------------------------------

/**
 * Find whoever holds this code, and ask them to let this computer in.
 *
 * Shouts the fingerprint, waits for somebody who recognises it, and then says
 * the real code down a direct connection to that computer alone. If nobody
 * answers it says so plainly — the commonest reason by far is that the other
 * computer is not on this network, and guessing anything else would send
 * somebody looking in the wrong place.
 */
export async function askToJoin({ code, card, person, waitFor = WAIT_FOR }) {
  const mark = markOf(code);
  const shouts = createSocket({ type: 'udp4', reuseAddr: true });
  shouts.on('error', () => { /* answered by the timeout below */ });

  const found = await new Promise((done) => {
    let settled = false;
    const finish = (v) => { if (!settled) { settled = true; clearTimeout(waiting); done(v); } };

    shouts.on('message', (raw) => {
      const heard = quietly(raw.toString('utf8'));
      if (heard?.v === 1 && heard.what === 'over-here' && heard.mark === mark && heard.port) finish(heard);
    });

    const waiting = setTimeout(() => finish(null), waitFor);

    shouts.bind(0, () => {
      shouts.setBroadcast(true);
      const word = Buffer.from(JSON.stringify({ v: 1, what: 'looking-for', mark, at: Date.now() }));
      // Shouted a few times: one packet on a busy network is one packet lost.
      const again = setInterval(() => shouts.send(word, SHOUT_PORT, '255.255.255.255', () => {}), 700);
      again.unref?.();
      shouts.send(word, SHOUT_PORT, '255.255.255.255', () => {});
      setTimeout(() => clearInterval(again), waitFor);
    });
  });

  try { shouts.close(); } catch { /* already gone */ }

  if (!found) {
    return {
      ok: false,
      nobodyAnswered: true,
      sentence: 'Nobody on this network is offering a workspace that code opens.',
      action: 'The computer that made the code has to be on this network with Viberant open. '
        + 'Check the code, and that the invitation has not run out.',
    };
  }

  for (const address of found.addresses ?? []) {
    const said = await quiet(() => knock(address, found.port, { code, card, person }));
    if (!said) continue;
    if (!said.ok) {
      return {
        ok: false,
        sentence: said.sentence ?? 'That invitation does not work.',
        action: 'Ask for a new code.',
      };
    }
    return { ok: true, workspace: said.workspace, from: found.name ?? null };
  }

  return {
    ok: false,
    sentence: `${found.name ?? 'That computer'} answered and then could not be reached.`,
    action: 'Try again in a moment.',
  };
}

/** Say the code to one computer, down one connection, and read one answer. */
function knock(address, port, { code, card, person }) {
  return new Promise((done) => {
    const socket = createConnection({ host: address, port, timeout: 8000 });
    let settled = false;
    const finish = (v) => { if (!settled) { settled = true; socket.destroy(); done(v); } };

    socket.once('error', () => finish(null));
    socket.once('timeout', () => finish(null));
    socket.once('connect', async () => {
      socket.write(`${JSON.stringify({ what: 'join', code, card, person })}\n`);
      finish(await oneLine(socket));
    });
  });
}

export const __testOnly = { oneLine, myAddresses, quietly };
