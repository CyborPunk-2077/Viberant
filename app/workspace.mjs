/**
 * The shared workspace: your computers, working on the same things, with no
 * network between them.
 *
 * The problem this solves is the founder's own, stated first: a desktop and a
 * laptop, the same projects, and no way to walk from one to the other without
 * losing the thread. The obvious answer is a server that both talk to. That
 * answer is barred here permanently — no service of ours exists, and D-13
 * already rejected a relay for exactly this.
 *
 * So the meeting point is a private project on your own GitHub account, called
 * `viberant-workspace`. Every computer signed in to that account keeps a copy of
 * it and puts three things in:
 *
 *   machines/<id>.json    who this computer is and when it was last here
 *   shared/<id>.json      the projects this computer is offering
 *   said/<id>.jsonl       what this computer has said, one line at a time
 *
 * **Each computer only ever writes its own three files.** That is the whole
 * trick, and it is why two computers can be doing this at the same moment and
 * never collide: there is no file for them to disagree about. Everything is
 * read by putting all the files side by side, which is the same fold the event
 * log already uses.
 *
 * What this costs, honestly: being here at all writes a small save every couple
 * of minutes into that one workspace. It is a project nobody reads by hand and
 * the saves are tiny, but they are real, and a server would not have needed
 * them. That is the price of not having one.
 *
 * What this does not do: it does not move your files between computers. Each
 * computer gets its own copy of a project from GitHub in the ordinary way. What
 * travels is knowing what exists, who is about, and what was said.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, writeFile, mkdir, readdir, rm, appendFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import * as path from 'node:path';
import { hostname, platform, release } from 'node:os';
import { randomBytes } from 'node:crypto';

import { HOUSE } from './projects.mjs';
import * as github from './github.mjs';

const run = promisify(execFile);
const quiet = async (fn, fallback = null) => { try { return await fn(); } catch { return fallback; } };

export const WORKSPACE_NAME = 'viberant-workspace';
const HERE = path.join(HOUSE, 'workspace');
const MARKER = path.join(HOUSE, 'workspace.json');

/** How long a computer counts as being about after its last word. */
const STILL_HERE = 6 * 60 * 1000;
/** How often being about is written down. Rarely, because each one is a save. */
const HEARTBEAT = 2 * 60 * 1000;

const git = (...args) => run('git', args, { cwd: HERE, maxBuffer: 32 * 1024 * 1024 });

let lastBeat = 0;

// ---------------------------------------------------------------------------
// Setting it up
// ---------------------------------------------------------------------------

async function marker() {
  if (!existsSync(MARKER)) return null;
  return quiet(async () => JSON.parse(await readFile(MARKER, 'utf8')));
}

async function setMarker(value) {
  await mkdir(HOUSE, { recursive: true });
  await writeFile(MARKER, JSON.stringify(value, null, 2), 'utf8');
}

/** This computer, as the others will see it. */
export function thisMachine(id, name = null) {
  return {
    id,
    name: name || hostname(),
    kind: platform() === 'win32' ? 'Windows' : platform() === 'darwin' ? 'Mac' : 'Linux',
    version: release(),
  };
}

/** Where the workspace stands on this computer. */
export async function state() {
  const m = await marker();
  const account = await github.who();
  return {
    joined: !!m && existsSync(path.join(HERE, '.git')),
    account: m?.account ?? null,
    signedInAs: account,
    // Signing in as somebody else does not quietly hand them your workspace.
    mismatch: !!m && !!account && m.account !== account,
    name: m?.name ?? hostname(),
  };
}

/**
 * Join the shared workspace, making it if this is the first computer.
 *
 * Safe to call twice. If the workspace is already here it is simply refreshed.
 */
export async function join({ machine, name = null } = {}) {
  if (!(await github.haveGitHubTool())) {
    return {
      ok: false,
      sentence: 'The GitHub helper is not installed, so your computers cannot find each other.',
      action: 'Install GitHub CLI from cli.github.com, then come back.',
    };
  }
  const account = await github.who();
  if (!account) {
    return {
      ok: false,
      sentence: 'You are not signed in to GitHub, so there is nowhere for your computers to meet.',
      action: 'Sign in to GitHub from the Accounts tab, then join.',
    };
  }

  const existing = await marker();
  if (existing && existing.account !== account && existsSync(HERE)) {
    // A different account's workspace is sitting here. Never mix the two.
    await rm(HERE, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }

  const full = `${account}/${WORKSPACE_NAME}`;

  if (!existsSync(path.join(HERE, '.git'))) {
    const there = await quiet(() => run('gh', ['repo', 'view', full, '--json', 'name']));
    if (!there) {
      const made = await quiet(() => run('gh', ['repo', 'create', WORKSPACE_NAME, '--private', '--add-readme',
        '--description', 'Where my computers find each other in Viberant. Made by the app; safe to leave alone.']));
      if (!made) {
        return {
          ok: false,
          sentence: 'A shared workspace could not be made on your GitHub account.',
          action: 'Check you are online, then try again.',
        };
      }
    }

    await mkdir(HOUSE, { recursive: true });
    await rm(HERE, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    const got = await quiet(() => run('gh', ['repo', 'clone', full, HERE]));
    if (!got) {
      return {
        ok: false,
        sentence: 'The shared workspace could not be brought down to this computer.',
        action: 'Check you are online, then try again.',
      };
    }
  }

  // Sending to a private workspace needs this computer to prove it is you, and
  // being signed in to the helper is not by itself enough. Set for this folder
  // only, so nothing outside what the manager made is changed. Done every time
  // rather than only on the first, so a workspace made before this existed is
  // repaired by joining again.
  await github.useOwnCredentials(HERE);

  await setMarker({ account, full, name: name || hostname(), joinedAt: Date.now() });
  lastBeat = 0;

  const refreshed = await sync({ machine, name, force: true });
  if (!refreshed.ok) return refreshed;
  if (refreshed.reached === false) {
    // Joined here, but the others cannot see it yet. Saying "joined" and
    // stopping would be true and misleading, which is the worse kind of true.
    return {
      ...refreshed,
      ok: false,
      sentence: 'This computer joined, but what it wrote has not reached GitHub yet.',
      action: 'Press Join again in a moment — it will send what is waiting.',
    };
  }
  return { ok: true, sentence: 'This computer has joined your shared workspace.', ...refreshed };
}

/**
 * The one secret the workspace holds.
 *
 * Written by whichever computer joins first and read by every other one. It is
 * what lets two computers on the same network recognise each other as *yours*
 * rather than merely as two computers on a network — being signed in to the
 * same GitHub account is a claim anybody nearby could make, and holding a
 * random number out of a project only you can read is not.
 *
 * This is the seam between the two halves: **GitHub says which computers are
 * yours, and the local network moves the files.** Nothing here is ever sent
 * anywhere; it stays in the workspace and in memory.
 */
export async function secret() {
  const at = path.join(HERE, 'key');
  if (!existsSync(path.join(HERE, '.git'))) return null;

  if (existsSync(at)) {
    const held = await quiet(() => readFile(at, 'utf8'), '');
    const trimmed = String(held ?? '').trim();
    if (trimmed.length >= 32) return trimmed;
  }

  await pull();
  if (existsSync(at)) {
    const held = await quiet(() => readFile(at, 'utf8'), '');
    const trimmed = String(held ?? '').trim();
    if (trimmed.length >= 32) return trimmed;
  }

  const made = randomBytes(32).toString('hex');
  await writeFile(at, `${made}\n`, 'utf8');
  const kept = await push('Set the key this workspace is recognised by');
  if (!kept) return null;

  // Somebody else may have written one first and won the race; theirs wins.
  const settled = await quiet(() => readFile(at, 'utf8'), made);
  return String(settled ?? made).trim();
}

/** Stop taking part, and take this computer's word out of the workspace. */
export async function leave({ machine } = {}) {
  if (!existsSync(path.join(HERE, '.git'))) return { ok: true, sentence: 'This computer was not in a shared workspace.' };

  for (const f of [path.join(HERE, 'machines', `${machine}.json`), path.join(HERE, 'shared', `${machine}.json`)]) {
    await rm(f, { force: true });
  }
  await push('One computer left the workspace');
  await rm(MARKER, { force: true });
  return { ok: true, sentence: 'This computer has left the shared workspace. Nothing on it was touched.' };
}

// ---------------------------------------------------------------------------
// Keeping in step
// ---------------------------------------------------------------------------

/** Bring down whatever the other computers have said. */
async function pull() {
  const ok = await quiet(() => git('pull', '--rebase', '--quiet', '--autostash'));
  return !!ok;
}

/** Put this computer's own three files back, and say why. */
async function push(why) {
  const added = await quiet(() => git('add', '--all'));
  if (!added) return false;

  const pending = await quiet(() => git('status', '--porcelain'));
  if (!pending?.stdout.trim()) return true;

  const saved = await quiet(() => git('commit', '--quiet', '--no-verify', '-m', why));
  if (!saved) return false;

  if (await quiet(() => git('push', '--quiet'))) return true;

  // Somebody else got there first. Take theirs, put ours on top, try once more.
  await pull();
  return !!(await quiet(() => git('push', '--quiet')));
}

/**
 * Say hello, offer what this computer has, and read everything back.
 *
 * Called whenever the workspace is on screen. Being about is only written down
 * every couple of minutes; anything you actually did is written down at once.
 */
export async function sync({ machine, name = null, project = null, sharing = null, force = false } = {}) {
  if (!existsSync(path.join(HERE, '.git'))) {
    return { ok: false, sentence: 'This computer is not in a shared workspace yet.', action: 'Join one first.' };
  }

  await pull();

  const me = thisMachine(machine, name || (await marker())?.name);
  const due = force || sharing !== null || Date.now() - lastBeat > HEARTBEAT;
  let reached = null;

  if (due) {
    await mkdir(path.join(HERE, 'machines'), { recursive: true });
    await writeFile(path.join(HERE, 'machines', `${machine}.json`), JSON.stringify({
      ...me, lastHere: Date.now(), workingOn: project,
    }, null, 2), 'utf8');

    if (sharing) {
      await mkdir(path.join(HERE, 'shared'), { recursive: true });
      await writeFile(path.join(HERE, 'shared', `${machine}.json`),
        JSON.stringify(sharing, null, 2), 'utf8');
    }

    reached = await push(sharing ? `${me.name} changed what it is offering` : `${me.name} is here`);
    lastBeat = Date.now();
  }

  return { ok: true, reached, ...(await read(machine)) };
}

/** Everything in the workspace, folded together. */
async function read(machine) {
  const gathered = { machines: [], shared: [], said: [] };

  for (const f of await listing('machines')) {
    gathered.machines.push({
      from: path.basename(f, '.json'),
      text: await quiet(() => readFile(path.join(HERE, 'machines', f), 'utf8'), ''),
    });
  }
  for (const f of await listing('shared')) {
    gathered.shared.push({
      from: path.basename(f, '.json'),
      text: await quiet(() => readFile(path.join(HERE, 'shared', f), 'utf8'), ''),
    });
  }
  for (const f of await listing('said')) {
    gathered.said.push({
      from: path.basename(f, '.jsonl'),
      text: await quiet(() => readFile(path.join(HERE, 'said', f), 'utf8'), ''),
    });
  }

  return fold(gathered, machine);
}

/**
 * Put every computer's files side by side and read one picture out of them.
 *
 * Deliberately separate from reading the disk, and deliberately pure: this is
 * the part that has to be right when two computers wrote at the same moment,
 * and it should be provable without a network, a workspace, or a second
 * computer. A file that is half-written or nonsense is skipped rather than
 * allowed to take the whole picture down with it.
 */
export function fold({ machines: mFiles = [], shared = [], said: sFiles = [] }, machine, now = Date.now()) {
  const machines = [];
  for (const { text } of mFiles) {
    const one = parse(text);
    if (!one) continue;
    machines.push({ ...one, you: one.id === machine, hereNow: now - (one.lastHere ?? 0) < STILL_HERE });
  }
  machines.sort((a, b) => (b.lastHere ?? 0) - (a.lastHere ?? 0));

  const named = Object.fromEntries(machines.map((m) => [m.id, m.name]));

  const projects = [];
  for (const { from, text } of shared) {
    for (const p of parse(text) ?? []) {
      projects.push({
        ...p,
        from,
        fromName: named[from] ?? 'a computer that has left',
        yours: from === machine,
      });
    }
  }
  projects.sort((a, b) => String(a.name).localeCompare(String(b.name)));

  const talk = [];
  for (const { from, text } of sFiles) {
    for (const line of String(text ?? '').split('\n')) {
      if (!line.trim()) continue;
      const one = parse(line);
      if (one) talk.push({ ...one, from, fromName: named[from] ?? one.fromName ?? 'a computer', you: from === machine });
    }
  }
  talk.sort((a, b) => a.at - b.at);

  return { machines, projects, said: talk.slice(-200) };
}

const parse = (text) => { try { return JSON.parse(text); } catch { return null; } };

async function listing(folder) {
  if (!existsSync(path.join(HERE, folder))) return [];
  return (await readdir(path.join(HERE, folder))).filter((f) => !f.startsWith('.'));
}

// ---------------------------------------------------------------------------
// Saying things
// ---------------------------------------------------------------------------

/** Say something to your other computers. */
export async function say({ machine, name = null, text }) {
  const words = String(text ?? '').trim().slice(0, 800);
  if (!words) return { ok: false, sentence: 'There was nothing to say.', action: 'Type something first.' };
  if (!existsSync(path.join(HERE, '.git'))) {
    return { ok: false, sentence: 'This computer is not in a shared workspace yet.', action: 'Join one first.' };
  }

  await pull();
  await mkdir(path.join(HERE, 'said'), { recursive: true });
  await appendFile(path.join(HERE, 'said', `${machine}.jsonl`),
    `${JSON.stringify({ at: Date.now(), fromName: name || hostname(), text: words })}\n`, 'utf8');

  const sent = await push(`${name || hostname()} said something`);
  if (!sent) {
    return {
      ok: false,
      sentence: 'That was written down here but has not reached your other computers.',
      action: 'Check you are online — it will go next time.',
      ...(await read(machine)),
    };
  }
  return { ok: true, ...(await read(machine)) };
}

/** Take a project down from the workspace onto this computer. */
export async function bring({ entry, into }) {
  if (!entry?.url) {
    return {
      ok: false,
      sentence: 'That project has no copy on GitHub, so it cannot come to this computer.',
      action: 'Ask the computer that has it to send it to GitHub first.',
    };
  }
  return github.bringDown({ url: entry.url, into });
}
