/**
 * The manager.
 *
 * A local server and a page. Nothing leaves this machine, no account exists
 * here, and there is no service anywhere — it is a process on your computer that
 * opens folders, starts the apps you already have, and keeps a note of what
 * happened.
 *
 * Run:  node app/server.mjs
 */

import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve, basename } from 'node:path';

import { ulid, Clock } from '../core/reference/src/identity.mjs';
import { Author, Developer, reason } from '../core/reference/src/events.mjs';
import { Store } from '../core/reference/src/store.mjs';
import { Engine } from '../core/reference/src/engine.mjs';
import { home } from '../core/reference/src/home.mjs';

import * as projects from './projects.mjs';
import * as tools from './tools.mjs';
import * as profiles from './profiles.mjs';

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

const json = (res, body, code = 200) => {
  res.writeHead(code, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
};

const routes = {
  async 'GET /projects'() {
    const list = await projects.remembered();
    const out = [];
    for (const p of list) {
      if (!existsSync(p.path)) continue;
      const s = await projects.situation(p.path);
      out.push({ ...p, says: projects.inWords(s), unsaved: s.unsaved, shared: !!s.shared });
    }
    return { projects: out, current: current?.dir ?? null, github: await projects.githubAccount() };
  },

  async 'GET /look'({ url }) {
    return { found: await projects.lookIn(url.searchParams.get('in') ?? '') };
  },

  async 'POST /open'({ body }) {
    if (!existsSync(body.path)) {
      return { ok: false, sentence: 'That folder is not there.', action: 'Pick another one.' };
    }
    current = await open(body.path);
    return { ok: true, ...(await routes['GET /project']()) };
  },

  async 'GET /project'() {
    if (!current) return { open: false };
    const s = await projects.situation(current.dir);
    return {
      open: true, name: current.name, dir: current.dir,
      says: projects.inWords(s), situation: s,
      home: home(current.store.state()),
    };
  },

  async 'GET /tools'() {
    const found = await tools.installed();
    const withAccounts = [];
    for (const t of found) {
      const full = tools.find(t.id);
      withAccounts.push({ ...t, ...(await profiles.list(full)) });
    }
    return { tools: withAccounts };
  },

  async 'POST /launch'({ body }) {
    if (!current) return { ok: false, sentence: 'No project is open.', action: 'Pick one first.' };
    const tool = tools.find(body.tool);

    if (body.profile) {
      const swapped = await profiles.use(tool, body.profile);
      if (!swapped.ok) return swapped;
    }

    const started = await tools.launch({ tool, dir: current.dir });
    if (started.ok) {
      const { effort, event } = current.dev.begin({ intent: body.intent || `work in ${tool.name}` });
      const delegated = current.author.delegated({ effort, assistant: tool.id, causedBy: event.id });
      await current.store.append(event, delegated,
        current.dev.transitioned({ effort, to: 'moving', causedBy: delegated.id }));
    }
    return { ...started, ...(await routes['GET /project']()) };
  },

  async 'POST /publish'({ body }) {
    if (!current) return { ok: false, sentence: 'No project is open.', action: 'Pick one first.' };
    const r = await projects.publish(current.dir, { message: body.message });
    return { ...r, ...(await routes['GET /project']()) };
  },

  async 'POST /profile/save'({ body }) {
    return { ...(await profiles.save(tools.find(body.tool), body.name)), ...(await routes['GET /tools']()) };
  },
  async 'POST /profile/use'({ body }) {
    return { ...(await profiles.use(tools.find(body.tool), body.name)), ...(await routes['GET /tools']()) };
  },
  async 'POST /profile/forget'({ body }) {
    return { ...(await profiles.forget(tools.find(body.tool), body.name)), ...(await routes['GET /tools']()) };
  },

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

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');

    if (url.pathname === '/') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      return res.end(await readFile(join(here, 'shell.html'), 'utf8'));
    }

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

const port = Number(process.env.PORT ?? 7777);
server.listen(port, '127.0.0.1', () => {
  console.log(`\n  open  http://localhost:${port}\n`);
});
