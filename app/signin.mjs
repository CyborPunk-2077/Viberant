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

import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { platform } from 'node:process';

const run = promisify(execFile);
const WINDOWS = platform === 'win32';

/**
 * The account that was signed in before we started, so it can be put back.
 *
 * Found by pressing the button: `gh auth login` clears the active session the
 * moment it begins, before you have signed in to anything. Start it and change
 * your mind, or close the window, and you are signed out of the account you
 * had — which the manager then reports as "not signed in", correctly and
 * uselessly.
 *
 * This is the same promise profiles.mjs makes about assistant accounts, applied
 * to the one that everything else here depends on: **signing in must never be
 * the thing that loses an account.**
 */
async function tokenInUse() {
  try {
    const { stdout } = await run('gh', ['auth', 'token'], { windowsHide: true });
    return stdout.trim() || null;
  } catch { return null; }
}

async function putItBack(token) {
  if (!token) return false;
  try {
    const back = spawn('gh', ['auth', 'login', '--hostname', 'github.com', '--with-token'], {
      shell: WINDOWS, windowsHide: true, stdio: ['pipe', 'ignore', 'ignore'],
    });
    back.stdin.end(`${token}\n`);
    return await new Promise((done) => back.on('close', (code) => done(code === 0)));
  } catch { return false; }
}

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
export async function forget() {
  if (going?.child && going.finished === null) {
    try { going.child.kill(); } catch { /* already gone */ }
    // Giving up must not cost you the account you already had.
    await putItBack(going.had);
  }
  going = null;
  return { ok: true };
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

  // The new attempt exists before anything asynchronous happens. It used to be
  // created inside the async half, so `begin()` returned whatever the *last*
  // attempt had ended as — and a previous failure came straight back as the
  // answer to starting a new one, which read as a button that did nothing.
  going = {
    child: null,
    had: null,
    code: null,
    at: 'https://github.com/login/device',
    opened: false,
    lines: [],
    finished: null,
    ok: null,
    sentence: null,
    action: null,
  };

  start(going);
  return state();
}

/**
 * The address it wants you to visit, wherever in its own words it appears.
 *
 * Worth being loose about. Older versions of the helper stopped and waited for
 * a keypress before opening a browser, and this app was that keypress. Newer
 * ones do not stop at all — they print the address and expect you to have seen
 * it. Watching only for the keypress meant nothing ever opened, while the page
 * cheerfully said your browser was opening. Watching for the address itself
 * works either way.
 */
const ADDRESS = /(https:\/\/github\.com\/login\/device\S*)/i;

async function start(mine) {
  mine.had = await tokenInUse();
  if (going !== mine) return state();

  let child;
  try {
    child = spawn('gh', ['auth', 'login', '--hostname', 'github.com', '--web', '--git-protocol', 'https'], {
      shell: WINDOWS,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch {
    settle(mine, {
      ok: false,
      sentence: 'The GitHub helper is not installed on this computer.',
      action: 'Install GitHub CLI from cli.github.com, then try again.',
    });
    return state();
  }

  mine.child = child;

  // Everything from here writes to `mine`, never to `going`. They are the same
  // object right up until somebody starts a second sign-in, and then the first
  // one's ending would land on the second one's record and report a failure
  // that belongs to an attempt already abandoned.
  const read = (chunk) => {
    const text = String(chunk);
    for (const line of text.split(/\r?\n/)) {
      const clean = line.replace(/\x1b\[[0-9;]*m/g, '').trim();
      if (clean) mine.lines.push(clean);
    }

    // The one thing on screen that matters. Everything else the command says is
    // for somebody who chose to be in a terminal.
    const code = text.match(/([A-Z0-9]{4}-[A-Z0-9]{4})/);
    if (code && !mine.code) mine.code = code[1];

    const where = text.match(ADDRESS);
    if (where) mine.at = where[1];

    // Open it ourselves, once, as soon as there is both a code to carry and
    // somewhere to carry it to. Some versions wait for a keypress first; we
    // are the keypress.
    if (/Press Enter to open/i.test(text)) {
      try { child.stdin.write('\n'); } catch { /* it may have moved on */ }
    }
    if (mine.code && !mine.opened) {
      mine.opened = true;
      openTheBrowser(mine.at);
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

  child.on('error', () => settle(mine, {
    ok: false,
    sentence: 'The GitHub helper would not start.',
    action: 'Install GitHub CLI from cli.github.com, then try again.',
  }));

  child.on('close', async (exit) => {
    if (mine.finished !== null) return;

    if (exit === 0) {
      return settle(mine, { ok: true, sentence: 'Signed in to GitHub.', action: null });
    }

    // It did not finish, and starting it already cleared whatever was signed
    // in. Put that back, so changing your mind costs nothing.
    const back = await putItBack(mine.had);
    settle(mine, {
      ok: false,
      sentence: 'That sign-in did not finish.',
      action: back
        ? 'The account you had is signed back in. Nothing changed.'
        : 'Try again, or use the code at github.com/login/device.',
    });
  });

  // Nobody stands at a sign-in page for a quarter of an hour.
  setTimeout(() => {
    if (mine.finished !== null) return;
    try { mine.child.kill(); } catch { /* already gone */ }
    putItBack(mine.had).then((back) => settle(mine, {
      ok: false,
      sentence: 'That sign-in was left too long, so it was stopped.',
      action: back
        ? 'The account you had is signed back in. Nothing changed.'
        : 'Start it again when you are ready.',
    }));
  }, 15 * 60 * 1000).unref?.();

  return state();
}

function settle(mine, how) {
  mine.finished = Date.now();
  mine.ok = how.ok;
  mine.sentence = how.sentence;
  mine.action = how.action;
}

/** Put the page in front of the person, wherever their browser lives. */
function openTheBrowser(address) {
  const [file, args] = WINDOWS
    ? ['cmd', ['/c', 'start', '', address]]
    : platform === 'darwin' ? ['open', [address]] : ['xdg-open', [address]];
  try {
    const child = spawn(file, args, { detached: true, stdio: 'ignore', windowsHide: true });
    // A child with nobody listening for its trouble throws where it cannot be
    // caught, and takes the manager with it. The address is on the page anyway.
    child.on('error', () => {});
    child.unref();
  } catch {
    // The address is on the page too, and it still works.
  }
}

export { openTheBrowser as openInBrowser };
