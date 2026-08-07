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

/**
 * Every address this computer can actually be reached on, best first.
 *
 * Two kinds of address are here that no other computer can ever reach, and both
 * were being handed out as though they were real:
 *
 *   The switches a virtual machine talks through. Windows makes one per feature
 *   — 172.27.240.1, 172.28.176.1 — and they are addresses of this computer, on
 *   networks that exist only inside it. Measured here: the other computer
 *   advertised two of them and its real address in the middle.
 *
 *   The address an adapter gives itself when nothing answered. Anything in
 *   169.254 means "this cable is not plugged in", said politely.
 *
 * Ordinary private networks come first because that is what one person's two
 * computers are on. Nothing is thrown away outright — an unusual setup still
 * gets its address offered, just last.
 */
function rankOf(address) {
  if (address.startsWith('169.254.')) return 3;
  if (/^(?:192\.168\.|10\.)/.test(address)) return 0;
  // 172.16–172.31 is one private range, and Windows puts its virtual switches
  // in the top half of it. Real networks there are rare; virtual ones are not.
  if (/^172\.(?:1[6-9]|2[0-9]|3[01])\./.test(address)) return 2;
  return 1;
}

function myAddresses() {
  const out = [];
  for (const list of Object.values(networkInterfaces())) {
    for (const one of list ?? []) {
      if (one.family === 'IPv4' && !one.internal) out.push(one.address);
    }
  }
  return out.sort((a, b) => rankOf(a) - rankOf(b));
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

  // A shout arrives every few seconds. Whichever address was found to actually
  // answer stays at the front of the new list, so learning it once is not undone
  // five seconds later by the next shout.
  const known = seen.get(said.machine);
  const offered = said.addresses ?? [];
  const answers = offered.includes(known?.answers) ? known.answers : null;

  seen.set(said.machine, {
    machine: said.machine,
    name: said.name,
    account: said.account,
    port: said.port,
    addresses: answers ? [answers, ...offered.filter((a) => a !== answers)] : offered,
    answers,
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
// What this computer has, for the others to compare against
// ---------------------------------------------------------------------------

/**
 * Where the list of shareable projects comes from.
 *
 * Set by the server, because deciding which projects are yours to share is the
 * server's business and not this file's. Left unset, this computer says it has
 * nothing, which is the safe answer.
 */
let whatToShare = async () => [];
export function shares(fn) { whatToShare = fn; }

/** Held briefly: the others ask every few seconds and folders do not change that fast. */
let held = { at: 0, projects: [] };
const HOLD_FOR = 2500;

async function whatIHave({ fresh = false } = {}) {
  if (!fresh && Date.now() - held.at < HOLD_FOR) return held.projects;
  const projects = await whatToShare().catch(() => []);
  held = { at: Date.now(), projects };
  return projects;
}

/** Say it again now, because something here just changed. */
export async function refresh() {
  return whatIHave({ fresh: true });
}

/** What one of your computers has, and what state it is in. */
export async function stateOf(machine) {
  const peer = seen.get(machine);
  if (!peer) return null;
  const res = await ask(peer, '/state');
  if (!res) return null;
  let body = '';
  for await (const chunk of res) body += chunk;
  try { return JSON.parse(body); } catch { return null; }
}

/** Everything every computer on this network has, asked all at once. */
export async function whatEveryoneHas() {
  const peers = around();
  const answers = await Promise.all(peers.map(async (p) => ({ peer: p, state: await stateOf(p.machine) })));
  return answers.filter((a) => a.state?.ok);
}

/**
 * Ask a computer for one project, by name rather than by offer.
 *
 * Syncing is not the same errand as offering: an offer is something you put up
 * on purpose, while a sync is one computer asking another for a project they
 * both already have. The name is the handle, because that is what makes them
 * the same project on both.
 */
export async function takeProject({ machine, name, into, job, jobs }) {
  const peer = seen.get(machine);
  if (!peer) {
    return jobs.end(job, {
      ok: false,
      sentence: 'That computer is not on this network at the moment.',
      action: 'Check it is turned on with Viberant open, on the same network as this one.',
    });
  }

  jobs.step(job, `Asking ${peer.name} for ${name}.`);
  const res = await ask(peer, `/project?name=${encodeURIComponent(name)}`);
  if (!res) {
    return jobs.end(job, {
      ok: false,
      sentence: `${peer.name} did not send ${name}.`,
      action: 'It may have stopped sharing it. Look again at what it has.',
    });
  }

  const expected = Number(res.headers['x-viberant-bytes']) || 0;
  jobs.step(job, `Bringing it in to ${into}.`);

  let last = 0;
  const out = await parcel.unwrap(res, into, {
    onProgress: ({ files, bytes }) => {
      if (bytes - last < 4_000_000) return;
      last = bytes;
      jobs.write(job, `${files} files, ${parcel.inWords(bytes)}${expected ? ` of ${parcel.inWords(expected)}` : ''}`);
    },
  }).catch((e) => ({
    ok: false,
    sentence: 'That folder could not be put together on this computer.',
    action: String(e.message ?? e),
  }));

  if (!out.ok) return jobs.end(job, out);

  await refresh();
  return jobs.end(job, {
    ok: true,
    at: out.at,
    sentence: `${name} now matches ${peer.name} — ${out.files} files, ${parcel.inWords(out.bytes)}.`,
    action: 'Your own copy was kept aside first, in case you want anything back out of it.',
  });
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

  // What this computer has, and what state each of it is in. Asked often, so
  // the answer is held for a few seconds rather than recomputed per question.
  if (url.pathname === '/state') {
    return say(200, { ok: true, machine: me.machine, name: me.name, projects: await whatIHave() });
  }

  // One project by name, for a computer that already has it and wants ours.
  if (url.pathname === '/project') {
    const wanted = url.searchParams.get('name');
    const one = (await whatIHave()).find((p) => p.name === wanted);
    if (!one || !existsSync(one.path)) return say(404, { ok: false });

    res.writeHead(200, {
      'content-type': 'application/octet-stream',
      'x-viberant-files': String(one.state?.files ?? 0),
      'x-viberant-bytes': String(one.state?.bytes ?? 0),
      'x-viberant-name': one.name,
    });
    return parcel.wrap(one.path, { everything: false })
      .on('error', () => res.destroy())
      .pipe(res);
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

/** How long one address gets to start answering before the next one is tried. */
const ANSWER_WITHIN = 6000;
/** How long something already arriving may go quiet before it is given up on. */
const SILENCE_FOR = 15000;

function tryOne(peer, address, path) {
  return new Promise((done) => {
    let settled = false;
    const finish = (value) => { if (!settled) { settled = true; done(value); } };

    const req = httpGet({
      host: address,
      port: peer.port ?? CARRY_PORT,
      path,
      headers: { 'x-viberant-pass': pass(me.key, me.account) },
      timeout: SILENCE_FOR,
    }, (res) => {
      clearTimeout(waiting);
      if (res.statusCode !== 200) { res.resume(); return finish(null); }
      finish(res);
    });

    // An address on a network that does not exist does not refuse — it says
    // nothing at all, and this computer waits out its own connect timeout,
    // which on Windows is about twenty seconds. Giving each one a short turn is
    // the difference between trying three addresses and appearing to hang.
    const waiting = setTimeout(() => { req.destroy(); finish(null); }, ANSWER_WITHIN);

    req.on('error', () => { clearTimeout(waiting); finish(null); });
    req.on('timeout', () => { req.destroy(); clearTimeout(waiting); finish(null); });
  });
}

/**
 * Ask one of your computers something, at whichever of its addresses answers.
 *
 * It used to ask at the first address it had been given and stop there. The
 * other computer here advertised its virtual switch first and the address it is
 * really on second, so every question went to a network that exists only inside
 * that machine — and came back as "could not be reached, even though it says it
 * is here", which is a sentence that tells you nothing you can act on.
 *
 * Ordering them helps and is still only a guess. Trying them all is the fix.
 */
async function ask(peer, path) {
  if (!me) return null;
  for (const address of peer.addresses ?? []) {
    const res = await tryOne(peer, address, path);
    if (!res) continue;
    // Whichever one answered goes first from now on, so the next question does
    // not pay for the same dead addresses again. Written down by name rather
    // than by position, because a shout arrives every few seconds and rebuilds
    // the list — and a fact kept as "the first one" would be overwritten by it.
    peer.answers = address;
    peer.addresses = [address, ...peer.addresses.filter((a) => a !== address)];
    return res;
  }
  return null;
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
