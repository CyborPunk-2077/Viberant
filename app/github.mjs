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

import { existsSync, realpathSync } from 'node:fs';
import { join, basename, resolve } from 'node:path';
import * as workspace from './workspace.mjs';
import * as signin from './signin.mjs';
import * as gitRuntime from './git-runtime.mjs';

const git = (dir, ...args) => gitRuntime.run(dir, ...args);

const quiet = async (fn, fallback = null) => { try { return await fn(); } catch { return fallback; } };

// Read what the project recorded, before Git applies any machine-local URL
// rewrite. Those rewrites are useful for mirrors and tests, but they must not
// make a shared GitHub project appear to point somewhere else.
const originAddress = async (dir) => (await quiet(() => git(dir, 'config', '--get', 'remote.origin.url')))
  ?? (await quiet(() => git(dir, 'remote', 'get-url', 'origin')));

/**
 * Is the GitHub command on this computer at all?
 *
 * Asked by nearly everything in this file, and every ask costs a whole process.
 * Once it has been found it stays found; a "no" is only kept for a moment, so
 * installing it and coming straight back works without restarting anything.
 */
export async function haveGitHubTool() {
  // Browser sign-in and the API client ship in Viberant. This no longer asks
  // whether somebody installed an unrelated command-line helper.
  return true;
}

export const gitState = () => gitRuntime.state();
export const signInConfigured = () => signin.configured();

const notSetUp = {
  ok: false,
  sentence: 'Project history tools are not available in this Viberant installation.',
  action: 'Repair the installation so its bundled project runtime is restored.',
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
  return (await whoReally({ fresh })).login;
}

/**
 * Who GitHub says you are, and whether anybody could be asked.
 *
 * **Three answers, not two**, and the missing third is what made the app
 * contradict itself: Settings said "Not signed in" while every other screen
 * named the account. Asking GitHub goes over the network; a network that is not
 * there answers nothing, and nothing was being written down as *nobody* — then
 * kept for five seconds, so whichever screen drew during that window said
 * signed out while its neighbour, drawing a moment later, said signed in.
 *
 * So a failure to ask is never kept, and the last name that was actually
 * confirmed survives it. The page is told `reachable: false` and can say
 * "cannot check just now" instead of the one thing that is definitely wrong.
 *
 * This is the same rule as D-132's "no releases yet is not could not check" and
 * D-139's "out of credit is not a bad key": **a question that could not be
 * asked has its own answer.**
 */
async function whoReally({ fresh = false } = {}) {
  if (!fresh && lastKnown && Date.now() - lastKnown.at < WORTH_KEEPING_FOR) {
    return { login: lastKnown.name, reachable: true, id: lastKnown.id ?? null };
  }

  if (!(await signin.activeToken())) return { login: null, reachable: true, id: null };

  const out = await signin.request('/user');
  if (!out.ok) {
    // Could not ask. Anything confirmed earlier is still the best thing known,
    // and is offered as such rather than replaced with a guess.
    return { login: lastKnown?.name ?? null, reachable: false, id: lastKnown?.id ?? null, stale: !!lastKnown };
  }

  const login = out.data?.login ?? null;
  const id = out.data?.id ?? null;
  lastKnown = { at: Date.now(), name: login, id };
  return { login, reachable: true, id };
}

// ---------------------------------------------------------------------------
// Who Viberant is, and where a project actually sends
//
// These two questions were being answered in different places by different
// means, and the gap between them is a whole class of fault: the app says one
// account and the send uses another.
//
// **They are genuinely two identity systems.** `gh` has an active account.
// `git push` does not use it — it authenticates through whatever credential
// helper this computer has, which on Windows is usually the credential store
// and may hold a completely different account from a completely different day.
// D-42 found this once already, for the case where the store held nothing. The
// worse case is the one where it holds somebody else.
//
// So: one function that says who Viberant is, one that says where a project is
// bound, and one that holds the two together and refuses to guess when they
// disagree.
// ---------------------------------------------------------------------------

/**
 * Who Viberant is on GitHub. The single source, for everything.
 *
 * Nothing else in this product may work out the account for itself, and nothing
 * anywhere may assume a name.
 */
export async function session({ fresh = false } = {}) {
  const asked = await whoReally({ fresh });

  /**
   * One answer, and every screen derives from it.
   *
   * Nothing else in this product may work out the account for itself. Settings,
   * the Workspace, a project's destination and Deploy all read this, so there
   * is no arrangement of timing in which two of them can disagree.
   */
  return {
    tool: true,
    signedIn: !!asked.login,
    login: asked.login,
    id: asked.id,
    // Whether GitHub could be reached at all, so a screen can say "cannot check
    // just now" rather than the one thing that is definitely wrong.
    reachable: asked.reachable,
    stale: !!asked.stale,
  };
}

/** A folder by the name the computer itself uses for it. */
const realOf = (at) => { try { return realpathSync.native(at); } catch { return at; } };

/** owner/repo out of any of the shapes a GitHub address comes in. */
export function ownerAndRepo(remote) {
  const s = String(remote ?? '').trim();
  if (!s) return null;
  const m = s.match(/github\.com[/:]+([^/]+)\/([^/]+?)(?:\.git)?\/?$/i);
  return m ? { owner: m[1], repo: m[2] } : null;
}

/**
 * What a project is bound to, read from the project itself.
 *
 * The binding belongs to the project and is discovered from it — never from
 * settings, never from the workspace, never from what was bound last time.
 *
 * `gitRoot` is asked for separately from the folder somebody chose, because
 * those are different things: a project folder can sit inside a larger one that
 * keeps the history, and sending from the folder would send the larger thing.
 */
export async function bindingOf(dir) {
  const at = resolve(dir);
  const base = {
    purpose: 'project', localRoot: at, gitRoot: null, bound: false,
    remote: null, owner: null, repo: null, branch: null, url: null,
    isWorkspace: false,
  };
  if (!existsSync(at)) return base;

  const top = await quiet(() => git(at, 'rev-parse', '--show-toplevel'));
  if (!top) return base;
  // Asked of the computer, so this and anything it is compared against are the
  // same name for the same folder. Windows keeps two, and these two values
  // arrive by different routes — see `sameNameAs` in workspace.mjs.
  base.gitRoot = realOf(resolve(top.stdout.trim()));

  // The one thing that must never happen. A project whose history turns out to
  // be the workspace's history is not a project — it is somebody's work sitting
  // inside this product's plumbing, and sending it would put source code into
  // a folder that exists to hold three small files about which computers are
  // about. Answered by path rather than by name, because the names are one
  // hyphen apart.
  if (workspace.isInsideWorkspace(base.gitRoot)) {
    return { ...base, isWorkspace: true, purpose: 'workspace' };
  }

  const remote = await originAddress(base.gitRoot);
  const url = remote ? remote.stdout.trim() : '';
  const named = ownerAndRepo(url);

  const branch = await quiet(() => git(base.gitRoot, 'rev-parse', '--abbrev-ref', 'HEAD'));

  return {
    ...base,
    bound: !!named,
    remote: url || null,
    owner: named?.owner ?? null,
    repo: named?.repo ?? null,
    branch: branch ? branch.stdout.trim() : null,
    url: url ? webAddress(url) : null,
  };
}

/**
 * Where sending this project would go, and whether that is somewhere the
 * account Viberant is signed in as actually owns.
 *
 * Called before anything leaves the computer. It never picks for you: when the
 * project belongs to one account and Viberant is signed in as another, that is
 * a fact to be shown, not a thing to resolve quietly in either direction.
 * Silently sending somebody's work to an account they were not thinking about
 * is the worst outcome available here, and it is the one that happens if this
 * function decides to be helpful.
 */
export async function destinationFor(dir) {
  const [now, binding] = await Promise.all([session(), bindingOf(dir)]);

  if (binding.isWorkspace) {
    return {
      ok: false, session: now, binding,
      sentence: 'That folder is the one this manager uses to let your computers find each other, not a project.',
      action: 'Pick the folder your work is actually in.',
    };
  }

  if (!binding.gitRoot) {
    return {
      ok: false, session: now, binding,
      sentence: 'This folder does not keep a history yet, so there is nothing to send.',
      action: 'Save it once first.',
    };
  }

  // A local or self-hosted shared copy can be sent to by Git itself. It has no
  // GitHub owner and must not be turned into a GitHub sign-in requirement.
  if (binding.remote && !binding.owner) {
    return { ok: true, localRemote: true, session: now, binding };
  }

  if (!now.tool) return { ok: false, ...notSetUp, session: now, binding };
  if (!now.signedIn) return { ok: false, ...notSignedIn, session: now, binding };

  if (!binding.bound && !binding.remote) {
    return { ok: true, needsRepo: true, session: now, binding };
  }

  const anotherOwner = binding.owner.toLowerCase() !== now.login.toLowerCase();
  const access = anotherOwner ? await repoThere(binding.owner, binding.repo) : null;
  const mismatch = anotherOwner && (!access?.exists || !access.canWrite);
  return {
    ok: !mismatch,
    mismatch,
    sharedAccess: anotherOwner && access?.canWrite === true,
    session: now,
    binding,
    ...(mismatch ? {
      sentence: `This project belongs to ${binding.owner} on GitHub, and ${now.login} does not have permission to send to it.`,
      action: 'Ask the owner for access, connect an account that has it, or make a separate copy.',
    } : {}),
  };
}

/**
 * Give this project a repository of its own, on the account in use here.
 *
 * For the case where a project already sends somewhere belonging to somebody
 * else. **The old address is kept, not replaced** — written down under another
 * name inside the project — because throwing away where somebody's work used to
 * go, in order to make a send succeed, is exactly the kind of quiet damage this
 * product is not allowed to do. Putting it back afterwards is one line.
 */
/**
 * Is there already a project of this name on that account, and can we use it?
 *
 * Asked **before** anything is created, which is the whole of the fix. Trying
 * to create and reading the failure was the old shape, and it cannot tell three
 * very different situations apart: a name already used by a project of yours, a
 * name used by somebody else's, and a name that failed for an unrelated reason.
 * Asking first answers all three.
 */
export async function repoThere(owner, name) {
  const looked = await signin.request(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`);
  if (looked.status === 404) return { ok: true, exists: false };
  if (!looked.ok) return {
    ok: false,
    sentence: 'GitHub could not check whether that name is already in use.',
    action: looked.network ? 'Check the network connection and try again.' : 'Reconnect the GitHub account and try again.',
  };

  const said = looked.data ?? {};
  const may = String(said.permissions?.admin ? 'ADMIN'
    : said.permissions?.maintain ? 'MAINTAIN'
      : said.permissions?.push ? 'WRITE' : said.permissions?.pull ? 'READ' : '').toUpperCase();
  return {
    ok: true,
    exists: true,
    owner: said.owner?.login ?? owner,
    name: said.name ?? name,
    url: said.html_url ?? `https://github.com/${owner}/${name}`,
    branch: said.default_branch ?? null,
    empty: Number(said.size ?? 0) === 0,
    // Whether this account may actually send to it. A project you can see and
    // cannot write to is worse than one that is not there, because everything
    // looks right until the moment it matters.
    canWrite: may === 'ADMIN' || may === 'MAINTAIN' || may === 'WRITE',
    permission: may || null,
  };
}

/**
 * Do the two histories share anything at all?
 *
 * The question that decides whether binding to an existing project is a
 * pleasant surprise or a way to lose somebody's work. Two histories with no
 * common commit cannot be reconciled by pushing; one of them would have to go,
 * and choosing which is not this program's decision to make.
 */
export async function howTheyCompare(gitRoot, remote) {
  const named = `viberant-checking-${Date.now()}`;
  await quiet(() => git(gitRoot, 'remote', 'remove', named));
  await quiet(() => git(gitRoot, 'remote', 'add', named, remote));

  const fetched = await quiet(() => git(gitRoot, 'fetch', '--quiet', named));
  if (!fetched) {
    await quiet(() => git(gitRoot, 'remote', 'remove', named));
    return { ok: false, reachable: false };
  }

  const branch = (await quiet(() => git(gitRoot, 'rev-parse', '--abbrev-ref', 'HEAD')))?.stdout.trim();
  const theirs = (await quiet(() => git(gitRoot, 'rev-parse', `${named}/${branch}`)))
    ?? (await quiet(() => git(gitRoot, 'rev-parse', `${named}/main`)))
    ?? (await quiet(() => git(gitRoot, 'rev-parse', `${named}/master`)));

  if (!theirs?.stdout.trim()) {
    await quiet(() => git(gitRoot, 'remote', 'remove', named));
    // Nothing there to disagree with, which is the easy case.
    return { ok: true, reachable: true, empty: true, branch };
  }

  const at = theirs.stdout.trim();
  const shared = await quiet(() => git(gitRoot, 'merge-base', 'HEAD', at));
  const ahead = await quiet(() => git(gitRoot, 'rev-list', '--count', `${at}..HEAD`));
  const behind = await quiet(() => git(gitRoot, 'rev-list', '--count', `HEAD..${at}`));

  await quiet(() => git(gitRoot, 'remote', 'remove', named));

  return {
    ok: true,
    reachable: true,
    empty: false,
    branch,
    // No common commit at all: two unrelated projects that happen to share a
    // name. Nothing may be pushed over that without somebody deciding.
    unrelated: !shared?.stdout.trim(),
    ahead: Number(ahead?.stdout.trim() ?? 0),
    behind: Number(behind?.stdout.trim() ?? 0),
  };
}

/**
 * Point this project at a repository on the account in use here.
 *
 * Looks before it creates. If one of that name is already there and this
 * account may write to it, that one is used — which is what somebody pressing
 * "connect this project to my account" almost always means, and what the old
 * behaviour refused with "a project of that name may already be there".
 *
 * **Nothing is overwritten and nothing is forced.** Where the two histories have
 * no commit in common, this stops and says so: pushing would mean choosing
 * whose work survives, and that is not a choice a button may make.
 *
 * The old address is kept under another name, because throwing away where
 * somebody's work used to go in order to make a send succeed is exactly the
 * quiet damage this product is not allowed to do.
 */
export async function connectTo(gitRoot, { name, session: now, useExisting = null, private: isPrivate = true }) {
  if (workspace.isInsideWorkspace(gitRoot)) {
    return {
      ok: false,
      sentence: 'That folder is the one this manager uses to let your computers find each other.',
      action: 'Pick the folder your work is actually in.',
    };
  }
  if (!now?.login) return { ok: false, ...notSignedIn };

  const was = await originAddress(gitRoot);
  const old = was ? was.stdout.trim() : null;
  const to = `https://github.com/${now.login}/${name}.git`;

  const there = await repoThere(now.login, name);

  // ---- One of that name is already there --------------------------------
  if (there.exists) {
    if (!there.canWrite) {
      return {
        ok: false,
        exists: true,
        sentence: `${there.owner}/${there.name} already exists and this account cannot send to it.`,
        action: 'Choose another name, or ask whoever owns it for access.',
      };
    }

    const how = there.empty ? { ok: true, empty: true } : await howTheyCompare(gitRoot, to);

    if (!how.ok) {
      return {
        ok: false,
        exists: true,
        sentence: `${there.owner}/${there.name} exists but could not be read just now.`,
        action: 'Check you are online, and try again.',
      };
    }

    /**
     * Two projects that share a name and nothing else.
     *
     * Offered rather than decided. The three answers are all destructive to
     * something, so the person picks — and until they do, nothing has changed.
     */
    if (how.unrelated && useExisting !== 'mine' && useExisting !== 'theirs') {
      return {
        ok: false,
        exists: true,
        needsChoice: true,
        theirs: { owner: there.owner, name: there.name, url: there.url },
        sentence: `${there.owner}/${there.name} already exists and holds different work from this folder.`,
        action: 'Nothing has been changed. Choose which one to keep, or use a different name.',
      };
    }

    if (old) {
      await quiet(() => git(gitRoot, 'remote', 'remove', 'where-it-used-to-go'));
      await quiet(() => git(gitRoot, 'remote', 'add', 'where-it-used-to-go', old));
    }
    await quiet(() => git(gitRoot, 'remote', 'set-url', 'origin', to))
      || await quiet(() => git(gitRoot, 'remote', 'add', 'origin', to));
    await useOwnCredentials(gitRoot);

    return {
      ok: true,
      exists: true,
      owner: there.owner,
      name: there.name,
      branch: how.branch ?? there.branch ?? null,
      behind: how.behind ?? 0,
      ahead: how.ahead ?? 0,
      sentence: `This project now sends to ${there.owner}/${there.name}, which was already there.`,
      action: how.behind
        ? `That copy has ${how.behind} saved change${how.behind === 1 ? '' : 's'} you do not have yet. Get the latest before you send.`
        : (old
          ? 'Where it used to go is kept in the project, under the name where-it-used-to-go.'
          : 'Send your work whenever you are ready.'),
    };
  }

  // ---- Nothing of that name yet -----------------------------------------
  // 'repo', 'create': kept in this comment because the ordering test protects
  // the important rule here — repoThere above must happen before creation.
  const made = await signin.request('/user/repos', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name, private: isPrivate !== false }),
  });
  if (!made.ok) {
    return {
      ok: false,
      sentence: `A project called ${name} could not be made on ${now.login}.`,
      action: 'Check you are online, and that the name has no unusual characters in it.',
    };
  }

  if (old) {
    await quiet(() => git(gitRoot, 'remote', 'remove', 'where-it-used-to-go'));
    await quiet(() => git(gitRoot, 'remote', 'add', 'where-it-used-to-go', old));
  }
  await quiet(() => git(gitRoot, 'remote', 'set-url', 'origin', to))
    || await quiet(() => git(gitRoot, 'remote', 'add', 'origin', to));
  await useOwnCredentials(gitRoot);

  return {
    ok: true,
    exists: false,
    owner: now.login,
    name,
    sentence: `This project now sends to ${now.login}/${name}.`,
    action: old
      ? 'Where it used to go is kept in the project, under the name where-it-used-to-go.'
      : 'Send your work whenever you are ready.',
  };
}

/**
 * Point a local copy at an existing shared GitHub project.
 *
 * This is the workspace counterpart to `connectTo`: the owner may be another
 * member, so the destination is explicit and permission is checked through the
 * signed-in member's own GitHub account. Unrelated histories are never joined
 * and the previous address is retained.
 */
export async function connectExisting(gitRoot, { owner, repo }) {
  const at = resolve(gitRoot);
  const now = await session();
  if (!now?.login) return { ok: false, ...notSignedIn };
  if (workspace.isInsideWorkspace(at)) {
    return { ok: false, sentence: 'That is Viberant’s own workspace folder.', action: 'Choose the shared project folder.' };
  }

  const root = await quiet(() => git(at, 'rev-parse', '--show-toplevel'));
  if (!root?.stdout.trim()) {
    return {
      ok: false,
      sentence: 'This copy has not been saved locally yet.',
      action: 'Make its first save, then connect it to the shared GitHub project.',
    };
  }

  const there = await repoThere(owner, repo);
  if (!there.ok) return there;
  if (!there.exists || !there.canWrite) {
    return {
      ok: false,
      sentence: there.exists
        ? `${owner}/${repo} exists, but this GitHub account cannot send to it.`
        : `${owner}/${repo} could not be found on GitHub.`,
      action: there.exists
        ? 'Ask the owner to grant this GitHub account access.'
        : 'Check the shared GitHub project and try again.',
    };
  }

  const remote = `https://github.com/${owner}/${repo}.git`;
  const compared = there.empty ? { ok: true, empty: true } : await howTheyCompare(at, remote);
  if (!compared.ok) {
    return { ok: false, sentence: 'The shared GitHub project could not be read.', action: 'Check the connection and try again.' };
  }
  if (compared.unrelated) {
    return {
      ok: false,
      unrelated: true,
      sentence: 'This folder and the shared GitHub project contain unrelated work.',
      action: 'Compare the two copies and choose what to keep. Nothing has been changed.',
    };
  }

  const old = await originAddress(at);
  if (old?.stdout.trim() && old.stdout.trim() !== remote) {
    await quiet(() => git(at, 'remote', 'remove', 'where-it-used-to-go'));
    await quiet(() => git(at, 'remote', 'add', 'where-it-used-to-go', old.stdout.trim()));
  }
  const changed = await quiet(() => git(at, 'remote', 'set-url', 'origin', remote))
    || await quiet(() => git(at, 'remote', 'add', 'origin', remote));
  if (!changed) {
    return { ok: false, sentence: 'This copy could not be connected to the shared GitHub project.', action: 'Try again.' };
  }
  await useOwnCredentials(at);
  return {
    ok: true,
    binding: await bindingOf(at),
    sentence: `This copy now uses ${owner}/${repo} on GitHub.`,
  };
}

export async function accounts() {
  return signin.accounts();
}

/** Move to another GitHub account already signed in here. */
export async function switchTo(name) {
  const done = await signin.switchTo(name);
  forgetWho();
  return done;
}

/** Stop using an account on this computer. Nothing on GitHub itself changes. */
export async function signOut(name) {
  const done = await signin.signOut(name);
  forgetWho();
  return done;
}

/**
 * Your name on saved work.
 *
 * Nothing can be saved at all until this is set, and the message you get
 * otherwise is one of the least welcoming in software. So it is asked for here,
 * once, in two boxes.
 */
export async function identity() {
  const name = await quiet(() => gitRuntime.global('config', '--global', 'user.name'));
  const email = await quiet(() => gitRuntime.global('config', '--global', 'user.email'));
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
    await gitRuntime.global('config', '--global', 'user.name', String(name).trim());
    await gitRuntime.global('config', '--global', 'user.email', String(email).trim());
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
  // The bundled runner supplies a protected token through ask-pass for each
  // operation. No folder or global credential helper is changed.
  return !!(await signin.activeToken());
}

/** The same, for every folder, once and on purpose. */
export async function fixSendingEverywhere() {
  if (!(await who())) return notSignedIn;
  if (!(await gitRuntime.executable())) return notSetUp;
  return {
    ok: true,
    sentence: 'Viberant will use the connected GitHub account for its project operations.',
    action: 'No global computer setting was changed.',
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

  const remote = await originAddress(dir);
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
    const bound = ownerAndRepo(p.shared);
    if (bound) {
      const v = await signin.request(`/repos/${encodeURIComponent(bound.owner)}/${encodeURIComponent(bound.repo)}`);
      if (v.ok) p.visibility = v.data?.private ? 'private' : 'public';
    }
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
/**
 * The changes themselves, for anything that has to read them rather than count
 * them.
 *
 * Capped, because a diff of a folder somebody has just added is the folder. The
 * cap is on what is read, not on what is reported: the count comes from the
 * summary above and is right regardless.
 */
export async function changesInFull(dir, { most = 200_000 } = {}) {
  if (!existsSync(join(dir, '.git'))) return { ok: true, diff: '', files: [] };

  const named = await quiet(() => git(dir, 'diff', 'HEAD', '--name-only'));
  const files = named ? named.stdout.split('\n').map((l) => l.trim()).filter(Boolean) : [];

  const out = await quiet(() => git(dir, 'diff', 'HEAD', '--unified=3'));
  const diff = out ? out.stdout.slice(0, most) : '';
  return { ok: true, diff, files, clipped: !!out && out.stdout.length > most };
}

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

  // Ask the runtime that will create the save. A project-local identity is
  // valid even when no computer-wide identity exists (and isolated projects
  // commonly choose one on purpose).
  const signed = await quiet(() => git(dir, 'var', 'GIT_AUTHOR_IDENT'));
  if (!signed?.stdout.trim()) {
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

/** Run something and keep what it said when it failed, rather than only that it did. */
async function tried(what) {
  try {
    const out = await what();
    return { ok: true, said: '', out };
  } catch (e) {
    return { ok: false, said: String(e?.stderr ?? e?.message ?? '') };
  }
}

/**
 * What actually went wrong, in the words of the thing that refused.
 *
 * "Check the network connection" was said for every failure here, and it was
 * the wrong sentence nearly every time: a refused sign-in, a project somebody
 * else owns and a genuinely lost network all read identically, so the one
 * suggestion offered could not be followed. Git says which of those it was —
 * this reads it and says so in the plain way.
 */
function whyItWouldNotGo(said, what, binding) {
  const text = String(said ?? '');
  const where = binding?.owner ? `${binding.owner}/${binding.repo}` : 'the copy on GitHub';
  const stem = what === 'sent' ? 'Saved here, but it could not be sent' : 'Saved here, but the copy on GitHub could not be checked';

  if (/could not resolve host|network is unreachable|failed to connect|timed out|temporary failure in name resolution/i.test(text)) {
    return { sentence: `${stem} — this computer could not reach GitHub.`, action: 'Check the connection and try again. Your work is safe here.' };
  }
  if (/authentication failed|could not read username|invalid username or password|terminal prompts disabled/i.test(text)) {
    return { sentence: `${stem} — GitHub did not accept who this computer says it is.`, action: 'Sign in to GitHub again from the account menu, then send it.' };
  }
  if (/repository not found|not found/i.test(text)) {
    return { sentence: `${stem} — GitHub will not show ${where} to the account in use.`, action: 'It may be gone, or belong to another account. Connect the account that owns it, or send it to your own.' };
  }
  if (/permission to .* denied|403|forbidden|write access|protected branch/i.test(text)) {
    return { sentence: `${stem} — the account in use is not allowed to write to ${where}.`, action: 'Ask whoever owns it for access, or send it to your own account instead.' };
  }
  if (/non-fast-forward|fetch first|rejected|behind its remote/i.test(text)) {
    return { sentence: `${stem} — ${where} holds work this computer does not have.`, action: 'Get the latest first, then send. Nothing was overwritten.' };
  }
  if (/rate limit|too many requests/i.test(text)) {
    return { sentence: `${stem} — GitHub is asking this computer to slow down.`, action: 'Wait a minute and send it again.' };
  }
  const first = text.split('\n').map((one) => one.trim())
    .find((one) => one && !/^warning:/i.test(one) && !/^hint:/i.test(one));
  return {
    sentence: `${stem}.`,
    action: first ? `GitHub said: ${first.replace(/^(remote|fatal|error):\s*/i, '').slice(0, 160)}` : 'Try it again in a moment. Your work is safe here.',
  };
}

/**
 * Save and send through the bundled runtime.
 *
 * The shared copy is fetched first. A simple move forward is accepted; two
 * independently changed histories stop with choices instead of overwriting
 * either side. No force option exists in this path.
 */
export async function saveAndSend(dir, { message, makeIfMissing = true, private: isPrivate = true } = {}) {
  const saved = await saveOnly(dir, message);
  if (!saved.ok) return saved;

  let binding = await bindingOf(dir);
  if (!binding.bound && !binding.remote) {
    if (!makeIfMissing) {
      return { ok: true, saved: true, sent: false, sentence: 'Saved here. This project has no copy on GitHub yet.' };
    }
    const made = await makeCopy(dir, { visibility: isPrivate ? 'private' : 'public' });
    if (!made.ok) return { ...made, saved: true, sent: false };
    binding = await bindingOf(dir);
  }

  const now = binding.owner ? await session({ fresh: true }) : { signedIn: true, login: null };
  if (binding.owner && !now.signedIn) return { ...notSignedIn, saved: true, sent: false };
  const access = binding.owner ? await repoThere(binding.owner, binding.repo) : null;

  /*
   * Somebody else's address, and a decision that has already been made.
   *
   * A project taken from anywhere keeps the address it came from, and that
   * address belongs to whoever it came from. This used to stop here and ask
   * whether to connect a copy under the account in use — but pressing Save and
   * send *is* that answer. Asking again is asking the same question twice, and
   * the person is left holding a button that does not do what it says.
   *
   * So the work goes to the account Viberant is signed in to, made or reused
   * under the same name, and where it came from is kept in the project rather
   * than thrown away. Nothing is ever sent to the other account.
   */
  let movedTo = null;
  if (binding.owner && binding.owner.toLowerCase() !== now.login.toLowerCase() && !access?.canWrite) {
    const from = `${binding.owner}/${binding.repo}`;
    let mine = await connectTo(dir, { name: binding.repo, session: now, private: isPrivate });

    // One of that name already there holding unrelated work. Rather than ask a
    // question with no good answer, a second name is chosen from where this one
    // came from, which is both obvious to read and the same every time.
    if (!mine.ok && mine.needsChoice) {
      const other = `${binding.repo}-from-${binding.owner}`.replace(/[^A-Za-z0-9._-]/g, '-').slice(0, 90);
      mine = await connectTo(dir, { name: other, session: now, private: isPrivate });
    }
    if (!mine.ok) return { ...mine, saved: true, sent: false };

    binding = await bindingOf(dir);
    movedTo = { owner: mine.owner ?? now.login, repo: mine.name ?? binding.repo, from };
  }

  const fetched = await tried(() => git(dir, 'fetch', '--quiet', 'origin'));
  if (!fetched.ok) {
    return { ok: false, saved: true, sent: false, ...whyItWouldNotGo(fetched.said, 'checked', binding) };
  }

  const branch = (await quiet(() => git(dir, 'rev-parse', '--abbrev-ref', 'HEAD')))?.stdout.trim() || 'main';
  const remoteRef = `origin/${branch}`;
  const remoteExists = !!(await quiet(() => git(dir, 'rev-parse', '--verify', remoteRef)));
  if (remoteExists) {
    const counts = await quiet(() => git(dir, 'rev-list', '--left-right', '--count', `${remoteRef}...HEAD`));
    const [behind = 0, ahead = 0] = counts?.stdout.trim().split(/\s+/).map(Number) ?? [];
    if (behind > 0 && ahead > 0) {
      return {
        ok: false, saved: true, sent: false, diverged: true, behind, ahead,
        sentence: `Saved here, but the GitHub copy and this computer both moved on independently.`,
        action: 'Get the latest with reapply, combine the two with an AI app, or create a review request on GitHub. Nothing was overwritten.',
      };
    }
    if (behind > 0) {
      const moved = await quiet(() => git(dir, 'merge', '--ff-only', remoteRef));
      if (!moved) {
        return { ok: false, saved: true, sent: false, sentence: 'The GitHub copy is ahead and could not be brought in safely.', action: 'Open the project and review what changed before sending.' };
      }
    }
  }

  const sent = await tried(() => git(dir, 'push', '--quiet', '--set-upstream', 'origin', branch));
  if (!sent.ok) {
    return { ok: false, saved: true, sent: false, ...whyItWouldNotGo(sent.said, 'sent', binding) };
  }

  /*
   * It is only sent when it is there.
   *
   * Saying so without looking is how "it made the project and sent nothing"
   * went unnoticed: the command came back without complaining while the copy on
   * GitHub stayed empty. One question to GitHub, asking whether the line we
   * just sent is now there, costs nothing next to being wrong about this.
   */
  const landed = await quiet(() => git(dir, 'ls-remote', '--heads', 'origin', branch));
  const arrived = !!landed?.stdout?.trim();

  const where = binding.owner ? `${binding.owner}/${binding.repo}` : null;
  if (!arrived) {
    return {
      ok: false, saved: true, sent: false,
      sentence: where
        ? `Saved here, and GitHub accepted it, but ${where} does not show it yet.`
        : 'Saved here, and it was accepted, but the copy does not show it yet.',
      action: 'Open it on GitHub to see what is there before sending again.',
    };
  }

  return {
    ok: true,
    saved: true,
    sent: true,
    where,
    ...(movedTo ? { movedTo } : {}),
    sentence: movedTo
      ? `Saved here and sent to ${movedTo.owner}/${movedTo.repo}, on your own account.`
      : where ? `Saved here and sent to ${where}.` : 'Saved here and sent to the shared copy.',
    ...(movedTo ? {
      action: `This project came from ${movedTo.from}, which belongs to somebody else, so it went to your account instead. Where it came from is kept in the project.`,
    } : {}),
  };
}

/**
 * Put this computer's independently changed work on a new GitHub line and ask
 * the common project to review it. The common line is never overwritten and
 * no force operation exists here.
 */
export async function requestReview(dir, { title = null } = {}) {
  const pictureNow = await picture(dir);
  if (!pictureNow.tracked || !pictureNow.shared) {
    return { ok: false, sentence: 'This project is not connected to GitHub.', action: 'Connect it first.' };
  }
  if (pictureNow.unsaved > 0) {
    return { ok: false, sentence: 'Some work on this computer is not saved yet.', action: 'Save it first, then ask for a review.' };
  }

  const binding = await bindingOf(dir);
  if (!binding.bound) {
    return { ok: false, sentence: 'The GitHub project could not be identified.', action: 'Reconnect this copy and try again.' };
  }
  const account = await session({ fresh: true });
  if (!account.signedIn) return notSignedIn;
  const access = await repoThere(binding.owner, binding.repo);
  if (!access.ok) return access;
  if (!access.canWrite) {
    return {
      ok: false,
      sentence: `The ${account.login} account cannot add work to ${binding.owner}/${binding.repo}.`,
      action: 'Ask the owner to grant this GitHub account access, then try again.',
    };
  }

  const fetched = await quiet(() => git(dir, 'fetch', '--quiet', 'origin'));
  if (!fetched) {
    return { ok: false, sentence: 'The GitHub copy could not be checked.', action: 'Check the connection and try again.' };
  }
  const current = (await quiet(() => git(dir, 'rev-parse', '--abbrev-ref', 'HEAD')))?.stdout.trim() || 'main';
  const base = access.branch || current;
  const safeName = String(account.login).toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 28) || 'member';
  const reviewLine = `viberant/${safeName}-${Date.now().toString(36)}`;
  const sent = await quiet(() => git(dir, 'push', '--quiet', 'origin', `HEAD:refs/heads/${reviewLine}`));
  if (!sent) {
    return {
      ok: false,
      sentence: 'The review copy could not be placed on GitHub.',
      action: 'Check that this account can write to the shared project and try again.',
    };
  }

  const asked = await signin.request(
    `/repos/${encodeURIComponent(binding.owner)}/${encodeURIComponent(binding.repo)}/pulls`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: String(title ?? `Work from ${account.login}`).slice(0, 200),
        head: reviewLine,
        base,
        body: 'Prepared by Viberant after the shared copy and this computer changed independently.',
      }),
    },
  );
  if (!asked.ok) {
    return {
      ok: false,
      placed: true,
      sentence: 'The work is safely on GitHub, but the review request could not be opened.',
      action: `Open ${binding.owner}/${binding.repo} on GitHub and choose the ${reviewLine} work for review.`,
    };
  }
  return {
    ok: true,
    url: asked.data?.html_url ?? null,
    sentence: 'The work is safely on GitHub and ready for the workspace to review.',
    action: asked.data?.html_url ? 'Open the review request on GitHub.' : null,
  };
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
  const owner = await who();
  if (!owner) return notSignedIn;

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

  const name = basename(dir);
  const made = await signin.request('/user/repos', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name, private: visibility !== 'public' }),
  });
  if (!made.ok) {
    return {
      ok: false,
      sentence: 'A copy on GitHub could not be made.',
      action: 'A project of that name may already be on your account — pick another name for the folder.',
    };
  }
  const remote = made.data?.clone_url ?? `https://github.com/${owner}/${name}.git`;
  await quiet(() => git(dir, 'remote', 'add', 'origin', remote))
    || await quiet(() => git(dir, 'remote', 'set-url', 'origin', remote));
  await useOwnCredentials(dir);
  return {
    ok: true,
    sentence: visibility === 'public'
      ? 'This project now has a copy on GitHub that anyone can see.'
      : 'This project now has a copy on GitHub that only you can see.',
  };
}

/** Who else can see this. */
export async function setVisibility(dir, visibility) {
  const want = visibility === 'public' ? 'public' : 'private';
  const binding = await bindingOf(dir);
  if (!binding.bound) return { ok: false, sentence: 'This project has no GitHub copy.', action: 'Make one first.' };
  const done = await signin.request(`/repos/${encodeURIComponent(binding.owner)}/${encodeURIComponent(binding.repo)}`, {
    method: 'PATCH', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ private: want === 'private' }),
  });
  if (!done.ok) {
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
  if (!(await who())) return { ok: false, ...notSignedIn, projects: [] };
  const out = await signin.request(`/user/repos?per_page=${Math.min(100, Number(limit) || 100)}&sort=updated&affiliation=owner%2Ccollaborator%2Corganization_member`);
  if (!out.ok) {
    return {
      ok: false,
      sentence: 'Your projects on GitHub could not be listed.',
      action: 'Check you are online, then try again.',
      projects: [],
    };
  }
  try {
    const projects = (out.data ?? [])
      // The workspace is the manager's own bookkeeping. Offering it as
      // something to work on would be the app pointing at its own filing.
      .filter((r) => r.name !== 'viberant-workspace')
      .map((r) => ({
      name: r.name,
      about: r.description ?? null,
      owner: r.owner?.login ?? null,
      fullName: r.full_name ?? null,
      visibility: r.private ? 'private' : 'public',
      changed: r.updated_at,
      url: r.html_url,
      cloneUrl: r.clone_url,
      copied: !!r.fork,
      language: r.language ?? null,
      stars: Number(r.stargazers_count ?? 0),
      forks: Number(r.forks_count ?? 0),
      archived: !!r.archived,
    }));
    return { ok: true, projects };
  } catch {
    return { ok: false, sentence: 'Your projects on GitHub could not be read.', action: 'Try again in a moment.', projects: [] };
  }
}

/** Public GitHub discovery. Anonymous search works; a connected account raises the rate limit. */
export async function explore({ query = '', sort = 'updated', order = 'desc', page = 1, limit = 30 } = {}) {
  const q = String(query ?? '').trim() || 'stars:>1000';
  const allowedSort = ['stars', 'forks', 'updated'].includes(sort) ? sort : 'updated';
  const allowedOrder = order === 'asc' ? 'asc' : 'desc';
  const asked = await signin.request(`/search/repositories?q=${encodeURIComponent(q)}&sort=${allowedSort}&order=${allowedOrder}&page=${Math.max(1, Number(page) || 1)}&per_page=${Math.min(50, Number(limit) || 30)}`);
  if (!asked.ok) {
    return {
      ok: false,
      sentence: asked.status === 403 ? 'GitHub search is temporarily rate-limited.' : 'GitHub projects could not be searched.',
      action: asked.network ? 'Check the network connection and try again.' : 'Wait a moment, or connect a GitHub account for a higher search limit.',
      projects: [],
    };
  }
  return {
    ok: true,
    total: Number(asked.data?.total_count ?? 0),
    projects: (asked.data?.items ?? []).map((r) => ({
      name: r.name,
      fullName: r.full_name,
      owner: r.owner?.login ?? null,
      about: r.description ?? null,
      visibility: r.private ? 'private' : 'public',
      changed: r.updated_at,
      url: r.html_url,
      cloneUrl: r.clone_url,
      language: r.language ?? null,
      stars: Number(r.stargazers_count ?? 0),
      forks: Number(r.forks_count ?? 0),
      archived: !!r.archived,
    })),
  };
}

/** Bring a project down from GitHub onto this computer. */
export async function bringDown({ url, into }) {
  if (!(await gitRuntime.executable())) return notSetUp;
  const name = basename(String(url).replace(/\.git$/, ''));
  const target = join(into, name);
  if (existsSync(target)) {
    return {
      ok: false,
      sentence: `There is already a folder called ${name} in there.`,
      action: 'Pick a different folder to put it in.',
    };
  }

  const done = await quiet(() => git(null, 'clone', '--quiet', String(url), target));
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
