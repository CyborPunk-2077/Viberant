/**
 * The application.
 *
 * A local server and a page. Nothing leaves this machine, no account exists, and
 * there is no service anywhere — the whole thing is a process on your computer
 * that reads a text file and draws it.
 *
 * This is not a stand-in for the real shell. The real shell is a web view, so
 * the page this serves is the actual surface, and the work put into it carries
 * forward rather than being thrown away.
 *
 * Run:  node app/server.mjs [path-to-a-project]
 */

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve, basename } from 'node:path';
import { homedir } from 'node:os';
import { existsSync } from 'node:fs';

import { ulid, Clock } from '../core/reference/src/identity.mjs';
import { Author, Developer, reason } from '../core/reference/src/events.mjs';
import { Store } from '../core/reference/src/store.mjs';
import { Engine } from '../core/reference/src/engine.mjs';
import { Gateway, observedOnly, contextFor } from '../core/reference/src/gateway.mjs';
import { summarize } from '../core/reference/src/summarizer.mjs';
import { home } from '../core/reference/src/home.mjs';

const here = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Where things live. All of it under one folder you can delete.
// ---------------------------------------------------------------------------

const HOUSE = join(homedir(), '.viberant');
const projectPath = resolve(process.argv[2] ?? process.cwd());
const projectName = basename(projectPath);

/** A stable identity for this machine, so its events are attributable forever. */
async function machineId() {
  const path = join(HOUSE, 'machine');
  if (existsSync(path)) return (await readFile(path, 'utf8')).trim();
  const id = ulid();
  const { writeFile, mkdir } = await import('node:fs/promises');
  await mkdir(HOUSE, { recursive: true });
  await writeFile(path, id, 'utf8');
  return id;
}

const machine = await machineId();
const projectId = ulid();
const clock = new Clock();
const author = new Author({ clock, machine, project: projectId });
const dev = new Developer(author);

const store = new Store(join(HOUSE, 'projects', `${projectName}.jsonl`));
await store.load();

const engine = new Engine({
  project: projectId,
  location: projectPath,
  groundRoot: join(HOUSE, 'ground', projectName),
});

const gateway = new Gateway();
for (const tool of ['claude', 'codex', 'gemini', 'aider']) {
  gateway.register(observedOnly(tool, [tool]));
}

if (!store.state().project.bound) {
  await store.append(author.bindProject(projectName, projectPath));
}

// ---------------------------------------------------------------------------
// Intents. Everything the developer can do, and nothing else.
// ---------------------------------------------------------------------------

const intents = {
  async begin({ intent, then }) {
    const { effort, event } = dev.begin({ intent });
    await store.append(event);

    if (then === 'park') {
      await store.append(dev.transitioned({
        effort, to: 'waiting', causedBy: event.id,
        reason: reason('parked', 'You set this aside for later.'),
      }));
      return { effort };
    }
    return intents.delegate({ effort, assistant: then ?? 'claude', causedBy: event.id });
  },

  async delegate({ effort, assistant, causedBy = null }) {
    const ready = await engine.prepare(effort);
    if (!ready.ok) {
      await store.append(dev.transitioned({
        effort, to: 'waiting', causedBy,
        reason: reason('failed', ready.sentence, ready.action),
      }));
      return { effort };
    }

    const delegated = author.delegated({ effort, assistant, ground: ready.ground, causedBy });
    await store.append(delegated, dev.transitioned({ effort, to: 'moving', causedBy: delegated.id }));

    const run = await gateway.delegate({
      effort, assistant, ground: ready.ground,
      context: contextFor(store.state().efforts.get(effort)),
    });

    if (run.ok) {
      // Nothing waits on this. The assistant works; the picture catches up when
      // it catches up; the developer is never held.
      run.session.start().then(async (finished) => {
        const described = await engine.describe(effort);
        const account = await summarize({
          effort: store.state().efforts.get(effort),
          touched: described.touched,
          account: finished.said,
          inference: await gateway.inferenceFor(effort),
        });
        await store.append(
          author.accountCaptured({ effort, assistant, kind: 'transcript', ref: 'session' }),
          author.summarized({ effort, sentence: account.sentence, source: account.source }),
          author.transitioned({
            effort, to: 'waiting', actor: 'assistant',
            reason: finished.code === 0
              ? reason('review_ready', 'The work is finished and ready for you to read.')
              : reason('failed', 'The assistant stopped before it was done.', 'Send it back with more direction.'),
          }),
        );
      }).catch(() => {});
    }
    return { effort };
  },

  async park({ effort }) {
    await store.append(dev.transitioned({
      effort, to: 'waiting',
      reason: reason('parked', 'You set this aside for later.'),
    }));
    return { effort };
  },

  async accept({ effort }) {
    const it = store.state().efforts.get(effort);
    const verdict = dev.judge({ effort, verdict: 'accept' });
    await store.append(verdict);

    const settled = await engine.settle(effort, it.intent);
    if (!settled.ok) {
      await store.append(dev.transitioned({
        effort, to: 'waiting', causedBy: verdict.id,
        reason: reason('failed', settled.sentence, settled.action),
      }));
      return { effort, refused: settled.sentence };
    }
    await store.append(dev.transitioned({ effort, to: 'done', causedBy: verdict.id }));
    return { effort };
  },

  async redirect({ effort, direction }) {
    gateway.stop(effort);
    const verdict = dev.judge({ effort, verdict: 'redirect' });
    const said = dev.addDirection({ effort, direction, causedBy: verdict.id });
    await store.append(verdict, said);
    const it = store.state().efforts.get(effort);
    return intents.delegate({ effort, assistant: it.assistant ?? 'claude', causedBy: said.id });
  },

  async abandon({ effort }) {
    gateway.stop(effort);
    const verdict = dev.judge({ effort, verdict: 'abandon' });
    await engine.abandon(effort);
    await store.append(
      verdict,
      dev.transitioned({ effort, to: 'dissolved', causedBy: verdict.id }),
      dev.dissolved({ effort, graceUntil: Date.now() + 24 * 3600_000, causedBy: verdict.id }),
    );
    return { effort };
  },
};

// ---------------------------------------------------------------------------

const json = (res, body, code = 200) => {
  res.writeHead(code, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');

    if (url.pathname === '/') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      return res.end(await readFile(join(here, 'shell.html'), 'utf8'));
    }

    if (url.pathname === '/home') {
      return json(res, home(store.state()));
    }

    if (url.pathname === '/effort') {
      const it = store.state().efforts.get(url.searchParams.get('id'));
      if (!it) return json(res, { missing: true }, 404);
      return json(res, {
        id: it.id, intent: it.intent, directions: it.directions, state: it.state,
        reason: it.reason, account: it.summary, assistants: it.assistants,
        story: it.story.slice(-40),
        touched: (await engine.describe(it.id)).touched,
      });
    }

    if (url.pathname === '/assistants') {
      return json(res, { available: await gateway.available() });
    }

    if (req.method === 'POST' && intents[url.pathname.slice(1)]) {
      const body = await new Promise((r) => {
        let s = ''; req.on('data', (c) => { s += c; }); req.on('end', () => r(s));
      });
      const result = await intents[url.pathname.slice(1)](JSON.parse(body || '{}'));
      return json(res, { ...result, home: home(store.state()) });
    }

    res.writeHead(404); res.end();
  } catch (e) {
    json(res, { sentence: 'Something went wrong here.', action: 'Try that again.', detail: String(e) }, 500);
  }
});

const port = Number(process.env.PORT ?? 7777);
server.listen(port, '127.0.0.1', () => {
  console.log(`\n  ${projectName}  —  ${projectPath}`);
  console.log(`  open  http://localhost:${port}\n`);
});
