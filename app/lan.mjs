/**
 * The computers on this network that are also yours.
 *
 * Two halves, and the seam between them is the point:
 *
 *   **GitHub says which computers are yours.** Joining the shared workspace
 *   puts a random key in a project only your account can read. Holding that key
 *   is the proof. Being signed in to the same account is a claim anybody nearby
 *   could make; holding the key is not.
 *
 *   **The network moves the files.** No folder ever goes to GitHub, or through
 *   anything of ours, or off this network. It goes from one computer to the
 *   other directly, and only when somebody asks for it.
 *
 * Nothing is automatic. One computer offers a folder. The other sees the offer,
 * chooses where to put it, and asks for it. Until it asks, nothing moves —
 * which is what you wanted and is also the only honest way to do this, because
 * a folder appearing on your disk without being asked for is the behaviour of
 * something you would uninstall.
 */

import { createServer, get as httpGet } from 'node:http';
import { createSocket } from 'node:dgram';
import { createHmac, timingSafeEqual, randomUUID } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, basename, resolve } from 'node:path';
import { networkInterfaces } from 'node:os';

import { HOUSE } from './projects.mjs';
import * as parcel from './parcel.mjs';

export const CALL_PORT = 47777;
export const CARRY_PORT = 47778;

/** How often this computer says it is here, and how long that lasts. */
const EVERY = 5000;
const LASTS = 20000;

const OFFERS = join(HOUSE, 'offers.json');

let me = null;
let beacon = null;
let carrier = null;
let ticking = null;
const seen = new Map();

// ---------------------------------------------------------------------------
// Proving it is you
// ---------------------------------------------------------------------------

const minute = (shift = 0) => Math.floor(Date.now() / 60000) + shift;

const sign = (key, what) => createHmac('sha256', key).update(what).digest('hex');

/** A pass that is good for this minute and the one before it. */
function pass(key, account) {
  return sign(key, `${account}|${minute()}`);
}

function passIsGood(key, account, given) {
  if (!given) return false;
  for (const shift of [0, -1]) {
    const want = Buffer.from(sign(key, `${account}|${minute(shift)}`));
    const got = Buffer.from(String(given));
    if (want.length === got.length && timingSafeEqual(want, got)) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// What this computer is offering
// ---------------------------------------------------------------------------

export async function offers() {
  if (!existsSync(OFFERS)) return [];
  try { return JSON.parse(await readFile(OFFERS, 'utf8')); } catch { return []; }
}

async function keepOffers(list) {
  await mkdir(HOUSE, { recursive: true });
  await writeFile(OFFERS, JSON.stringify(list, null, 2), 'utf8');
}

/** Put a folder up for your other computers to take a copy of. */
export async function offer({ path, everything = false, about = '' }) {
  const at = resolve(path);
  if (!existsSync(at)) {
    return { ok: false, sentence: 'That folder is not there.', action: 'Choose another one.' };
  }

  const weight = await parcel.weigh(at, { everything });
  const list = (await offers()).filter((o) => o.path !== at);
  const one = {
    id: randomUUID(),
    name: basename(at),
    path: at,
    about: String(about ?? '').slice(0, 200),
    everything: !!everything,
    files: weight.files,
    bytes: weight.bytes,
    skipped: weight.skipped,
    at: Date.now(),
  };
  list.unshift(one);
  await keepOffers(list);

  return {
    ok: true,
    offer: one,
    sentence: `${one.name} is now offered to your other computers — ${one.files} files, ${parcel.inWords(one.bytes)}.`,
    action: 'Nothing moves until one of them asks for it.',
  };
}

/** Stop offering something. Nothing already taken is affected. */
export async function withdraw(id) {
  const list = await offers();
  const one = list.find((o) => o.id === id);
  await keepOffers(list.filter((o) => o.id !== id));
  return {
    ok: true,
    sentence: one ? `${one.name} is no longer offered.` : 'That was already not offered.',
  };
}

// ---------------------------------------------------------------------------
// Being here
// ---------------------------------------------------------------------------

/** Every address this computer can be reached on. */
function myAddresses() {
  const out = [];
  for (const list of Object.values(networkInterfaces())) {
    for (const one of list ?? []) {
      if (one.family === 'IPv4' && !one.internal) out.push(one.address);
    }
  }
  return out;
}

/** Where to shout so everything on this network hears it. */
function shoutAt() {
  const out = new Set(['255.255.255.255']);
  for (const list of Object.values(networkInterfaces())) {
    for (const one of list ?? []) {
      if (one.family !== 'IPv4' || one.internal || !one.netmask) continue;
      const address = one.address.split('.').map(Number);
      const mask = one.netmask.split('.').map(Number);
      out.add(address.map((n, i) => n | (~mask[i] & 255)).join('.'));
    }
  }
  return [...out];
}

/**
 * Start being findable, and start looking.
 *
 * Without a key this does nothing at all and says so — there is no version of
 * this that runs open to whoever happens to be on the same network.
 */
export async function start({ machine, name, account, key, carryPort = CARRY_PORT, callPort = CALL_PORT }) {
  await stop();

  if (!key) {
    return {
      ok: false,
      sentence: 'Your computers cannot find each other until this one has joined your shared workspace.',
      action: 'Join it first — that is what gives them a way to recognise each other.',
    };
  }

  me = { machine, name, account, key, carryPort, callPort };

  carrier = createServer(handle);
  const listening = await new Promise((done) => {
    carrier.once('error', () => done(false));
    carrier.listen(carryPort, '0.0.0.0', () => done(true));
  });
  if (!listening) {
    carrier = null;
    me = null;
    return {
      ok: false,
      sentence: 'Another program on this computer is already using the door your computers talk through.',
      action: 'Close it, or turn local sharing off in Settings.',
    };
  }

  beacon = createSocket({ type: 'udp4', reuseAddr: true });
  beacon.on('message', (raw) => heard(raw));
  beacon.on('error', () => { /* a network that comes and goes is not an event */ });
  await new Promise((done) => beacon.bind(callPort, () => { beacon.setBroadcast(true); done(); }));

  callOut();
  ticking = setInterval(callOut, EVERY);
  ticking.unref?.();

  return { ok: true, sentence: 'This computer can now be found by your others on this network.' };
}

export async function stop() {
  clearInterval(ticking);
  ticking = null;
  try { beacon?.close(); } catch { /* already gone */ }
  beacon = null;
  await new Promise((done) => (carrier ? carrier.close(() => done()) : done()));
  carrier = null;
  me = null;
  seen.clear();
}

export const isOn = () => !!carrier;

function callOut() {
  if (!beacon || !me) return;
  const word = Buffer.from(JSON.stringify({
    v: 1,
    machine: me.machine,
    name: me.name,
    account: me.account,
    port: me.carryPort,
    addresses: myAddresses(),
    proof: sign(me.key, `${me.account}|${me.machine}|${minute()}`),
  }));
  for (const to of shoutAt()) {
    try { beacon.send(word, 0, word.length, me.callPort, to); } catch { /* try the next */ }
  }
}

function heard(raw) {
  if (!me) return;
  let said;
  try { said = JSON.parse(raw.toString('utf8')); } catch { return; }
  if (said.v !== 1 || said.machine === me.machine) return;
  if (said.account !== me.account) return;

  // Same account is a claim. The key is the proof.
  const want = sign(me.key, `${said.account}|${said.machine}|${minute()}`);
  const before = sign(me.key, `${said.account}|${said.machine}|${minute(-1)}`);
  if (said.proof !== want && said.proof !== before) return;

  seen.set(said.machine, {
    machine: said.machine,
    name: said.name,
    account: said.account,
    port: said.port,
    addresses: said.addresses ?? [],
    lastHeard: Date.now(),
  });
}

/** The computers of yours that are on this network right now. */
export function around() {
  const now = Date.now();
  return [...seen.values()]
    .filter((p) => now - p.lastHeard < LASTS)
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

// ---------------------------------------------------------------------------
// Answering the others
// ---------------------------------------------------------------------------

async function handle(req, res) {
  const say = (code, body) => {
    res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(body));
  };

  if (!me) return say(503, { ok: false });

  const url = new URL(req.url, 'http://x');
  if (!passIsGood(me.key, me.account, req.headers['x-viberant-pass'])) {
    return say(403, { ok: false });
  }

  if (url.pathname === '/hello') {
    return say(200, { ok: true, machine: me.machine, name: me.name });
  }

  if (url.pathname === '/offers') {
    return say(200, { ok: true, name: me.name, offers: await offers() });
  }

  if (url.pathname === '/parcel') {
    const one = (await offers()).find((o) => o.id === url.searchParams.get('id'));
    if (!one || !existsSync(one.path)) return say(404, { ok: false });

    res.writeHead(200, {
      'content-type': 'application/octet-stream',
      'x-viberant-files': String(one.files),
      'x-viberant-bytes': String(one.bytes),
      'x-viberant-name': one.name,
    });
    return parcel.wrap(one.path, { everything: one.everything })
      .on('error', () => res.destroy())
      .pipe(res);
  }

  return say(404, { ok: false });
}

// ---------------------------------------------------------------------------
// Asking one of them for something
// ---------------------------------------------------------------------------

function ask(peer, path) {
  return new Promise((done) => {
    const address = peer.addresses?.[0];
    if (!address || !me) return done(null);
    const req = httpGet({
      host: address,
      port: peer.port ?? CARRY_PORT,
      path,
      headers: { 'x-viberant-pass': pass(me.key, me.account) },
      timeout: 15000,
    }, (res) => done(res.statusCode === 200 ? res : (res.resume(), null)));
    req.on('error', () => done(null));
    req.on('timeout', () => { req.destroy(); done(null); });
  });
}

/** What one of your computers is offering right now. */
export async function offeredBy(machine) {
  const peer = seen.get(machine);
  if (!peer) {
    return {
      ok: false,
      sentence: 'That computer is not on this network at the moment.',
      action: 'Check it is turned on with Viberant open, on the same network as this one.',
    };
  }
  const res = await ask(peer, '/offers');
  if (!res) {
    return {
      ok: false,
      sentence: `${peer.name} could not be reached, even though it says it is here.`,
      action: 'A firewall on one of the two computers is the usual reason.',
    };
  }
  let body = '';
  for await (const chunk of res) body += chunk;
  try {
    const said = JSON.parse(body);
    return { ok: true, from: peer.name, offers: said.offers ?? [] };
  } catch {
    return { ok: false, sentence: `${peer.name} answered with something unreadable.`, action: 'Try again in a moment.' };
  }
}

/**
 * Take a copy of something one of your computers is offering.
 *
 * Given a job to write into, because a folder of any size takes long enough
 * that watching it is the only reasonable thing to offer.
 */
export async function take({ machine, offerId, into, name, job, jobs }) {
  const peer = seen.get(machine);
  if (!peer) {
    return jobs.end(job, {
      ok: false,
      sentence: 'That computer is not on this network at the moment.',
      action: 'Check it is turned on with Viberant open, on the same network as this one.',
    });
  }

  jobs.step(job, `Asking ${peer.name} for it.`);
  const res = await ask(peer, `/parcel?id=${encodeURIComponent(offerId)}`);
  if (!res) {
    return jobs.end(job, {
      ok: false,
      sentence: `${peer.name} did not send it.`,
      action: 'It may have stopped offering it. Look again at what it is offering.',
    });
  }

  const expected = Number(res.headers['x-viberant-bytes']) || 0;
  const target = join(resolve(into), name || res.headers['x-viberant-name'] || 'folder');
  jobs.step(job, `Bringing it in to ${target}.`);

  let last = 0;
  const out = await parcel.unwrap(res, target, {
    onProgress: ({ files, bytes }) => {
      if (bytes - last < 4_000_000) return;
      last = bytes;
      jobs.write(job, `${files} files, ${parcel.inWords(bytes)}${expected ? ` of ${parcel.inWords(expected)}` : ''}`);
    },
  }).catch((e) => ({ ok: false, sentence: 'That folder could not be put together on this computer.', action: String(e.message ?? e) }));

  if (!out.ok) return jobs.end(job, out);

  return jobs.end(job, {
    ok: true,
    at: out.at,
    sentence: `${name || out.at.split(/[\\/]/).pop()} is on this computer — ${out.files} files, ${parcel.inWords(out.bytes)}.`,
    action: 'Open it from your projects whenever you are ready.',
  });
}
