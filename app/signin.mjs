/**
 * Signing in to GitHub without a terminal.
 *
 * What was happening before: the manager opened a black window running
 * `gh auth login --web`, which asked "Authenticate Git with your GitHub
 * credentials? (Y/n)". That is a fair question and completely the wrong place
 * to ask it — somebody who came to this app to avoid terminals has just been
 * handed one, with a yes-or-no in a language they did not sign up for.
 *
 * What happens now: the manager runs that same command with its hands on the
 * pipes. It answers the questions itself, reads the one-time code out of what
 * the command prints, shows the code on the page, and opens the browser at the
 * page that wants it. You see a code and a browser tab. There is no terminal.
 *
 * This is GitHub's device flow, which is exactly what it is for — a code you
 * carry from one place to another, so the thing signing in never sees your
 * password and never needs to.
 */

import { spawn } from 'node:child_process';
import { platform } from 'node:process';

const WINDOWS = platform === 'win32';

/** One sign-in, in progress. Only ever one at a time. */
let going = null;

export const state = () => (going
  ? {
    running: going.finished === null,
    code: going.code,
    at: going.at,
    ok: going.ok,
    sentence: going.sentence,
    action: going.action,
    lines: going.lines.slice(-20),
  }
  : null);

/** Stop watching, without touching whatever is already signed in. */
export function forget() {
  if (going?.child && going.finished === null) {
    try { going.child.kill(); } catch { /* already gone */ }
  }
  going = null;
}

/**
 * Begin. Returns straight away; the page watches `state()` for the code.
 *
 * The command is driven rather than displayed: every question it asks has one
 * right answer for this app, and asking a person a question you already know
 * the answer to is not respect, it is paperwork.
 */
export function begin() {
  if (going && going.finished === null) return state();

  going = {
    child: null,
    code: null,
    at: 'https://github.com/login/device',
    lines: [],
    finished: null,
    ok: null,
    sentence: null,
    action: null,
  };

  let child;
  try {
    child = spawn('gh', ['auth', 'login', '--hostname', 'github.com', '--web', '--git-protocol', 'https'], {
      shell: WINDOWS,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch {
    going.finished = Date.now();
    going.ok = false;
    going.sentence = 'The GitHub helper is not installed on this computer.';
    going.action = 'Install GitHub CLI from cli.github.com, then try again.';
    return state();
  }

  going.child = child;

  const read = (chunk) => {
    const text = String(chunk);
    for (const line of text.split(/\r?\n/)) {
      const clean = line.replace(/\x1b\[[0-9;]*m/g, '').trim();
      if (clean) going.lines.push(clean);
    }

    // The one thing on screen that matters. Everything else the command says is
    // for somebody who chose to be in a terminal.
    const code = text.match(/([A-Z0-9]{4}-[A-Z0-9]{4})/);
    if (code && !going.code) going.code = code[1];

    // It waits for a keypress before opening a browser. We are the keypress,
    // and we open the browser ourselves so it lands in front of the person.
    if (/Press Enter to open/i.test(text)) {
      try { child.stdin.write('\n'); } catch { /* it may have moved on */ }
      openTheBrowser(going.at);
    }
    // "Authenticate Git with your GitHub credentials?" — yes, always. This app
    // sets that up per folder anyway, and a person who came here to avoid
    // terminals should not be answering it.
    if (/\(Y\/n\)/i.test(text)) {
      try { child.stdin.write('y\n'); } catch { /* it may have moved on */ }
    }
  };

  child.stdout?.on('data', read);
  child.stderr?.on('data', read);

  child.on('error', () => {
    going.finished = Date.now();
    going.ok = false;
    going.sentence = 'The GitHub helper would not start.';
    going.action = 'Install GitHub CLI from cli.github.com, then try again.';
  });

  child.on('close', (exit) => {
    going.finished = Date.now();
    going.ok = exit === 0;
    going.sentence = exit === 0
      ? 'Signed in to GitHub.'
      : 'That sign-in did not finish.';
    going.action = exit === 0 ? null : 'Try again, or use the code at github.com/login/device.';
  });

  // Nobody stands at a sign-in page for a quarter of an hour.
  setTimeout(() => {
    if (going?.finished === null) {
      try { going.child.kill(); } catch { /* already gone */ }
      going.finished = Date.now();
      going.ok = false;
      going.sentence = 'That sign-in was left too long, so it was stopped.';
      going.action = 'Start it again when you are ready.';
    }
  }, 15 * 60 * 1000).unref?.();

  return state();
}

/** Put the page in front of the person, wherever their browser lives. */
function openTheBrowser(address) {
  const [file, args] = WINDOWS
    ? ['cmd', ['/c', 'start', '', address]]
    : platform === 'darwin' ? ['open', [address]] : ['xdg-open', [address]];
  try {
    spawn(file, args, { detached: true, stdio: 'ignore', windowsHide: true }).unref();
  } catch {
    // The address is on the page too, and it still works.
  }
}

export { openTheBrowser as openInBrowser };
