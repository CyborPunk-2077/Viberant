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
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { existsSync, watch } from 'node:fs';
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
import { widenPath } from './findtools.mjs';

// Before anything asks whether a command exists. A window started from the
// Start menu does not inherit the PATH a terminal has, which is how `gh` came
// to be "not installed" on a computer that plainly has it.
const foundOnPath = widenPath();

const here = dirname(fileURLToPath(import.meta.url));
const VERSION = '0.1.0';
const HOUSE = projects.HOUSE;

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

async function watchProject(dir) {
  watcher?.close();
  watcher = null;
  if (!dir || !(await settings.get('watchFolder'))) return;
  try {
    watcher = watch(dir, { recursive: true }, (_kind, name) => {
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
 * Everything except what you have marked private — and private means left out
 * of this list entirely, so there is nothing for another computer to ask about.
 */
async function offering() {
  const list = await projects.remembered();
  const out = [];
  for (const p of list) {
    if (p.private || !existsSync(p.path)) continue;
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
 * Private projects are absent, exactly as they are absent from the workspace.
 * There is nothing here for another computer to ask about.
 */
async function whatThisComputerHas() {
  const list = await projects.remembered();
  const out = [];
  for (const p of list) {
    if (p.private || !existsSync(p.path)) continue;
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
    const [account, identity, ws, now] = await Promise.all([
      github.who(), github.identity(), workspace.state(), settings.all(),
    ]);
    return {
      machine,
      machineName: now.machineName,
      host: hostname(),
      github: account,
      identity,
      workspace: ws,
      settings: now,
      haveGitHubTool: await github.haveGitHubTool(),
      lookedIn: foundOnPath,
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
    try { spawn(opener[0], opener[1], { detached: true, stdio: 'ignore' }).unref(); } catch { /* nothing to say */ }
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

  async 'POST /projects/forget'({ body }) {
    await projects.forget(body.path);
    if (current?.dir === resolve(body.path)) { current = null; await watchProject(null); }
    return { ok: true, sentence: 'That project is off the list. The folder is untouched.', ...(await routes['GET /projects']()) };
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
    const found = await tools.installed();
    const out = [];
    for (const t of found) {
      const full = tools.find(t.id);
      const accounts = t.config ? await profiles.list(full) : { profiles: [], active: null, signedIn: false };
      out.push({ ...t, ...accounts });
    }
    return { tools: out, terminals: await terminals.installed(), preferred: await settings.get('terminal') };
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

    const job = jobs.begin({ what: `Installing ${tool.name}`, where: HOUSE });
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
    return { ...signin.begin(), ok: true, started: true };
  },

  async 'GET /github/signin'() {
    return { ok: true, signin: signin.state(), github: await github.who() };
  },

  async 'POST /github/signin/stop'() {
    signin.forget();
    return { ok: true };
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
    return { kinds: feedback.KINDS, said: await feedback.said(), home: feedback.HOME };
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

  async 'POST /publish'({ body }) {
    if (!current) return noProject;
    const r = await projects.publish(current.dir, { message: body.message, private: body.private !== false });
    projects.forgetSituations();
    return { ...r, ...(await routes['GET /project']()) };
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
    const job = jobs.begin({ what: `Putting ${current.name} on GitHub`, where: current.dir });
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
    return { open: true, name: current.name, ...(await deploy.look(current.dir)) };
  },

  async 'POST /ship/site'({ body }) {
    if (!current) return noProject;
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
    const r = await workspace.sync({ machine, name: await myName(), project: current?.name ?? null });
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
    if (r.ok) {
      await workspace.sync({ machine, name, project: current?.name ?? null, sharing: await offering() });
      await localSharing();
    }
    return { ...r, ...(await workspace.state()) };
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

  async 'POST /workspace/bring'({ body }) {
    const into = body.into ?? (await settings.get('workFolder'));
    const r = await workspace.bring({ entry: body.entry, into });
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
    const weighed = await parcel.weigh(body.path, { everything: !!body.everything });
    if (weighed.files === 0) {
      return { ok: false, sentence: 'There is nothing in that folder to send.', action: 'Choose another one.' };
    }
    return lan.offer({ path: body.path, everything: !!body.everything, about: body.about ?? '' });
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
    const job = jobs.begin({ what: `Bringing ${body.name} across`, where: body.path ?? HOUSE });
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
    const job = jobs.begin({ what: `Bringing ${body.name} to this computer`, where: into });
    lan.take({ machine: body.machine, offerId: body.offer, into, name: body.name, job, jobs })
      .then(async (done) => {
        if (done?.ok && done.at) { current = await open(done.at); await watchProject(done.at); }
      })
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

    jobs.step(job, `Making ${name} on GitHub, visible to ${visibility === 'public' ? 'anybody' : 'only you'}.`);
    const out = await jobs.runInto(job, {
      file: 'gh',
      args: ['repo', 'create', name, visibility === 'public' ? '--public' : '--private',
        '--source', '.', '--remote', 'origin', '--push'],
      cwd: dir,
    });
    if (!out.ok) {
      return jobs.end(job, {
        ok: false,
        sentence: `${name} could not be made on GitHub.`,
        action: 'A project of that name may already be on your account. Try another name.',
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
    }
  })().catch(() => {}).finally(() => { telling = null; });
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
    spawn(file, args, { detached: true, stdio: 'ignore' }).unref();
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
