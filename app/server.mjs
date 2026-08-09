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
import * as newer from './newer.mjs';
import * as peers from './peers.mjs';
import * as device from './device.mjs';
import * as membersOf from './members.mjs';
import * as anywhere from './anywhere.mjs';
import * as joining from './joining.mjs';
import * as chatter from './chatter.mjs';
import * as remote from './remote.mjs';
import * as machines from './machines.mjs';
import * as syncing from './sync.mjs';
import * as snapshots from './snapshots.mjs';
import * as channelsOf from './channels.mjs';
import * as artifacts from './artifacts.mjs';
import * as previewing from './preview.mjs';
import * as carried from './carried.mjs';
import * as activity from './activity.mjs';
import { widenPath, stopPassingOnOurOwnSurroundings } from './findtools.mjs';

// Before anything asks whether a command exists. A window started from the
// Start menu does not inherit the PATH a terminal has, which is how `gh` came
// to be "not installed" on a computer that plainly has it.
const foundOnPath = widenPath();

// Every byte that crosses a peer connection is counted by how it travelled, on
// this computer, in memory and one small file. Nothing about it leaves here.
peers.countWith((kind, bytes) => { carried.went(kind, bytes).catch(() => {}); });

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

  /*
   * Two workspaces can make this computer findable, and the newer one comes
   * first.
   *
   * Computers that joined a workspace with a code held nothing they could
   * recognise each other by — the value came out of a private project on
   * GitHub, which they had never seen. So they appeared in each other's lists,
   * correctly, and both said offline forever. The members workspace can produce
   * one of its own from what every member already holds.
   */
  const team = await membersOf.current();
  const theirs = team ? membersOf.beaconKey(team) : null;
  if (theirs) {
    /*
     * It calls itself by the name the workspace knows it by.
     *
     * The shout carries an identifier, and whoever hears it looks that
     * identifier up. A members workspace knows its computers by their device
     * identifier and by nothing else, so shouting the older workspace's name
     * for this machine meant every shout was heard, matched against nothing,
     * and dropped — two computers that had joined each other sat there
     * calling out and both saying the other was offline.
     */
    const me = await device.card();
    return lan.start({ machine: me.deviceId, name: me.displayName, account: team.id, key: theirs });
  }

  const state = await workspace.state();
  if (!state.joined) {
    return {
      ok: false,
      sentence: 'Your computers cannot find each other until this one is in a workspace.',
      action: 'Make one or join one with a code — that is what gives them a way to '
        + 'recognise each other.',
    };
  }
  const key = await workspace.secret();
  return lan.start({ machine, name: await myName(), account: state.account, key });
}

/**
 * Answer people trying to join, whenever there is a live invitation.
 *
 * Started when one is made and again when the app starts, so a code read aloud
 * five minutes ago still works. It answers nobody when there is nothing live,
 * which is the ordinary state of a workspace.
 */
/**
 * An answer, with the state of the workspace attached — and the answer wins.
 *
 * Written out by hand at nine call sites as `{ ...out, ...around() }`, which
 * quietly reverses what it says: `around()` ends with `ok: true`, so a refusal
 * combined with it came back as a success. A made-up invitation was answered
 * "That invitation does not work" **with `ok: true` on it**, so the page said
 * it had worked. Nothing was let in — the refusal was real — but everything
 * on the screen said otherwise, which is the failure this project cares about
 * most.
 */
async function withWorkspace(out) {
  const around = await anywhere.around();
  return { ...around, ...out };
}

async function listenForJoiners() {
  const ws = await membersOf.current();
  if (!ws) return joining.stopAnswering();

  const live = await membersOf.liveInvites(ws);
  if (!live.length) return joining.stopAnswering();
  if (joining.isAnswering()) return null;

  return joining.answerJoiners({
    liveOnes: async () => {
      const now = await membersOf.current();
      return now ? membersOf.liveInvites(now) : [];
    },
    // Read fresh, and redeemed against the record this computer actually holds.
    // Nothing the joiner said decides anything except which code was tried.
    letThemIn: async (code, card, person) => {
      const now = await membersOf.current();
      if (!now) return { ok: false, sentence: 'This computer is not in a workspace.' };
      const out = await membersOf.redeem({ workspace: now, code, person, device: card });
      if (out.ok) await activity.remember('joined', { who: card.displayName ?? person, what: now.name });
      return out;
    },
    whoAmI: async () => (await device.card()).displayName,
  });
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
    return {
      settings: await settings.described(),
      // Which part of the page each one is drawn on, said here rather than in
      // the page, so one place decides what belongs with what.
      parts: settings.PARTS,
      record: settings.recordFolder,
    };
  },

  async 'POST /settings'({ body }) {
    const r = await settings.set(body.id, body.value);
    if (r.ok && body.id === 'watchFolder') await watchProject(current?.dir ?? null);
    if (r.ok && body.id === 'localSharing') await localSharing();
    /*
     * What this computer is called is one name, not two.
     *
     * The setting named it for the older workspace and `device.mjs` kept its
     * own for the newer one, so renaming a computer changed it in one list and
     * not the other — and two profiles on one machine both introduced
     * themselves by the same hostname whatever anybody had typed.
     */
    if (r.ok && body.id === 'machineName') await device.rename(body.value).catch(() => null);
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
    return browse.chooseFolder();
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

  /**
   * The one place anything asks who this computer is on GitHub.
   *
   * Settings, the Workspace, a project's destination and Deploy all read this
   * answer rather than working one out. Two screens disagreeing about the
   * account was never a wording problem — it was two screens asking two
   * different questions at two different moments.
   */
  async 'GET /github'() {
    const [accounts, identity, now] = await Promise.all([
      github.accounts(), github.identity(), github.session(),
    ]);
    const picture = current ? await github.picture(current.dir) : null;
    return {
      ...accounts,
      // Whether the answer is a fact or the last one confirmed, said out loud.
      account: now.login,
      reachable: now.reachable,
      stale: now.stale,
      identity,
      picture,
      project: current?.name ?? null,
    };
  },

  /** Ask GitHub again, now, rather than waiting for the held answer to lapse. */
  async 'POST /github/refresh'() {
    github.forgetWho();
    const now = await github.session({ fresh: true });
    return {
      ok: now.reachable,
      sentence: now.reachable
        ? (now.login ? `Signed in as ${now.login}.` : 'Not signed in to GitHub on this computer.')
        : 'GitHub still could not be reached.',
      action: now.reachable ? null : 'Check you are online, and try again.',
    };
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

  /**
   * Whether there is a newer Viberant.
   *
   * A read, never a write. The one thing it will not do is install anything —
   * `newer.mjs` says at length why, and `signing` below carries that sentence
   * to the page so the reason is on screen rather than in a comment.
   */
  async 'GET /newer'() {
    return { ...(await newer.check(VERSION)), signing: newer.signing() };
  },

  async 'POST /newer'() {
    return { ...(await newer.check(VERSION, { force: true })), signing: newer.signing() };
  },

  // -- your computers, wherever they are ------------------------------------
  //
  // One shape for all of it. Nothing below knows whether a computer is in the
  // next room or on the other side of the country, because `anywhere.reach`
  // answers the same way either way.

  /** This computer, and the workspace it takes part in. */
  async 'GET /me/device'() {
    const me = await device.card();
    const ws = await membersOf.current();
    return {
      ...me,
      workspace: ws ? { id: ws.id, name: ws.name } : null,
      // Every workspace this computer knows about, for the switcher.
      all: (await membersOf.all()).map((w) => ({ id: w.id, name: w.name })),
    };
  },

  async 'POST /me/device/name'({ body }) {
    return device.rename(body?.name);
  },

  /** Everybody in this workspace, and how each can be reached right now. */
  async 'GET /team'() {
    const ws = await membersOf.current();
    // Anything that has run out goes now, so a list can never show a code that
    // would be refused if anybody typed it.
    if (ws) await membersOf.sweepInvites(ws);

    const me = await device.card();
    return {
      ...(await anywhere.around()),
      invites: ws ? await membersOf.liveInvites(ws) : [],
      // Whether this computer may do the things that manage a workspace, so the
      // page can offer them rather than offering and then refusing.
      mayManage: !!ws && membersOf.may(ws, me.deviceId, 'manageMembers'),
    };
  },

  /**
   * Stop taking part, from this computer.
   *
   * Nothing of anybody's is deleted. The workspace carries on for everybody
   * else — somebody leaving is not the same as a workspace ending.
   */
  /**
   * What is different between a project here and the same one over there.
   *
   * Asked, compared and summarised — nothing moves. Everything it needs
   * already exists: the far end can produce a list of what it holds, and this
   * computer already knows how to compare two of those and say which files
   * both sides changed.
   *
   * Deliberately read-only. Somebody looking at "twelve changed" has not asked
   * for anything to happen, and a page that quietly began a transfer because
   * you looked at it would be the worst thing in this product.
   */
  async 'POST /workspace/changes'({ body }) {
    const ws = await membersOf.current();
    if (!ws) return { ok: false, sentence: 'This computer is not in a workspace.', action: null };

    const mineAt = body?.dir ? resolve(body.dir) : current?.dir;
    if (!mineAt || !existsSync(mineAt)) {
      return { ok: false, sentence: 'That project is not on this computer.', action: 'Open it first.' };
    }

    const found = await anywhere.reach(String(body?.device ?? ''));
    if (!found.ok) return found;

    const theirs = await askPeer(found.peer, { what: 'manifest', offer: body?.offer });
    found.peer.close?.();

    if (!theirs?.ok) {
      return {
        ok: false,
        sentence: 'That computer would not say what it has.',
        action: 'It may not be offering that project any more.',
      };
    }

    const mine = await syncing.manifest(mineAt, { everything: false });
    const work = syncing.compare(mine, theirs);
    const bothChanged = syncing.conflicts(mine, theirs);

    return {
      ok: true,
      says: syncing.inWords(work),
      // What a person wants to know before pressing anything: how many, of
      // which kinds, and whether any of it is a decision rather than a copy.
      added: work.extra.length,
      changed: work.changed.length,
      onlyHere: work.missing.length,
      unchanged: work.same.length,
      bytes: work.bytesToSend,
      conflicts: bothChanged,
      state: bothChanged.length ? 'CONFLICT'
        : work.extra.length || work.changed.length ? 'CHANGES_AVAILABLE'
          : 'UP_TO_DATE',
      // Names only, and only a handful: this is a summary, not a file browser.
      examples: [...work.extra.slice(0, 5), ...work.changed.slice(0, 5)].slice(0, 8),
    };
  },

  async 'POST /team/leave'({ body }) {
    const ws = await membersOf.current();
    if (!ws) return { ok: false, sentence: 'This computer is not in a workspace.', action: null };

    const me = await device.card();
    await anywhere.stop().catch(() => null);
    const out = await membersOf.leave(body?.workspace ?? ws.id, me.deviceId);
    if (out.ok) await activity.remember('left', { who: me.displayName });
    return await withWorkspace(out);
  },

  /** End a workspace, as its owner. Separate, and harder to reach. */
  async 'POST /team/close'({ body }) {
    const ws = await membersOf.current();
    if (!ws) return { ok: false, sentence: 'This computer is not in a workspace.', action: null };

    const me = await device.card();
    await anywhere.stop().catch(() => null);
    const out = await membersOf.close(body?.workspace ?? ws.id, me.deviceId);
    return await withWorkspace(out);
  },

  async 'POST /team/rename'({ body }) {
    const ws = await membersOf.current();
    const me = await device.card();
    if (!ws || !membersOf.may(ws, me.deviceId, 'manageMembers')) {
      return { ok: false, sentence: 'Only whoever owns this workspace can rename it.', action: null };
    }
    return await withWorkspace(await membersOf.rename(ws.id, body?.name));
  },

  async 'POST /team/start'() {
    const out = await anywhere.beAbout();
    return await withWorkspace(out);
  },

  async 'POST /team/stop'() {
    return await withWorkspace(await anywhere.stop());
  },

  // -- making a workspace, and letting somebody in ---------------------------

  async 'POST /team/create'({ body }) {
    const me = await device.card();
    const out = await membersOf.create({
      name: body?.name,
      owner: (await github.session())?.login || me.displayName,
      device: me,
    });
    if (out.ok) {
      await anywhere.beAbout({ workspace: out.workspace }).catch(() => null);
      await activity.remember('joined', { who: me.displayName, what: out.workspace.name });
      // Making a workspace is joining one, as far as being findable goes.
      await lan.stop().catch(() => null);
      await localSharing().catch(() => null);
    }
    return await withWorkspace(out);
  },

  async 'POST /team/invite'({ body }) {
    const ws = await membersOf.current();
    if (!ws) return { ok: false, sentence: 'This computer is not in a workspace.', action: 'Make one first.' };

    const me = await device.card();
    if (!membersOf.may(ws, me.deviceId, 'manageMembers')) {
      return {
        ok: false,
        sentence: 'Only whoever owns this workspace can invite somebody.',
        action: 'Ask them to send you a code.',
      };
    }
    const made = await membersOf.invite({ workspace: ws, by: me.displayName, role: body?.role ?? 'member' });
    if (made.ok) await listenForJoiners();
    return made;
  },

  async 'POST /team/invite/cancel'({ body }) {
    const ws = await membersOf.current();
    if (!ws) return { ok: false, sentence: 'This computer is not in a workspace.', action: null };
    return membersOf.cancelInvite(ws, body?.of);
  },

  /**
   * Use a code, on a computer that can already see the workspace.
   *
   * **The honest limit, said here rather than found out by pressing.** A code
   * is the permission to join; it is not the workspace. The workspace itself
   * — who is in it, what each may do, the keys they know each other by —
   * lives on the computer that made it, and something has to carry it across.
   * Today the only thing that does is a service both computers can reach, and
   * with no address for one there is nothing for a code to be redeemed against.
   *
   * So this refuses, and says the actual reason. It used to say the same thing
   * in words that read like a settings problem, which sent people to look for a
   * box that would not have helped.
   */
  /**
   * Use a code.
   *
   * Two ways, and the second is the one that used to be missing. A computer
   * already in the workspace redeems the code against the record it has. A
   * computer that has never seen the workspace has nothing to redeem against,
   * so it goes and asks: it calls out the fingerprint of the code on this
   * network, whoever holds a live invitation matching it answers, and the code
   * itself is then said down one connection to that computer alone.
   *
   * The code is the whole of the authorisation. `redeem` runs on the owner's
   * own record, on the owner's own computer, and already refuses one that has
   * run out, been used, or been made up.
   */
  async 'POST /team/join'({ body }) {
    const me = await device.card();
    const person = (await github.session())?.login || me.displayName;
    const ws = await membersOf.current();

    if (!ws) {
      const found = await joining.askToJoin({ code: body?.code, card: me, person });
      if (!found.ok) return found;

      const kept = await membersOf.remember(found.workspace);
      await anywhere.beAbout({ workspace: kept.workspace }).catch(() => null);
      // The beacon is keyed on the workspace, so joining one changes which key
      // this computer answers to. Restarted here rather than on the next thing
      // that happens to touch it.
      await lan.stop().catch(() => null);
      await localSharing().catch(() => null);
      await activity.remember('joined', { who: me.displayName, what: kept.workspace.name });

      return withWorkspace({
        ok: true,
        workspace: kept.workspace,
        sentence: `You are in ${kept.workspace.name}.`,
        action: found.from ? `${found.from} let this computer in.` : null,
      });
    }

    const out = await membersOf.redeem({ workspace: ws, code: body?.code, person, device: me });
    if (out.ok) {
      await anywhere.beAbout({ workspace: out.workspace }).catch(() => null);
      await activity.remember('joined', { who: me.displayName, what: out.workspace.name });
      await lan.stop().catch(() => null);
      await localSharing().catch(() => null);
    }
    return await withWorkspace(out);
  },

  // -- who may do what -------------------------------------------------------

  async 'POST /team/allow'({ body }) {
    const ws = await membersOf.current();
    const me = await device.card();
    if (!ws || !membersOf.may(ws, me.deviceId, 'manageMembers')) {
      return {
        ok: false,
        sentence: 'Only whoever owns this workspace can change what a computer may do.',
        action: null,
      };
    }
    const out = await membersOf.allow(ws, body?.device, body?.capability, body?.yes);
    if (out.ok && body?.yes) {
      await activity.remember('allowed', {
        who: ws.devices?.[body.device]?.displayName ?? 'a computer',
        what: { remoteTerminal: 'open a terminal', remoteRun: 'run things', remoteBuild: 'build' }[body.capability] ?? body.capability,
      });
    }
    return await withWorkspace(out);
  },

  async 'POST /team/revoke'({ body }) {
    const ws = await membersOf.current();
    const me = await device.card();
    if (!ws || !membersOf.may(ws, me.deviceId, 'manageMembers')) {
      return { ok: false, sentence: 'Only whoever owns this workspace can do that.', action: null };
    }
    const gone = ws.devices?.[body?.what]?.displayName ?? body?.what;
    const out = await membersOf.revoke(ws, body?.what);
    if (out.ok) await activity.remember('revoked', { who: gone });
    return await withWorkspace(out);
  },

  // -- doing something on a computer of yours --------------------------------
  //
  // Everything here goes through `remote.mayAsk` on the machine that would do
  // the work. This route is the near end asking; it is never the authority.

  /** What this computer would let this project be asked to do. */
  async 'GET /remote/can'({ url }) {
    const at = url.searchParams.get('path') || current?.dir;
    if (!at || !existsSync(at)) return { ok: false, sentence: 'No project chosen.', action: null };
    return { ok: true, ...(await remote.whatItCanDo(at)) };
  },

  /** What is happening on this computer at somebody else's asking. */
  async 'GET /remote/sessions'() {
    return { ok: true, sessions: remote.openSessions() };
  },

  async 'POST /remote/terminal'({ body }) {
    const ws = await membersOf.current();
    const me = await device.card();
    const out = remote.openTerminal({
      workspace: ws,
      fromDevice: body?.asDevice || me.deviceId,
      whoName: me.displayName,
      where: body?.where || current?.dir,
      onOutput: (text) => terminalSaid(out?.session, text),
    });
    return out;
  },

  async 'POST /remote/terminal/type'({ body }) {
    return remote.typeInto(body?.session, body?.text);
  },

  async 'POST /remote/terminal/close'({ body }) {
    return remote.closeTerminal(body?.session);
  },

  async 'GET /remote/terminal/said'({ url }) {
    return { ok: true, text: terminalSince(url.searchParams.get('session')) };
  },

  async 'POST /remote/do'({ body }) {
    const ws = await membersOf.current();
    const me = await device.card();
    return remote.doNamed({
      workspace: ws,
      fromDevice: body?.asDevice || me.deviceId,
      whoName: me.displayName,
      dir: body?.path || current?.dir,
      name: body?.name,
      kind: body?.name === 'build' ? remote.BUILD : remote.RUN,
    });
  },

  async 'POST /remote/stop'({ body }) {
    return remote.stopNamed(body?.session);
  },

  // -- comparing two computers ----------------------------------------------

  /** What this computer is, for a comparison. Names only, never values. */
  async 'GET /machine'({ url }) {
    const at = url.searchParams.get('path') || current?.dir || null;
    return { ok: true, machine: await machines.whatThisIs({ dir: at }) };
  },

  /**
   * Two computers, side by side.
   *
   * The far end is asked what it is over the same connection everything else
   * uses. With nobody reachable, this says so rather than inventing a machine.
   */
  async 'POST /machine/compare'({ body }) {
    const mine = await machines.whatThisIs({ dir: current?.dir ?? null });
    const found = await anywhere.reach(body?.device);
    if (!found.ok) return found;

    const theirs = await askPeer(found.peer, { what: 'machine', path: body?.theirPath ?? null });
    found.peer.close();
    if (!theirs?.machine) {
      return {
        ok: false,
        sentence: 'That computer did not say what it is.',
        action: 'Try again in a moment.',
      };
    }
    return { ok: true, mine, theirs: theirs.machine, ...machines.compare(mine, theirs.machine) };
  },

  // -- sending only what changed ---------------------------------------------

  /** What this computer holds of a project, so another can send only the rest. */
  async 'GET /sync/manifest'({ url }) {
    const at = url.searchParams.get('path');
    if (!at || !existsSync(at)) return { ok: false, sentence: 'That project is not here.', action: null };
    return { ok: true, ...(await syncing.manifest(at, { everything: false })) };
  },

  /** The ways back this project has, and putting one back. */
  async 'GET /waysback'({ url }) {
    const at = url.searchParams.get('path') || current?.dir;
    if (!at) return { ok: true, waysBack: [] };
    return { ok: true, waysBack: await snapshots.forProject(at) };
  },

  async 'POST /waysback/restore'({ body }) {
    return snapshots.restore(body?.id);
  },

  // -- what a build made, and looking at what is running there ---------------

  /** What this project would send back, if it were asked. */
  async 'GET /remote/built'({ url }) {
    const at = url.searchParams.get('path') || current?.dir;
    if (!at) return { ok: false, sentence: 'No project chosen.', action: null };
    return artifacts.whatCameOut(at);
  },

  /**
   * Bring back what another computer built.
   *
   * It lands beside the project rather than in it, named for where it came
   * from — so two machines' answers do not overwrite each other, and neither
   * overwrites yours.
   */
  async 'POST /remote/bring-built'({ body }) {
    const found = await anywhere.reach(body?.device);
    if (!found.ok) return found;

    const job = jobs.begin({
      what: `Bringing back what ${found.peer.who.displayName} built`,
      where: current?.dir ?? '',
      kind: 'transfer',
    });

    try {
      const post = channelsOf.channels(found.peer, { odd: false });
      const channel = await post.start('artifact');
      const into = await settings.get('workFolder');
      const out = await artifacts.receive(channel, {
        into: into || dirname(current?.dir ?? process.cwd()),
        from: found.peer.who.displayName,
        named: current?.name ?? 'project',
      });
      found.peer.close();
      jobs.end(job, out);
      return out;
    } catch (e) {
      found.peer.close();
      const failed = {
        ok: false,
        sentence: 'What that computer built did not arrive.',
        action: 'Try again when both are settled.',
      };
      jobs.end(job, failed);
      return failed;
    }
  },

  /**
   * Open a window onto something running on another computer.
   *
   * The address that comes back is on this computer only. Nothing is put on the
   * network and nothing is put on the internet.
   */
  async 'POST /remote/preview'({ body }) {
    const found = await anywhere.reach(body?.device);
    if (!found.ok) return found;

    const post = channelsOf.channels(found.peer, { odd: false });
    return previewing.open({
      peer: found.peer,
      channels: post,
      port: Number(body?.port),
      name: body?.name ?? null,
    });
  },

  async 'GET /remote/previews'() {
    return { ok: true, windows: previewing.openWindows() };
  },

  async 'POST /remote/preview/close'({ body }) {
    return previewing.close(body?.at);
  },

  /** How much has gone which way. Numbers only, and none of them leave here. */
  async 'GET /carried'() {
    return { ok: true, ...(await carried.sofar()) };
  },

  /**
   * Bring the changed part of a project from another computer.
   *
   * An errand rather than a request, because on a large project this takes
   * minutes and nobody should have to stay on the page for it.
   */
  async 'POST /sync/bring'({ body }) {
    const found = await anywhere.reach(body?.device);
    if (!found.ok) return found;

    const into = body?.path || current?.dir;
    if (!into) {
      found.peer.close();
      return { ok: false, sentence: 'No project chosen.', action: 'Open one first.' };
    }

    const job = jobs.begin({
      what: `Bringing changes from ${found.peer.who.displayName}`,
      where: into,
      kind: 'sync',
      project: current?.name ?? null,
    });

    (async () => {
      try {
        const post = channelsOf.channels(found.peer, { odd: false });
        const channel = await post.start(`sync:${body?.offer ?? ''}`);

        const out = await syncing.bring({
          channel,
          into,
          snapshotWith: snapshots.before,
          onProgress: (text) => jobs.write(job, text),
        });
        found.peer.close();
        jobs.end(job, out);
        activity.remember(out.ok ? 'synced' : 'sync failed', {
          who: found.peer.who.displayName, what: current?.name ?? into,
        });
      } catch (e) {
        found.peer.close();
        jobs.end(job, {
          ok: false,
          sentence: 'The changes did not come over.',
          action: 'Try again when both computers are settled.',
        });
      }
    })();

    return { ok: true, job: job.id, sentence: 'Bringing over what changed.' };
  },

  /** What has happened in this workspace, as facts rather than a feed. */
  async 'GET /team/activity'() {
    return { ok: true, activity: await activity.recently() };
  },

  /**
   * Connect Vercel, on its own, rather than only as the first step of a deploy.
   *
   * Somebody pressing Connect wants to be connected; making them start a deploy
   * to get there is the reason the screen sat on "Not connected" while the
   * browser had plainly said yes. The errand is a job so the page can watch it,
   * and the page asks for the state again when it finishes — no restart.
   */
  /**
   * Connect Vercel, by a token that is checked before it is kept.
   *
   * This used to start Vercel's own sign-in as a background command and wait
   * for a browser. Inside an app with no terminal attached that command has
   * nowhere to print what it wants you to visit and nothing to read your answer
   * from, so it waited, and all anybody saw was a spinner that never stopped.
   * Sometimes the browser half worked, which was worse: authorised over there,
   * "Not connected" over here, and a process left running.
   */
  async 'POST /ship/token'({ body }) {
    const token = String(body?.token ?? '').trim();
    const checked = await providers.vercel.checkToken(token);
    if (!checked.ok) return checked;

    await settings.set('vercelToken', token);
    providers.forgetVercel();

    return { ...checked, vercel: await providers.vercel.state({ fresh: true }) };
  },

  /** Where to make one, opened in a browser. Never a token over the wire. */
  async 'POST /ship/get-token'() {
    signin.openInBrowser(providers.VERCEL_TOKEN_PAGE);
    return {
      ok: true,
      sentence: "Vercel's token page is open in your browser.",
      action: 'Make one there, then paste it here. It stays on this computer.',
    };
  },

  /** Stop acting as that account on this computer. */
  async 'POST /ship/forget'() {
    await settings.set('vercelToken', '');
    providers.forgetVercel();
    return {
      ok: true,
      sentence: 'Vercel is no longer connected on this computer.',
      action: 'Nothing that is already online was touched.',
      vercel: await providers.vercel.state({ fresh: true }),
    };
  },

  /** Ask Vercel again, rather than trusting what was true twenty seconds ago. */
  async 'POST /ship/again'() {
    providers.forgetVercel();
    return { ok: true, vercel: await providers.vercel.state({ fresh: true }) };
  },

  /** What every place this can put a site is, asked fresh. */
  async 'GET /ship/places'() {
    const [v, look] = await Promise.all([
      providers.vercel.state(),
      current ? providers.inspect(current.dir) : null,
    ]);
    const bound = current ? await providers.bindingFor(current.dir) : null;
    return { ok: true, vercel: v, look, live: bound ?? null, project: current?.name ?? null };
  },

  async 'GET /feedback'() {
    return { kinds: feedback.KINDS, said: await feedback.said(), home: await feedback.issuesGoTo() };
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
    return github.connectTo(going.binding.gitRoot ?? current.dir, {
      name,
      session: going.session,
      // Only ever a value the page got back from a refusal it showed somebody.
      useExisting: body?.useExisting ?? null,
    });
  },

  // -- asking a model about this project ----------------------------------
  //
  // Reading is free and changing is not, and that line is drawn here: every
  // route below reads, except the last one, which is reached only by pressing
  // something that says what it will change.

  async 'GET /ai'() {
    const set = await assistant.ready();
    return { ...set, ...(await assistant.whoCanBeAsked()), project: current?.name ?? null };
  },

  /**
   * Add a key, having checked it first.
   *
   * Checked before it is kept, because a key that is one character short looks
   * exactly like a working one until somebody asks a question and gets a
   * refusal they cannot interpret. Nothing is written unless it works.
   */
  async 'POST /ai/key'({ body }) {
    const which = String(body?.provider ?? '');
    const key = String(body?.key ?? '').trim();

    const checked = await assistant.checkKey(which, key);
    if (!checked.ok) return checked;

    const one = assistant.modelCalled(which);
    await settings.set(one.keySetting, key);
    await settings.set('askWho', which);

    return { ...checked, ...(await assistant.whoCanBeAsked()) };
  },

  /** Which company to ask, and which of its models. */
  async 'POST /ai/choose'({ body }) {
    const which = String(body?.provider ?? '');
    const one = assistant.modelCalled(which);
    if (!one) return { ok: false, sentence: 'That is not one this can ask.', action: null };

    if (body?.provider) await settings.set('askWho', which);
    if (body?.model) {
      const offered = assistant.CATALOGUE[which]?.models ?? [];
      if (!offered.some((m) => m.id === body.model)) {
        return { ok: false, sentence: 'That is not a model this offers.', action: null };
      }
      await settings.set(`model:${which}`, String(body.model));
    }

    const said = await assistant.whoCanBeAsked();
    const mine = said.models.find((m) => m.id === which);
    const named = (mine?.models ?? []).find((m) => m.id === mine?.using)?.name ?? mine?.using;

    return {
      ok: true,
      sentence: body?.model
        ? `${one.name} will use ${named}.`
        : `${one.name} it is${named ? `, using ${named}` : ''}.`,
      ...said,
    };
  },

  /** Where to get a key, opened in a browser. Never a key over the wire. */
  async 'POST /ai/get-key'({ body }) {
    const one = assistant.modelCalled(String(body?.provider ?? ''));
    if (!one) return { ok: false, sentence: 'That is not one this can ask.', action: null };
    signin.openInBrowser(one.where);
    return {
      ok: true,
      sentence: `${one.name}'s key page is open in your browser.`,
      action: 'Make a key there, then paste it here. It stays on this computer.',
    };
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
  /**
   * Why do these two computers behave differently?
   *
   * Both halves are gathered first, then handed to a model. What it is given
   * has never held a secret value — the comparison is names and counts — so the
   * redaction is a second line of defence rather than the only one.
   */
  async 'POST /ai/why-different'({ body }) {
    const mine = await machines.whatThisIs({ dir: current?.dir ?? null });
    const found = await anywhere.reach(body?.device);
    if (!found.ok) return found;

    const theirs = await askPeer(found.peer, { what: 'machine', path: null });
    found.peer.close();
    if (!theirs?.machine) {
      return { ok: false, sentence: 'That computer did not say what it is.', action: 'Try again in a moment.' };
    }

    return assistant.whyDifferent({
      mine,
      theirs: theirs.machine,
      comparison: machines.compare(mine, theirs.machine),
      what: body?.what ?? null,
    });
  },

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
      /**
       * The new half, in the safe form of everything.
       *
       * The device identifier is the public fingerprint, which is what other
       * computers already know. No addresses, because an address is where
       * somebody lives, and no keys, because keys.
       */
      thisDevice: await (async () => {
        const me = await device.card();
        const ws2 = await membersOf.current();
        const team = ws2 ? await anywhere.around({ workspace: ws2 }) : null;
        return {
          id: me.deviceId,
          name: me.displayName,
          workspace: ws2 ? ws2.name : 'none',
          service: team?.service ?? 'not in a workspace',
          computers: team ? team.mine.length + team.team.length : 0,
          online: team ? [...team.mine, ...team.team].filter((o) => o.online).length : 0,
          // How each reachable one is reached, counted rather than listed.
          connections: team
            ? [...team.mine, ...team.team].filter((o) => o.online && !o.you)
              .reduce((all, o) => ({ ...all, [o.how]: (all[o.how] ?? 0) + 1 }), {})
            : {},
        };
      })(),
      runningHere: remote.openSessions().map((one) => ({
        kind: one.kind, who: one.who, began: one.began,
      })),
      // How much went which way. The relay figure is the only one that costs
      // anybody anything, which is why it is worth knowing before there is a
      // price on it.
      carried: await carried.sofar(),
      previews: previewing.openWindows().length,
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
    // Whether there is a website in here at all, and where. Worked out here so
    // the page can say so before anybody presses anything, rather than after a
    // deploy has run for five minutes against a desktop application.
    const web = await providers.webPartOf(current.dir);
    return {
      open: true,
      name: current.name,
      dir: current.dir,
      binding,
      look,
      deployedTo: where,
      vercel: vercelState,
      web: {
        ok: web.ok,
        root: web.root,
        inside: web.inside ?? null,
        kind: web.kind ?? null,
        sentence: web.sentence ?? null,
        action: web.action ?? null,
      },
      slug: providers.slugFor(current.name),
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
      // Read once, here, from the project that is open at the moment of the
      // press. Everything below uses these and never asks again, so a project
      // changed while a deploy is running cannot redirect it.
      const dir = current.dir;
      const name = current.name;
      const job = jobs.begin({ what: `Putting ${name} online`, where: dir, kind: 'deploy', project: name });

      (async () => {
        const state = await providers.vercel.state({ fresh: true });

        if (!state.connected) {
          return jobs.end(job, {
            ok: false,
            sentence: state.sentence ?? 'Vercel is not connected on this computer.',
            action: state.action ?? 'Connect it on this page first.',
            needsToken: !!state.needsToken,
          });
        }
        if (!state.here) {
          return jobs.end(job, {
            ok: false,
            sentence: 'Vercel is connected, but the command that builds and uploads is not on this computer.',
            action: 'Install it once with npm install -g vercel, then try again.',
          });
        }

        const token = await settings.get('vercelToken');
        const out = await providers.vercel.deploy(job, jobs, {
          dir, name, token, account: state.login,
        });
        if (!out.ok) return jobs.end(job, out);

        // Everything worth writing down, against this project by its own path,
        // so the next press goes to the same place and project B never
        // inherits project A's site.
        await providers.bind(dir, { ...out.binding, name });

        return jobs.end(job, {
          ok: true,
          at: out.at,
          inspect: out.inspect ?? null,
          sentence: `${name} is live at ${out.at}`,
          action: out.noFrontPage
            ? 'Vercel says it is ready, and the address itself shows nothing — this project has no front page, so its pages are at their own names.'
            : 'Checked with Vercel: it is serving that address now.',
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
      /*
       * Not in the older workspace is not "not sharing".
       *
       * This said `sharingHere: false` and an empty list of who is about,
       * whatever was actually true, so a computer in a members workspace —
       * beacon running, other computers audible — was told on the page that
       * it could not be reached by anybody.
       */
      return {
        ...state,
        machines: [],
        projects: [],
        said: [],
        around: lan.around(),
        offers: await lan.offers(),
        sharingHere: lan.isOn(),
        workFolder: await settings.get('workFolder'),
      };
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

  /**
   * Say something to the workspace.
   *
   * Written down here first, so it exists whatever happens next, then handed to
   * every member who is reachable right now. It used to go through GitHub —
   * written, committed, sent, and read back by whoever synced next, which could
   * be minutes. Nobody types a sentence to somebody in the next room and
   * expects it to travel via a hosting service.
   */
  async 'POST /workspace/say'({ body }) {
    const text = String(body?.text ?? '').trim().slice(0, 2000);
    if (!text) return { ok: false, sentence: 'There was nothing to say.', action: null };

    const ws = await membersOf.current();
    if (!ws) return { ok: false, sentence: 'This computer is not in a workspace.', action: 'Make one or join one.' };

    const me = await device.card();
    const one = chatter.anEvent({
      kind: 'note',
      workspace: ws.id,
      from: me.deviceId,
      fromName: me.displayName,
      text,
    });

    await chatter.remember(one);
    const reached = await sayItToTheOthers(ws, one);

    return {
      ok: true,
      event: one,
      reached,
      sentence: reached ? null : 'Nobody else is reachable right now, so only this computer has it.',
    };
  },

  /**
   * Everything that has happened lately, and everything that happens next.
   *
   * One stream, opened once by the page, rather than a timer per screen asking
   * whether anything changed. A note arriving writes one line down it; nothing
   * is redrawn, and it arrives whichever screen somebody is looking at.
   */
  async 'GET /events'({ res, url }) {
    const ws = await membersOf.current();
    const since = Number(url.searchParams.get('since') ?? 0);

    res.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-store',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    });

    const write = (one) => {
      if (ws && one.workspace && one.workspace !== ws.id) return;
      res.write(`id: ${one.id}
data: ${JSON.stringify(one)}

`);
    };

    // What was missed, then everything from now on. The identifier on each is
    // what lets the page throw away anything it has already seen.
    for (const one of await chatter.lately({ workspace: ws?.id ?? null })) {
      if (one.at > since) write(one);
    }

    const stop = chatter.listen(write);
    // A silent stream is indistinguishable from a broken one, to anything in
    // between. This says nothing, often enough that nothing gives up on it.
    const beat = setInterval(() => res.write(`: still here

`), 25000);

    const done = () => { clearInterval(beat); stop(); };
    res.on('close', done);
    res.on('error', done);

    return null;
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
/**
 * Asking one of your computers a question, and hearing the answer.
 *
 * One small errand shape on top of `peers`: a question with a name, an answer
 * with the same name. Everything the app asks another machine goes through
 * this, so there is one place where a request from somewhere else is turned
 * into a decision — and that place calls the same `remote.mayAsk` a local
 * request calls, because the far end deciding is the whole security model.
 */
const ANSWER_WITHIN = 20000;

/**
 * Ask one of your computers something, down a channel of its own.
 *
 * A channel is written to with `write`; a connection is written to with `send`.
 * This handed a channel to something expecting a connection, so every question
 * ever asked over the local network threw the moment it tried to speak — the
 * connection was made, the other end was listening, and nothing was ever said.
 * The answering side had already been adapted the same way; this half had not.
 */
async function askPeer(peer, question) {
  const post = channelsOf.channels(peer, { odd: false });
  const channel = await post.start('ask');
  return askOn({
    send: (text) => channel.write(text),
    incoming: channel.incoming,
  }, question);
}

function askOn(peer, question) {
  return new Promise((done) => {
    const id = ulid();
    let held = '';

    const onData = (chunk) => {
      held += chunk.toString();
      const at = held.indexOf('\n');
      if (at === -1) return;
      const line = held.slice(0, at);
      held = held.slice(at + 1);
      let said;
      try { said = JSON.parse(line); } catch { return finish(null); }
      if (said?.id === id) finish(said);
    };

    let settled = false;
    const finish = (v) => {
      if (settled) return;
      settled = true;
      clearTimeout(waiting);
      peer.incoming.off('data', onData);
      done(v);
    };

    const waiting = setTimeout(() => finish(null), ANSWER_WITHIN);
    peer.incoming.on('data', onData);
    peer.send(`${JSON.stringify({ id, ...question })}\n`).catch(() => finish(null));
  });
}

/**
 * What this computer does when one of yours asks it something.
 *
 * Every branch checks with `remote.mayAsk` before doing anything, on this
 * machine, from what this machine believes. A caller that has already decided
 * it is allowed is not consulted.
 */
async function answerPeer(peer, asked) {
  const ws = await membersOf.current();
  const from = peer.who?.deviceId;

  const reply = (body) => peer.send(`${JSON.stringify({ id: asked.id, ...body })}\n`).catch(() => {});

  if (asked.what === 'machine') {
    // Saying what this computer is needs no special permission — it is names
    // and versions, and being in the workspace at all is the check.
    if (!ws?.devices?.[from] || membersOf.isRevoked(ws, from)) return reply({ ok: false });
    return reply({ ok: true, machine: await machines.whatThisIs({ dir: asked.path || null }) });
  }

  /*
   * Something said rather than asked, and the only message here that is.
   *
   * Membership-checked exactly like the rest — the way in that skips that
   * check is `joining.mjs`, it can do one thing, and it is not this. Written
   * down by its own identifier, so a computer repeating itself after
   * reconnecting does not produce a second note.
   */
  if (asked.what === 'said') {
    if (!ws?.devices?.[from] || membersOf.isRevoked(ws, from)) return reply({ ok: false });
    if (asked.event?.workspace !== ws.id) return reply({ ok: false });

    const out = await chatter.remember({
      ...asked.event,
      // Whoever it claims to be from is not taken on trust: it is whoever this
      // connection is actually with.
      from,
      fromName: ws.devices[from].displayName ?? asked.event?.fromName ?? null,
    });
    return reply({ ok: true, ...out });
  }

  if (asked.what === 'manifest') {
    if (!membersOf.may(ws, from, 'seeOffered')) return reply({ ok: false });
    const one = (await lan.offers()).find((o) => o.id === asked.offer);
    if (!one) return reply({ ok: false });
    return reply({ ok: true, ...(await syncing.manifest(one.path, { everything: one.everything })) });
  }

  if (asked.what === 'can') {
    if (!ws?.devices?.[from] || membersOf.isRevoked(ws, from)) return reply({ ok: false });
    const one = (await lan.offers()).find((o) => o.id === asked.offer);
    if (!one) return reply({ ok: false });
    return reply({ ok: true, ...(await remote.whatItCanDo(one.path)) });
  }

  if (asked.what === 'do') {
    const one = (await lan.offers()).find((o) => o.id === asked.offer);
    if (!one) return reply({ ok: false, sentence: 'That project is not offered from this computer.' });

    const out = await remote.doNamed({
      workspace: ws,
      fromDevice: from,
      whoName: ws?.devices?.[from]?.displayName ?? 'somebody',
      dir: one.path,
      name: asked.name,
      kind: asked.name === 'build' ? remote.BUILD : remote.RUN,
    });
    return reply(out);
  }

  if (asked.what === 'said') {
    if (!ws?.devices?.[from] || membersOf.isRevoked(ws, from)) return reply({ ok: false });
    return reply(remote.whatItSaid(asked.session));
  }

  return reply({ ok: false, sentence: 'This computer does not know how to do that.' });
}

/**
 * Somebody arriving, and the three things they may ask for.
 *
 * All of it over one connection, split into channels — a question and its
 * answer, what a build made, and a page from a development server. Every one
 * checks with the workspace on **this** computer before doing anything.
 */
anywhere.whenSomebodyArrives((peer) => {
  const post = channelsOf.channels(peer, { odd: true });

  post.whenOpened(async (channel) => {
    const ws = await membersOf.current();
    const from = peer.who?.deviceId;
    const known = !!ws?.devices?.[from] && !membersOf.isRevoked(ws, from);
    if (!known) return channel.fail('that computer is not in this workspace');

    if (channel.what === 'ask') {
      let held = '';
      channel.incoming.on('data', (chunk) => {
        held += chunk.toString();
        for (;;) {
          const at = held.indexOf('\n');
          if (at === -1) return;
          const line = held.slice(0, at);
          held = held.slice(at + 1);
          if (!line.trim()) continue;
          let asked;
          try { asked = JSON.parse(line); } catch { return channel.fail('unreadable'); }
          answerOnChannel(channel, peer, asked).catch(() => {});
        }
      });
      return;
    }

    if (channel.what === 'artifact') {
      // Sending back what was built is part of building, so it needs the same
      // permission — asking for a folder is not a smaller thing than asking
      // for the build that filled it.
      if (!membersOf.may(ws, from, 'remoteBuild')) {
        return channel.fail('that computer is not allowed to build here');
      }
      return void artifacts.send(current?.dir ?? '', channel);
    }

    if (channel.what.startsWith('sync:')) {
      // Sending the changed part of a project is sending a project, so it needs
      // the same permission — a sync is not a smaller thing than a transfer.
      if (!membersOf.may(ws, from, 'seeOffered')) {
        return channel.fail('that computer is not allowed to see what is offered here');
      }
      const wanted = channel.what.slice('sync:'.length);
      const one = (await lan.offers()).find((o) => o.id === wanted);
      if (!one) return channel.fail('that project is not offered from this computer');
      return void syncing.serve({ channel, dir: one.path, everything: one.everything });
    }

    if (channel.what.startsWith('preview:')) {
      if (!membersOf.may(ws, from, 'remoteRun')) {
        return channel.fail('that computer is not allowed to run things here');
      }
      // Only ports something running here has actually mentioned. Anything
      // else would make this a way to reach whatever this computer can reach.
      const offering = remote.openSessions()
        .flatMap((one) => remote.whatItSaid(one.id)?.ports ?? []);
      return previewing.answer(channel, { allowedPorts: offering });
    }

    channel.fail('this computer does not know how to do that');
  });

  // The old line-by-line shape, kept for anything that opens no channel.
  let held = '';
  peer.incoming.on('data', () => { held = ''; });
});

/** The same answers as before, said down a channel rather than a connection. */
async function answerOnChannel(channel, peer, asked) {
  await answerPeer({
    who: peer.who,
    send: (text) => channel.write(text),
  }, asked);
}

/**
 * What a terminal has said since the page last looked.
 *
 * Held here rather than pushed, because the page asks for everything on a
 * timer already and one more thing to ask for is cheaper than one more way for
 * the server to talk. Bounded, so a session that produces a great deal cannot
 * grow this without limit.
 */
const terminalBuffers = new Map();
const MOST_HELD = 200_000;

function terminalSaid(session, text) {
  if (!session) return;
  const held = (terminalBuffers.get(session) ?? '') + text;
  terminalBuffers.set(session, held.length > MOST_HELD ? held.slice(-MOST_HELD) : held);
}

function terminalSince(session) {
  const held = terminalBuffers.get(session) ?? '';
  terminalBuffers.set(session, '');
  return held;
}

/**
 * Hand one event to every member who can be reached right now.
 *
 * Best effort by design: somebody whose computer is closed has not lost
 * anything, because it is written down at both ends by its own identifier and
 * the ordinary sync catches up. What this buys is that somebody who *is* there
 * hears it at once.
 */
async function sayItToTheOthers(ws, one) {
  const around = await anywhere.around({ workspace: ws }).catch(() => null);
  const others = [...(around?.mine ?? []), ...(around?.team ?? [])]
    .filter((who) => !who.you && who.online);

  let reached = 0;
  await Promise.all(others.map(async (who) => {
    const found = await anywhere.reach(who.deviceId).catch(() => null);
    if (!found?.ok) return;
    const said = await askPeer(found.peer, { what: 'said', event: one }).catch(() => null);
    found.peer.close?.();
    if (said?.ok) reached += 1;
  }));

  return reached;
}

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

/** The kinds of picture a browser will actually draw. */
const PICTURES = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.avif': 'image/avif',
  '.bmp': 'image/bmp',
};

/**
 * The one picture somebody chose, and nothing else on this computer.
 *
 * **The path never comes from the request.** It is read back from the setting,
 * so this route can serve exactly one file: the one already chosen through the
 * picker. A route that took a path from the page would be a way to read any
 * file on this computer through a browser, which is not a wallpaper feature —
 * it is a hole with a wallpaper feature in front of it.
 */
async function servePicture(res) {
  const at = await settings.get('wallPicture');
  const kind = at ? PICTURES[extname(at).toLowerCase()] : null;

  if (!at || !kind || !existsSync(at)) {
    res.writeHead(404);
    return res.end();
  }
  res.writeHead(200, { 'content-type': kind, 'cache-control': 'no-store' });
  return res.end(await readFile(at));
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');

    if (url.pathname === '/') return serveUi(res, 'shell.html');
    if (url.pathname.startsWith('/ui/')) return serveUi(res, url.pathname.slice(4));
    if (url.pathname === '/wall/picture') return servePicture(res);

    const route = routes[`${req.method} ${url.pathname}`];
    if (!route) { res.writeHead(404); return res.end(); }

    let body = {};
    if (req.method === 'POST') {
      const raw = await new Promise((r) => {
        let s = ''; req.on('data', (c) => { s += c; }); req.on('end', () => r(s));
      });
      body = raw ? JSON.parse(raw) : {};
    }
    /*
     * A route that answers with nothing has answered already.
     *
     * The stream of what is happening writes its own headers and then keeps
     * writing for as long as somebody is listening, which is the opposite of
     * every other route here. It returns nothing, and nothing is the signal.
     */
    const answer = await route({ url, body, res, req });
    if (answer === null) return null;
    return json(res, answer);
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

  /*
   * And it starts *answering*, which is a different thing and was missing.
   *
   * Being findable is a shout. Being reachable is a door somebody can knock
   * on, and that door was only ever opened at the moment a workspace was made
   * or joined — so every computer that had simply been restarted sat there
   * present, visible, correct in every list, and impossible to connect to.
   * Nothing said so, because being seen and being reachable look identical
   * from the outside until something tries.
   */
  (async () => {
    const ws = await membersOf.current();
    if (ws) await anywhere.beAbout({ workspace: ws }).catch(() => null);
    await listenForJoiners().catch(() => null);
  })().catch(() => {});
});
