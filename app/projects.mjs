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
  { id: 'working', name: 'Working on it', blurb: 'This is what you are in the middle of.' },
  { id: 'waiting', name: 'Waiting', blurb: 'Parked for now, and you mean to come back.' },
  { id: 'finished', name: 'Finished', blurb: 'Done. Nothing owed.' },
];

/** Set, or clear, how a project stands with you. */
export async function mark(path, value) {
  const dir = resolve(path);
  const known = value === null || MARKS.some((m) => m.id === value);
  if (!known) {
    return { ok: false, sentence: 'That is not one of the ways a project can be marked.', action: 'Pick one from the list.' };
  }

  const list = await remembered();
  const one = list.find((p) => p.path === dir);
  if (!one) {
    return { ok: false, sentence: 'That project is not one this manager is keeping.', action: 'Open it once first.' };
  }
  one.mark = value;
  one.markedAt = value ? Date.now() : null;
  await mkdir(HOUSE, { recursive: true });
  await writeFile(REMEMBERED, JSON.stringify(list, null, 2), 'utf8');

  const named = MARKS.find((m) => m.id === value);
  return { ok: true, sentence: value ? `${one.name} is marked ${named.name.toLowerCase()}.` : `${one.name} is no longer marked.` };
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
  const dir = resolve(path);
  const list = await remembered();
  const one = list.find((p) => p.path === dir);
  if (!one) {
    return { ok: false, sentence: 'That project is not one this manager is keeping.', action: 'Open it once first.' };
  }
  one.private = !!yes;
  await mkdir(HOUSE, { recursive: true });
  await writeFile(REMEMBERED, JSON.stringify(list, null, 2), 'utf8');
  return {
    ok: true,
    sentence: yes
      ? `${one.name} is private to this computer now.`
      : `${one.name} is visible to your other computers again.`,
  };
}

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
export async function situation(dir) {
  if (!existsSync(join(dir, '.git'))) {
    return { tracked: false, unsaved: 0, shared: null, waitingToSend: 0 };
  }
  const out = {};
  try {
    const { stdout } = await git(dir, 'status', '--porcelain');
    out.unsaved = stdout.split('\n').filter((l) => l.trim()).length;
  } catch { out.unsaved = 0; }

  try {
    const { stdout } = await git(dir, 'remote', 'get-url', 'origin');
    out.shared = stdout.trim() || null;
  } catch { out.shared = null; }

  try {
    const { stdout } = await git(dir, 'rev-list', '--count', '@{upstream}..HEAD');
    out.waitingToSend = Number(stdout.trim());
  } catch {
    // There is a copy on GitHub, but this computer has never sent to it, so we
    // cannot say whether it is up to date. Saying nothing is better than
    // claiming "sent" and being wrong about where someone's work is.
    out.waitingToSend = null;
  }

  try {
    const { stdout } = await git(dir, 'log', '-1', '--format=%s|%cr|%cI');
    const [subject, when, at] = stdout.trim().split('|');
    out.last = subject ? { subject, when, at } : null;
  } catch { out.last = null; }

  return { tracked: true, ...out };
}

/**
 * When this was last saved, as a person would say it.
 *
 * Its own sentence rather than part of the one above, because "what is unsaved"
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
  bits.push(isPrivate ? 'private to this computer' : 'your other computers can see it');
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
