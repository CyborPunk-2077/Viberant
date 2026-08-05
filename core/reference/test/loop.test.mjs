/**
 * The loop.
 *
 * One test, one day of work: open, begin, delegate, leave, come back, read,
 * judge, send. Everything else in this project exists to make this test pass and
 * keep passing.
 *
 * MVP objective 2 is "prove the loop — the full core rhythm works end to end."
 * This is that objective, executable.
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm, writeFile, mkdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ulid, Clock } from '../src/identity.mjs';
import { Author, Developer, reason } from '../src/events.mjs';
import { Store, Projection, absorb } from '../src/store.mjs';
import { homeOrder } from '../src/log.mjs';
import { Engine } from '../src/engine.mjs';
import { checkSentence } from '../src/lexicon.mjs';

const run = promisify(execFile);
let root;
before(async () => { root = await mkdtemp(join(tmpdir(), 'viberant-loop-')); });
after(async () => { await rm(root, { recursive: true, force: true }); });

describe('a day of work', () => {
  test('begin, delegate, leave, return, read, accept, send', async () => {
    // ---- the developer's actual project, and a shared copy of it -----------
    const dir = join(root, 'project');
    const shared = join(root, 'shared.git');
    await mkdir(dir, { recursive: true });
    const git = (...a) => run('git', a, { cwd: dir });
    await git('init', '--quiet', '-b', 'main');
    await git('config', 'user.email', 'dev@local');
    await git('config', 'user.name', 'Developer');
    await writeFile(join(dir, 'export.js'), 'export function exportAll() {}\n');
    await git('add', '-A');
    await git('commit', '--quiet', '-m', 'Set up the project');
    await run('git', ['init', '--quiet', '--bare', '-b', 'main', shared]);
    await git('remote', 'add', 'origin', shared);

    // ---- the app -----------------------------------------------------------
    let now = 9 * 3600_000;                 // nine in the morning
    const clock = new Clock(() => now);
    const machine = 'DESK'.padStart(26, '0');
    const projectId = ulid();
    const author = new Author({ clock, machine, project: projectId });
    const dev = new Developer(author);
    const store = new Store(join(root, 'store', 'project.jsonl'));
    await store.load();
    const engine = new Engine({ project: projectId, location: dir, groundRoot: join(root, 'ground') });

    await store.append(author.bindProject('export tool', dir));

    // ---- a thought arrives -------------------------------------------------
    const { effort, event: begun } = dev.begin({ intent: 'the export flow needs a progress indicator' });
    await store.append(begun);

    // Beginning an effort costs nothing but the intent. No ground yet
    // (decision D-5) — parking an idea must never cost a copy of the project.
    assert.equal((await engine.grounds()).length, 0, 'a new effort holds no ground');

    // ---- hand it to an assistant ------------------------------------------
    const prepared = await engine.prepare(effort);
    assert.equal(prepared.ok, true);
    const delegated = author.delegated({
      effort, assistant: 'claude-code', ground: prepared.ground, causedBy: begun.id,
    });
    await store.append(
      delegated,
      author.groundPrepared({ effort, location: prepared.ground, causedBy: delegated.id }),
      dev.transitioned({ effort, to: 'moving', causedBy: delegated.id }),
    );
    assert.equal(store.state().efforts.get(effort).state, 'moving');

    // ---- the developer leaves. the assistant works. ------------------------
    now += 47 * 60_000;
    await writeFile(join(prepared.ground, 'export.js'),
      'export function exportAll(onProgress) {\n  onProgress?.(0);\n}\n');
    await writeFile(join(prepared.ground, 'progress.js'), 'export const bar = () => {};\n');
    await store.append(author.accountCaptured({
      effort, assistant: 'claude-code', kind: 'transcript', ref: 'accounts/1.md',
    }));

    // The assistant stops. Nothing buzzes; the picture simply changes.
    const described = await engine.describe(effort);
    assert.equal(described.hasWork, true);
    assert.equal(described.touched.length, 2);

    const account = 'The export flow now reports progress as it runs, and a small bar shows it.';
    await store.append(
      author.transitioned({
        effort, to: 'waiting', actor: 'assistant',
        reason: reason('review_ready', 'The export flow reports progress now and is ready for you to read.'),
      }),
      author.summarized({ effort, sentence: account, source: 'claude-code' }),
    );

    // ---- meanwhile, a second effort, parked --------------------------------
    now += 60_000;
    const parked = dev.begin({ intent: 'rename the settings screen' });
    await store.append(
      parked.event,
      dev.transitioned({
        effort: parked.effort, to: 'waiting', causedBy: parked.event.id,
        reason: reason('parked', 'You set this aside for later.'),
      }),
    );

    // ---- the developer comes back and glances ------------------------------
    const home = homeOrder([...store.state().efforts.values()]);
    assert.equal(home.length, 2);
    assert.equal(home[0].id, effort, 'what is ready to read comes before what you deferred');
    assert.equal(home[0].summary, account);
    assert.equal(checkSentence(home[0].summary).ok, true, 'the app speaks plainly');
    assert.equal(home[1].reason.kind, 'parked');

    // ---- they read it, and accept -----------------------------------------
    now += 3 * 60_000;
    const verdict = dev.judge({ effort, verdict: 'accept' });
    await store.append(verdict);

    const settled = await engine.settle(effort, store.state().efforts.get(effort).intent);
    assert.equal(settled.ok, true, settled.sentence);
    await store.append(dev.transitioned({ effort, to: 'done', causedBy: verdict.id }));

    // One entry, in the developer's own words.
    const { stdout: history } = await git('log', '--format=%s');
    assert.deepEqual(history.trim().split('\n'),
      ['the export flow needs a progress indicator', 'Set up the project']);

    // The project is clean and holds nothing of ours.
    const { stdout: lanes } = await git('branch', '--format=%(refname:short)');
    assert.deepEqual(lanes.trim().split('\n'), ['main']);
    assert.equal((await engine.grounds()).length, 0, 'the ground was reclaimed');
    assert.match(await readFile(join(dir, 'export.js'), 'utf8'), /onProgress/);

    // ---- and send it to the shared copy ------------------------------------
    const sent = await engine.publish();
    assert.equal(sent.ok, true);
    await store.append(dev.published({ effort, causedBy: verdict.id }));

    const { stdout: theirs } = await run('git', ['log', '--format=%s'], { cwd: shared });
    assert.equal(theirs.trim().split('\n')[0], 'the export flow needs a progress indicator');

    // ---- the day ends ------------------------------------------------------
    const end = store.state().efforts;
    assert.equal(end.get(effort).state, 'done');
    assert.equal(end.get(effort).published, true);
    assert.equal(end.get(parked.effort).state, 'waiting');
    assert.deepEqual(store.state().refusals, []);

    // Everything that happened is answerable from the record alone.
    const story = end.get(effort).story;
    assert.ok(story.some((s) => s.kind === 'begun'));
    assert.ok(story.some((s) => s.kind === 'delegated'));
    assert.ok(story.some((s) => s.kind === 'account'));
    assert.ok(story.some((s) => s.kind === 'judged' && s.detail === 'accept'));
    assert.ok(story.some((s) => s.kind === 'sent'));
    assert.ok(story.every((s) => s.actor !== 'assistant' || s.kind !== 'judged'),
      'no machine ever judged anything');
  });

  test('and tomorrow, on the other machine, the picture is whole', async () => {
    const projectId = ulid();
    const carrier = new Projection(join(root, 'carrier'));

    let now = 10 * 3600_000;
    const deskA = new Author({
      clock: new Clock(() => now), machine: 'A'.padStart(26, '0'), project: projectId,
    });
    const devA = new Developer(deskA);
    const storeA = new Store(join(root, 'deskA.jsonl'));
    await storeA.load();

    const { effort, event } = devA.begin({ intent: 'the export flow needs a progress indicator' });
    await storeA.append(
      event,
      devA.transitioned({ effort, to: 'moving', causedBy: event.id }),
    );
    await carrier.put(projectId, deskA.machine, storeA.log);

    // A different machine, which has never seen any of this.
    const storeB = new Store(join(root, 'deskB.jsonl'));
    await storeB.load();
    const arrived = await absorb(storeB, carrier, projectId);

    assert.deepEqual(arrived.refusals, []);
    const there = storeB.state().efforts.get(effort);
    assert.equal(there.intent, 'the export flow needs a progress indicator');
    assert.equal(there.state, 'moving');
    assert.deepEqual(arrived.changed, [
      { effort, intent: 'the export flow needs a progress indicator', change: 'new' },
    ]);
  });
});
