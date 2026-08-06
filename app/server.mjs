/**
 * The manager.
 *
 * A local server and a page. Nothing leaves this machine except through your
 * own GitHub account, no account exists here, and there is no service anywhere —
 * it is a process on your computer that opens folders, starts the apps you
 * already have, and keeps a note of what happened.
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

const here = dirname(fileURLToPath(import.meta.url));
const HOUSE = projects.HOUSE;

// ---------------------------------------------------------------------------
// One open project at a time, remembered between runs.
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

async function machineName() {
  const path = join(HOUSE, 'machine-name');
  if (existsSync(path)) return (await readFile(path, 'utf8')).trim();
  return hostname();
}
let myName = await machineName();

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
// Noticing when the folder changes underneath us
//
// You asked for this: work in another app, come back here, and the picture is
// already right rather than a refresh away. It is a number that goes up. The
// page asks for it often and cheaply, and only looks properly when it moves.
// ---------------------------------------------------------------------------

let pulse = 0;
let watcher = null;

function watchProject(dir) {
  watcher?.close();
  watcher = null;
  if (!dir) return;
  try {
    watcher = watch(dir, { recursive: true }, (_kind, name) => {
      const path = String(name ?? '');
      // Everything a running app does churns through these. What matters is
      // that something moved, not what.
      if (path.includes('node_modules') || path.includes('.git\\objects') || path.includes('.git/objects')) return;
      pulse += 1;
    });
    watcher.on('error', () => { watcher = null; });
  } catch {
    // Watching is a convenience. A computer that will not do it still works.
  }
}

// ---------------------------------------------------------------------------

const json = (res, body, code = 200) => {
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
};

const noProject = { ok: false, sentence: 'No project is open.', action: 'Pick one first.' };

/** What this computer is offering the others, built from what you have marked. */
async function offering() {
  const list = await projects.remembered();
  const out = [];
  for (const p of list) {
    if (!p.offered || !existsSync(p.path)) continue;
    const s = await projects.situation(p.path);
    out.push({
      id: p.path,
      name: p.name,
      says: projects.inWords(s),
      lastSaved: s.last?.at ?? null,
      mark: p.mark ?? null,
      url: s.shared ? github.webAddress(s.shared) : null,
      shared: s.shared ?? null,
    });
  }
  return out;
}

const routes = {

  // -- who and where ------------------------------------------------------

  async 'GET /me'() {
    const [account, identity, ws] = await Promise.all([
      github.who(), github.identity(), workspace.state(),
    ]);
    return {
      machine, machineName: myName, host: hostname(),
      github: account, identity, workspace: ws,
      haveGitHubTool: await github.haveGitHubTool(),
      current: current?.dir ?? null,
    };
  },

  async 'GET /pulse'() {
    return { pulse };
  },

  async 'POST /me/name'({ body }) {
    const clean = String(body.name ?? '').trim().slice(0, 40);
    if (!clean) return { ok: false, sentence: 'A computer needs a name.', action: 'Type one.' };
    myName = clean;
    await mkdir(HOUSE, { recursive: true });
    await writeFile(join(HOUSE, 'machine-name'), clean, 'utf8');
    return { ok: true, sentence: `This computer is called ${clean}.` };
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
        unsaved: s.unsaved,
        toSend: s.waitingToSend,
        shared: !!s.shared,
        mark: p.mark ?? null,
        offered: !!p.offered,
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
    watchProject(current.dir);
    return { ok: true, ...(await routes['GET /project']()) };
  },

  async 'POST /close'() {
    current = null;
    watchProject(null);
    return { ok: true };
  },

  async 'GET /project'() {
    if (!current) return { open: false };
    const s = await projects.situation(current.dir);
    const remembered = (await projects.remembered()).find((p) => p.path === current.dir) ?? {};
    return {
      open: true, name: current.name, dir: current.dir,
      says: projects.inWords(s), saved: projects.lastSavedInWords(s), situation: s,
      mark: remembered.mark ?? null, offered: !!remembered.offered,
      home: home(current.store.state()),
    };
  },

  async 'POST /projects/mark'({ body }) {
    return { ...(await projects.mark(body.path, body.mark ?? null)), ...(await routes['GET /projects']()) };
  },

  async 'POST /projects/offer'({ body }) {
    const r = await projects.offer(body.path, body.offered);
    if (r.ok && (await workspace.state()).joined) {
      await workspace.sync({ machine, name: myName, project: current?.name ?? null, sharing: await offering() });
    }
    return { ...r, ...(await routes['GET /projects']()) };
  },

  async 'POST /projects/forget'({ body }) {
    await projects.forget(body.path);
    if (current?.dir === resolve(body.path)) { current = null; watchProject(null); }
    return { ok: true, sentence: 'That project is off the list. The folder is untouched.', ...(await routes['GET /projects']()) };
  },

  // -- picking a folder ---------------------------------------------------

  async 'GET /browse'({ url }) {
    return browse.look(url.searchParams.get('at'), { hidden: url.searchParams.get('hidden') === '1' });
  },

  async 'GET /browse/starts'() {
    return { places: await browse.starts() };
  },

  async 'POST /browse/choose'({ body }) {
    return browse.chooseFolder({ startAt: body.startAt ?? null });
  },

  // -- AI apps ------------------------------------------------------------

  async 'GET /tools'() {
    const found = await tools.installed();
    const withAccounts = [];
    for (const t of found) {
      const full = tools.find(t.id);
      const accounts = t.config ? await profiles.list(full) : { profiles: [], active: null, signedIn: false };
      withAccounts.push({ ...t, ...accounts });
    }
    return { tools: withAccounts };
  },

  async 'POST /launch'({ body }) {
    if (!current) return noProject;
    const tool = tools.find(body.tool);

    if (body.profile) {
      const swapped = await profiles.use(tool, body.profile);
      if (!swapped.ok) return { ...swapped, ...(await routes['GET /project']()) };
    }

    const started = await tools.launch({
      tool, dir: current.dir, how: body.how ?? null, terminal: body.terminal ?? null,
    });

    if (started.ok) {
      const where = started.how === 'terminal' ? 'a terminal' : 'its own window';
      const { effort, event } = current.dev.begin({ intent: body.intent || `work in ${tool.name}` });
      const delegated = current.author.delegated({ effort, assistant: tool.id, causedBy: event.id });
      await current.store.append(event, delegated,
        current.dev.transitioned({ effort, to: 'moving', causedBy: delegated.id }));
      return {
        ...started,
        sentence: `${tool.name} is opening in ${where}, already in ${current.name}.`,
        ...(await routes['GET /project']()),
      };
    }
    return { ...started, ...(await routes['GET /project']()) };
  },

  async 'POST /signin/tool'({ body }) {
    const tool = tools.find(body.tool);
    const r = await tools.signIn({ tool, dir: current?.dir ?? process.cwd(), terminal: body.terminal ?? null });
    return { ...r, ...(await routes['GET /tools']()) };
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
    return { terminals: await terminals.installed() };
  },

  async 'POST /terminal'({ body }) {
    if (!current) return noProject;
    const r = await terminals.openTerminal({ dir: current.dir, which: body.terminal ?? null });
    if (!r.ok) return r;
    const t = terminals.find(r.opened);
    return { ...r, sentence: `${t?.name ?? 'A terminal'} is open in ${current.name}.` };
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
    const opened = await terminals.openTerminal({
      dir: current?.dir ?? HOUSE,
      command: 'gh auth login --web --git-protocol https',
    });
    if (!opened.ok) return opened;
    return {
      ok: true,
      sentence: 'Signing in to GitHub in the window that just opened.',
      action: 'Follow the steps there, then come back and this page will know.',
    };
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

  async 'POST /publish'({ body }) {
    if (!current) return noProject;
    const r = await projects.publish(current.dir, { message: body.message, private: body.private !== false });
    return { ...r, ...(await routes['GET /project']()) };
  },

  async 'POST /github/save'({ body }) {
    if (!current) return noProject;
    return { ...(await github.saveOnly(current.dir, body.message)), ...(await routes['GET /project']()) };
  },
  async 'POST /github/latest'() {
    if (!current) return noProject;
    return { ...(await github.getLatest(current.dir)), ...(await routes['GET /project']()) };
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
    return { ...(await github.undoLastSave(current.dir)), ...(await routes['GET /project']()) };
  },
  async 'GET /github/history'() {
    if (!current) return { ok: true, saves: [] };
    return github.history(current.dir);
  },
  async 'GET /github/changes'() {
    if (!current) return { ok: true, changes: [] };
    return github.whatChanged(current.dir);
  },
  async 'GET /github/mine'() {
    return github.myProjects();
  },
  async 'POST /github/bring'({ body }) {
    const r = await github.bringDown({ url: body.url, into: body.into });
    if (r.ok) { current = await open(r.path); watchProject(current.dir); }
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
    if (!state.joined) return { ...state, machines: [], projects: [], said: [] };
    const r = await workspace.sync({ machine, name: myName, project: current?.name ?? null });
    return { ...state, ...r };
  },

  async 'POST /workspace/join'() {
    const r = await workspace.join({ machine, name: myName });
    if (r.ok) await workspace.sync({ machine, name: myName, project: current?.name ?? null, sharing: await offering() });
    return { ...r, ...(await workspace.state()) };
  },

  async 'POST /workspace/leave'() {
    return { ...(await workspace.leave({ machine })), ...(await workspace.state()) };
  },

  async 'POST /workspace/say'({ body }) {
    return workspace.say({ machine, name: myName, text: body.text });
  },

  async 'POST /workspace/refresh'() {
    return workspace.sync({ machine, name: myName, project: current?.name ?? null, sharing: await offering(), force: true });
  },

  async 'POST /workspace/bring'({ body }) {
    const r = await workspace.bring({ entry: body.entry, into: body.into });
    if (r.ok) { current = await open(r.path); watchProject(current.dir); }
    return { ...r, ...(await routes['GET /projects']()) };
  },

  // -- efforts ------------------------------------------------------------

  async 'POST /done'({ body }) {
    if (!current) return { ok: false };
    const verdict = current.dev.judge({ effort: body.effort, verdict: 'accept' });
    await current.store.append(verdict,
      current.dev.transitioned({ effort: body.effort, to: 'done', causedBy: verdict.id }));
    return { ok: true, ...(await routes['GET /project']()) };
  },

  async 'POST /drop'({ body }) {
    if (!current) return { ok: false };
    const verdict = current.dev.judge({ effort: body.effort, verdict: 'abandon' });
    await current.store.append(verdict,
      current.dev.transitioned({ effort: body.effort, to: 'dissolved', causedBy: verdict.id }),
      current.dev.dissolved({ effort: body.effort, graceUntil: Date.now() + 86400_000, causedBy: verdict.id }));
    return { ok: true, ...(await routes['GET /project']()) };
  },
};

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
});
