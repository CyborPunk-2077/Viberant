/**
 * The Git executable Viberant uses.
 *
 * A packaged MinGit runtime wins, then a system installation. Nothing is put
 * on PATH and no global setting is changed. Authentication is passed to the
 * child only for the lifetime of one operation through Git's ask-pass hook.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { platform } from 'node:process';
import * as signin from './signin.mjs';

const execute = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const WINDOWS = platform === 'win32';
let found = null;

function candidates() {
  const exe = WINDOWS ? 'git.exe' : 'git';
  const roots = [
    process.env.VIBERANT_GIT,
    process.resourcesPath ? join(process.resourcesPath, 'runtime', 'git', 'cmd', exe) : null,
    process.resourcesPath ? join(process.resourcesPath, 'app', 'runtime', 'git', 'cmd', exe) : null,
    resolve(here, '..', 'runtime', 'git', 'cmd', exe),
    'git',
  ];
  return [...new Set(roots.filter(Boolean))];
}

export async function executable({ fresh = false } = {}) {
  if (!fresh && found) return found;
  for (const one of candidates()) {
    if (one !== 'git' && !existsSync(one)) continue;
    try {
      await execute(one, ['--version'], { windowsHide: true, timeout: 5000 });
      found = one;
      return one;
    } catch { /* try the next candidate */ }
  }
  return null;
}

export async function state() {
  const file = await executable();
  if (!file) return { available: false, bundled: false, file: null };
  return {
    available: true,
    bundled: resolve(file).toLowerCase().includes(`${join('runtime', 'git')}`.toLowerCase()),
    file,
  };
}

/** Where the small program that answers "who is this" lives. */
export const askpassFile = () => join(here, WINDOWS ? 'git-askpass.cmd' : 'git-askpass.sh');

/**
 * What one Git operation runs with — arguments and environment, decided
 * without touching the disk so it can be held against a test.
 *
 * **Ask us who this is, not the computer's password store.**
 *
 * This is the whole of the "it made the project on GitHub and then sent nothing
 * to it" fault, and nothing about it is visible from the outside. A password
 * store is asked *before* the way we offer a key, and it answers — with whoever
 * was last signed in to it, which on the computer where this was found was a
 * different person entirely. GitHub then says the project is not there, because
 * that is what it tells somebody asking for one they cannot see, and the new
 * project stayed empty while the words on the screen talked about the network.
 *
 * Two things follow, and the second one is newer:
 *
 *   The store is taken out of the decision for the length of one command,
 *   never beyond it. Nothing on the computer changes and no other folder is
 *   touched.
 *
 *   It is taken out **whenever Viberant holds an account at all** — not only
 *   when a key could be produced. A key that cannot be unsealed used to fall
 *   straight back to the store, which is the same wrong-account send wearing
 *   the clothes of a rare failure. Now the operation is refused by GitHub and
 *   the person is told to sign in again, which is true.
 *
 * Somebody with no account connected here keeps their own arrangement exactly
 * as it is.
 */
export function invocation({ args, token = null, askpass = null, connected = false }) {
  const ours = !!token && !!askpass;
  const hush = ours || connected;
  return {
    ours,
    hush,
    args: hush ? ['-c', 'credential.helper=', ...args] : [...args],
    env: {
      GIT_TERMINAL_PROMPT: '0',
      ...(ours ? {
        GIT_ASKPASS: askpass,
        VIBERANT_GITHUB_TOKEN: token,
        VIBERANT_GITHUB_USER: 'x-access-token',
      } : {}),
    },
  };
}

export async function run(dir, ...args) {
  const file = await executable();
  if (!file) {
    const error = new Error('Git is not available.');
    error.code = 'GIT_NOT_AVAILABLE';
    throw error;
  }

  const account = await signin.activeAccount();
  const askpass = askpassFile();
  const how = invocation({
    args,
    token: account?.token ?? null,
    askpass: existsSync(askpass) ? askpass : null,
    connected: !!account,
  });

  const env = { ...process.env, ...how.env };
  // An account is connected but no key of ours could be offered. Whatever this
  // computer would otherwise have answered with is not allowed to stand in.
  if (how.hush && !how.ours) {
    delete env.GIT_ASKPASS;
    delete env.SSH_ASKPASS;
  }

  return execute(file, how.args, { cwd: dir || undefined, env, windowsHide: true, maxBuffer: 32 * 1024 * 1024 });
}

export async function global(...args) {
  return run(null, ...args);
}
