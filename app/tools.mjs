/**
 * Launching AI apps already pointed at your project.
 *
 * The whole point: you pick a project once, here, and every app opens knowing
 * where it is. No adding the folder again in each app, no dragging it in, no
 * re-explaining where you are. That is the errand this removes.
 *
 * Each app can have two ways in, and most have only one:
 *
 *   terminal — it runs in a terminal. We open one, already in the folder.
 *   desktop  — it has a window of its own. We start it with the folder loaded.
 *
 * Only the ways that are actually on this computer are ever offered. An app with
 * neither is not shown at all, and an app with one is not made to look like it
 * has two.
 *
 * Terminals themselves live in `terminals.mjs`, deliberately apart — PowerShell
 * is not an AI app and should never sit in a list of them.
 */

import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { platform } from 'node:process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { openTerminal } from './terminals.mjs';

const run = promisify(execFile);
const WINDOWS = platform === 'win32';

const local = process.env.LOCALAPPDATA ?? '';
const programs = process.env.PROGRAMFILES ?? 'C:\\Program Files';
const programsX86 = process.env['PROGRAMFILES(X86)'] ?? 'C:\\Program Files (x86)';

/**
 * The apps we know how to start.
 *
 * Order here means nothing and is never shown as a ranking — it is a set, and
 * the manager has no opinion about which you should use. `config` is the folder
 * in your home directory where that app keeps who you are signed in as; it is
 * what makes more than one account possible (see profiles.mjs).
 */
export const KNOWN = [
  {
    id: 'claude',
    name: 'Claude Code',
    made: 'Anthropic',
    config: '.claude',
    ways: {
      terminal: { bin: 'claude' },
    },
    signIn: {
      way: 'terminal',
      command: 'claude',
      then: 'Type /login in the window that opens and follow the steps.',
    },
  },
  {
    id: 'codex',
    name: 'Codex',
    made: 'OpenAI',
    config: '.codex',
    ways: {
      terminal: { bin: 'codex' },
    },
    signIn: { way: 'terminal', command: 'codex login', then: 'Follow the steps in the window.' },
  },
  {
    id: 'gemini',
    name: 'Gemini',
    made: 'Google',
    config: '.gemini',
    ways: {
      terminal: { bin: 'gemini' },
    },
    signIn: { way: 'terminal', command: 'gemini', then: 'Choose how you want to sign in.' },
  },
  {
    id: 'copilot',
    name: 'Copilot',
    made: 'GitHub',
    config: '.copilot',
    ways: {
      terminal: { bin: 'copilot' },
    },
    signIn: { way: 'terminal', command: 'copilot', then: 'Type /login in the window that opens.' },
  },
  {
    id: 'opencode',
    name: 'OpenCode',
    made: 'open source',
    config: '.opencode',
    ways: {
      terminal: { bin: 'opencode' },
    },
    signIn: { way: 'terminal', command: 'opencode auth login', then: 'Pick a provider and paste its key.' },
  },
  {
    id: 'aider',
    name: 'Aider',
    made: 'open source',
    config: '.aider',
    ways: {
      terminal: { bin: 'aider' },
    },
    signIn: {
      way: 'terminal',
      command: 'aider',
      then: 'Aider uses a key rather than a sign-in. Paste yours when it asks.',
    },
  },
  {
    id: 'cursor',
    name: 'Cursor',
    made: 'Anysphere',
    config: null,
    ways: {
      desktop: { bin: 'cursor', at: [join(local, 'Programs', 'cursor', 'Cursor.exe')] },
      terminal: { bin: 'cursor-agent' },
    },
    signIn: { way: 'inside', then: 'Cursor signs you in inside its own window.' },
  },
  {
    id: 'windsurf',
    name: 'Windsurf',
    made: 'Codeium',
    config: null,
    ways: {
      desktop: { bin: 'windsurf', at: [join(local, 'Programs', 'Windsurf', 'Windsurf.exe')] },
    },
    signIn: { way: 'inside', then: 'Windsurf signs you in inside its own window.' },
  },
  {
    id: 'antigravity',
    name: 'Antigravity',
    made: 'Google',
    config: null,
    ways: {
      desktop: { bin: 'antigravity', at: [join(local, 'Programs', 'Antigravity', 'Antigravity.exe')] },
    },
    signIn: { way: 'inside', then: 'Antigravity signs you in inside its own window.' },
  },
  {
    id: 'code',
    name: 'VS Code',
    made: 'Microsoft',
    config: null,
    ways: {
      desktop: {
        bin: 'code',
        at: [
          join(local, 'Programs', 'Microsoft VS Code', 'Code.exe'),
          join(programs, 'Microsoft VS Code', 'Code.exe'),
          join(programsX86, 'Microsoft VS Code', 'Code.exe'),
        ],
      },
    },
    signIn: { way: 'inside', then: 'VS Code signs you in inside its own window.' },
  },
  {
    id: 'zed',
    name: 'Zed',
    made: 'Zed Industries',
    config: null,
    ways: {
      desktop: { bin: 'zed', at: [join(local, 'Zed', 'Zed.exe')] },
    },
    signIn: { way: 'inside', then: 'Zed signs you in inside its own window.' },
  },
];

// ---------------------------------------------------------------------------
// Is it here?
// ---------------------------------------------------------------------------

/** Is this command on the path? */
async function onPath(bin) {
  if (!bin) return false;
  try {
    await run(WINDOWS ? 'where' : 'which', [bin]);
    return true;
  } catch { return false; }
}

/**
 * Where a way in actually is, or nothing.
 *
 * The path is tried first because a command there works from any folder. Only
 * if that fails do we look in the places these apps install themselves, which
 * is how an app that never added itself to the path is still found.
 */
async function locate(way) {
  if (!way) return null;
  if (await onPath(way.bin)) return { bin: way.bin, onPath: true };
  for (const candidate of way.at ?? []) {
    if (candidate && existsSync(candidate)) return { bin: candidate, onPath: false };
  }
  return null;
}

/** Which ways into this app are on this computer. */
export async function waysIn(tool) {
  if (!tool) return {};
  const found = {};
  for (const [how, way] of Object.entries(tool.ways ?? {})) {
    const where = await locate(way);
    if (where) found[how] = where;
  }
  // Older shape, kept because the app is the same app whichever way it is
  // described: a plain { kind, bin } tool still launches.
  if (!tool.ways && tool.bin) {
    const where = await locate({ bin: tool.bin });
    if (where) found[tool.kind === 'app' ? 'desktop' : 'terminal'] = where;
  }
  return found;
}

/** Is this app on the machine at all, by any way in? */
export async function present(tool) {
  return Object.keys(await waysIn(tool)).length > 0;
}

/**
 * Every AI app on this computer, and how it can be opened.
 *
 * Apps that are not here are returned too, marked absent, because "we looked
 * and it is not here" is a more useful thing to see than a shorter list — and
 * it is where the offer to install one belongs.
 */
export async function installed(extra = []) {
  const all = [...KNOWN, ...extra];
  const out = [];
  for (const t of all) {
    const ways = await waysIn(t);
    const how = Object.keys(ways);
    out.push({
      id: t.id,
      name: t.name,
      made: t.made ?? null,
      config: t.config ?? null,
      ways: how,
      here: how.length > 0,
      signIn: t.signIn ?? null,
    });
  }
  return out;
}

export function find(id, extra = []) {
  return [...KNOWN, ...extra].find((t) => t.id === id) ?? null;
}

// ---------------------------------------------------------------------------
// Starting one
// ---------------------------------------------------------------------------

/**
 * Start an app in a project.
 *
 * `how` is 'terminal' or 'desktop'. Leave it out and the app picks the only way
 * it has; an app with both ways and no choice made opens in its own window,
 * because that is the one that does not steal your keyboard.
 *
 * Returns the one shape everything in this product returns: it worked, or one
 * plain sentence about why not and one thing to do about it.
 */
export async function launch({ tool, dir, how = null, terminal = null, env = {} }) {
  if (!tool) {
    return {
      ok: false,
      sentence: 'That app is not one this manager knows about.',
      action: 'Pick another one from the list.',
    };
  }

  const ways = await waysIn(tool);
  const available = Object.keys(ways);
  if (!available.length) {
    return {
      ok: false,
      sentence: `${tool.name} does not seem to be installed on this computer.`,
      action: `Install ${tool.name}, then try again.`,
    };
  }

  const chosen = how && ways[how] ? how
    : how ? null
      : (available.includes('desktop') ? 'desktop' : available[0]);

  if (!chosen) {
    return {
      ok: false,
      sentence: how === 'desktop'
        ? `${tool.name} has no window of its own on this computer.`
        : `${tool.name} cannot be started in a terminal on this computer.`,
      action: `Open ${tool.name} the other way instead.`,
    };
  }

  const where = ways[chosen];

  try {
    if (chosen === 'terminal') {
      const started = await openTerminal({ dir, command: quote(where.bin), which: terminal });
      if (!started.ok) return started;
      return { ok: true, started: tool.id, how: chosen, at: dir };
    }

    // On Windows we start through a shell, so anything with a space in it — and
    // most people have a space in a folder name somewhere — has to carry its own
    // quotes or the app is handed half a path.
    const child = spawn(quote(where.bin), [WINDOWS ? `"${dir}"` : dir], {
      cwd: dir,
      detached: true,
      stdio: 'ignore',
      shell: WINDOWS,
      env: { ...process.env, ...env },
    });
    child.unref();
    return { ok: true, started: tool.id, how: chosen, at: dir };
  } catch {
    return {
      ok: false,
      sentence: `${tool.name} would not start.`,
      action: 'Try opening it yourself once, then come back.',
    };
  }
}

/**
 * Sign in to an app.
 *
 * For the ones that run in a terminal this opens one and runs their sign-in for
 * you. For the ones with a window of their own there is nothing to run — they
 * ask inside themselves — so we open the app and say so plainly.
 */
export async function signIn({ tool, dir, terminal = null }) {
  if (!tool?.signIn) {
    return {
      ok: false,
      sentence: 'This manager does not know how to sign you in to that app.',
      action: 'Open the app and sign in there.',
    };
  }

  if (tool.signIn.way === 'inside') {
    const opened = await launch({ tool, dir, how: 'desktop' });
    if (!opened.ok) return opened;
    return { ok: true, sentence: `${tool.name} is opening.`, action: tool.signIn.then };
  }

  const ways = await waysIn(tool);
  if (!ways.terminal) {
    return {
      ok: false,
      sentence: `${tool.name} does not seem to be installed on this computer.`,
      action: `Install ${tool.name}, then sign in.`,
    };
  }

  const started = await openTerminal({ dir, command: tool.signIn.command, which: terminal });
  if (!started.ok) return started;
  return {
    ok: true,
    sentence: `Signing in to ${tool.name} in the window that just opened.`,
    action: tool.signIn.then,
  };
}

/** A path with a space in it is one thing, not two. */
const quote = (bin) => (WINDOWS && bin.includes(' ') ? `"${bin}"` : bin);
