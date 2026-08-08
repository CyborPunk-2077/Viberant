/**
 * The manager.
 *
 * A local server and a page. There is no account here and no service anywhere —
 * it is a process on your computer that opens folders, starts the apps you
 * already have, and keeps a note of what happened. The only two things that
 * leave this machine do so through your own GitHub account and across your own
 * network, and both are things you press.
 *
 * Run:  node app/server.mjs
 */

import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { readFile, mkdir, writeFile, realpath } from 'node:fs/promises';
import { existsSync, statSync, watch } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve, basename, extname, normalize } from 'node:path';
import { hostname } from 'node:os';

import { ulid, Clock } from '../core/reference/src/identity.mjs';
import { Author, Developer } from '../core/reference/src/events.mjs';
import { Store } from '../core/reference/src/store.mjs';
import { Engine } from '../core/reference/src/engine.mjs';
import { home } from '../core/reference/src/home.mjs';

import * as projects from './projects.mjs';
import * as tools from './tools.mjs';
import * as terminals from './terminals.mjs';
import * as profiles from './profiles.mjs';
import * as browse from './browse.mjs';
import * as github from './github.mjs';
import * as deploy from './deploy.mjs';
import * as jobs from './jobs.mjs';
import * as workspace from './workspace.mjs';
import * as settings from './settings.mjs';
import * as lan from './lan.mjs';
import * as parcel from './parcel.mjs';
import * as contents from './contents.mjs';
import * as firstpublish from './firstpublish.mjs';
import * as signin from './signin.mjs';
import * as feedback from './feedback.mjs';
import * as fingerprint from './fingerprint.mjs';
import * as live from './live.mjs';
import * as google from './google.mjs';
import * as providers from './providers.mjs';
import * as assistant from './assistant.mjs';
import { widenPath, stopPassingOnOurOwnSurroundings } from './findtools.mjs';

// Before anything asks whether a command exists. A window started from the
// Start menu does not inherit the PATH a terminal has, which is how `gh` came
// to be "not installed" on a computer that plainly has it.
const foundOnPath = widenPath();

// And before anything is started. Running inside our own window left a mark on
// this process that told every app we start not to put a window up — see
// findtools.mjs, which explains it properly.
const noLongerPassedOn = stopPassingOnOurOwnSurroundings();

const here = dirname(fileURLToPath(import.meta.url));
const VERSION = '0.1.0';
const HOUSE = projects.HOUSE;

/**
 * Nothing that goes wrong is allowed to end the manager.
 *
 * This is not tidiness. A manager that stops is indistinguishable, from where
 * you are sitting, from every button in the app breaking at once: the window
 * stays up, the page still draws, and everything you press says the manager is
 * not answering. That is the shape of the fault that was reported — one app
 * that would not open, and afterwards nothing worked.
 *
 * The particular way it happened is worth naming, because it is easy to write
 * again: starting something in the background and not listening for the child
 * saying it could not be started. That is not a thrown error and no `try` will
 * catch it; it ends the process. Every one of those now has somebody listening,
 * and this is here in case one is ever missed.
 */
function keepGoing(what, trouble) {
  console.error(`  ${what}: ${trouble?.stack ?? trouble}`);
}
process.on('uncaughtException', (e) => keepGoing('something went wrong and was survived', e));
process.on('unhandledRejection', (e) => keepGoing('something was left unanswered', e));

/** Start something in the background and stop holding on to it. */
function letGoOf(child) {
  child.on('error', () => {});
  child.unref();
  return child;
}

// ---------------------------------------------------------------------------
// This computer
// ---------------------------------------------------------------------------

async function machineId() {
  const path = join(HOUSE, 'machine');
  if (existsSync(path)) return (await readFile(path, 'utf8')).trim();
  const id = ulid();
  await mkdir(HOUSE, { recursive: true });
  await writeFile(path, id, 'utf8');
  return id;
}
const machine = await machineId();

const myName = async () => (await settings.get('machineName')) || hostname();

/** Everything to do with one project, made once and kept. */
const opened = new Map();
async function open(path) {
  const dir = resolve(path);
  if (opened.has(dir)) return opened.get(dir);

  const name = basename(dir);
  const projectId = ulid();
  const author = new Author({ clock: new Clock(), machine, project: projectId });
  const store = new Store(join(HOUSE, 'projects', `${name}.jsonl`));
  await store.load();
  if (!store.state().project.bound) await store.append(author.bindProject(name, dir));

  const it = {
    dir, name, author,
    dev: new Developer(author),
    store,
    engine: new Engine({ project: projectId, location: dir, groundRoot: join(HOUSE, 'ground', name) }),
  };
  opened.set(dir, it);
  await projects.remember(dir);
  return it;
}

let current = null;

// ---------------------------------------------------------------------------
// Noticing when a folder changes underneath us
// ---------------------------------------------------------------------------

let pulse = 0;
let watcher = null;

/**
 * Watching a folder by the name Windows itself would use for it.
 *
 * This one ends the whole manager, and no `try` anywhere can stop it.
 *
 * Windows keeps a second, shortened name for any folder whose name is longer
 * than eight characters — `C:\Users\Administrator` is also `C:\Users\ADMINI~1`,
 * and plenty of ordinary things hand out the short one. The watcher underneath
 * Node takes whichever name it is given, then compares it against the name
 * Windows reports changes under, which is always the long one. They do not
 * match, and it stops the process where it stands:
 *
 *   Assertion failed: !_wcsnicmp(filename, dir, dirlen), file src\win\fs-event.c
 *
 * That is not an error anybody can catch. It is not thrown, it does not reach
 * `uncaughtException`, and the last line of defence D-77 put in cannot see it —
 * the process is simply gone, and from the outside every button in the app
 * stops working at once. The same happens to a folder reached through a linked
 * or substituted drive.
 *
 * So the fix is to never hand it a name it cannot live with. Asked of the
 * computer rather than worked out here, and only for watching — the folder
 * keeps the name the person chose it by everywhere else, because that name is
 * how a project is recognised again next time.
 */
async function watchProject(dir) {
  watcher?.close();
  watcher = null;
  if (!dir || !(await settings.get('watchFolder'))) return;
  try {
    const real = await realpath.native(dir).catch(() => dir);
    watcher = watch(real, { recursive: true }, (_kind, name) => {
      const path = String(name ?? '');
      if (path.includes('node_modules') || path.includes('.git\\objects') || path.includes('.git/objects')) return;
      pulse += 1;
    });
    watcher.on('error', () => { watcher = null; });
  } catch {
    // Watching is a convenience. A computer that will not do it still works.
  }
}

// ---------------------------------------------------------------------------
// Being findable by your other computers
// ---------------------------------------------------------------------------

async function localSharing() {
  if (!(await settings.get('localSharing'))) {
    await lan.stop();
    return { ok: false, off: true };
  }
  if (lan.isOn()) return { ok: true, already: true };

  const state = await workspace.state();
  if (!state.joined) {
    return {
      ok: false,
      sentence: 'Your computers cannot find each other until this one has joined your shared workspace.',
      action: 'Join it above — that is what gives them a way to recognise each other.',
    };
  }
  const key = await workspace.secret();
  return lan.start({ machine, name: await myName(), account: state.account, key });
}

// ---------------------------------------------------------------------------

const json = (res, body, code = 200) => {
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
};

const noProject = { ok: false, sentence: 'No project is open.', action: 'Pick one first.' };

/** Where an errand should happen: what was asked for, or the open project. */
const whereabouts = (body) => {
  const asked = body?.dir ? resolve(body.dir) : null;
  if (asked && existsSync(asked)) return asked;
  return current?.dir ?? null;
};

/**
 * What this computer tells the others it has.
 *
 * Only what has been offered on purpose. Anything else is left out of this list
 * entirely, so there is nothing for another computer to ask about.
 */
async function offering() {
  const list = await projects.remembered();
  const out = [];
  for (const p of list) {
    if (!projects.isShared(p) || !existsSync(p.path)) continue;
    const s = await projects.situation(p.path);
    out.push({
      id: p.path,
      name: p.name,
      says: projects.inWords(s),
      kind: projects.kindOf(p.path),
      lastSaved: s.last?.at ?? null,
      lastDid: s.last?.subject ?? null,
      mark: p.mark ?? null,
      url: s.shared ? github.webAddress(s.shared) : null,
    });
  }
  return out;
}

/**
 * Every project this computer will answer for on the network, with a
 * fingerprint of each so another computer can tell in one comparison whether
 * they match — without anything being copied to find out.
 *
 * Anything not offered is absent, exactly as it is absent from the workspace.
 * There is nothing here for another computer to ask about — which is the point,
 * and is why this asks the same question the workspace list asks, through the
 * same function rather than through a second expression that means to agree.
 */
async function whatThisComputerHas() {
  const list = await projects.remembered();
  const out = [];
  for (const p of list) {
    if (!projects.isShared(p) || !existsSync(p.path)) continue;
    const [state, s] = await Promise.all([
      fingerprint.of(p.path),
      projects.situation(p.path),
    ]);
    out.push({
      name: p.name,
      path: p.path,
      state,
      unsaved: s.unsaved ?? 0,
      // Whether this copy has moved since it last agreed with anybody. Used to
      // tell "they are ahead" from "you have both changed it".
      changedSinceSync: (s.unsaved ?? 0) > 0,
    });
  }
  return out;
}

// What the others are told, when they ask.
lan.shares(whatThisComputerHas);

const routes = {

  // -- who and where ------------------------------------------------------

  async 'GET /me'() {
    const [account, identity, ws, now, googleAccount, haveGh] = await Promise.all([
      github.who(), github.identity(), workspace.state(), settings.allSafely(),
      google.who(), github.haveGitHubTool(),
    ]);
    return {
      machine,
      machineName: now.machineName,
      host: hostname(),
      github: account,
      google: googleAccount,
      identity,
      workspace: ws,
      settings: now,
      haveGitHubTool: haveGh,
      lookedIn: foundOnPath,
      noLongerPassedOn,
      sharingHere: lan.isOn(),
      current: current?.dir ?? null,
      currentName: current?.name ?? null,
    };
  },

  async 'GET /pulse'() {
    return { pulse };
  },

  // -- settings -----------------------------------------------------------

  async 'GET /settings'() {
    return { settings: await settings.described(), record: settings.recordFolder };
  },

  async 'POST /settings'({ body }) {
    const r = await settings.set(body.id, body.value);
    if (r.ok && body.id === 'watchFolder') await watchProject(current?.dir ?? null);
    if (r.ok && body.id === 'localSharing') await localSharing();
    if (r.ok && body.id === 'machineName' && lan.isOn()) {
      // The others know this computer by its name, so a new one has to go out.
      await lan.stop();
      await localSharing();
    }
    return { ...r, ...(await routes['GET /settings']()) };
  },

  async 'POST /settings/reset'() {
    return { ...(await settings.forgetAll()), ...(await routes['GET /settings']()) };
  },

  async 'POST /settings/openRecord'() {
    const opener = process.platform === 'win32' ? ['explorer', [HOUSE]] : ['xdg-open', [HOUSE]];
    try { letGoOf(spawn(opener[0], opener[1], { detached: true, stdio: 'ignore' })); } catch { /* nothing to say */ }
    return { ok: true, sentence: 'The folder with everything in it is open.' };
  },

  // -- projects -----------------------------------------------------------

  async 'GET /projects'() {
    const list = await projects.remembered();
    const out = [];
    for (const p of list) {
      if (!existsSync(p.path)) continue;
      const s = await projects.situation(p.path);
      out.push({
        ...p,
        says: projects.inWords(s),
        saved: projects.lastSavedInWords(s),
        reach: projects.reachInWords(s, { private: !!p.private }),
        kind: projects.kindOf(p.path),
        lastDid: s.last?.subject ?? null,
        unsaved: s.unsaved,
        toSend: s.waitingToSend,
        shared: !!s.shared,
        mark: p.mark ?? null,
        private: !!p.private,
      });
    }
    return { projects: out, current: current?.dir ?? null, github: await github.who(), marks: projects.MARKS };
  },

  async 'GET /look'({ url }) {
    return { found: await projects.lookIn(url.searchParams.get('in') ?? '') };
  },

  async 'POST /open'({ body }) {
    if (!existsSync(body.path)) {
      return { ok: false, sentence: 'That folder is not there.', action: 'Pick another one.' };
    }
    current = await open(body.path);
    await watchProject(current.dir);
    return { ok: true, ...(await routes['GET /project']()) };
  },

  async 'POST /close'() {
    current = null;
    await watchProject(null);
    return { ok: true };
  },

  async 'GET /project'() {
    if (!current) return { open: false };
    const s = await projects.situation(current.dir);
    const remembered = (await projects.remembered()).find((p) => p.path === current.dir) ?? {};
    return {
      open: true, name: current.name, dir: current.dir,
      says: projects.inWords(s), saved: projects.lastSavedInWords(s), situation: s,
      mark: remembered.mark ?? null, private: !!remembered.private,
      kind: projects.kindOf(current.dir),
      reach: projects.reachInWords(s, { private: !!remembered.private }),
      home: home(current.store.state()),
    };
  },

  async 'POST /projects/mark'({ body }) {
    return { ...(await projects.mark(body.path, body.mark ?? null)), ...(await routes['GET /projects']()) };
  },

  async 'POST /projects/private'({ body }) {
    const r = await projects.keepPrivate(body.path, body.private);
    // Telling the other computers involves reaching GitHub, which takes seconds.
    // The answer to "is this private now" does not depend on that having
    // finished, so it is not waited for — a button that takes four seconds to
    // do something instant reads as broken.
    if (r.ok) tellTheOthers();
    return { ...r, ...(await routes['GET /projects']()) };
  },

  /**
   * Stop keeping this project in the list. Nothing on the disk is touched.
   *
   * Deliberately a different route from `/projects/delete`, and worded so the
   * two can never be read as the same thing. They are the pair people mix up,
   * and mixing them up in one direction costs somebody their work.
   */
  async 'POST /projects/forget'({ body }) {
    const at = body?.path ? resolve(body.path) : null;
    if (!at) return { ok: false, sentence: 'No project was named.', action: 'Pick one from the list.' };
    await projects.forget(at);
    if (current?.dir === at) { current = null; await watchProject(null); }
    return {
      ok: true,
      sentence: `${basename(at)} is off the list. Every file of it is still on this computer.`,
      ...(await routes['GET /projects']()),
    };
  },

  // -- picking a folder ---------------------------------------------------

  async 'GET /browse'({ url }) {
    return browse.look(url.searchParams.get('at'), { hidden: url.searchParams.get('hidden') === '1' });
  },

  async 'GET /browse/starts'() {
    const work = await settings.get('workFolder');
    const places = await browse.starts();
    if (work && existsSync(work) && !places.some((p) => p.path === work)) {
      places.unshift({ name: 'Your projects', path: work });
    }
    return { places };
  },

  async 'POST /browse/choose'({ body }) {
    return browse.chooseFolder({ startAt: body.startAt ?? null });
  },

  // -- AI apps ------------------------------------------------------------

  async 'GET /tools'() {
    // This page used to take well over a second to appear, every time, because
    // every question it asks was asked after the one before it had answered.
    // None of them depend on each other.
    const [found, terminalsHere, preferred] = await Promise.all([
      tools.installed(), terminals.installed(), settings.get('terminal'),
    ]);
    const out = await Promise.all(found.map(async (t) => ({
      ...t,
      ...(t.config
        ? await profiles.list(tools.find(t.id))
        : { profiles: [], active: null, signedIn: false }),
    })));
    return { tools: out, terminals: terminalsHere, preferred };
  },

  async 'POST /launch'({ body }) {
    const dir = whereabouts(body);
    if (!dir) return noProject;
    const tool = tools.find(body.tool);

    if (body.profile) {
      const swapped = await profiles.use(tool, body.profile);
      if (!swapped.ok) return { ...swapped, ...(await routes['GET /project']()) };
    }

    const started = await tools.launch({
      tool,
      dir,
      how: body.how ?? null,
      terminal: body.terminal ?? (await settings.get('terminal')),
      carryOn: !!body.carryOn,
    });

    if (started.ok) {
      // Writing down what happened, and re-reading the project, are both worth
      // doing and neither is worth waiting for. The app is already starting;
      // holding the answer until the bookkeeping is filed makes the button feel
      // dead for a second on top of the several these apps take to appear.
      noteLaunch({ tool, dir, how: started.how, profile: body.profile ?? null }).catch(() => {});

      const where = started.how === 'terminal' ? 'a terminal' : 'its own window';
      const carried = started.carriedOn
        ? ' Carrying on the conversation you were having.'
        : (body.carryOn && started.how === 'terminal'
          ? ` ${tool.name} has no way to be asked to carry on, so this is a fresh start.`
          : '');
      // Several of these take ten seconds to put a window on screen, so the
      // sentence says what is true now rather than what will be true later.
      return {
        ...started,
        sentence: `${tool.name} is starting in ${where}, already in ${basename(dir)}.`
          + (body.profile ? ` Using the account you called “${body.profile}”.` : '')
          + carried,
        action: started.how === 'desktop'
          ? 'Big apps take a few seconds to appear.'
          : null,
      };
    }
    return started;
  },

  async 'POST /signin/tool'({ body }) {
    const tool = tools.find(body.tool);
    const r = await tools.signIn({
      tool,
      dir: whereabouts(body) ?? HOUSE,
      terminal: await settings.get('terminal'),
      method: body.method ?? null,
    });
    return { ...r, ...(await routes['GET /tools']()) };
  },

  async 'POST /install'({ body }) {
    const tool = tools.find(body.tool);
    const what = tools.installCommand(tool);
    if (!what) {
      return {
        ok: false,
        sentence: `${tool?.name ?? 'That app'} comes as its own installer rather than a command.`,
        action: 'Open its download page and run it, then come back.',
      };
    }

    const job = jobs.begin({ what: `Installing ${tool.name}`, where: HOUSE, kind: 'other' });
    (async () => {
      jobs.step(job, `Running ${what.what}. This takes a minute or two.`);
      const out = await jobs.runInto(job, { file: what.file, args: what.args, cwd: HOUSE });
      if (!out.ok) {
        return jobs.end(job, {
          ok: false,
          sentence: `${tool.name} could not be installed.`,
          action: what.file === 'npm'
            ? 'This needs Node on the computer. The lines below say what it did not like.'
            : 'This needs Python on the computer. The lines below say what it did not like.',
        });
      }
      // What is on this computer is remembered for a few seconds, and a thing
      // you have just installed must not have to wait for that to lapse.
      tools.forgetWhatIsHere();
      return jobs.end(job, {
        ok: true,
        sentence: `${tool.name} is installed.`,
        action: 'It appears as available on this page in a moment.',
      });
    })();

    return { ok: true, job: job.id };
  },

  // -- accounts, per app --------------------------------------------------

  async 'POST /profile/save'({ body }) {
    return { ...(await profiles.save(tools.find(body.tool), body.name)), ...(await routes['GET /tools']()) };
  },
  async 'POST /profile/use'({ body }) {
    return { ...(await profiles.use(tools.find(body.tool), body.name)), ...(await routes['GET /tools']()) };
  },
  async 'POST /profile/forget'({ body }) {
    return { ...(await profiles.forget(tools.find(body.tool), body.name)), ...(await routes['GET /tools']()) };
  },

  // -- terminals ----------------------------------------------------------

  async 'GET /terminals'() {
    return { terminals: await terminals.installed(), preferred: await settings.get('terminal') };
  },

  async 'POST /terminal'({ body }) {
    const dir = whereabouts(body);
    if (!dir) return noProject;
    const which = body.terminal ?? (await settings.get('terminal'));
    const r = await terminals.openTerminal({ dir, which });
    if (!r.ok) return r;
    const t = terminals.find(r.opened);
    return { ...r, sentence: `${t?.name ?? 'A terminal'} is open in ${basename(dir)}.` };
  },

  // -- GitHub -------------------------------------------------------------

  async 'GET /github'() {
    const [accounts, identity] = await Promise.all([github.accounts(), github.identity()]);
    const picture = current ? await github.picture(current.dir) : null;
    return { ...accounts, identity, picture, project: current?.name ?? null };
  },

  async 'POST /github/signin'() {
    if (!(await github.haveGitHubTool())) {
      return {
        ok: false,
        sentence: 'The GitHub helper is not installed on this computer.',
        action: 'Install GitHub CLI from cli.github.com, then come back.',
      };
    }
    // The attempt's own ok is null while it runs; it must not overwrite the
    // fact that starting it worked.
    github.forgetWho();
    return { ...signin.begin(), ok: true, started: true };
  },

  async 'GET /github/signin'() {
    // Asked afresh every time. This is the one place where a few seconds of a
    // remembered answer would be the difference between noticing you signed in
    // and appearing not to.
    return { ok: true, signin: signin.state(), github: await github.who({ fresh: true }) };
  },

  async 'POST /github/signin/stop'() {
    signin.forget();
    return { ok: true };
  },

  async 'POST /google/signin'() {
    const now = await settings.all();
    const begun = google.begin({ clientId: now.googleClientId, clientSecret: now.googleClientSecret });
    return {
      ...begun,
      // The attempt's own ok is null while it runs; it must not overwrite the
      // fact that starting it worked. Same as the GitHub way in above.
      ok: begun.needsSetup ? false : true,
      started: !begun.needsSetup,
      howToRegister: google.HOW_TO_REGISTER,
    };
  },

  async 'GET /google/signin'() {
    return { ok: true, signin: google.state(), google: await google.who() };
  },

  async 'POST /google/signout'({ body }) {
    return google.signOut(body?.name ?? null);
  },

  /** Every Google name on this computer, and which is in use. */
  async 'GET /google'() {
    return google.accounts();
  },

  /** Use a different Google name. Touches nothing about where work goes. */
  async 'POST /google/switch'({ body }) {
    return google.switchTo(String(body?.name ?? ''));
  },

  async 'POST /open/page'({ body }) {
    // The page cannot open a browser tab itself when it is inside the app's own
    // window, so it asks. Only ever addresses on the web.
    if (!/^https:\/\//.test(String(body.at ?? ''))) {
      return { ok: false, sentence: 'That is not an address this can open.', action: 'Try another one.' };
    }
    signin.openInBrowser(body.at);
    return { ok: true };
  },

  async 'GET /feedback'() {
    return { kinds: feedback.KINDS, said: await feedback.said(), home: feedback.ISSUES_FOR_VIBERANT };
  },

  async 'POST /feedback'({ body }) {
    return feedback.send({
      what: body.what,
      kind: body.kind,
      about: {
        machine: await myName(),
        project: current?.name ?? null,
        version: VERSION,
      },
    });
  },

  async 'POST /github/switch'({ body }) {
    return { ...(await github.switchTo(body.name)), ...(await routes['GET /github']()) };
  },
  async 'POST /github/signout'({ body }) {
    return { ...(await github.signOut(body.name)), ...(await routes['GET /github']()) };
  },
  async 'POST /github/identity'({ body }) {
    return { ...(await github.setIdentity(body)), ...(await routes['GET /github']()) };
  },

  async 'POST /github/allowSending'() {
    return { ...(await github.fixSendingEverywhere()), ...(await routes['GET /github']()) };
  },

  /**
   * Where this project's work would go, checked before any of it moves.
   *
   * Asked by the page so the destination is on screen next to the button, and
   * asked again by the button itself — because the answer can change between
   * drawing a screen and pressing what is on it.
   */
  async 'GET /project/destination'() {
    if (!current) return noProject;
    return github.destinationFor(current.dir);
  },

  /**
   * Point this project at a repository on the account in use here.
   *
   * The address it used before is kept under another name rather than replaced.
   * Nothing about somebody's history is discarded to make a send work, and if
   * this turns out to be the wrong idea the old address is still written down
   * inside the project where they can see it.
   */
  async 'POST /project/connect'({ body }) {
    if (!current) return noProject;

    const going = await github.destinationFor(current.dir);
    if (!going.session?.signedIn) return going;
    if (going.binding?.isWorkspace) return going;

    const name = String(body?.name ?? '').trim() || basename(current.dir);
    if (!/^[\w.-]+$/.test(name)) {
      return {
        ok: false,
        sentence: 'That name has characters GitHub will not accept.',
        action: 'Letters, numbers, dots and dashes.',
      };
    }
    return github.connectTo(going.binding.gitRoot ?? current.dir, { name, session: going.session });
  },

  // -- asking a model about this project ----------------------------------
  //
  // Reading is free and changing is not, and that line is drawn here: every
  // route below reads, except the last one, which is reached only by pressing
  // something that says what it will change.

  async 'GET /ai'() {
    const set = await assistant.ready();
    return { ...set, project: current?.name ?? null };
  },

  /** Why did something fail. The most useful question there is. */
  async 'POST /ai/explain'({ body }) {
    if (!current) return noProject;
    const job = jobs.get(body?.job);
    if (!job) return { ok: false, sentence: 'That errand is no longer being kept.', action: 'Run it again.' };
    return assistant.explainFailure({
      dir: current.dir,
      what: job.what ?? 'Something',
      lines: job.lines ?? [],
    });
  },

  /** Is anything obviously wrong with this project. */
  async 'POST /ai/diagnose'() {
    if (!current) return noProject;
    return assistant.diagnose({ dir: current.dir });
  },

  /** What have I changed, and is any of it a mistake. */
  async 'POST /ai/review'() {
    if (!current) return noProject;
    const changed = await github.changesInFull(current.dir);
    if (!changed?.diff?.trim()) {
      return { ok: false, sentence: 'There is nothing unsaved to look at.', action: 'Change something first.' };
    }
    return assistant.reviewChanges({
      dir: current.dir,
      diff: changed.diff,
      files: changed.files ?? [],
    });
  },

  /** A question about this project. */
  async 'POST /ai/ask'({ body }) {
    if (!current) return noProject;
    const question = String(body?.question ?? '').trim();
    if (question.length < 3) {
      return { ok: false, sentence: 'There was no question.', action: 'Type one first.' };
    }
    return assistant.askAbout({ dir: current.dir, question });
  },

  /**
   * Ask for a change. Nothing is written — what comes back is a proposal.
   *
   * Separate from applying it, and it has to stay separate: this one can be
   * reached by typing a sentence, and the other one cannot be reached at all
   * except by pressing something that has already listed every file it touches.
   */
  async 'POST /ai/propose'({ body }) {
    if (!current) return noProject;
    const wanted = String(body?.wanted ?? '').trim();
    if (wanted.length < 4) {
      return { ok: false, sentence: 'There was nothing to ask for.', action: 'Say what you want changed.' };
    }
    return assistant.proposeChange({ dir: current.dir, wanted });
  },

  /**
   * Do what was suggested.
   *
   * Its own route, reached only from a screen that has already shown every file
   * it would change. Nothing above this line can reach it.
   */
  async 'POST /ai/apply'({ body }) {
    const out = await assistant.apply(String(body?.id ?? ''));
    projects.forgetSituations();
    return { ...out, ...(current ? await routes['GET /project']() : {}) };
  },

  /**
   * Everything worth telling somebody who is trying to help.
   *
   * The one thing in this product designed to be copied out and pasted
   * somewhere else, which makes it the one thing most likely to carry a secret
   * out with it. Every line goes through the same redaction the model prompts
   * use — one function, so there is no second rule to keep in step.
   */
  async 'GET /diagnostics'() {
    const [now, ws, vercelState, ai, all] = await Promise.all([
      github.session(),
      workspace.state(),
      providers.vercel.state(),
      assistant.ready(),
      settings.allSafely(),
    ]);

    const failed = jobs.all().filter((j) => j.ok === false).slice(0, 5).map((j) => ({
      what: j.what,
      kind: j.kind,
      sentence: j.sentence,
      // The last few lines are what somebody helping actually needs, and are
      // also the most likely place for a key to be sitting.
      lines: assistant.withoutSecrets((j.lines ?? []).slice(-8).join('\n')),
    }));

    return {
      viberant: VERSION,
      node: process.version,
      platform: `${process.platform} ${process.arch}`,
      manager: 'running',
      github: {
        tool: now.tool,
        signedIn: now.signedIn,
        account: now.login,
      },
      workspace: { joined: ws.joined, account: ws.account, reachable: lan.isOn() },
      network: { others: lan.around().length, offering: (await lan.offers()).length },
      deploy: { vercel: vercelState.here ? (vercelState.connected ? 'connected' : 'not connected') : 'not installed' },
      assistant: ai.ok ? `${ai.name}, set up` : `${ai.name}, no key`,
      // Whether each is set, never what any of them is (D-81).
      settings: Object.fromEntries(Object.entries(all).map(([k, v]) => [k, typeof v === 'string' && v.length > 40 ? '[set]' : v])),
      project: current ? { name: current.name, where: current.dir } : null,
      recentlyFailed: failed,
    };
  },

  /** What one project is bound to, for the panel beside the list. */
  async 'GET /project/binding'({ url }) {
    const at = url.searchParams.get('path');
    if (!at || !existsSync(at)) return { bound: false };
    const [bound, well] = await Promise.all([github.bindingOf(at), providers.health(at)]);
    return { ...bound, health: well };
  },

  async 'POST /publish'({ body }) {
    if (!current) return noProject;

    // Nothing leaves until it is known where it is going. A project that
    // belongs to one account while this app is signed in as another is a fact
    // to be shown, never a thing to be resolved by guessing — and the guess
    // that used to happen was made by the computer's credential store, which
    // has no idea what anybody intended.
    const going = await github.destinationFor(current.dir);
    if (going.mismatch || going.binding?.isWorkspace) {
      return { ...going, ok: false, ...(await routes['GET /project']()) };
    }
    if (body.expect && going.binding?.bound
      && `${going.binding.owner}/${going.binding.repo}` !== body.expect) {
      return {
        ok: false,
        sentence: `This project now sends to ${going.binding.owner}/${going.binding.repo}, not where the page said.`,
        action: 'Look at where it is going, then send it again.',
        ...(await routes['GET /project']()),
      };
    }

    const r = await projects.publish(current.dir, { message: body.message, private: body.private !== false });
    projects.forgetSituations();
    return { ...r, destination: going.binding, ...(await routes['GET /project']()) };
  },

  async 'POST /github/save'({ body }) {
    if (!current) return noProject;
    const saved = await github.saveOnly(current.dir, body.message);
    projects.forgetSituations();
    return { ...saved, ...(await routes['GET /project']()) };
  },
  async 'POST /github/latest'() {
    if (!current) return noProject;
    const got = await github.getLatest(current.dir);
    projects.forgetSituations();
    return { ...got, ...(await routes['GET /project']()) };
  },
  async 'POST /github/copy'({ body }) {
    if (!current) return noProject;
    return { ...(await github.makeCopy(current.dir, { visibility: body.visibility })), ...(await routes['GET /project']()) };
  },
  async 'POST /github/visibility'({ body }) {
    if (!current) return noProject;
    return { ...(await github.setVisibility(current.dir, body.visibility)), ...(await routes['GET /project']()) };
  },
  async 'POST /github/undo'() {
    if (!current) return noProject;
    const undone = await github.undoLastSave(current.dir);
    projects.forgetSituations();
    return { ...undone, ...(await routes['GET /project']()) };
  },
  async 'GET /github/history'() {
    if (!current) return { ok: true, saves: [] };
    return github.history(current.dir);
  },
  async 'GET /github/changes'() {
    if (!current) return { ok: true, changes: [] };
    return github.whatChanged(current.dir);
  },

  async 'GET /contents'({ url }) {
    const dir = url.searchParams.get('at') ?? current?.dir;
    if (!dir || !existsSync(dir)) return noProject;
    return { ok: true, ...(await contents.of(resolve(dir))) };
  },

  // -- putting a project on GitHub for the first time ----------------------

  async 'GET /publish/first'() {
    if (!current) return noProject;
    const picture = await github.picture(current.dir);
    return {
      ok: true,
      name: current.name,
      suggested: current.name.replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 90),
      already: !!picture.shared,
      url: picture.url,
      who: await github.who(),
      licences: firstpublish.LICENCES,
      willMake: firstpublish.whatIsMissing(current.dir),
    };
  },

  async 'POST /publish/first'({ body }) {
    if (!current) return noProject;
    const job = jobs.begin({ what: `Putting ${current.name} on GitHub`, where: current.dir, kind: 'send', project: current.name });
    firstTimeOnGitHub(job, {
      dir: current.dir,
      name: body.name,
      description: body.description ?? null,
      licence: body.licence ?? 'none',
      visibility: body.visibility === 'public' ? 'public' : 'private',
    });
    return { ok: true, job: job.id };
  },
  async 'GET /github/mine'() {
    return github.myProjects();
  },
  async 'POST /github/bring'({ body }) {
    const into = body.into ?? (await settings.get('workFolder'));
    const r = await github.bringDown({ url: body.url, into });
    if (r.ok) { current = await open(r.path); await watchProject(current.dir); }
    return { ...r, ...(await routes['GET /projects']()) };
  },

  // -- putting things out into the world ----------------------------------

  async 'GET /ship'() {
    if (!current) return { open: false };
    // Which repository this would act on, said on the page. Deploying to the
    // wrong one is not recoverable by pressing something else afterwards.
    const [looked, binding, look, where, vercelState] = await Promise.all([
      deploy.look(current.dir),
      github.bindingOf(current.dir),
      providers.inspect(current.dir),
      providers.bindingFor(current.dir),
      providers.vercel.state(),
    ]);
    return {
      open: true,
      name: current.name,
      dir: current.dir,
      binding,
      look,
      deployedTo: where,
      vercel: vercelState,
      ...looked,
    };
  },

  async 'POST /ship/site'({ body }) {
    if (!current) return noProject;

    /*
     * Vercel goes through the provider, which knows what this project is and
     * where it deploys. Everything read here comes from `current` at the moment
     * of the press — the project you are looking at, never the one you were
     * looking at when the page was drawn.
     */
    if (body.place === 'vercel') {
      const dir = current.dir;
      const name = current.name;
      const job = jobs.begin({ what: `Putting ${name} online`, where: dir, kind: 'deploy', project: name });

      (async () => {
        const state = await providers.vercel.state();
        if (!state.here) {
          return jobs.end(job, {
            ok: false,
            sentence: state.missing,
            action: `Install it once with ${state.how}, then try again.`,
          });
        }
        if (!state.connected) {
          const signedIn = await providers.vercel.connect(job, jobs);
          if (!signedIn.ok) {
            return jobs.end(job, {
              ok: false,
              sentence: 'Vercel was not connected, so nothing was put online.',
              action: 'Try again and finish the sign-in in your browser.',
            });
          }
        }

        const out = await providers.vercel.deploy(job, jobs, { dir, name });
        if (!out.ok) return jobs.end(job, out);

        // Remembered against this project, so the next press knows where it went
        // and project B never inherits project A's site.
        await providers.bind(dir, { provider: 'vercel', url: out.at, name });

        return jobs.end(job, {
          ok: true,
          at: out.at,
          sentence: `${name} is live at ${out.at}`,
          action: 'Anyone with the address can see it now.',
        });
      })().catch((e) => jobs.end(job, {
        ok: false,
        sentence: 'Putting the site online stopped part way through.',
        action: String(e?.message ?? e),
      }));

      return { ok: true, job: job.id };
    }

    const job = deploy.putSiteOnline({ dir: current.dir, place: body.place, name: current.name });
    return { ok: true, job: job.id };
  },

  async 'POST /ship/app'({ body }) {
    if (!current) return noProject;
    const job = deploy.makeApplication({
      dir: current.dir, name: current.name,
      alsoGiveOut: !!body.giveOut, version: body.version ?? null, notes: body.notes ?? '',
    });
    return { ok: true, job: job.id };
  },

  async 'GET /job'({ url }) {
    const one = jobs.get(url.searchParams.get('id'));
    return one ?? { ok: false, sentence: 'That errand is no longer being kept.', action: 'Start it again.' };
  },

  async 'GET /jobs'() {
    return { jobs: jobs.all() };
  },

  // -- the shared workspace -----------------------------------------------

  async 'GET /workspace'() {
    const state = await workspace.state();
    if (!state.joined) {
      return { ...state, machines: [], projects: [], said: [], around: [], offers: [], sharingHere: false };
    }
    // Drawn from what is already here, and the reaching-out happens behind the
    // answer. This route measured at 1.5-2.2 seconds because it went to GitHub
    // first, and it is the route every press of the Workspace tab waits on.
    const r = await workspace.known(machine);
    listenForTheOthers();
    return {
      ...state,
      ...r,
      around: lan.around(),
      offers: await lan.offers(),
      sharingHere: lan.isOn(),
      workFolder: await settings.get('workFolder'),
    };
  },

  async 'POST /workspace/join'() {
    const name = await myName();
    const r = await workspace.join({ machine, name });

    // Both of these are tried whenever the workspace is actually here, rather
    // than only when joining reported success. Joining can succeed at the part
    // that matters — the workspace is cloned, the key is readable — and still
    // answer `ok: false` because what this computer wrote has not gone out yet.
    // Hanging being findable on that answer left this computer permanently
    // invisible to the other one, and nothing on any screen said why.
    if ((await workspace.state()).joined) {
      await workspace.sync({ machine, name, project: current?.name ?? null, sharing: await offering() });
      await localSharing();
    }
    return { ...r, ...(await workspace.state()), sharingHere: lan.isOn() };
  },

  async 'POST /workspace/leave'() {
    await lan.stop();
    return { ...(await workspace.leave({ machine })), ...(await workspace.state()) };
  },

  async 'POST /workspace/say'({ body }) {
    return workspace.say({ machine, name: await myName(), text: body.text });
  },

  async 'POST /workspace/refresh'() {
    return workspace.sync({
      machine, name: await myName(), project: current?.name ?? null, sharing: await offering(), force: true,
    });
  },

  /**
   * Bring a project from one of your other computers.
   *
   * **Across the network when that computer is reachable, and only otherwise
   * through GitHub.** That order is the fix for the fault this route had, and
   * the fault was not a small one: it only ever went through GitHub, which
   * means it brought down `gh repo clone` — and a clone carries what has been
   * saved and sent, and nothing else.
   *
   * So a project whose folder is 1.3 GB on the other computer arrived here as
   * 300 MB, and everything missing was real: anything not yet saved, anything
   * deliberately left out of what gets saved, every asset, every local setting,
   * every build. The card said 1.3 GB because it was describing the folder. The
   * transfer was describing something else entirely, and nothing on screen said
   * they were different things.
   *
   * The parcel checks added since — what was promised, what was sent, what
   * landed — could never have caught this, because a clone is not a parcel and
   * never passed through any of them.
   *
   * When the other computer is not on this network, GitHub is still offered,
   * and now it says what it carries.
   */
  async 'POST /workspace/bring'({ body }) {
    const into = body.into ?? (await settings.get('workFolder'));
    const entry = body.entry ?? {};
    const near = lan.around().some((p) => p.machine === entry.from);

    if (near) {
      const target = join(resolve(into), entry.name);
      if (existsSync(target)) {
        return {
          ok: false,
          sentence: `There is already a folder called ${entry.name} in there.`,
          action: 'Pick a different folder to put it in.',
        };
      }
      const job = jobs.begin({ what: `Bringing ${entry.name} from ${entry.fromName}`, where: target, kind: 'transfer', project: entry.name });
      lan.takeProject({ machine: entry.from, name: entry.name, into: target, job, jobs })
        .then((done) => registerIfItArrived(done))
        .catch(() => jobs.end(job, {
          ok: false,
          sentence: `${entry.name} did not make it across.`,
          action: 'Check both computers are on the same network, then try again.',
        }));
      return { ok: true, job: job.id, whole: true };
    }

    const r = await workspace.bring({ entry, into });
    if (r.ok) { current = await open(r.path); await watchProject(current.dir); }
    return { ...r, ...(await routes['GET /projects']()) };
  },

  // -- across the network -------------------------------------------------

  async 'POST /local/on'() {
    return { ...(await localSharing()), sharingHere: lan.isOn() };
  },

  async 'POST /local/offer'({ body }) {
    const started = await localSharing();
    if (!started.ok && !started.already) return started;

    // A file is one thing and is always worth sending, even an empty one.
    // A folder with nothing in it is a different case: sending it would arrive
    // as nothing and look like a failure.
    const asked = existsSync(body.path) ? statSync(body.path) : null;
    if (asked?.isDirectory()) {
      const weighed = await parcel.weigh(body.path, { everything: !!body.everything });
      if (weighed.files === 0 && weighed.dirs === 0) {
        return { ok: false, sentence: 'There is nothing in that folder to send.', action: 'Choose another one.' };
      }
    }
    return lan.offer({
      path: body.path,
      everything: !!body.everything,
      about: body.about ?? '',
      kind: body.kind ?? null,
    });
  },

  /**
   * Put the project's folder in the recycle bin.
   *
   * The recycle bin rather than deleting it outright, because this is the only
   * destructive thing in the product and somebody who presses it by mistake
   * should be able to undo it with the tool they already know. Nothing on
   * GitHub and nothing on any other computer is touched — those are separate
   * places and separate decisions.
   */
  async 'POST /projects/delete'({ body }) {
    const at = body?.path ? resolve(body.path) : null;
    if (!at || !existsSync(at)) {
      return { ok: false, sentence: 'That folder is not on this computer.', action: 'Refresh the list.' };
    }
    if (workspace.isInsideWorkspace(at)) {
      return {
        ok: false,
        sentence: 'That folder is the one this manager uses to let your computers find each other.',
        action: 'Take this computer out of the workspace instead, from the Workspace page.',
      };
    }

    const gone = await recycle(at);
    if (!gone.ok) return gone;

    await projects.forget(at);
    if (current?.dir === at) { current = null; await watchProject(null); }
    return {
      ok: true,
      sentence: `${basename(at)} has gone to the recycle bin. Nothing on GitHub was touched.`,
      action: 'Your recycle bin can put it back.',
      ...(await routes['GET /projects']()),
    };
  },

  /**
   * Open an address in the browser this computer uses, not in this window.
   *
   * The manager's window is the manager. Navigating it to somebody's newly
   * published website would replace the app with the website, and the way back
   * is not obvious to anybody who has not met an Electron window before.
   */
  async 'POST /open-outside'({ body }) {
    const url = String(body?.url ?? '');
    if (!/^https?:\/\//i.test(url)) {
      return { ok: false, sentence: 'That is not an address this computer can open.', action: 'Copy it instead.' };
    }
    letGoOf(spawn(
      process.platform === 'win32' ? 'cmd' : 'open',
      process.platform === 'win32' ? ['/c', 'start', '', url] : [url],
      { detached: true, stdio: 'ignore', windowsHide: true },
    ));
    return { ok: true };
  },

  /** The file chooser this computer already has, for offering one file. */
  async 'POST /choose/file'({ body }) {
    return browse.chooseFile({ startAt: body?.startAt ?? null });
  },

  /**
   * Open the folder something is in, in the file browser this computer has.
   *
   * Selects the thing itself rather than merely opening the folder around it,
   * which for a folder of four thousand files is the difference between an
   * answer and a search.
   */
  async 'POST /reveal'({ body }) {
    const at = body?.path ? resolve(body.path) : null;
    if (!at || !existsSync(at)) {
      return { ok: false, sentence: 'That is not on this computer any more.', action: 'Refresh the list.' };
    }
    if (process.platform !== 'win32') {
      return { ok: false, sentence: 'This computer has no file browser the manager can open.', action: 'Open it yourself.' };
    }
    // `explorer` answers 1 even when it worked, so nothing is read from it.
    letGoOf(spawn('explorer.exe', [`/select,${at}`], { detached: true, stdio: 'ignore', windowsHide: false }));
    return { ok: true };
  },

  async 'POST /local/weigh'({ body }) {
    const weighed = await parcel.weigh(body.path, { everything: !!body.everything });
    return { ok: true, ...weighed, says: `${weighed.files} files, ${parcel.inWords(weighed.bytes)}` };
  },

  async 'POST /local/withdraw'({ body }) {
    return lan.withdraw(body.id);
  },

  async 'GET /local/offers'({ url }) {
    return lan.offeredBy(url.searchParams.get('machine'));
  },

  // -- the same project, on two computers at once -------------------------

  async 'GET /live'() {
    return live.look({ mine: await whatThisComputerHas() });
  },

  async 'POST /live/sync'({ body }) {
    const job = jobs.begin({ what: `Bringing ${body.name} across`, where: body.path ?? HOUSE, kind: 'transfer', project: body.name });
    live.take({ name: body.name, from: body.from, path: body.path, job, jobs })
      .then(async (done) => {
        if (done?.ok && done.at) { current = await open(done.at); await watchProject(done.at); }
      })
      .catch(() => jobs.end(job, {
        ok: false,
        sentence: 'That did not come across.',
        action: 'Your copy was put back exactly as it was. Try again.',
      }));
    return { ok: true, job: job.id };
  },

  async 'POST /live/leave'({ body }) {
    return live.leaveItAlone({ from: body.from, name: body.name, mark: body.mark });
  },

  async 'POST /local/take'({ body }) {
    const into = body.into ?? (await settings.get('workFolder'));
    const job = jobs.begin({ what: `Bringing ${body.name} to this computer`, where: into, kind: 'transfer', project: body.name });
    lan.take({ machine: body.machine, offerId: body.offer, into, name: body.name, job, jobs })
      .then(registerIfItArrived)
      .catch(() => jobs.end(job, {
        ok: false,
        sentence: 'That folder did not make it across.',
        action: 'Check both computers are on the same network, then try again.',
      }));
    return { ok: true, job: job.id };
  },

  // -- efforts ------------------------------------------------------------

  // One press on a card means all of that app's entries, because the card is
  // one app rather than one press of it.
  async 'POST /done'({ body }) {
    if (!current) return noProject;
    for (const id of asked(body)) {
      const verdict = current.dev.judge({ effort: id, verdict: 'accept' });
      await current.store.append(verdict,
        current.dev.transitioned({ effort: id, to: 'done', causedBy: verdict.id }));
    }
    return { ok: true, ...(await routes['GET /project']()) };
  },

  async 'POST /drop'({ body }) {
    if (!current) return noProject;
    for (const id of asked(body)) await letGo(id);
    return { ok: true, ...(await routes['GET /project']()) };
  },

  async 'POST /tidy'() {
    if (!current) return noProject;
    const live = [...current.store.state().efforts.values()]
      .filter((e) => e.state && e.state !== 'dissolved');
    for (const e of live) await letGo(e.id);
    return {
      ok: true,
      sentence: live.length
        ? `Cleared ${live.length === 1 ? 'one' : live.length} from the list. Nothing that is running was stopped.`
        : 'There was nothing on the list.',
      ...(await routes['GET /project']()),
    };
  },
};

/**
 * Remember that an app was opened here — once per app, not once per press.
 *
 * Opening the same assistant six times in an afternoon is one thing you are
 * doing, not six. The first press begins something; every press after it is
 * recorded against the same one, which is what `effort.account_captured` is for
 * (D-15). Without this the list of what is going on becomes a list of times you
 * clicked, which is noise wearing the clothes of information.
 */
async function noteLaunch({ tool, dir, how, profile }) {
  if (!current || current.dir !== dir) return;

  const already = [...current.store.state().efforts.values()]
    .find((e) => e.assistant === tool.id && e.state === 'moving');

  if (already) {
    await current.store.append(current.author.accountCaptured({
      effort: already.id,
      assistant: tool.id,
      kind: how === 'terminal' ? 'terminal' : 'window',
      ref: profile ? `as ${profile}` : dir,
    }));
    return;
  }

  const { effort, event } = current.dev.begin({ intent: `work in ${tool.name}` });
  const delegated = current.author.delegated({ effort, assistant: tool.id, causedBy: event.id });
  await current.store.append(event, delegated,
    current.dev.transitioned({ effort, to: 'moving', causedBy: delegated.id }));
}

/**
 * The whole of a first time on GitHub, from a folder to a page people can read.
 *
 * Everything is named as it happens, because this is the step somebody has been
 * putting off, and watching it go is most of what makes it stop being scary.
 */
async function firstTimeOnGitHub(job, { dir, name, description, licence, visibility }) {
  try {
    jobs.step(job, 'Looking at what the project already has.');
    const put = await firstpublish.prepare(dir, {
      name, description, licence, who: (await github.identity()).name,
    });
    if (put.made.length) jobs.step(job, `Wrote ${put.made.join(', ')} — the pieces a project usually has.`);
    if (put.leftAlone.length) jobs.step(job, `Left your own ${put.leftAlone.join(', ')} exactly as it was.`);

    jobs.step(job, 'Saving everything here first.');
    const saved = await github.saveOnly(dir, put.made.length
      ? `Add ${put.made.join(', ')} and everything so far`
      : 'Everything so far');
    if (!saved.ok) return jobs.end(job, saved);

    // Ask first, rather than guess afterwards. Not being signed in and a name
    // already taken produce the same failure from the outside, and telling
    // somebody to pick another name when the real answer is "sign in" sends
    // them round a loop that cannot end.
    const who = await github.who();
    if (!who) {
      return jobs.end(job, {
        ok: false,
        sentence: 'You are not signed in to GitHub, so nothing could be made there.',
        action: 'Sign in from the account menu at the bottom of the rail, then try again. Your work is saved here either way.',
      });
    }

    jobs.step(job, `Making ${name} on GitHub as ${who}, visible to ${visibility === 'public' ? 'anybody' : 'only you'}.`);
    const out = await jobs.runInto(job, {
      file: 'gh',
      args: ['repo', 'create', name, visibility === 'public' ? '--public' : '--private',
        '--source', '.', '--remote', 'origin', '--push'],
      cwd: dir,
    });
    if (!out.ok) {
      const said = job.lines.join(' ');
      const notSignedIn = /gh auth login|GH_TOKEN|authentication/i.test(said);
      const taken = /already exists|name already/i.test(said);
      return jobs.end(job, {
        ok: false,
        sentence: notSignedIn
          ? 'You are not signed in to GitHub, so nothing could be made there.'
          : taken
            ? `You already have a project called ${name} on GitHub.`
            : `${name} could not be made on GitHub.`,
        action: notSignedIn
          ? 'Sign in from the account menu, then try again. Your work is saved here either way.'
          : taken
            ? 'Pick another name.'
            : 'The lines below say what GitHub objected to.',
      });
    }

    await github.useOwnCredentials(dir);
    const where = await quietly(() => github.picture(dir));

    return jobs.end(job, {
      ok: true,
      at: where?.url ?? null,
      sentence: where?.url ? `${name} is on GitHub, at ${where.url}` : `${name} is on GitHub.`,
      action: 'From now on, Save and send is the only button you need — it sends what changed and nothing else.',
    });
  } catch (e) {
    jobs.write(job, String(e));
    return jobs.end(job, {
      ok: false,
      sentence: 'Putting it on GitHub stopped part way through.',
      action: 'Your work is safe on this computer. The lines below say where it stopped.',
    });
  }
}

const quietly = async (fn) => { try { return await fn(); } catch { return null; } };

/**
 * Send a folder to the recycle bin rather than destroying it.
 *
 * This is the only thing in the product that removes somebody's work, so it is
 * the one place where "undo" has to exist — and the undo people already know is
 * the recycle bin. Windows will do it properly if asked properly: the shell's
 * own file operation, with the flag that says put it in the bin, which is not
 * something a plain delete can be talked into doing.
 *
 * If the shell refuses, this refuses too. Falling back to deleting it outright
 * would turn a recoverable action into an unrecoverable one at exactly the
 * moment something was already going wrong.
 */
async function recycle(at) {
  if (process.platform !== 'win32') {
    return {
      ok: false,
      sentence: 'This computer has no recycle bin the manager can use.',
      action: 'Move the folder to the bin yourself, then take it out of the list here.',
    };
  }

  const script = `
    Add-Type -AssemblyName Microsoft.VisualBasic
    [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteDirectory(
      '${at.replace(/'/g, "''")}',
      [Microsoft.VisualBasic.FileIO.UIOption]::OnlyErrorDialogs,
      [Microsoft.VisualBasic.FileIO.RecycleOption]::SendToRecycleBin)`;

  try {
    await new Promise((done, fail) => {
      const child = spawn('powershell',
        ['-NoProfile', '-STA', '-ExecutionPolicy', 'Bypass', '-Command', script],
        { windowsHide: true });
      let said = '';
      child.stderr.on('data', (d) => { said += d; });
      child.on('error', fail);
      child.on('exit', (code) => (code === 0 ? done() : fail(new Error(said.trim() || `exit ${code}`))));
    });
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      sentence: 'That folder could not be put in the recycle bin, so nothing was removed.',
      action: /being used|access/i.test(String(e.message))
        ? 'Something has it open. Close it and try again.'
        : 'Move it to the bin yourself instead.',
    };
  }
}

/**
 * Something arrived. Put it in the list of projects, once, in one place.
 *
 * Every way of bringing a folder to this computer ends here, which is the point
 * — the last two lines of a transfer are exactly the sort of thing that gets
 * written three times and corrected twice.
 *
 * A file is left alone. It is a file: it lands where you chose to put it and
 * that is the whole errand. Registering it as a project would put something in
 * the list that cannot be opened, which is worse than it not being there.
 */
async function registerIfItArrived(done) {
  if (!done?.ok || !done.at) return done;
  if (!existsSync(done.at) || !statSync(done.at).isDirectory()) return done;

  current = await open(done.at);
  await watchProject(current.dir);
  return done;
}

/**
 * Let the other computers know what changed here, without keeping anybody
 * waiting for it.
 *
 * Sending takes seconds because it reaches GitHub. Nothing on screen depends on
 * it having landed, so it happens behind the answer. If it fails, the next
 * heartbeat carries it — which is the whole point of the workspace being a list
 * of files rather than a conversation.
 */
let telling = null;
function tellTheOthers() {
  if (telling) return;
  telling = (async () => {
    const state = await workspace.state();
    if (state.joined) {
      await workspace.sync({
        machine, name: await myName(), project: current?.name ?? null, sharing: await offering(),
      });
      // Being findable is tried again here rather than only at startup. The
      // one at startup runs before anybody has joined anything on a computer's
      // first day, so it is the one attempt guaranteed to be too early.
      if (!lan.isOn()) await localSharing();
    }
  })().catch(() => {}).finally(() => { telling = null; });
}

/**
 * Hear what the others have said, behind whatever is on screen.
 *
 * Deliberately not `tellTheOthers`. Passing what this computer is offering
 * makes a write due every time, and this runs on every poll of the Workspace
 * page — which would put a save in that workspace every twenty seconds and make
 * O-9 considerably worse. Left alone, it fetches every time and writes on the
 * ordinary two-minute beat, which is what it cost before the page stopped
 * waiting for it.
 */
let listening = null;
function listenForTheOthers() {
  if (listening) return;
  listening = (async () => {
    if ((await workspace.state()).joined) {
      await workspace.sync({ machine, name: await myName(), project: current?.name ?? null });
      if (!lan.isOn()) await localSharing();
    }
  })().catch(() => {}).finally(() => { listening = null; });
}

/** Which entries a press was about: a whole card's worth, or just one. */
const asked = (body) => (Array.isArray(body?.efforts) && body.efforts.length
  ? body.efforts
  : [body?.effort].filter(Boolean));

async function letGo(id) {
  const verdict = current.dev.judge({ effort: id, verdict: 'abandon' });
  await current.store.append(verdict,
    current.dev.transitioned({ effort: id, to: 'dissolved', causedBy: verdict.id }),
    current.dev.dissolved({ effort: id, graceUntil: Date.now() + 86400_000, causedBy: verdict.id }));
}

// ---------------------------------------------------------------------------
// The page itself
// ---------------------------------------------------------------------------

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
};

async function serveUi(res, name) {
  // Nothing outside the ui folder is ever served, whatever is asked for.
  const safe = normalize(name).replace(/^([.][.][/\\])+/, '').replace(/\\/g, '/');
  const path = join(here, 'ui', safe);
  if (!path.startsWith(join(here, 'ui')) || !existsSync(path)) {
    res.writeHead(404);
    return res.end();
  }
  res.writeHead(200, { 'content-type': TYPES[extname(path)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
  return res.end(await readFile(path));
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');

    if (url.pathname === '/') return serveUi(res, 'shell.html');
    if (url.pathname.startsWith('/ui/')) return serveUi(res, url.pathname.slice(4));

    const route = routes[`${req.method} ${url.pathname}`];
    if (!route) { res.writeHead(404); return res.end(); }

    let body = {};
    if (req.method === 'POST') {
      const raw = await new Promise((r) => {
        let s = ''; req.on('data', (c) => { s += c; }); req.on('end', () => r(s));
      });
      body = raw ? JSON.parse(raw) : {};
    }
    return json(res, await route({ url, body }));
  } catch (e) {
    json(res, { ok: false, sentence: 'Something went wrong here.', action: 'Try that again.', detail: String(e) }, 500);
  }
});

/**
 * Put the page in front of the person who asked for it.
 *
 * Only ever when asked — start.bat asks, because someone who double-clicked an
 * icon wants the thing, not a web address to copy. Nothing opens by itself.
 */
function showInBrowser(address) {
  const [file, args] = process.platform === 'win32'
    ? ['cmd', ['/c', 'start', '', address]]
    : process.platform === 'darwin'
      ? ['open', [address]]
      : ['xdg-open', [address]];
  try {
    letGoOf(spawn(file, args, { detached: true, stdio: 'ignore' }));
  } catch {
    // Not being able to open a browser is not a reason to stop; the address is
    // on the line above and it still works.
  }
}

const port = Number(process.env.PORT ?? 7777);
server.listen(port, '127.0.0.1', () => {
  const address = `http://localhost:${port}`;
  console.log(`\n  open  ${address}\n`);
  if (process.env.VIBERANT_OPEN === '1') showInBrowser(address);
  // If this computer has already joined, it starts being findable by the
  // others without being asked again. Turning it off is one switch in Settings.
  localSharing().catch(() => {});
});
