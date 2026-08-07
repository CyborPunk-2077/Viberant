/**
 * GitHub, for someone who has never heard of any of this.
 *
 * There is exactly one button most days — save and send. Everything else in
 * here sits behind it, and every one of these carries its own plain sentence
 * saying what it does and what it will cost you, because the reason people are
 * frightened of this is that the words are borrowed from somewhere else and
 * nothing tells you which ones are safe.
 *
 * The rules this file obeys, in order:
 *
 *   Never claim something happened when it did not. If your work is saved but
 *   not sent, that is what you are told, in that order.
 *
 *   Never touch work in progress. Anything that could walk over unsaved work
 *   refuses first and says what to do instead.
 *
 *   Nothing is undone that has already left this computer. Taking back
 *   something other people may already have is a different, larger thing, and
 *   the manager will not do it quietly.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { platform } from 'node:process';

const run = promisify(execFile);
const WINDOWS = platform === 'win32';

const git = (dir, ...args) => run('git', args, { cwd: dir, maxBuffer: 32 * 1024 * 1024 });
const gh = (args, opts = {}) => run('gh', args, { maxBuffer: 32 * 1024 * 1024, ...opts });

const quiet = async (fn, fallback = null) => { try { return await fn(); } catch { return fallback; } };

/**
 * Is the GitHub command on this computer at all?
 *
 * Asked by nearly everything in this file, and every ask costs a whole process.
 * Once it has been found it stays found; a "no" is only kept for a moment, so
 * installing it and coming straight back works without restarting anything.
 */
let toolIsHere = null;

export async function haveGitHubTool() {
  if (toolIsHere?.yes) return true;
  if (toolIsHere && Date.now() - toolIsHere.at < 3000) return false;
  const yes = !!(await quiet(() => run(WINDOWS ? 'where' : 'which', ['gh'])));
  toolIsHere = { at: Date.now(), yes };
  return yes;
}

const notSetUp = {
  ok: false,
  sentence: 'The GitHub helper is not installed on this computer.',
  action: 'Install GitHub CLI from cli.github.com, then come back.',
};

const notSignedIn = {
  ok: false,
  sentence: 'You are not signed in to GitHub on this computer.',
  action: 'Sign in with the account button at the bottom left, then try again.',
};

// ---------------------------------------------------------------------------
// Who you are
// ---------------------------------------------------------------------------

/**
 * Who GitHub thinks you are, or nothing.
 *
 * This asks GitHub, over the network, and takes about a third of a second. The
 * page asks it on every draw, so the answer is kept for a few seconds — long
 * enough to stop it being the slowest thing on screen, short enough that it is
 * never what anybody is looking at when it is wrong. Anything that changes the
 * answer forgets it on the way past, so a switch or a sign-out shows at once.
 */
const WORTH_KEEPING_FOR = 5000;
let lastKnown = null;

export function forgetWho() {
  lastKnown = null;
}

export async function who({ fresh = false } = {}) {
  if (!fresh && lastKnown && Date.now() - lastKnown.at < WORTH_KEEPING_FOR) return lastKnown.name;
  const out = await quiet(() => gh(['api', 'user', '--jq', '.login']));
  const name = out ? out.stdout.trim() || null : null;
  lastKnown = { at: Date.now(), name };
  return name;
}

/**
 * Every GitHub account signed in on this computer, and which one is in use.
 *
 * Read out of the helper's own account list rather than kept here, so it can
 * never drift from the truth.
 */
export async function accounts() {
  if (!(await haveGitHubTool())) return { here: false, accounts: [], active: null };

  // Two questions that do not depend on each other, so they are asked at once.
  const [status, active] = await Promise.all([quiet(() => gh(['auth', 'status'])), who()]);
  const text = status ? `${status.stdout}\n${status.stderr ?? ''}` : '';
  const names = [...text.matchAll(/account (\S+)/g)].map((m) => m[1]);

  const list = [...new Set(names)].map((name) => ({ name, active: name === active }));
  if (active && !list.some((a) => a.name === active)) list.unshift({ name: active, active: true });
  return { here: true, accounts: list, active };
}

/** Move to another GitHub account already signed in here. */
export async function switchTo(name) {
  if (!(await haveGitHubTool())) return notSetUp;
  const done = await quiet(() => gh(['auth', 'switch', '--user', name]));
  forgetWho();
  if (!done) {
    return {
      ok: false,
      sentence: `Could not move to ${name}.`,
      action: 'Sign in to that account first.',
    };
  }
  return { ok: true, sentence: `You are now working as ${name} on GitHub.` };
}

/** Stop using an account on this computer. Nothing on GitHub itself changes. */
export async function signOut(name) {
  if (!(await haveGitHubTool())) return notSetUp;
  const done = await quiet(() => gh(['auth', 'logout', '--user', name]));
  forgetWho();
  if (!done) {
    return { ok: false, sentence: `${name} could not be signed out.`, action: 'Try again in a moment.' };
  }
  return { ok: true, sentence: `${name} is signed out on this computer.` };
}

/**
 * Your name on saved work.
 *
 * Nothing can be saved at all until this is set, and the message you get
 * otherwise is one of the least welcoming in software. So it is asked for here,
 * once, in two boxes.
 */
export async function identity() {
  const name = await quiet(() => run('git', ['config', '--global', 'user.name']));
  const email = await quiet(() => run('git', ['config', '--global', 'user.email']));
  return {
    name: name ? name.stdout.trim() : null,
    email: email ? email.stdout.trim() : null,
  };
}

export async function setIdentity({ name, email }) {
  if (!String(name ?? '').trim() || !String(email ?? '').trim()) {
    return { ok: false, sentence: 'Both a name and an email address are needed.', action: 'Fill in both boxes.' };
  }
  const ok = await quiet(async () => {
    await run('git', ['config', '--global', 'user.name', String(name).trim()]);
    await run('git', ['config', '--global', 'user.email', String(email).trim()]);
    return true;
  });
  if (!ok) {
    return { ok: false, sentence: 'That could not be saved on this computer.', action: 'Try again in a moment.' };
  }
  return { ok: true, sentence: `Saved work will be signed ${String(name).trim()}.` };
}

/**
 * Let one folder send to GitHub as the account you are signed in as here.
 *
 * Found by pressing the button rather than by reasoning, which is the honest
 * way to report it. Signing in to GitHub with the helper does not, by itself,
 * let *saving* reach GitHub: the helper keeps its own token, while sending goes
 * out through whatever this computer keeps its passwords in — on Windows that is
 * the credential store, and if it has never been told about GitHub, every send
 * comes back as "not found", which reads like the project does not exist rather
 * than like a sign-in problem.
 *
 * The usual fix changes a setting for every folder on the computer. This sets it
 * for one folder — the folder the manager made — so nothing outside what the
 * manager put there is altered. Anything else can be fixed by pressing the
 * button that says so, which is the one place a global change gets asked for.
 */
export async function useOwnCredentials(dir) {
  return !!(await quiet(async () => {
    // The empty value first is the load-bearing line, and it is not obvious.
    // Helpers are a list, not a setting: whatever the computer already had is
    // asked first and wins, so adding ours to the end changes nothing at all —
    // which is exactly what happened, and it took a real push to find out.
    // An empty value clears the list; ours then stands alone for this folder.
    await git(dir, 'config', '--local', '--replace-all', 'credential.helper', '');
    await git(dir, 'config', '--local', '--add', 'credential.helper', '!gh auth git-credential');
    return true;
  }));
}

/** The same, for every folder, once and on purpose. */
export async function fixSendingEverywhere() {
  if (!(await haveGitHubTool())) return notSetUp;
  if (!(await who())) return notSignedIn;

  const done = await quiet(() => gh(['auth', 'setup-git']));
  if (!done) {
    return {
      ok: false,
      sentence: 'Sending could not be set up on this computer.',
      action: 'Try signing in to GitHub again first.',
    };
  }
  return {
    ok: true,
    sentence: 'This computer can now prove to GitHub that it is you, for every project.',
    action: 'Try sending again.',
  };
}

/** Does a failure to send look like a sign-in problem rather than a lost network? */
export async function sendingIsBlocked(dir) {
  const said = await quiet(async () => {
    try {
      await git(dir, 'push', '--dry-run');
      return '';
    } catch (e) { return String(e.stderr ?? e.message ?? ''); }
  }, '');
  return /not found|Authentication failed|could not read Username|403|denied/i.test(String(said));
}

// ---------------------------------------------------------------------------
// Where a project stands
// ---------------------------------------------------------------------------

/**
 * The full picture for one project — everything the more-options menu needs to
 * decide what it is honest to offer.
 */
export async function picture(dir) {
  const tracked = existsSync(join(dir, '.git'));
  if (!tracked) {
    return {
      tracked: false, shared: null, url: null, visibility: null,
      unsaved: 0, toSend: 0, toGet: 0, saves: 0, last: null, line: null,
    };
  }

  const p = { tracked: true };

  const status = await quiet(() => git(dir, 'status', '--porcelain'));
  p.unsaved = status ? status.stdout.split('\n').filter((l) => l.trim()).length : 0;

  const remote = await quiet(() => git(dir, 'remote', 'get-url', 'origin'));
  p.shared = remote ? remote.stdout.trim() || null : null;
  p.url = p.shared ? webAddress(p.shared) : null;

  const line = await quiet(() => git(dir, 'rev-parse', '--abbrev-ref', 'HEAD'));
  p.line = line ? line.stdout.trim() : null;

  const counts = await quiet(() => git(dir, 'rev-list', '--left-right', '--count', '@{upstream}...HEAD'));
  if (counts) {
    const [behind, ahead] = counts.stdout.trim().split(/\s+/).map(Number);
    p.toGet = behind;
    p.toSend = ahead;
  } else {
    // There may be a copy on GitHub, but this computer has never sent to it, so
    // we cannot say whether it is up to date. Saying nothing is better than
    // claiming "sent" and being wrong about where someone's work is.
    p.toGet = null;
    p.toSend = null;
  }

  const total = await quiet(() => git(dir, 'rev-list', '--count', 'HEAD'));
  p.saves = total ? Number(total.stdout.trim()) : 0;

  const last = await quiet(() => git(dir, 'log', '-1', '--format=%s%x1f%cr%x1f%an%x1f%cI'));
  if (last && last.stdout.trim()) {
    const [what, when, by, at] = last.stdout.trim().split('');
    p.last = { what, when, by, at };
  } else {
    p.last = null;
  }

  p.visibility = null;
  if (p.shared) {
    const v = await quiet(() => gh(['repo', 'view', '--json', 'visibility', '--jq', '.visibility'], { cwd: dir }));
    if (v) p.visibility = v.stdout.trim().toLowerCase() || null;
  }

  return p;
}

/** The web address of a shared copy, from however it was written down. */
export function webAddress(remote) {
  const s = String(remote).trim().replace(/\.git$/, '');
  const ssh = s.match(/^git@([^:]+):(.+)$/);
  if (ssh) return `https://${ssh[1]}/${ssh[2]}`;
  if (s.startsWith('http')) return s;
  return null;
}

/** What is different right now, in words a person can act on. */
export async function whatChanged(dir) {
  if (!existsSync(join(dir, '.git'))) return { ok: true, changes: [] };
  const status = await quiet(() => git(dir, 'status', '--porcelain'));
  if (!status) return { ok: true, changes: [] };

  const changes = [];
  for (const line of status.stdout.split('\n')) {
    if (!line.trim()) continue;
    const mark = line.slice(0, 2);
    const name = line.slice(3).trim();
    changes.push({ name, says: inWords(mark) });
  }
  return { ok: true, changes };
}

function inWords(mark) {
  if (mark.includes('?')) return 'new, never saved';
  if (mark.includes('D')) return 'deleted';
  if (mark.includes('R')) return 'renamed';
  if (mark.includes('A')) return 'added';
  return 'changed';
}

/** The recent saves, newest first. */
export async function history(dir, count = 20) {
  if (!existsSync(join(dir, '.git'))) return { ok: true, saves: [] };
  const out = await quiet(() => git(dir, 'log', `-${count}`, '--format=%h%x1f%s%x1f%cr%x1f%an'));
  if (!out) return { ok: true, saves: [] };
  const saves = out.stdout.trim().split('\n').filter(Boolean).map((l) => {
    const [ref, what, when, by] = l.split('');
    return { ref, what, when, by };
  });
  return { ok: true, saves };
}

// ---------------------------------------------------------------------------
// Things you can do
// ---------------------------------------------------------------------------

/** Save what is here, and do not send it anywhere. */
export async function saveOnly(dir, message) {
  if (!existsSync(join(dir, '.git'))) {
    const started = await quiet(() => git(dir, 'init', '-b', 'main'));
    if (!started) {
      return {
        ok: false,
        sentence: 'This folder could not be set up to keep a history.',
        action: 'Check you have permission to write here.',
      };
    }
  }

  const nameSet = (await identity()).name;
  if (!nameSet) {
    return {
      ok: false,
      sentence: 'Saved work has to be signed with a name, and none is set on this computer.',
      action: 'Put your name and email behind the account button at the bottom left, then save.',
    };
  }

  const added = await quiet(async () => {
    await git(dir, 'add', '--all');
    return true;
  });
  if (!added) {
    return {
      ok: false,
      sentence: 'Your changes could not be gathered up.',
      action: 'Check that the files here are not open somewhere else.',
    };
  }

  const pending = await quiet(() => git(dir, 'status', '--porcelain'));
  if (!pending?.stdout.trim()) {
    return { ok: true, saved: false, sentence: 'There was nothing new to save.' };
  }

  const done = await quiet(() => git(dir, 'commit', '--quiet', '--no-verify', '-m', message || 'Work from today'));
  if (!done) {
    return {
      ok: false,
      sentence: 'Your changes could not be saved.',
      action: 'Check that the files here are not open somewhere else.',
    };
  }
  return { ok: true, saved: true, sentence: 'Saved on this computer.' };
}

/**
 * Bring down whatever your other computers have sent.
 *
 * Refuses while you have unsaved work, because bringing other work in on top of
 * yours is exactly the way people lose an afternoon.
 */
export async function getLatest(dir) {
  const p = await picture(dir);
  if (!p.tracked) {
    return { ok: false, sentence: 'This folder does not keep a history yet.', action: 'Save it once first.' };
  }
  if (!p.shared) {
    return {
      ok: false,
      sentence: 'This project has no copy on GitHub to get anything from.',
      action: 'Make one first.',
    };
  }
  if (p.unsaved > 0) {
    return {
      ok: false,
      sentence: 'You have work here that is not saved yet, so nothing was brought in.',
      action: 'Save your work first, then get the latest.',
    };
  }

  const done = await quiet(() => git(dir, 'pull', '--rebase', '--quiet'));
  if (!done) {
    return {
      ok: false,
      sentence: 'The latest could not be brought in — your work and the shared copy disagree about the same lines.',
      action: 'Open the project in an AI app and ask it to sort the two versions out.',
    };
  }

  const after = await picture(dir);
  const got = after.saves - p.saves;
  return {
    ok: true,
    sentence: got > 0
      ? `Brought in ${got === 1 ? 'one saved change' : `${got} saved changes`} from your other computers.`
      : 'You already had everything.',
  };
}

/** Put a copy of this project on GitHub for the first time. */
export async function makeCopy(dir, { visibility = 'private' } = {}) {
  if (!(await haveGitHubTool())) return notSetUp;
  if (!(await who())) return notSignedIn;

  const p = await picture(dir);
  if (p.shared) {
    return {
      ok: false,
      sentence: 'This project already has a copy on GitHub.',
      action: 'Send your work to it instead.',
    };
  }
  if (!p.tracked) {
    const first = await saveOnly(dir, 'First save');
    if (!first.ok) return first;
  }

  const made = await quiet(() => gh(
    ['repo', 'create', basename(dir), visibility === 'public' ? '--public' : '--private',
      '--source', '.', '--remote', 'origin'],
    { cwd: dir },
  ));
  if (made) await useOwnCredentials(dir);
  if (!made) {
    return {
      ok: false,
      sentence: 'A copy on GitHub could not be made.',
      action: 'A project of that name may already be on your account — pick another name for the folder.',
    };
  }
  return {
    ok: true,
    sentence: visibility === 'public'
      ? 'This project now has a copy on GitHub that anyone can see.'
      : 'This project now has a copy on GitHub that only you can see.',
  };
}

/** Who else can see this. */
export async function setVisibility(dir, visibility) {
  if (!(await haveGitHubTool())) return notSetUp;
  const want = visibility === 'public' ? 'public' : 'private';

  const done = await quiet(() => gh(
    ['repo', 'edit', '--visibility', want, '--accept-visibility-change-consequences'],
    { cwd: dir },
  ));
  if (!done) {
    return {
      ok: false,
      sentence: 'Who can see this project could not be changed.',
      action: 'Check you are signed in as the account that owns it.',
    };
  }
  return {
    ok: true,
    sentence: want === 'public'
      ? 'Anyone can now see this project on GitHub.'
      : 'Only you can now see this project on GitHub.',
  };
}

/**
 * Take back the last save.
 *
 * Only ever the one still on this computer, and the files are left exactly as
 * they are — this undoes the act of saving, never the work. Once something has
 * gone to GitHub other people may have it, and taking it back from them is not
 * something this manager will do behind your back.
 */
export async function undoLastSave(dir) {
  const p = await picture(dir);
  if (!p.tracked || p.saves === 0) {
    return { ok: false, sentence: 'There is nothing saved here to take back.', action: 'Save something first.' };
  }
  if (p.shared && p.toSend !== null && p.toSend < 1) {
    return {
      ok: false,
      sentence: 'That save has already gone to GitHub, so taking it back here would leave the two out of step.',
      action: 'Change what you want and save again instead.',
    };
  }
  if (p.saves === 1) {
    return {
      ok: false,
      sentence: 'That is the only save this project has, and taking it back would leave nothing behind it.',
      action: 'Change what you want and save again instead.',
    };
  }

  const done = await quiet(() => git(dir, 'reset', '--soft', 'HEAD~1'));
  if (!done) {
    return { ok: false, sentence: 'The last save could not be taken back.', action: 'Try again in a moment.' };
  }
  return { ok: true, sentence: 'The last save is taken back. Every file is exactly as you left it.' };
}

/** Every project on your GitHub account, so one can be brought down here. */
export async function myProjects({ limit = 100 } = {}) {
  if (!(await haveGitHubTool())) return { ok: false, ...notSetUp, projects: [] };
  if (!(await who())) return { ok: false, ...notSignedIn, projects: [] };

  const out = await quiet(() => gh([
    'repo', 'list', '--limit', String(limit), '--json',
    'name,description,visibility,updatedAt,url,isFork',
  ]));
  if (!out) {
    return {
      ok: false,
      sentence: 'Your projects on GitHub could not be listed.',
      action: 'Check you are online, then try again.',
      projects: [],
    };
  }
  try {
    const projects = JSON.parse(out.stdout)
      // The workspace is the manager's own bookkeeping. Offering it as
      // something to work on would be the app pointing at its own filing.
      .filter((r) => r.name !== 'viberant-workspace')
      .map((r) => ({
      name: r.name,
      about: r.description ?? null,
      visibility: String(r.visibility ?? '').toLowerCase(),
      changed: r.updatedAt,
      url: r.url,
      copied: !!r.isFork,
    }));
    return { ok: true, projects };
  } catch {
    return { ok: false, sentence: 'Your projects on GitHub could not be read.', action: 'Try again in a moment.', projects: [] };
  }
}

/** Bring a project down from GitHub onto this computer. */
export async function bringDown({ url, into }) {
  if (!(await haveGitHubTool())) return notSetUp;
  const name = basename(String(url).replace(/\.git$/, ''));
  const target = join(into, name);
  if (existsSync(target)) {
    return {
      ok: false,
      sentence: `There is already a folder called ${name} in there.`,
      action: 'Pick a different folder to put it in.',
    };
  }

  const done = await quiet(() => gh(['repo', 'clone', String(url), target]));
  if (done) await useOwnCredentials(target);
  if (!done) {
    return {
      ok: false,
      sentence: `${name} could not be brought down to this computer.`,
      action: 'Check you are online and that the account you are signed in as can see it.',
    };
  }
  return { ok: true, path: target, sentence: `${name} is now on this computer.` };
}
