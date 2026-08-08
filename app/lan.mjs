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

import { createServer, request } from 'node:http';
import { createSocket } from 'node:dgram';
import { createHmac, timingSafeEqual, randomUUID } from 'node:crypto';
import { readFile, writeFile, mkdir, rm, rename } from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';
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

/**
 * Put something up for your other computers to take a copy of.
 *
 * The register of what this computer is offering, and the only thing any other
 * computer is ever told about. Nothing is inferred from what is on the disk,
 * what is in the projects list, or what happens to be open — if it is not in
 * here, it does not exist as far as the network is concerned.
 *
 * `kind` is written down rather than worked out later. A file, a folder and a
 * project are three different things to the person receiving one: a file lands
 * as itself, a folder lands as a folder, and a project lands and then becomes
 * something you can open. Guessing which from the shape of a path is the sort
 * of inference that is right until the day it is not.
 */
export async function offer({ path, everything = false, about = '', kind = null }) {
  const at = resolve(path);
  if (!existsSync(at)) {
    return { ok: false, sentence: 'That is not there any more.', action: 'Choose something else.' };
  }

  const asked = statSync(at);
  const isFile = asked.isFile();

  if (!isFile && !asked.isDirectory()) {
    return {
      ok: false,
      sentence: 'That is not a file or a folder this computer can send.',
      action: 'Choose a file or a folder.',
    };
  }

  const weight = isFile
    ? { files: 1, dirs: 0, bytes: asked.size, skipped: 0, unreadable: 0 }
    : await parcel.weigh(at, { everything });

  if (!isFile && weight.unreadable) {
    return {
      ok: false,
      sentence: `${weight.unreadable} folders inside that one could not be read.`,
      action: 'Close anything using it, then offer it again.',
    };
  }

  const list = (await offers()).filter((o) => o.path !== at);
  const one = {
    id: randomUUID(),
    kind: kind ?? (isFile ? 'file' : 'folder'),
    name: basename(at),
    path: at,
    about: String(about ?? '').slice(0, 200),
    everything: !!everything,
    files: weight.files,
    dirs: weight.dirs ?? 0,
    bytes: weight.bytes,
    skipped: weight.skipped,
    at: Date.now(),
  };
  list.unshift(one);
  await keepOffers(list);

  return {
    ok: true,
    offer: one,
    sentence: isFile
      ? `${one.name} is now offered to your other computers — ${parcel.inWords(one.bytes)}.`
      : `${one.name} is now offered to your other computers — ${one.files} files, ${parcel.inWords(one.bytes)}.`,
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

  const out = await receiveInto(res, into, { job, jobs, called: name });
  if (!out.ok) return jobs.end(job, out);

  await refresh();
  return jobs.end(job, {
    ok: true,
    at: out.at,
    sentence: `${name} now matches ${peer.name} — ${out.files} files, ${parcel.inWords(out.bytes)}.`,
    action: 'Your own copy was kept aside first, in case you want anything back out of it.',
  });
}

/**
 * The transfers happening right now, by where they are going.
 *
 * Pressing "Bring it here" twice used to start two of them, and because both
 * write to the same folder-plus-`.part` while they work, the second one deletes
 * what the first has written and then both try to move a folder into the same
 * place. Whichever finished second would have been "verified" against a set of
 * files the other one was in the middle of removing.
 *
 * The button is the wrong place to fix this. A button can be disabled, and a
 * second window, a keyboard shortcut and a command palette entry all still
 * reach the same errand. The rule belongs where the errand is.
 */
const arriving = new Map();

const alreadyComing = (target) => {
  const at = resolve(target);
  const held = arriving.get(at);
  if (!held) return null;
  return {
    ok: false,
    sentence: `${held} is already arriving here.`,
    action: 'Wait for it to finish, or leave it and it will be along.',
  };
};

/**
 * Take a folder off the wire, watch it arrive, and check it all did.
 *
 * One of these rather than two. There were two copies of this — one for a
 * project and one for an offered folder — with the same four-megabyte progress
 * step, the same swallowed failure and, between them, two chances for only one
 * to be fixed.
 *
 * What it reports is a fact rather than an impression. The far end says, in the
 * headers and again in the parcel itself, how many files and how many bytes are
 * coming; the percentage is measured against that, and so is the verdict.
 */
async function receiveInto(res, target, { job, jobs, called = null, have = null, forOffer = null }) {
  const busy = alreadyComing(target);
  if (busy) { res.resume(); return busy; }
  arriving.set(resolve(target), called ?? basename(target));

  try {
    return await intoFolder(res, target, { job, jobs, have, forOffer });
  } finally {
    arriving.delete(resolve(target));
  }
}

async function intoFolder(res, target, { job, jobs, have = null, forOffer = null }) {
  // What is on the way now, and what the whole folder comes to. They are the
  // same on a first attempt and different on one that is carrying on.
  const wantFiles = Number(res.headers['x-viberant-files']) || 0;
  const wantBytes = Number(res.headers['x-viberant-bytes']) || 0;
  const wholeFiles = Number(res.headers['x-viberant-whole-files']) || wantFiles;
  const wholeBytes = Number(res.headers['x-viberant-whole-bytes']) || wantBytes;

  const held = Object.keys(have?.have ?? {}).length;
  const heldBytes = Object.values(have?.have ?? {})
    .reduce((sum, size) => sum + (Number(size) || 0), 0);

  jobs.step(job, held
    ? `Carrying on from ${held} files already here. ${parcel.inWords(wantBytes)} still to come.`
    : wantBytes
      ? `Bringing in ${wantFiles} files, ${parcel.inWords(wantBytes)}, to ${target}.`
      : `Bringing it in to ${target}.`);

  const began = Date.now();
  let fastest = 0;

  const out = await parcel.unwrap(res, target, {
    have,
    forOffer,
    // Anything worth waiting for is worth not doing twice. Below that, keeping
    // a part of it costs a folder on the disk to save a couple of seconds.
    keep: wholeBytes >= WORTH_KEEPING,
    onProgress: ({ files, bytes }) => {
      const seconds = Math.max((Date.now() - began) / 1000, 0.001);
      // What this attempt has moved, which is what a speed is about. Counting
      // the part that was already here would put the rate at a hundred
      // megabytes a second for the first instant and then have it fall.
      const rate = Math.max(0, bytes - heldBytes) / seconds;
      if (rate > fastest) fastest = rate;

      const parts = [`${files}${wholeFiles ? ` of ${wholeFiles}` : ''} files`,
        `${parcel.inWords(bytes)}${wholeBytes ? ` of ${parcel.inWords(wholeBytes)}` : ''}`];

      if (wholeBytes) parts.push(`${Math.floor((bytes / wholeBytes) * 100)}%`);
      if (rate > 0) parts.push(`${parcel.inWords(Math.round(rate))} a second`);
      if (wholeBytes && rate > 0 && bytes < wholeBytes) {
        parts.push(`about ${inTime((wholeBytes - bytes) / rate)} left`);
      }
      jobs.write(job, parts.join(' · '));
    },
  }).catch((e) => ({
    ok: false,
    sentence: 'That folder could not be put together on this computer.',
    action: String(e.message ?? e),
  }));

  if (!out.ok) return out;

  // The far end said what was coming before it sent any of it. The parcel said
  // it again on the way past, and `unwrap` has already held those two against
  // what landed. This is the third: what the reply's own headers claimed. It
  // costs nothing and it is the one that catches a reply that was cut short by
  // something between the two computers rather than by either of them.
  //
  // Held against **the whole folder**, not against the stream, which is what
  // makes carrying on from a previous attempt safe: the numbers checked here
  // are what the far end says the folder comes to, and what is now on this
  // disk. A transfer that resumed and still came up short fails exactly as one
  // that never resumed at all.
  if ((wholeFiles && out.files !== wholeFiles) || (wholeBytes && out.bytes !== wholeBytes)) {
    await rm(out.at, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }).catch(() => {});
    await parcel.forget(target);
    return {
      ok: false,
      sentence: `Only ${parcel.inWords(out.bytes)} of ${parcel.inWords(wholeBytes)} arrived, so nothing was kept.`,
      action: 'Nothing on this computer was changed. Try again when both are settled.',
    };
  }

  return out;
}

/**
 * Reachable from a test, because the rule it holds is a data-safety one and a
 * rule about not destroying somebody's folder deserves better than being taken
 * on trust. Nothing in the app calls this.
 */
export const __testOnly = {
  receiveInto,
  /** Put a peer in the list without waiting to hear one shout across a room. */
  remember: (peer) => seen.set(peer.machine, peer),
};

/** Roughly how long, said the way somebody waiting would say it. */
const inTime = (seconds) => (seconds < 90
  ? `${Math.max(1, Math.round(seconds))} seconds`
  : seconds < 5400 ? `${Math.round(seconds / 60)} minutes` : `${(seconds / 3600).toFixed(1)} hours`);

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

  /**
   * Hand over a folder, having first counted exactly what is in it.
   *
   * The count and the sending come from the same walk, and the walk happens
   * now rather than whenever the offer was made. Both of those were wrong:
   * a project's size on the card came from the fingerprint, which skips the
   * history folder and stops at thirty thousand files, while what travelled
   * came from a different walk that does neither — so the number a person read
   * before pressing was never the number that moved. An offer's size was at
   * least measured the same way, but at the moment it was offered, which on a
   * project somebody is working in is a different folder by the afternoon.
   */
  const handOver = async (path, { everything, name, have = null }) => {
    const whole = await parcel.survey(path, { everything });

    if (whole.unreadable.length) {
      return say(409, {
        ok: false,
        sentence: `${whole.unreadable.length} folders inside ${name} could not be read on this computer.`,
        action: 'Close anything using that folder, then ask again.',
      });
    }

    // What is left to send, once whatever the asker already has is taken out.
    const seen = parcel.withoutWhatTheyHave(whole, have);

    /**
     * Two sets of numbers, and both are needed.
     *
     * The plain ones describe **this stream**, which is what the receiver holds
     * the parcel to. The whole ones describe **the folder**, which is what the
     * receiver holds the finished result to once it has added back what it was
     * already keeping. One set could not do both jobs: a stream carrying the
     * last tenth of a folder is complete and a tenth of a folder is not.
     */
    res.writeHead(200, {
      'content-type': 'application/octet-stream',
      'x-viberant-files': String(seen.files.length),
      'x-viberant-dirs': String(seen.dirs.length),
      'x-viberant-bytes': String(seen.bytes),
      'x-viberant-whole-files': String(whole.files.length),
      'x-viberant-whole-bytes': String(whole.bytes),
      'x-viberant-name': name,
    });
    return parcel.wrap(path, { everything, seen })
      .on('error', () => res.destroy())
      .pipe(res);
  };

  /**
   * What the asker says it already has, if it said anything.
   *
   * Read with a ceiling on it. This is the one place another computer hands
   * this one a list it chose the length of, and a list with no limit is a way
   * to fill this computer's memory from across the room — even a computer of
   * yours, even by accident.
   */
  const whatTheyHave = () => new Promise((done) => {
    if (req.method !== 'POST') return done(null);
    let text = '';
    let over = false;
    req.on('data', (chunk) => {
      if (over) return;
      text += chunk;
      if (text.length > 8 * 1024 * 1024) { over = true; text = ''; }
    });
    req.on('end', () => {
      if (over || !text) return done(null);
      try {
        const said = JSON.parse(text);
        done(said?.have && typeof said.have === 'object' ? said.have : null);
      } catch { done(null); }
    });
    req.on('error', () => done(null));
  });

  // One project by name, for a computer that already has it and wants ours.
  if (url.pathname === '/project') {
    const wanted = url.searchParams.get('name');
    const one = (await whatIHave()).find((p) => p.name === wanted);
    if (!one || !existsSync(one.path)) return say(404, { ok: false });
    return handOver(one.path, { everything: false, name: one.name, have: await whatTheyHave() });
  }

  if (url.pathname === '/parcel') {
    const one = (await offers()).find((o) => o.id === url.searchParams.get('id'));
    if (!one || !existsSync(one.path)) return say(404, { ok: false });

    const have = await whatTheyHave();

    // One file travels as a parcel of one, so both ends keep the single format
    // they already know — and the name and every byte of it survive, which is
    // the whole of what "offer a file" has to promise.
    if (one.kind === 'file') {
      const now = statSync(one.path);
      res.writeHead(200, {
        'content-type': 'application/octet-stream',
        'x-viberant-files': '1',
        'x-viberant-dirs': '0',
        'x-viberant-bytes': String(now.size),
        'x-viberant-name': one.name,
        'x-viberant-kind': 'file',
      });
      return parcel.wrapOne(one.path)
        .on('error', () => res.destroy())
        .pipe(res);
    }

    return handOver(one.path, { everything: one.everything, name: one.name, have });
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

/**
 * Big enough that starting again would be a real loss.
 *
 * Below this, keeping a half-finished folder on the disk to save a couple of
 * seconds is a worse trade than simply asking again: there is a folder left
 * lying about, and somebody has to be told about it, for nothing.
 */
const WORTH_KEEPING = 50 * 1024 * 1024;

function tryOne(peer, address, path, carrying = null) {
  return new Promise((done) => {
    let settled = false;
    const finish = (value) => { if (!settled) { settled = true; done(value); } };

    // A question with a list attached goes as a POST, because the list of files
    // this computer already has does not fit in an address — on a project of
    // eight thousand files it is half a megabyte of paths.
    const body = carrying ? Buffer.from(JSON.stringify(carrying), 'utf8') : null;

    const req = request({
      host: address,
      port: peer.port ?? CARRY_PORT,
      path,
      method: body ? 'POST' : 'GET',
      headers: {
        'x-viberant-pass': pass(me.key, me.account),
        ...(body ? { 'content-type': 'application/json', 'content-length': String(body.length) } : {}),
      },
      timeout: SILENCE_FOR,
    }, (res) => {
      clearTimeout(waiting);
      if (res.statusCode !== 200) { res.resume(); return finish(null); }
      finish(res);
    });

    if (body) req.write(body);
    req.end();

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
async function ask(peer, path, carrying = null) {
  if (!me) return null;
  for (const address of peer.addresses ?? []) {
    const res = await tryOne(peer, address, path, carrying);
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

  /**
   * What a previous attempt at this same thing already got.
   *
   * Looked up before asking, because it changes the question: the sender is
   * told what is already here and sends only the rest. Keyed to the offer, so a
   * half-finished folder from something else is never mistaken for a head start
   * on this one.
   */
  const settling = name
    ? join(resolve(into), name)
    : join(resolve(into), 'folder');
  const already = await parcel.whatIsAlreadyHere(settling, { forOffer: offerId });
  const carriedFiles = Object.keys(already?.have ?? {}).length;

  jobs.step(job, carriedFiles
    ? `Asking ${peer.name} for the rest of it — ${carriedFiles} files are already here.`
    : `Asking ${peer.name} for it.`);

  const res = await ask(peer, `/parcel?id=${encodeURIComponent(offerId)}`,
    already ? { have: already.have } : null);
  if (!res) {
    return jobs.end(job, {
      ok: false,
      sentence: `${peer.name} did not send it.`,
      action: 'It may have stopped offering it. Look again at what it is offering.',
    });
  }

  const called = name || res.headers['x-viberant-name'] || 'folder';
  const isFile = res.headers['x-viberant-kind'] === 'file';

  // A file arrives as a parcel of one, so it is unwrapped into a folder of its
  // own and then lifted out of it. Doing it this way means the checking above —
  // what was promised, what was sent, what landed — applies to a single file
  // exactly as it does to a project, rather than a second path with its own
  // arithmetic and its own chance of being wrong.
  const target = isFile
    ? join(resolve(into), `${called}.viberant-arriving`)
    : join(resolve(into), called);

  // A file is one file: there is no half of it worth keeping, and a ledger of
  // one entry is either everything or nothing.
  const out = await receiveInto(res, target, {
    job,
    jobs,
    called,
    forOffer: offerId,
    have: isFile ? null : (target === settling ? already : null),
  });
  if (!out.ok) return jobs.end(job, out);

  if (isFile) {
    const landed = join(resolve(into), called);
    await rm(landed, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }).catch(() => {});
    await rename(join(target, called), landed);
    await rm(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }).catch(() => {});
    return jobs.end(job, {
      ok: true,
      at: landed,
      sentence: `${called} is on this computer — ${parcel.inWords(out.bytes)}.`,
      action: 'It is where you chose to put it.',
    });
  }

  return jobs.end(job, {
    ok: true,
    at: out.at,
    sentence: `${name || out.at.split(/[\\/]/).pop()} is on this computer — ${out.files} files, ${parcel.inWords(out.bytes)}.`,
    action: out.carriedOver
      ? `${out.carriedOver} of them were already here from the last try, so only the rest came over.`
      : 'Open it from your projects whenever you are ready.',
  });
}
