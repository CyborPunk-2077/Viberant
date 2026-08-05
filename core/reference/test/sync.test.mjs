/**
 * Two machines, one developer.
 *
 * This is the founder's daily problem, tested end to end: begin work on one
 * machine, walk to another, and find the picture whole. No server is involved
 * anywhere in this file — that is the point.
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ulid, Clock } from '../src/identity.mjs';
import { Author, Developer, reason } from '../src/events.mjs';
import { Store, Projection, absorb } from '../src/store.mjs';

let root;
before(async () => { root = await mkdtemp(join(tmpdir(), 'viberant-')); });
after(async () => { await rm(root, { recursive: true, force: true }); });

function machine(name, project, start) {
  let t = start;
  const clock = new Clock(() => t);
  const id = name.padStart(26, '0');
  const author = new Author({ clock, machine: id, project });
  return { id, author, dev: new Developer(author), clock, advance: (ms) => { t += ms; } };
}

describe('a log survives being written and read back', () => {
  test('append, reload, and the truth is identical', async () => {
    const project = ulid();
    const m = machine('A', project, 1_000_000);
    const path = join(root, 'roundtrip', 'log.jsonl');

    const store = new Store(path);
    await store.load();
    const { effort, event: begun } = m.dev.begin({ intent: 'add billing' });
    await store.append(begun, m.author.delegated({ effort, assistant: 'claude-code', causedBy: begun.id }));
    await store.append(m.dev.transitioned({ effort, to: 'moving' }));

    const reopened = new Store(path);
    await reopened.load();
    assert.equal(reopened.state().efforts.get(effort).state, 'moving');
    assert.equal(reopened.state().efforts.get(effort).intent, 'add billing');
  });

  test('a half-written final line loses nothing that was acknowledged', async () => {
    const project = ulid();
    const m = machine('A', project, 2_000_000);
    const path = join(root, 'torn', 'log.jsonl');
    const store = new Store(path);
    await store.load();
    const { effort, event: begun } = m.dev.begin({ intent: 'fix the exporter' });
    await store.append(begun);
    await store.append(m.dev.transitioned({ effort, to: 'moving' }));

    // Simulate losing power mid-append.
    const { appendFile } = await import('node:fs/promises');
    await appendFile(path, '{"v":1,"id":"01KZ', 'utf8');

    const reopened = new Store(path);
    await reopened.load();
    assert.equal(reopened.state().efforts.get(effort).state, 'moving');
  });
});

describe('walking to the other machine', () => {
  test('work begun on one machine is whole on the other', async () => {
    const project = ulid();
    const carrier = new Projection(join(root, 'carrier'));

    // Desk one: begin an effort, hand it to an assistant, walk away.
    const a = machine('A', project, 3_000_000);
    const storeA = new Store(join(root, 'a', 'log.jsonl'));
    await storeA.load();
    const { effort, event: begun } = a.dev.begin({ intent: 'make the exporter show progress' });
    const delegated = a.author.delegated({ effort, assistant: 'claude-code', causedBy: begun.id });
    await storeA.append(begun, delegated, a.dev.transitioned({ effort, to: 'moving', causedBy: delegated.id }));
    await carrier.put(project, a.id, storeA.log);

    // Desk two, later that day. Nothing here has ever seen this work.
    const b = machine('B', project, 3_060_000);
    const storeB = new Store(join(root, 'b', 'log.jsonl'));
    await storeB.load();
    const result = await absorb(storeB, carrier, project);

    assert.equal(result.added, 3);
    assert.deepEqual(result.refusals, []);
    const ef = storeB.state().efforts.get(effort);
    assert.equal(ef.intent, 'make the exporter show progress');
    assert.equal(ef.state, 'moving');
    assert.equal(ef.assistant, 'claude-code');
    assert.deepEqual(result.changed, [{ effort, intent: 'make the exporter show progress', change: 'new' }]);
  });

  test('both machines work, and both end up agreeing', async () => {
    const project = ulid();
    const carrier = new Projection(join(root, 'carrier2'));

    const a = machine('A', project, 4_000_000);
    const storeA = new Store(join(root, 'a2', 'log.jsonl'));
    await storeA.load();
    const { effort, event: begun } = a.dev.begin({ intent: 'add billing' });
    await storeA.append(begun, a.dev.transitioned({ effort, to: 'moving' }));
    await carrier.put(project, a.id, storeA.log);

    // Machine B absorbs, then does its own work.
    const b = machine('B', project, 4_000_000);
    const storeB = new Store(join(root, 'b2', 'log.jsonl'));
    await storeB.load();
    await absorb(storeB, carrier, project);
    for (const e of storeB.log.ordered()) b.clock.observe(e.at);
    b.advance(1000);
    await storeB.append(b.author.transitioned({
      effort, to: 'waiting', actor: 'assistant',
      reason: reason('review_ready', 'Billing is finished and waiting for you to read it.'),
    }));
    await carrier.put(project, b.id, storeB.log);

    // Machine A picks it up.
    const back = await absorb(storeA, carrier, project);
    assert.deepEqual(back.refusals, []);
    assert.equal(storeA.state().efforts.get(effort).state, 'waiting');
    assert.equal(storeB.state().efforts.get(effort).state, 'waiting');

    // And the two machines hold byte-identical truth.
    assert.equal(storeA.log.toJSONL(), storeB.log.toJSONL());
    assert.deepEqual(back.changed, [
      { effort, intent: 'add billing', change: 'moved', from: 'moving', to: 'waiting' },
    ]);
  });

  test('syncing repeatedly changes nothing', async () => {
    const project = ulid();
    const carrier = new Projection(join(root, 'carrier3'));
    const a = machine('A', project, 5_000_000);
    const store = new Store(join(root, 'a3', 'log.jsonl'));
    await store.load();
    const { event } = a.dev.begin({ intent: 'tidy the settings screen' });
    await store.append(event);
    await carrier.put(project, a.id, store.log);

    const first = (await absorb(store, carrier, project));
    const second = (await absorb(store, carrier, project));
    assert.equal(first.added, 0);
    assert.equal(second.added, 0);
    assert.deepEqual(second.changed, []);
  });

  test('a machine that lies is refused on arrival, not obeyed', async () => {
    const project = ulid();
    const carrier = new Projection(join(root, 'carrier4'));
    const a = machine('A', project, 6_000_000);
    const storeA = new Store(join(root, 'a4', 'log.jsonl'));
    await storeA.load();
    const { effort, event: begun } = a.dev.begin({ intent: 'rewrite the importer' });
    await storeA.append(begun, a.dev.transitioned({ effort, to: 'moving' }));

    // Something on the other machine claims the work is settled.
    const forged = { ...a.author.transitioned({ effort, to: 'moving' }), to: 'done', actor: 'assistant' };
    await storeA.append(forged);

    const state = storeA.state();
    assert.equal(state.efforts.get(effort).state, 'moving', 'the claim was ignored');
    assert.equal(state.refusals.length, 1);
    assert.match(state.refusals[0].why, /only the developer can settle/);
  });

  test('the carrier explains itself to whoever finds it', async () => {
    const project = ulid();
    const dir = join(root, 'carrier5');
    const carrier = new Projection(dir);
    const a = machine('A', project, 7_000_000);
    const store = new Store(join(root, 'a5', 'log.jsonl'));
    await store.load();
    await store.append(a.dev.begin({ intent: 'x' }).event);
    await carrier.put(project, a.id, store.log);

    const readme = await readFile(join(dir, 'README.md'), 'utf8');
    assert.match(readme, /safe to delete/);
    assert.match(readme, /safe to ignore/);
    // A teammate who does not use this app must never meet our vocabulary here.
    const { checkSentence } = await import('../src/lexicon.mjs');
    for (const line of readme.split('\n').filter((l) => l.trim() && !l.startsWith('#'))) {
      assert.ok(checkSentence(line).ok !== false || !checkSentence(line).forbidden.length,
        `carrier README leaks vocabulary: ${line}`);
    }
  });
});
