/**
 * Terminals.
 *
 * A tab of their own, on purpose. PowerShell is not an AI app and putting it in
 * a list of them would be a small lie about what it is — you go to that list to
 * hand a project to something that writes code, and you come here to get a
 * prompt in the right folder.
 *
 * Everything here opens in the project you have open. That is the only promise:
 * whichever one you pick, it starts where your work is.
 */

import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { platform } from 'node:process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const run = promisify(execFile);
const WINDOWS = platform === 'win32';

const programs = process.env.PROGRAMFILES ?? 'C:\\Program Files';
const programsX86 = process.env['PROGRAMFILES(X86)'] ?? 'C:\\Program Files (x86)';
const local = process.env.LOCALAPPDATA ?? '';

/**
 * The terminals we know how to open.
 *
 * `start` is given the folder and returns what to spawn. Windows Terminal is
 * listed first only because it is the one that can hold the others in tabs, not
 * because it is preferred — nothing here is marked as the one to use.
 */
const WINDOWS_TERMINALS = [
  {
    id: 'wt',
    name: 'Windows Terminal',
    blurb: 'The modern one, with tabs.',
    bin: 'wt',
    start: (dir, command) => ({
      file: 'wt',
      args: command
        ? ['-d', `"${dir}"`, 'cmd', '/k', command]
        : ['-d', `"${dir}"`],
    }),
  },
  {
    id: 'powershell',
    name: 'Windows PowerShell',
    blurb: 'The blue one that comes with Windows.',
    bin: 'powershell',
    start: (dir, command) => ({
      file: 'cmd',
      args: ['/c', 'start', '', 'powershell', '-NoExit', '-Command',
        `Set-Location -LiteralPath '${dir.replace(/'/g, "''")}'${command ? `; ${command}` : ''}`],
    }),
  },
  {
    id: 'pwsh',
    name: 'PowerShell 7',
    blurb: 'The newer cross-platform PowerShell.',
    bin: 'pwsh',
    start: (dir, command) => ({
      file: 'cmd',
      args: ['/c', 'start', '', 'pwsh', '-NoExit', '-Command',
        `Set-Location -LiteralPath '${dir.replace(/'/g, "''")}'${command ? `; ${command}` : ''}`],
    }),
  },
  {
    id: 'cmd',
    name: 'Command Prompt',
    blurb: 'The plain black one. Always here.',
    bin: 'cmd',
    start: (dir, command) => ({
      file: 'cmd',
      args: ['/c', 'start', '', 'cmd', '/k', `cd /d "${dir}"${command ? ` && ${command}` : ''}`],
    }),
  },
  {
    id: 'bash',
    // Its own name, as it appears in your Start menu. The manager never uses
    // this kind of word to describe your work — only to name a program you
    // already have, the same way it names GitHub.
    name: 'Git Bash',
    blurb: 'A Unix-style prompt on Windows.',
    at: [
      join(programs, 'Git', 'git-bash.exe'),
      join(programsX86, 'Git', 'git-bash.exe'),
      join(local, 'Programs', 'Git', 'git-bash.exe'),
    ],
    start: (dir, command, exe) => ({
      file: exe,
      args: command ? ['-c', `cd "${dir}" && ${command}; exec bash`] : [`--cd=${dir}`],
      raw: true,
    }),
  },
  {
    id: 'wsl',
    name: 'Linux (WSL)',
    blurb: 'The Linux environment inside Windows.',
    bin: 'wsl',
    start: (dir, command) => ({
      file: 'cmd',
      args: ['/c', 'start', '', 'wsl', '--cd', dir, ...(command ? ['--', 'bash', '-lc', `${command}; exec bash`] : [])],
    }),
  },
];

const UNIX_TERMINALS = [
  {
    id: 'gnome-terminal',
    name: 'Terminal',
    blurb: 'The one that came with your desktop.',
    bin: 'gnome-terminal',
    start: (dir, command) => ({
      file: 'gnome-terminal',
      args: ['--working-directory', dir, ...(command ? ['--', 'bash', '-lc', `${command}; exec bash`] : [])],
      raw: true,
    }),
  },
  {
    id: 'x-terminal-emulator',
    name: 'Terminal',
    blurb: 'Whichever terminal this computer prefers.',
    bin: 'x-terminal-emulator',
    start: (dir, command) => ({
      file: 'x-terminal-emulator',
      args: ['-e', 'bash', '-lc', `cd '${dir}'${command ? ` && ${command}` : ''}; exec bash`],
      raw: true,
    }),
  },
  {
    id: 'xterm',
    name: 'xterm',
    blurb: 'The oldest one, and the one that is always there.',
    bin: 'xterm',
    start: (dir, command) => ({
      file: 'xterm',
      args: ['-e', `cd '${dir}'${command ? ` && ${command}` : ''}; bash`],
      raw: true,
    }),
  },
];

export const ALL = WINDOWS ? WINDOWS_TERMINALS : UNIX_TERMINALS;

async function onPath(bin) {
  if (!bin) return false;
  try { await run(WINDOWS ? 'where' : 'which', [bin]); return true; } catch { return false; }
}

/** Where this terminal is on this computer, or nothing. */
async function locate(t) {
  if (t.bin && await onPath(t.bin)) return t.bin;
  for (const candidate of t.at ?? []) if (existsSync(candidate)) return candidate;
  return null;
}

/** Every terminal on this computer. */
export async function installed() {
  const out = [];
  for (const t of ALL) {
    const exe = await locate(t);
    if (exe) out.push({ id: t.id, name: t.name, blurb: t.blurb, here: true });
  }
  return out;
}

export function find(id) {
  return ALL.find((t) => t.id === id) ?? null;
}

/**
 * Open a terminal in a folder, optionally running something in it.
 *
 * `which` names one; leaving it out takes the first that is here, which is how
 * starting a command-line AI app can just work without ever asking you what a
 * terminal is.
 */
export async function openTerminal({ dir, command = null, which = null } = {}) {
  const wanted = which ? [find(which)].filter(Boolean) : ALL;
  if (which && !wanted.length) {
    return {
      ok: false,
      sentence: 'That terminal is not one this manager knows about.',
      action: 'Pick another one from the list.',
    };
  }

  for (const t of wanted) {
    const exe = await locate(t);
    if (!exe) continue;
    const started = t.start(dir, command, exe);
    try {
      const child = spawn(started.file, started.args, {
        cwd: dir,
        detached: true,
        stdio: 'ignore',
        // Anything routed through `cmd /c start` needs a shell; a program we
        // found ourselves is started directly, so a path with a space in it is
        // never split in half.
        shell: WINDOWS && !started.raw,
      });
      child.unref();
      return { ok: true, opened: t.id, at: dir };
    } catch { /* try the next one rather than give up on the errand */ }
  }

  if (which) {
    const t = find(which);
    return {
      ok: false,
      sentence: `${t.name} does not seem to be installed on this computer.`,
      action: 'Pick another terminal.',
    };
  }

  // Nothing to show a terminal in. Run it out of sight rather than refuse — the
  // work still happens, it just happens quietly.
  if (command) {
    try {
      const child = spawn(WINDOWS ? 'cmd' : 'bash', WINDOWS ? ['/c', command] : ['-lc', command], {
        cwd: dir, detached: true, stdio: 'ignore',
      });
      child.unref();
      return { ok: true, opened: 'none', at: dir, quiet: true };
    } catch { /* fall through to the honest refusal */ }
  }

  return {
    ok: false,
    sentence: 'No terminal could be found on this computer.',
    action: 'Open one yourself and it will still work.',
  };
}
