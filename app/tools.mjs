/**
 * Launching AI tools already pointed at your project.
 *
 * The whole point: you pick a project once, here, and every tool opens knowing
 * where it is. No adding the folder again in each app, no dragging it in, no
 * re-explaining where you are. That is the errand this removes.
 *
 * Two kinds of tool, because they start differently:
 *   cli  — runs in a terminal. We open one, already in the project folder.
 *   app  — a window of its own. We start it with the folder as its argument.
 */

import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { platform } from 'node:process';

const run = promisify(execFile);
const WINDOWS = platform === 'win32';

/**
 * The tools we know how to start.
 *
 * Order here means nothing and is never shown as a ranking — it is a set, and
 * the app has no opinion about which you should use. You can add your own.
 */
export const KNOWN = [
  { id: 'claude',      name: 'Claude Code',  kind: 'cli', bin: 'claude',  config: '.claude' },
  { id: 'codex',       name: 'Codex',        kind: 'cli', bin: 'codex',   config: '.codex' },
  { id: 'gemini',      name: 'Gemini',       kind: 'cli', bin: 'gemini',  config: '.gemini' },
  { id: 'aider',       name: 'Aider',        kind: 'cli', bin: 'aider',   config: '.aider' },
  { id: 'cursor',      name: 'Cursor',       kind: 'app', bin: 'cursor' },
  { id: 'windsurf',    name: 'Windsurf',     kind: 'app', bin: 'windsurf' },
  { id: 'antigravity', name: 'Antigravity',  kind: 'app', bin: 'antigravity' },
  { id: 'code',        name: 'VS Code',      kind: 'app', bin: 'code' },
];

/** Is this tool actually on the machine? */
export async function present(tool) {
  try {
    await run(WINDOWS ? 'where' : 'which', [tool.bin]);
    return true;
  } catch { return false; }
}

/** Everything installed, with whether we can start it. */
export async function installed(extra = []) {
  const all = [...KNOWN, ...extra];
  const found = [];
  for (const t of all) {
    if (await present(t)) found.push({ id: t.id, name: t.name, kind: t.kind, config: t.config ?? null });
  }
  return found;
}

export function find(id, extra = []) {
  return [...KNOWN, ...extra].find((t) => t.id === id) ?? null;
}

/**
 * Which terminal to open a command-line tool in.
 *
 * Windows Terminal if it is there, because it is what people actually use now;
 * the old console if not. Neither choice is visible to you — you press a button
 * and a terminal appears in the right folder.
 */
async function terminalFor(dir, command) {
  if (WINDOWS) {
    try {
      await run('where', ['wt']);
      return { file: 'wt', args: ['-d', dir, 'cmd', '/k', command], detached: true };
    } catch {
      return { file: 'cmd', args: ['/c', 'start', '', 'cmd', '/k', `cd /d "${dir}" && ${command}`], detached: true };
    }
  }
  for (const [file, args] of [
    ['x-terminal-emulator', ['-e', 'bash', '-lc', `cd '${dir}' && ${command}; exec bash`]],
    ['gnome-terminal', ['--working-directory', dir, '--', 'bash', '-lc', `${command}; exec bash`]],
    ['xterm', ['-e', `cd '${dir}' && ${command}; bash`]],
  ]) {
    try { await run('which', [file]); return { file, args, detached: true }; } catch {}
  }
  // Nothing to show a terminal in. Run it headless rather than refuse.
  return { file: 'bash', args: ['-lc', `cd '${dir}' && ${command}`], detached: false };
}

/**
 * Start a tool in a project.
 *
 * Returns the one shape everything in this product returns: it worked, or one
 * plain sentence about why not and one thing to do about it.
 */
export async function launch({ tool, dir, env = {} }) {
  if (!tool) {
    return { ok: false, sentence: 'That app is not one this manager knows about.',
      action: 'Add it under your own tools, or pick another.' };
  }
  if (!(await present(tool))) {
    return { ok: false, sentence: `${tool.name} does not seem to be installed on this computer.`,
      action: `Install ${tool.name}, then try again.` };
  }

  try {
    const started = tool.kind === 'cli'
      ? await terminalFor(dir, tool.bin)
      : { file: tool.bin, args: [dir], detached: true };

    const child = spawn(started.file, started.args, {
      cwd: dir,
      detached: started.detached,
      stdio: 'ignore',
      shell: WINDOWS,
      env: { ...process.env, ...env },
    });
    child.unref();

    return { ok: true, started: tool.id, at: dir };
  } catch {
    return { ok: false, sentence: `${tool.name} would not start.`,
      action: 'Try opening it yourself once, then come back.' };
  }
}
