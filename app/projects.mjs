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
  const list = (await remembered()).filter((p) => p.path !== dir);
  list.unshift({ path: dir, name: basename(dir), lastOpened: Date.now() });
  await mkdir(HOUSE, { recursive: true });
  await writeFile(REMEMBERED, JSON.stringify(list.slice(0, 30), null, 2), 'utf8');
  return list[0];
}

export async function forget(path) {
  const list = (await remembered()).filter((p) => p.path !== resolve(path));
  await writeFile(REMEMBERED, JSON.stringify(list, null, 2), 'utf8');
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
    const { stdout } = await git(dir, 'log', '-1', '--format=%s|%cr');
    const [subject, when] = stdout.trim().split('|');
    out.last = subject ? { subject, when } : null;
  } catch { out.last = null; }

  return { tracked: true, ...out };
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
  } catch {
    return { ok: false, saved: true, sent: false,
      sentence: 'Saved here, but GitHub could not be reached.',
      action: 'Send it again when you are back online.' };
  }
}
