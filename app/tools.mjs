/**
 * The AI apps, and every way into them.
 *
 * You pick a project once and every app opens knowing where it is. That is the
 * errand. Around it sit three smaller ones that used to live in other places:
 *
 *   Two ways in. An app can have a window of its own, a terminal, or both.
 *   Only the ways actually on this computer are offered, and "has a window" is
 *   read out of the program's own header rather than guessed from its name —
 *   several of these ship a file that looks like a desktop app and is really
 *   the command-line program (see windowed.mjs).
 *
 *   Signing in, where you use the app. Every app carries the services it can
 *   sign in with, so choosing an account is a thing you do on the app's own
 *   card at the moment you are about to open it, not on a page somewhere else.
 *
 *   Getting one you do not have. Every app knows how it is installed, so an
 *   app you have heard of but never set up is one press away rather than a
 *   search.
 *
 * Terminals themselves live in terminals.mjs, deliberately apart — PowerShell
 * is not an AI app and should never sit in a list of them.
 */

import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { platform } from 'node:process';
import { existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

import { openTerminal } from './terminals.mjs';
import { kindOfProgram } from './windowed.mjs';

const run = promisify(execFile);
const WINDOWS = platform === 'win32';

const local = process.env.LOCALAPPDATA ?? '';
const programs = process.env.PROGRAMFILES ?? 'C:\\Program Files';
const programsX86 = process.env['PROGRAMFILES(X86)'] ?? 'C:\\Program Files (x86)';

/**
 * Services an app can sign you in with.
 *
 * `initial` and `tint` are all the badge needs — no pictures are fetched from
 * anywhere, because this app does not reach the network to draw itself.
 * `at` is the page that opens in your browser. `by` is what actually authorises
 * the app on this computer, where that is a thing the manager can run.
 */
const SERVICE = {
  anthropic: { id: 'anthropic', name: 'Anthropic', initial: 'A', tint: '#d97757', at: 'https://claude.ai/login' },
  anthropicKey: { id: 'anthropicKey', name: 'Anthropic key', initial: 'A', tint: '#d97757', at: 'https://console.anthropic.com/settings/keys' },
  openai: { id: 'openai', name: 'OpenAI', initial: 'O', tint: '#10a37f', at: 'https://chatgpt.com/' },
  openaiKey: { id: 'openaiKey', name: 'OpenAI key', initial: 'O', tint: '#10a37f', at: 'https://platform.openai.com/api-keys' },
  google: { id: 'google', name: 'Google', initial: 'G', tint: '#4285f4', at: 'https://accounts.google.com/' },
  github: { id: 'github', name: 'GitHub', initial: 'G', tint: '#6e7681', at: 'https://github.com/login' },
  openrouter: { id: 'openrouter', name: 'OpenRouter', initial: 'R', tint: '#8b5cf6', at: 'https://openrouter.ai/keys' },
};

/**
 * The apps the manager knows how to start.
 *
 * Order means nothing and is never shown as a ranking — it is a set, and the
 * manager has no opinion about which you should use. `config` is the folder in
 * your home directory where an app keeps who you are signed in as; it is what
 * makes more than one account possible (see profiles.mjs).
 */
export const KNOWN = [
  {
    id: 'claude',
    name: 'Claude Code',
    made: 'Anthropic',
    config: '.claude',
    ways: {
      terminal: { bin: 'claude' },
      desktop: {
        at: [
          [local, 'AnthropicClaude', 'claude.exe'],
          [local, 'AnthropicClaude', 'app-*', 'claude.exe'],
          [local, 'Programs', 'claude-code', 'Claude Code.exe'],
          [local, 'Programs', 'Claude', 'Claude.exe'],
          [programs, 'Claude', 'Claude.exe'],
          // Where the version manager keeps what it downloaded. Looked at last
          // and on purpose: what is in there is the terminal program, so
          // finding it is how the card gets to say so rather than say nothing.
          [local, 'Claude-3p', 'claude-code', '*', 'claude.exe'],
        ],
      },
    },
    services: [SERVICE.anthropic, SERVICE.anthropicKey],
    signIn: { way: 'terminal', command: 'claude', then: 'Type /login in the window that opens and follow the steps.' },
    install: { how: 'npm', what: '@anthropic-ai/claude-code', at: 'https://claude.com/product/claude-code' },
  },
  {
    id: 'codex',
    name: 'Codex',
    made: 'OpenAI',
    config: '.codex',
    ways: {
      terminal: { bin: 'codex' },
      desktop: {
        at: [
          [local, 'Programs', 'Codex', 'Codex.exe'],
          [local, 'OpenAI', 'Codex', 'Codex.exe'],
          [local, 'Programs', 'ChatGPT', 'ChatGPT.exe'],
          [local, 'OpenAI', 'Codex', 'bin', '*', 'codex.exe'],
        ],
      },
    },
    services: [SERVICE.openai, SERVICE.openaiKey],
    signIn: { way: 'terminal', command: 'codex login', then: 'Follow the steps in the window.' },
    install: { how: 'npm', what: '@openai/codex', at: 'https://developers.openai.com/codex/cli' },
  },
  {
    id: 'gemini',
    name: 'Gemini',
    made: 'Google',
    config: '.gemini',
    ways: { terminal: { bin: 'gemini' } },
    services: [SERVICE.google],
    signIn: { way: 'terminal', command: 'gemini', then: 'Choose how you want to sign in.' },
    install: { how: 'npm', what: '@google/gemini-cli', at: 'https://github.com/google-gemini/gemini-cli' },
  },
  {
    id: 'copilot',
    name: 'Copilot',
    made: 'GitHub',
    config: '.copilot',
    ways: { terminal: { bin: 'copilot' } },
    services: [SERVICE.github],
    signIn: { way: 'terminal', command: 'copilot', then: 'Type /login in the window that opens.' },
    install: { how: 'npm', what: '@github/copilot', at: 'https://github.com/features/copilot/cli' },
  },
  {
    id: 'opencode',
    name: 'OpenCode',
    made: 'open source',
    config: '.opencode',
    ways: {
      terminal: { bin: 'opencode' },
      desktop: {
        at: [
          [local, 'Programs', 'opencode', 'opencode.exe'],
          [local, 'Programs', 'OpenCode', 'OpenCode.exe'],
        ],
      },
    },
    services: [SERVICE.anthropicKey, SERVICE.openaiKey, SERVICE.google, SERVICE.openrouter],
    signIn: { way: 'terminal', command: 'opencode auth login', then: 'Pick a provider and paste its key.' },
    install: { how: 'npm', what: 'opencode-ai', at: 'https://opencode.ai' },
  },
  {
    id: 'aider',
    name: 'Aider',
    made: 'open source',
    config: '.aider',
    ways: { terminal: { bin: 'aider' } },
    services: [SERVICE.anthropicKey, SERVICE.openaiKey],
    signIn: { way: 'terminal', command: 'aider', then: 'Aider uses a key rather than a sign-in. Paste yours when it asks.' },
    install: { how: 'link', at: 'https://aider.chat/docs/install.html' },
  },
  {
    id: 'cursor',
    name: 'Cursor',
    made: 'Anysphere',
    config: null,
    ways: {
      desktop: {
        bin: 'cursor',
        at: [
          [local, 'Programs', 'cursor', 'Cursor.exe'],
          [programs, 'Cursor', 'Cursor.exe'],
        ],
      },
      terminal: { bin: 'cursor-agent' },
    },
    services: [],
    signIn: { way: 'inside', then: 'Cursor signs you in inside its own window.' },
    install: { how: 'link', at: 'https://cursor.com/downloads' },
  },
  {
    id: 'windsurf',
    name: 'Windsurf',
    made: 'Codeium',
    config: null,
    ways: {
      desktop: { bin: 'windsurf', at: [[local, 'Programs', 'Windsurf', 'Windsurf.exe']] },
    },
    services: [],
    signIn: { way: 'inside', then: 'Windsurf signs you in inside its own window.' },
    install: { how: 'link', at: 'https://windsurf.com/download' },
  },
  {
    id: 'antigravity',
    name: 'Antigravity',
    made: 'Google',
    config: null,
    ways: {
      desktop: { bin: 'antigravity', at: [[local, 'Programs', 'antigravity', 'Antigravity.exe']] },
    },
    services: [],
    signIn: { way: 'inside', then: 'Antigravity signs you in inside its own window.' },
    install: { how: 'link', at: 'https://antigravity.google/download' },
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
          [local, 'Programs', 'Microsoft VS Code', 'Code.exe'],
          [programs, 'Microsoft VS Code', 'Code.exe'],
          [programsX86, 'Microsoft VS Code', 'Code.exe'],
        ],
      },
    },
    services: [],
    signIn: { way: 'inside', then: 'VS Code signs you in inside its own window.' },
    install: { how: 'link', at: 'https://code.visualstudio.com/download' },
  },
  {
    id: 'zed',
    name: 'Zed',
    made: 'Zed Industries',
    config: null,
    ways: {
      desktop: { bin: 'zed', at: [[local, 'Zed', 'Zed.exe'], [local, 'Programs', 'Zed', 'Zed.exe']] },
    },
    services: [],
    signIn: { way: 'inside', then: 'Zed signs you in inside its own window.' },
    install: { how: 'link', at: 'https://zed.dev/download' },
  },
];

// ---------------------------------------------------------------------------
// Is it here, and is it what it claims to be?
// ---------------------------------------------------------------------------

async function onPath(bin) {
  if (!bin) return null;
  try {
    const { stdout } = await run(WINDOWS ? 'where' : 'which', [bin]);
    const first = stdout.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)[0];
    return first ?? bin;
  } catch { return null; }
}

/**
 * Fill in a path that has a `*` in it, taking the newest match.
 *
 * Some of these install into a folder named after their version, so the path
 * that was right last week is wrong today.
 */
async function settle(parts) {
  const star = parts.findIndex((p) => String(p).includes('*'));
  if (star === -1) {
    const path = join(...parts);
    return existsSync(path) ? path : null;
  }
  const above = join(...parts.slice(0, star));
  if (!existsSync(above)) return null;

  const pattern = new RegExp(`^${String(parts[star]).replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`, 'i');
  const matches = (await readdir(above, { withFileTypes: true }).catch(() => []))
    .filter((e) => e.isDirectory() && pattern.test(e.name))
    .map((e) => e.name)
    .sort()
    .reverse();

  for (const name of matches) {
    const found = await settle([above, name, ...parts.slice(star + 1)]);
    if (found) return found;
  }
  return null;
}

/**
 * Where a way in actually is.
 *
 * A window has to prove it is a window. On Windows that is readable out of the
 * file itself, so an app whose "desktop" turns out to be the command-line
 * program is not offered as a window — which is the honest answer even when it
 * is not the one somebody hoped for.
 */
async function locate(way, { mustBeWindowed = false } = {}) {
  if (!way) return null;

  const tries = [];
  const fromPath = await onPath(way.bin);
  if (fromPath) tries.push(fromPath);
  for (const parts of way.at ?? []) {
    const found = await settle(Array.isArray(parts) ? parts : [parts]);
    if (found) tries.push(found);
  }

  for (const bin of tries) {
    if (!mustBeWindowed || !WINDOWS) return { bin };

    const kind = await kindOfProgram(bin);
    if (kind === 'window') return { bin };
    if (kind === 'terminal') return { bin, butItIsATerminalProgram: true };

    // Not a program we can read at all — a shim like `cursor.cmd`, which is how
    // most of the windowed ones put themselves on the path. Nothing is known
    // against it, so it is taken at its word. Only evidence downgrades a way in,
    // never the absence of evidence.
    return { bin };
  }
  return null;
}

/** Which ways into this app are on this computer. */
export async function waysIn(tool) {
  if (!tool) return {};
  const found = {};

  for (const [how, way] of Object.entries(tool.ways ?? {})) {
    const where = await locate(way, { mustBeWindowed: how === 'desktop' });
    if (!where) continue;
    if (how === 'desktop' && where.butItIsATerminalProgram) {
      found.onlyATerminalProgram = where.bin;
      continue;
    }
    found[how] = where;
  }

  // Older shape, kept because the app is the same app however it is described.
  if (!tool.ways && tool.bin) {
    const where = await locate({ bin: tool.bin });
    if (where) found[tool.kind === 'app' ? 'desktop' : 'terminal'] = where;
  }
  return found;
}

/** Is this app on the machine at all, by any way in? */
export async function present(tool) {
  const ways = await waysIn(tool);
  return !!(ways.terminal || ways.desktop);
}

/**
 * Every AI app, and how it can be opened.
 *
 * Apps that are not here are returned too, marked absent, because "we looked
 * and it is not here" is more useful than a shorter list — and it is where the
 * offer to install one belongs.
 */
export async function installed(extra = []) {
  const all = [...KNOWN, ...extra];
  const out = [];
  for (const t of all) {
    const ways = await waysIn(t);
    const how = ['desktop', 'terminal'].filter((k) => ways[k]);
    out.push({
      id: t.id,
      name: t.name,
      made: t.made ?? null,
      config: t.config ?? null,
      ways: how,
      here: how.length > 0,
      // Said out loud on the card, so "why is there no Open button" has an
      // answer rather than being a mystery.
      terminalOnlyBecause: ways.onlyATerminalProgram
        ? `What is installed here is ${t.name} for the terminal, not a window.`
        : null,
      services: t.services ?? [],
      signIn: t.signIn ?? null,
      install: t.install ?? null,
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
 * Start an app in a folder.
 *
 * `how` is 'terminal' or 'desktop'. Leave it out and the app takes the only way
 * it has; an app with both and no choice made opens in its own window, because
 * that is the one that does not take your keyboard.
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
  const available = ['desktop', 'terminal'].filter((k) => ways[k]);
  if (!available.length) {
    return {
      ok: false,
      sentence: `${tool.name} does not seem to be installed on this computer.`,
      action: `Install ${tool.name} from its card, then try again.`,
    };
  }

  const chosen = how && ways[how] ? how
    : how ? null
      : (available.includes('desktop') ? 'desktop' : available[0]);

  if (!chosen) {
    return {
      ok: false,
      sentence: how === 'desktop'
        ? (ways.onlyATerminalProgram
          ? `What is installed here is ${tool.name} for the terminal, not a window.`
          : `${tool.name} has no window of its own on this computer.`)
        : `${tool.name} cannot be started in a terminal on this computer.`,
      action: `Open ${tool.name} the other way instead.`,
    };
  }

  const where = ways[chosen];

  try {
    if (chosen === 'terminal') {
      const started = await openTerminal({ dir, command: quote(where.bin), which: terminal });
      if (!started.ok) return started;
      return { ok: true, started: tool.id, how: chosen, at: dir, terminal: started.opened };
    }

    // On Windows we start through a shell, so anything with a space in it — and
    // most people have a space in a folder name somewhere — has to carry its
    // own quotes or the app is handed half a path.
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
 * For the ones that run in a terminal this opens one and runs their own sign-in,
 * which is what actually opens your browser and authorises them. For the ones
 * with a window of their own there is nothing to run — they ask inside
 * themselves — so we open the app and say so plainly.
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
      action: `Install ${tool.name} first, then sign in.`,
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

// ---------------------------------------------------------------------------
// Getting one you do not have
// ---------------------------------------------------------------------------

/**
 * What installing an app would involve, before you agree to it.
 *
 * Nothing is installed without being asked, and what would run is shown first.
 */
export function howToInstall(tool) {
  if (!tool?.install) return null;
  if (tool.install.how === 'npm') {
    return {
      can: true,
      what: `npm install -g ${tool.install.what}`,
      why: `${tool.name} is installed the same way as any other command-line program. This needs Node on the computer.`,
      at: tool.install.at,
    };
  }
  return {
    can: false,
    why: `${tool.name} comes as its own installer, which has to be downloaded and run.`,
    at: tool.install.at,
  };
}

/** The pieces of an install, for an errand to run. */
export function installCommand(tool) {
  if (tool?.install?.how !== 'npm') return null;
  return { file: 'npm', args: ['install', '-g', tool.install.what] };
}

/** A path with a space in it is one thing, not two. */
const quote = (bin) => (WINDOWS && bin.includes(' ') ? `"${bin}"` : bin);
