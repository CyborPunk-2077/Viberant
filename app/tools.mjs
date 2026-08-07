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
/**
 * How each app officially signs you in.
 *
 * `run` is the load-bearing field. It is the app's *own* sign-in command, and
 * running it is what opens the provider's real flow — Google's account picker,
 * GitHub's device page, Anthropic's consent screen. The manager never tries to
 * be the thing signing you in; it starts the thing that is.
 *
 * This replaces what was here before, which opened a web address instead. That
 * is how pressing Google landed somebody on their Google *account settings*
 * page: a page about their account rather than a way to sign in to anything.
 *
 * `kind` is `account` for a real sign-in and `key` for pasting a secret. Only
 * accounts are offered on the card. Keys are how a couple of these tools work
 * and they are still reachable, but they are not a sign-in and are not dressed
 * up as one.
 */
const WAY = {
  anthropic: { id: 'anthropic', kind: 'account', name: 'Claude account', mark: 'anthropic', tint: '#d97757', initial: 'A' },
  anthropicConsole: { id: 'anthropicConsole', kind: 'account', name: 'Anthropic Console', mark: 'anthropic', tint: '#d97757', initial: 'A' },
  anthropicSso: { id: 'anthropicSso', kind: 'account', name: 'Your company (SSO)', mark: 'anthropic', tint: '#d97757', initial: 'A' },
  openai: { id: 'openai', kind: 'account', name: 'OpenAI', mark: 'openai', tint: '#10a37f', initial: 'O' },
  google: { id: 'google', kind: 'account', name: 'Google', mark: 'google', tint: '#4285f4', initial: 'G' },
  github: { id: 'github', kind: 'account', name: 'GitHub', mark: 'github', tint: '#6e7681', initial: 'G' },
  openrouter: { id: 'openrouter', kind: 'account', name: 'OpenRouter', mark: null, tint: '#8b5cf6', initial: 'R' },
  anthropicKey: { id: 'anthropicKey', kind: 'key', name: 'Anthropic key', mark: 'anthropic', tint: '#d97757', initial: 'A' },
  openaiKey: { id: 'openaiKey', kind: 'key', name: 'OpenAI key', mark: 'openai', tint: '#10a37f', initial: 'O' },
};

/** One way in, with the command that actually starts it. */
const signInWith = (way, run, then) => ({ ...way, run, then });

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
        // There is a window for this, it is just not something the command-line
        // half can start. So the button exists and says where to get it.
        elsewhere: 'https://claude.com/download',
      },
    },
    signIns: [
      signInWith(WAY.anthropic, 'claude auth login --claudeai',
        'Your browser opens on Anthropic’s sign-in. This is the one that uses your Claude subscription.'),
      signInWith(WAY.anthropicConsole, 'claude auth login --console',
        'Signs in against Anthropic Console, where usage is billed to an account rather than a subscription.'),
      signInWith(WAY.anthropicSso, 'claude auth login --sso',
        'For an Anthropic account your company signs you in to.'),
      signInWith(WAY.anthropicKey, 'claude auth login --console',
        'Console accounts issue keys. Paste yours in the window.'),
    ],
    signIn: { way: 'terminal', command: 'claude auth login', then: 'Follow the steps in the window that opens.' },
    carryOn: ['--continue'],
    install: 'https://claude.com/product/claude-code',
  },
  {
    id: 'codex',
    name: 'Codex',
    made: 'OpenAI',
    config: '.codex',
    ways: {
      terminal: { bin: 'codex' },
      // Codex opens its own window through its own command, and that command
      // takes the folder. It even fetches the window if it is missing, which is
      // why this is offered whenever Codex itself is here.
      desktop: { command: { bin: 'codex', args: ['app'], takesPath: true } },
    },
    signIns: [
      signInWith(WAY.openai, 'codex login',
        'Your browser opens on OpenAI’s sign-in. Finish there and Codex is signed in.'),
      signInWith(WAY.openaiKey, 'codex login --with-api-key',
        'Paste your key into the window when it asks.'),
    ],
    signIn: { way: 'terminal', command: 'codex login', then: 'Follow the steps in the window.' },
    carryOn: ['resume', '--last'],
    install: 'https://developers.openai.com/codex/cli',
  },
  {
    id: 'gemini',
    name: 'Gemini',
    made: 'Google',
    config: '.gemini',
    ways: { terminal: { bin: 'gemini' } },
    signIns: [
      signInWith(WAY.google, 'gemini',
        'Choose “Login with Google” in the window. Your browser opens on Google’s account picker.'),
    ],
    signIn: { way: 'terminal', command: 'gemini', then: 'Choose Google when it asks, and your browser will open.' },
    install: 'https://github.com/google-gemini/gemini-cli',
  },
  {
    id: 'copilot',
    name: 'Copilot',
    made: 'GitHub',
    config: '.copilot',
    ways: { terminal: { bin: 'copilot' } },
    signIns: [
      signInWith(WAY.github, 'copilot',
        'Type /login in the window. Your browser opens on GitHub’s device page.'),
    ],
    signIn: { way: 'terminal', command: 'copilot', then: 'Type /login in the window that opens.' },
    install: 'https://github.com/features/copilot/cli',
  },
  {
    id: 'opencode',
    name: 'OpenCode',
    made: 'open source',
    config: '.opencode',
    ways: {
      terminal: { bin: 'opencode' },
      // OpenCode's window is a page it serves and opens for you.
      desktop: { command: { bin: 'opencode', args: ['web'], takesPath: false }, inBrowser: true },
    },
    signIns: [
      signInWith(WAY.anthropic, 'opencode auth login', 'Choose Anthropic in the window that opens.'),
      signInWith(WAY.openai, 'opencode auth login', 'Choose OpenAI in the window that opens.'),
      signInWith(WAY.google, 'opencode auth login', 'Choose Google in the window that opens.'),
      signInWith(WAY.openrouter, 'opencode auth login', 'Choose OpenRouter in the window that opens.'),
    ],
    signIn: { way: 'terminal', command: 'opencode auth login', then: 'Pick a provider and paste its key.' },
    carryOn: ['--continue'],
    install: 'https://opencode.ai',
  },
  {
    id: 'aider',
    name: 'Aider',
    made: 'open source',
    config: '.aider',
    ways: { terminal: { bin: 'aider' } },
    signIns: [
      signInWith(WAY.anthropicKey, 'aider', 'Aider is signed in with a key rather than an account. Paste yours when it asks.'),
      signInWith(WAY.openaiKey, 'aider', 'Aider is signed in with a key rather than an account. Paste yours when it asks.'),
    ],
    signIn: { way: 'terminal', command: 'aider', then: 'Aider uses a key rather than a sign-in. Paste yours when it asks.' },
    install: 'https://aider.chat/docs/install.html',
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
    signIns: [],
    newWindow: true,
    signIn: { way: 'inside', then: 'Cursor signs you in inside its own window.' },
    install: 'https://cursor.com/downloads',
  },
  {
    id: 'windsurf',
    name: 'Windsurf',
    made: 'Codeium',
    config: null,
    ways: {
      desktop: { bin: 'windsurf', at: [[local, 'Programs', 'Windsurf', 'Windsurf.exe']] },
    },
    signIns: [],
    newWindow: true,
    signIn: { way: 'inside', then: 'Windsurf signs you in inside its own window.' },
    install: 'https://windsurf.com/download',
  },
  {
    id: 'antigravity',
    name: 'Antigravity',
    made: 'Google',
    config: null,
    ways: {
      desktop: { bin: 'antigravity', at: [[local, 'Programs', 'antigravity', 'Antigravity.exe']] },
    },
    signIns: [signInWith(WAY.google, null, 'Antigravity signs you in with Google, inside its own window.')],
    newWindow: true,
    signIn: { way: 'inside', then: 'Antigravity signs you in with Google, inside its own window.' },
    install: 'https://antigravity.google/download',
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
    signIns: [],
    newWindow: true,
    signIn: { way: 'inside', then: 'VS Code signs you in inside its own window.' },
    install: 'https://code.visualstudio.com/download',
  },
  {
    id: 'zed',
    name: 'Zed',
    made: 'Zed Industries',
    config: null,
    ways: {
      desktop: { bin: 'zed', at: [[local, 'Zed', 'Zed.exe'], [local, 'Programs', 'Zed', 'Zed.exe']] },
    },
    signIns: [],
    signIn: { way: 'inside', then: 'Zed signs you in inside its own window.' },
    install: 'https://zed.dev/download',
  },
];

// ---------------------------------------------------------------------------
// Is it here, and is it what it claims to be?
// ---------------------------------------------------------------------------

/**
 * What is on this computer, remembered for a moment.
 *
 * Asking "where is this?" costs a whole process, and the Apps page asks it
 * about twenty times before it can draw anything — which was a second and a
 * third of staring at nothing every time you went there, and again after every
 * button press. Nothing installs itself in the seconds between two of those
 * questions, so the answer is kept for a few seconds and the page becomes
 * instant.
 *
 * Installing something clears it, so a thing you just installed appears at
 * once rather than after a wait nobody can explain.
 */
const REMEMBER_FOR = 8000;
const remembered = new Map();

export function forgetWhatIsHere() {
  remembered.clear();
}

async function askOnce(key, ask) {
  const had = remembered.get(key);
  if (had && Date.now() - had.at < REMEMBER_FOR) return had.answer;
  const answer = await ask();
  remembered.set(key, { at: Date.now(), answer });
  return answer;
}

async function onPath(bin) {
  if (!bin) return null;
  return askOnce(`path:${bin}`, async () => {
    try {
      const { stdout } = await run(WINDOWS ? 'where' : 'which', [bin]);
      const first = stdout.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)[0];
      return first ?? bin;
    } catch { return null; }
  });
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

  // Some apps open their own window through their own command rather than
  // through a file we can point at — `codex app`, `opencode web`. There is
  // nothing to read a header out of; if the command is here, the window is.
  if (way.command) {
    const found = await onPath(way.command.bin);
    return found ? { bin: found, run: way.command, inBrowser: !!way.inBrowser } : null;
  }

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
    if (!where) {
      // A window this app has but this computer does not. The button still
      // exists, and pressing it says where to get it rather than nothing.
      if (how === 'desktop' && way.elsewhere) found.windowElsewhere = way.elsewhere;
      continue;
    }
    if (how === 'desktop' && where.butItIsATerminalProgram) {
      found.onlyATerminalProgram = where.bin;
      if (way.elsewhere) found.windowElsewhere = way.elsewhere;
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
  // Eleven apps, each asking the computer two or three questions. Asked one
  // after another that is well over a second before the page can draw; asked
  // all at once it is the slowest single question, which is a fraction of it.
  return Promise.all(all.map(async (t) => {
    const ways = await waysIn(t);
    const how = ['desktop', 'terminal'].filter((k) => ways[k]);
    return {
      id: t.id,
      name: t.name,
      made: t.made ?? null,
      config: t.config ?? null,
      ways: how,
      here: how.length > 0,
      // A window this app has, that this computer does not. The card shows Open
      // anyway and pressing it says where to get it — a button that explains is
      // more use than a button that is not there.
      windowElsewhere: ways.windowElsewhere ?? null,
      // Said out loud, so "why is there no Open button" has an answer rather
      // than being a mystery.
      terminalOnlyBecause: ways.onlyATerminalProgram
        ? `What is installed here is ${t.name} for the terminal, not its window.`
        : null,
      opensInBrowser: !!ways.desktop?.inBrowser,
      // Whether this app can be asked to carry on the conversation you were
      // having, rather than starting a new one.
      canCarryOn: !!t.carryOn,
      // Only real sign-ins reach the card. A key is how a couple of these
      // tools work, and it is still reachable, but it is not an account and is
      // not dressed up as one.
      signIns: (t.signIns ?? []).filter((w) => w.kind === 'account'),
      keys: (t.signIns ?? []).filter((w) => w.kind === 'key'),
      signIn: t.signIn ?? null,
      install: t.install ?? null,
      installs: installCommand(t)?.what ?? null,
    };
  }));
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
export async function launch({ tool, dir, how = null, terminal = null, carryOn = false, env = {} }) {
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
    if (how === 'desktop' && ways.windowElsewhere) {
      return {
        ok: false,
        getItAt: ways.windowElsewhere,
        sentence: ways.onlyATerminalProgram
          ? `What is installed here is ${tool.name} for the terminal, not its window.`
          : `${tool.name}'s own window is not on this computer yet.`,
        action: `Get it from ${tool.name}'s download page, or open it in a terminal instead.`,
      };
    }
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
      // Picking up where you left off is the app's own trick, not ours — every
      // one of these already remembers your conversation, and each has its own
      // word for asking to carry on with it. Where an app has no such word, it
      // opens fresh, and the page says so rather than implying otherwise.
      const resuming = carryOn && tool.carryOn ? ` ${tool.carryOn.join(' ')}` : '';
      const started = await openTerminal({ dir, command: `${quote(where.bin)}${resuming}`, which: terminal });
      if (!started.ok) return started;
      return {
        ok: true, started: tool.id, how: chosen, at: dir,
        terminal: started.opened, carriedOn: !!resuming,
      };
    }

    // On Windows we start through a shell, so anything with a space in it — and
    // most people have a space in a folder name somewhere — has to carry its
    // own quotes or the app is handed half a path.
    const folder = WINDOWS ? `"${dir}"` : dir;

    // The editors are all one family and all behave the same way: started a
    // second time, they hand the folder to the copy that is already running
    // and put nothing new on screen. From where you are sitting the button did
    // nothing. Asking for a window is how you get a window.
    const wantsAWindow = tool.newWindow ? ['--new-window'] : [];

    const args = where.run
      ? [...where.run.args, ...(where.run.takesPath ? [folder] : [])]
      : [...wantsAWindow, folder];

    const child = spawn(quote(where.bin), args, {
      cwd: dir,
      detached: true,
      stdio: 'ignore',
      shell: WINDOWS,
      env: { ...process.env, ...env },
    });

    const trouble = await didItDieAtOnce(child);
    if (trouble) {
      return {
        ok: false,
        sentence: `${tool.name} would not start.`,
        action: 'Try opening it yourself once. If that works and this does not, tell us and say which app.',
      };
    }

    child.unref();
    return { ok: true, started: tool.id, how: chosen, at: dir, inBrowser: !!where.inBrowser };
  } catch {
    return {
      ok: false,
      sentence: `${tool.name} would not start.`,
      action: 'Try opening it yourself once, then come back.',
    };
  }
}

/**
 * Give a freshly started app a moment to fall over, and say so if it does.
 *
 * `spawn` does not throw when the thing cannot be started — it says so later,
 * on the child, and a child nobody is listening to takes the whole manager down
 * with it. That is how "the app stopped working" happened: one app that would
 * not open, and every other button afterwards said the manager was not
 * answering.
 *
 * So somebody listens. And while we are listening, half a second is long enough
 * to catch a command that dies immediately, which is the difference between
 * saying "it is starting" truthfully and saying it because we did not look.
 * An app still running after that has started; big ones take seconds more to
 * put a window up and that is not something to wait for.
 */
const LONG_ENOUGH_TO_FAIL = 500;

function didItDieAtOnce(child) {
  return new Promise((answer) => {
    let done = false;
    const settled = (why) => { if (!done) { done = true; answer(why); } };

    child.on('error', () => settled('would not start'));
    child.on('exit', (code) => settled(code ? `stopped straight away (${code})` : null));
    setTimeout(() => settled(null), LONG_ENOUGH_TO_FAIL).unref?.();
  });
}

/**
 * Sign in to an app.
 *
 * For the ones that run in a terminal this opens one and runs their own sign-in,
 * which is what actually opens your browser and authorises them. For the ones
 * with a window of their own there is nothing to run — they ask inside
 * themselves — so we open the app and say so plainly.
 */
export async function signIn({ tool, dir, terminal = null, method = null }) {
  if (!tool) {
    return {
      ok: false,
      sentence: 'That app is not one this manager knows about.',
      action: 'Pick another one from the list.',
    };
  }

  // A named way in — Google, GitHub, Anthropic — runs that app's own sign-in,
  // which is the thing that opens the provider's real flow. The manager starts
  // it; it never tries to be it.
  const chosen = method ? (tool.signIns ?? []).find((w) => w.id === method) : null;
  if (method && !chosen) {
    return {
      ok: false,
      sentence: `${tool.name} does not sign in that way.`,
      action: 'Pick one of the ways on its card.',
    };
  }

  const inside = tool.signIn?.way === 'inside' || (chosen && !chosen.run);
  if (inside) {
    const opened = await launch({ tool, dir, how: 'desktop' });
    if (!opened.ok) return opened;
    return {
      ok: true,
      sentence: `${tool.name} is opening.`,
      action: chosen?.then ?? tool.signIn?.then ?? 'Sign in inside its own window.',
    };
  }

  const command = chosen?.run ?? tool.signIn?.command;
  if (!command) {
    return {
      ok: false,
      sentence: 'This manager does not know how to sign you in to that app.',
      action: 'Open the app and sign in there.',
    };
  }

  const ways = await waysIn(tool);
  if (!ways.terminal) {
    return {
      ok: false,
      sentence: `${tool.name} does not seem to be installed on this computer.`,
      action: `Install ${tool.name} first, then sign in.`,
    };
  }

  const started = await openTerminal({ dir, command, which: terminal });
  if (!started.ok) return started;

  return {
    ok: true,
    // Said out loud so the page knows there is a window with something in it
    // that may need carrying out — see carryTheLink in the page.
    inATerminal: !started.quiet,
    sentence: chosen
      ? `Signing in to ${tool.name} with ${chosen.name}.`
      : `Signing in to ${tool.name}.`,
    action: chosen?.then ?? tool.signIn?.then ?? 'Follow the steps in the window that opened.',
  };
}

/**
 * The one command that installs an app, where there is one.
 *
 * Only for the ones that install as a command — the editors come as their own
 * installer and that stays a download page, because silently running somebody
 * else's installer is not a thing this should do.
 */
const INSTALLS = {
  gemini: ['npm', 'install', '-g', '@google/gemini-cli'],
  copilot: ['npm', 'install', '-g', '@github/copilot'],
  claude: ['npm', 'install', '-g', '@anthropic-ai/claude-code'],
  codex: ['npm', 'install', '-g', '@openai/codex'],
  opencode: ['npm', 'install', '-g', 'opencode-ai'],
  aider: ['python', '-m', 'pip', 'install', '--upgrade', 'aider-install'],
};

export function installCommand(tool) {
  const one = INSTALLS[tool?.id];
  return one ? { file: one[0], args: one.slice(1), what: one.join(' ') } : null;
}

/** A path with a space in it is one thing, not two. */
const quote = (bin) => (WINDOWS && bin.includes(' ') ? `"${bin}"` : bin);
