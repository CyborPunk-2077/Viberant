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

export async function run(dir, ...args) {
  const file = await executable();
  if (!file) {
    const error = new Error('Git is not available.');
    error.code = 'GIT_NOT_AVAILABLE';
    throw error;
  }

  const token = await signin.activeToken();
  const askpass = join(here, WINDOWS ? 'git-askpass.cmd' : 'git-askpass.sh');
  const env = {
    ...process.env,
    GIT_TERMINAL_PROMPT: '0',
    ...(token && existsSync(askpass) ? {
      GIT_ASKPASS: askpass,
      VIBERANT_GITHUB_TOKEN: token,
      VIBERANT_GITHUB_USER: 'x-access-token',
    } : {}),
  };
  return execute(file, args, { cwd: dir || undefined, env, windowsHide: true, maxBuffer: 32 * 1024 * 1024 });
}

export async function global(...args) {
  return run(null, ...args);
}
