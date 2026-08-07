/**
 * Projects, and publishing them.
 *
 * A project is a folder on your computer. This remembers the ones you use, so
 * picking one is a click rather than a path you retype, and knows how to send a
 * project to GitHub in one go.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, basename, resolve, dirname } from 'node:path';
import { homedir } from 'node:os';

const run = promisify(execFile);
export const HOUSE = join(homedir(), '.viberant');
const REMEMBERED = join(HOUSE, 'projects.json');

// ---------------------------------------------------------------------------
// The ones you use
// ---------------------------------------------------------------------------

export async function remembered() {
  if (!existsSync(REMEMBERED)) return [];
  try { return JSON.parse(await readFile(REMEMBERED, 'utf8')); } catch { return []; }
}

export async function remember(path) {
  const dir = resolve(path);
  const all = await remembered();
  const was = all.find((p) => p.path === dir);
  const list = all.filter((p) => p.path !== dir);
  list.unshift({ ...was, path: dir, name: basename(dir), lastOpened: Date.now() });
  await mkdir(HOUSE, { recursive: true });
  await writeFile(REMEMBERED, JSON.stringify(list.slice(0, 60), null, 2), 'utf8');
  return list[0];
}

export async function forget(path) {
  const list = (await remembered()).filter((p) => p.path !== resolve(path));
  await writeFile(REMEMBERED, JSON.stringify(list, null, 2), 'utf8');
}

// ---------------------------------------------------------------------------
// Where you have got to
// ---------------------------------------------------------------------------

/**
 * What you decided about a project, as opposed to what is true about it.
 *
 * A project can be perfectly saved and still unfinished, and it can be a mess
 * on disk and be something you have decided is done. Only you know which, so
 * this is the one thing here that is yours to set rather than ours to work out.
 */
export const MARKS = [
  { id: 'notStarted', name: 'Yet to start', blurb: 'Here, and waiting for you to begin.' },
  { id: 'working', name: 'Working on it', blurb: 'This is what you are in the middle of.' },
  { id: 'finished', name: 'Finished', blurb: 'Done. Nothing owed.' },
  { id: 'published', name: 'Published', blurb: 'Out in the world, where people can use it.' },
];

/** What a project is before anybody has said otherwise. */
export const FIRST_MARK = 'notStarted';

/**
 * Set how a project stands with you.
 *
 * There is no such thing as unmarked. A project you have just added has not been
 * started, which is a real answer rather than an absence, and the four run in
 * the order work actually goes: yet to start, working on it, finished,
 * published.
 */
export async function mark(path, value) {
  const dir = resolve(path);
  if (!MARKS.some((m) => m.id === value)) {
    return { ok: false, sentence: 'That is not one of the ways a project can be marked.', action: 'Pick one from the list.' };
  }

  const list = await remembered();
  const one = list.find((p) => p.path === dir);
  if (!one) {
    return { ok: false, sentence: 'That project is not one this manager is keeping.', action: 'Open it once first.' };
  }
  one.mark = value;
  one.markedAt = Date.now();
  await mkdir(HOUSE, { recursive: true });
  await writeFile(REMEMBERED, JSON.stringify(list, null, 2), 'utf8');

  const named = MARKS.find((m) => m.id === value);
  return { ok: true, sentence: `${one.name}: ${named.name.toLowerCase()}.` };
}

/**
 * Keep a project to this computer, or let your other computers see it again.
 *
 * The default is that your other computers see it. They are yours — signed in
 * to the same account, sitting in the same house — so hiding your own work from
 * yourself by default would be a strange starting point. Private is the
 * exception you reach for, and it is one press.
 *
 * Private means not listed and not reachable: it is left out of what this
 * computer tells the workspace, so there is nothing for another computer to ask
 * about. It is an absence, not a permission that could be got around.
 */
export async function keepPrivate(path, yes) {
  return share(path, !yes);
}

/**
 * Whether this project is offered to your other computers.
 *
 * **Nothing is offered until you say so.** This reverses the default D-44 set,
 * and it was reversed by looking at what the other computer actually saw:
 *
 *   1MS22AI · Contacts · Download · Viberant
 *
 * Two of those are Windows' own folders, sitting in the list because they were
 * opened once. Nobody offered them to anything. They were on another computer's
 * screen because being in the list *was* the offer, and the only way out was to
 * notice and object.
 *
 * D-44's reasoning was that they are your own computers and your own account,
 * so hiding your work from yourself is a strange place to start. That is a fair
 * argument about *projects* and it is the wrong shape for a rule: it makes the
 * quiet path the one that gives things away, and the loud path the one that
 * keeps them. Offering is a thing somebody does on purpose, once, per project —
 * and a person who has done it knows what is out there, which is the property
 * that actually matters.
 *
 * Kept as an absence rather than a permission, exactly as before: what is not
 * offered is not in the list this computer publishes, so there is nothing for
 * another computer to ask about and nothing to get around.
 */
export async function share(path, yes) {
  const dir = resolve(path);
  const list = await remembered();
  const one = list.find((p) => p.path === dir);
  if (!one) {
    return { ok: false, sentence: 'That project is not one this manager is keeping.', action: 'Open it once first.' };
  }
  one.shared = !!yes;
  // The old word, kept in step so anything still reading it agrees.
  one.private = !yes;
  await mkdir(HOUSE, { recursive: true });
  await writeFile(REMEMBERED, JSON.stringify(list, null, 2), 'utf8');
  return {
    ok: true,
    sentence: yes
      ? `${one.name} is offered to your other computers now.`
      : `${one.name} is no longer offered. Nothing on this computer was touched.`,
  };
}

/**
 * Whether a remembered project is offered, for anything deciding what to tell
 * the other computers.
 *
 * Written as a function because the answer has to be the same in the two places
 * that ask — what goes into the shared workspace, and what this computer
 * answers for on the network. Those were two separate expressions, which is two
 * chances for only one of them to be corrected.
 *
 * A project remembered before this rule existed has no `shared` at all. It is
 * treated as not offered, which is the safe direction: the worst that happens
 * is somebody presses Share once on something they wanted shared, rather than
 * something staying on another computer's screen that was never meant to be.
 */
export const isShared = (p) => p?.shared === true;

/**
 * Look for projects under a folder, one level down.
 *
 * Deliberately shallow. Scanning a whole drive is slow, and a folder of folders
 * is how almost everyone keeps their work anyway.
 */
export async function lookIn(where) {
  const dir = resolve(where);
  if (!existsSync(dir)) return [];
  const found = [];
  for (const entry of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    const path = join(dir, entry.name);
    if (existsSync(join(path, '.git'))) found.push({ path, name: entry.name });
  }
  return found;
}

// ---------------------------------------------------------------------------
// What is going on in a project
// ---------------------------------------------------------------------------

const git = (dir, ...args) => run('git', args, { cwd: dir, maxBuffer: 32 * 1024 * 1024 });

/**
 * A plain account of where a project stands: is anything unsaved, is there a
 * copy on GitHub, is this computer behind or ahead of it.
 */
/**
 * Kept as a no-op on purpose.
 *
 * There was a two-second cache here, and it made the list able to say
 * "everything here is saved" moments after you had changed a file. Two tests
 * caught it immediately, which is the system working: **speed is never worth
 * being wrong about where somebody's work is.** The speed came from asking the
 * four questions at once instead of one after another, which costs nothing and
 * cannot go stale.
 *
 * The callers stay, so the next person who reaches for a cache finds this note
 * rather than an empty space.
 */
export function forgetSituations() {}

export async function situation(dir) {
  if (!existsSync(join(dir, '.git'))) {
    return { tracked: false, unsaved: 0, shared: null, waitingToSend: 0 };
  }

  // Four separate questions that do not depend on each other. Asked one after
  // another they were four process starts deep; asked together they cost about
  // as much as the slowest one. With a dozen projects on a page that is the
  // difference between the list appearing and the list arriving.
  const quiet = async (fn, fallback) => { try { return await fn(); } catch { return fallback; } };

  const [unsaved, shared, waitingToSend, last] = await Promise.all([
    quiet(async () => {
      const { stdout } = await git(dir, 'status', '--porcelain');
      return stdout.split(String.fromCharCode(10)).filter((l) => l.trim()).length;
    }, 0),

    quiet(async () => (await git(dir, 'remote', 'get-url', 'origin')).stdout.trim() || null, null),

    // There may be a copy on GitHub, but this computer has never sent to it, so
    // we cannot say whether it is up to date. Saying nothing is better than
    // claiming "sent" and being wrong about where someone's work is.
    quiet(async () => Number((await git(dir, 'rev-list', '--count', '@{upstream}..HEAD')).stdout.trim()), null),

    quiet(async () => {
      const { stdout } = await git(dir, 'log', '-1', '--format=%s|%cr|%cI');
      const [subject, when, at] = stdout.trim().split('|');
      return subject ? { subject, when, at } : null;
    }, null),
  ]);

  return { tracked: true, unsaved, shared, waitingToSend, last };
}

/**
 * When this was last saved, as a person would say it.
 *
 * Its own sentence rather than part of the one below, because "what is unsaved"
 * and "when did I last stop" are two different questions and a card has room
 * for both.
 */
export function lastSavedInWords(s) {
  if (!s.tracked) return 'Never saved.';
  if (!s.last) return 'Nothing saved here yet.';
  return `Saved ${s.last.when}.`;
}

/**
 * What kind of thing this is, read off the files that are always there.
 *
 * Cheap on purpose — a handful of checks for a file existing, no reading and no
 * walking the folder. It is the one fact that tells you which project you are
 * looking at when three of them have similar names.
 */
const KINDS = [
  ['package.json', 'Node'],
  ['pyproject.toml', 'Python'],
  ['requirements.txt', 'Python'],
  ['Cargo.toml', 'Rust'],
  ['go.mod', 'Go'],
  ['pom.xml', 'Java'],
  ['build.gradle', 'Java'],
  ['Gemfile', 'Ruby'],
  ['composer.json', 'PHP'],
  ['pubspec.yaml', 'Flutter'],
  ['index.html', 'a website'],
];

export function kindOf(dir) {
  for (const [file, name] of KINDS) if (existsSync(join(dir, file))) return name;
  return null;
}

/**
 * Who can see this, said in one short phrase.
 *
 * Two different questions that people run together: whether it is on GitHub at
 * all, and whether your other computers are offered it. Both matter and they
 * are not the same, so both are said.
 */
export function reachInWords(s, { private: isPrivate = false } = {}) {
  const bits = [];
  if (!s.tracked) bits.push('no history yet');
  else if (!s.shared) bits.push('only on this computer');
  else bits.push('has a copy on GitHub');
  bits.push(isPrivate ? 'not offered to your other computers' : 'offered to your other computers');
  return bits.join(' · ');
}

/** A one-line, jargon-free reading of that. */
export function inWords(s) {
  if (!s.tracked) return 'This folder does not keep a history yet.';
  const bits = [];
  if (s.unsaved) bits.push(s.unsaved === 1 ? 'one file changed since you last saved' : `${s.unsaved} files changed since you last saved`);
  if (s.waitingToSend) bits.push(s.waitingToSend === 1 ? 'one saved change not yet sent' : `${s.waitingToSend} saved changes not yet sent`);
  // "and sent" is only ever said when we actually know it was.
  if (!bits.length) {
    return s.shared && s.waitingToSend === 0
      ? 'Everything here is saved and sent.'
      : 'Everything here is saved.';
  }
  return capitalise(bits.join(', ')) + '.';
}

const capitalise = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// ---------------------------------------------------------------------------
// Sending it to GitHub
// ---------------------------------------------------------------------------

/** Who GitHub thinks you are, if the GitHub command-line tool is signed in. */
export async function githubAccount() {
  try {
    const { stdout } = await run('gh', ['api', 'user', '--jq', '.login']);
    return stdout.trim() || null;
  } catch { return null; }
}

/**
 * Save everything and send it, in one go.
 *
 * If the project has never been on GitHub, this offers to put it there — which
 * is the step that otherwise means leaving, making a repository by hand, copying
 * a URL back, and getting the first push wrong.
 */
export async function publish(dir, { message, makeIfMissing = true, private: isPrivate = true } = {}) {
  if (!existsSync(join(dir, '.git'))) {
    try {
      await git(dir, 'init', '-b', 'main');
    } catch {
      return { ok: false, sentence: 'This folder could not be set up to keep a history.',
        action: 'Check you have permission to write here.' };
    }
  }

  try {
    await git(dir, 'add', '--all');
    const { stdout: pending } = await git(dir, 'status', '--porcelain');
    if (pending.trim()) {
      await git(dir, 'commit', '--quiet', '--no-verify', '-m', message || 'Work from today');
    }
  } catch {
    return { ok: false, sentence: 'Your changes could not be saved.',
      action: 'Check that the files here are not open somewhere else.' };
  }

  let shared = null;
  try { shared = (await git(dir, 'remote', 'get-url', 'origin')).stdout.trim(); } catch {}

  if (!shared) {
    if (!makeIfMissing) {
      return { ok: true, saved: true, sent: false,
        sentence: 'Saved here. This project has no copy on GitHub yet.' };
    }
    const who = await githubAccount();
    if (!who) {
      // Your work is already saved at this point. Saying only that we failed
      // would be true and misleading, which is the worse kind of true.
      return { ok: false, saved: true, sent: false,
        sentence: 'Saved here, but you are not signed in to GitHub on this computer.',
        action: 'Sign in to GitHub, then send it.' };
    }
    try {
      await run('gh', ['repo', 'create', basename(dir),
        isPrivate ? '--private' : '--public', '--source', '.', '--remote', 'origin'],
      { cwd: dir });
      // Being signed in to the GitHub helper does not by itself let sending
      // reach GitHub, and adding ours to the end of the list changes nothing
      // because whatever the computer already had is asked first. The empty
      // value clears that list. Set for this folder only. See github.mjs.
      await git(dir, 'config', '--local', '--replace-all', 'credential.helper', '').catch(() => {});
      await git(dir, 'config', '--local', '--add', 'credential.helper', '!gh auth git-credential').catch(() => {});
    } catch {
      return { ok: false, saved: true, sent: false,
        sentence: 'Saved here, but a copy on GitHub could not be made.',
        action: 'Make one on GitHub yourself, then send it again.' };
    }
  }

  try {
    const branch = (await git(dir, 'rev-parse', '--abbrev-ref', 'HEAD')).stdout.trim();
    await git(dir, 'push', '--quiet', '--set-upstream', 'origin', branch);
    return { ok: true, saved: true, sent: true, sentence: 'Saved and sent to GitHub.' };
  } catch (e) {
    // Two very different reasons look identical from here unless you read what
    // came back, and telling somebody to wait until they are online when they
    // are online is the sort of wrong answer that wastes an afternoon.
    const said = String(e.stderr ?? e.message ?? '');
    if (/not found|Authentication failed|could not read Username|403|denied/i.test(said)) {
      return { ok: false, saved: true, sent: false, blocked: true,
        sentence: 'Saved here, but this computer could not prove to GitHub that it is you.',
        action: 'Open More, then “Let this computer send to GitHub”. It takes a second and is asked once.' };
    }
    return { ok: false, saved: true, sent: false,
      sentence: 'Saved here, but GitHub could not be reached.',
      action: 'Send it again when you are back online.' };
  }
}
