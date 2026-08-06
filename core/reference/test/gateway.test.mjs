/**
 * The Gateway, against assistants that actually run.
 *
 * The "assistants" here are small scripts that behave the way real ones do:
 * they write files in bursts, pause, sometimes stop to ask a question, and
 * sometimes fail. That is enough to prove the Gateway learns the right facts
 * from watching, which is the part that has to work for every tool including the
 * ones nobody has written yet.
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Gateway, Adapter, observedOnly, Session, GroundWatch, contextFor } from '../src/gateway.mjs';

let root;
before(async () => { root = await mkdtemp(join(tmpdir(), 'viberant-gw-')); });
after(async () => { await rm(root, { recursive: true, force: true }); });

/** A ground for an effort to work in. */
async function ground(name) {
  const dir = join(root, name);
  await mkdir(dir, { recursive: true });
  return dir;
}

/**
 * An "assistant": a small program that does something and stops.
 *
 * Written in Node rather than a shell script because a shell script is not a
 * thing Windows knows how to start, and Windows is the platform this is for.
 * Returns the command to run it, which is what an adapter wants.
 */
async function assistant(name, body) {
  const path = join(root, `${name}.mjs`);
  await writeFile(path, `${STANDIN_HELPERS}\n${body}\n`);
  return [process.execPath, path];
}

/** The few things a stand-in assistant needs to be able to do. */
const STANDIN_HELPERS = `
import { writeFileSync } from 'node:fs';
const write = (f, t) => writeFileSync(f, t);
const say = (t) => process.stdout.write(t + '\\n');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const input = async () => { let s = ''; for await (const c of process.stdin) s += c; return s; };
`;

const settle = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------

describe('watching a ground', () => {
  test('notices work, and notices when it stops', async () => {
    const where = await ground('watch1');
    const facts = [];
    const watcher = new GroundWatch(where, (f) => facts.push(f), { silence: 250 }).start();

    await writeFile(join(where, 'a.js'), 'export const a = 1;\n');
    await settle(120);
    await writeFile(join(where, 'b.js'), 'export const b = 2;\n');
    await settle(600);
    watcher.stop();

    assert.ok(facts.some((f) => f.kind === 'active'), 'saw the work happen');
    assert.ok(facts.some((f) => f.kind === 'quiet'), 'saw it go quiet afterwards');

    const firstQuiet = facts.findIndex((f) => f.kind === 'quiet');
    const lastActive = facts.map((f) => f.kind).lastIndexOf('active');
    assert.ok(firstQuiet > lastActive, 'quiet is only ever declared after the last activity');
  });

  test('build output keeps an effort alive, but is not called a change', async () => {
    const where = await ground('watch2');
    await mkdir(join(where, 'node_modules', 'thing'), { recursive: true });
    const facts = [];
    const watcher = new GroundWatch(where, (f) => facts.push(f), { silence: 400 }).start();

    // A test run touching only build output — the case that would fool a
    // narrower watcher into calling this silence.
    for (let i = 0; i < 3; i++) {
      await writeFile(join(where, 'node_modules', 'thing', `cache${i}`), 'x');
      await settle(120);
    }
    await settle(80);
    const before = facts.filter((f) => f.kind === 'quiet').length;
    watcher.stop();

    assert.equal(before, 0, 'the effort was never called quiet while its build was running');
    assert.ok(facts.some((f) => f.kind === 'active'), 'the build kept it alive');
    assert.deepEqual(watcher.touched(), [], 'but none of it counts as a change');
  });
});

describe('running an assistant', () => {
  test('an unknown tool works by being watched alone', async () => {
    const where = await ground('run1');
    const tool = await assistant('scribbler', `
      say('working');
      write('billing.js', 'export function charge() {}\\n');
      await sleep(100);
      write('rates.js', 'export const rate = 0.2;\\n');
      say('done');
    `);

    const gateway = new Gateway().register(observedOnly('some-new-tool', tool));
    const r = await gateway.delegate({
      effort: 'E1', assistant: 'some-new-tool', ground: where, context: 'add billing',
    });
    assert.equal(r.ok, true);

    const { code } = await r.session.start({ silence: 5000 });
    assert.equal(code, 0);

    const kinds = r.session.facts().map((f) => f.kind);
    assert.ok(kinds.includes('started'));
    assert.ok(kinds.includes('active'), 'we saw it work without knowing anything about it');
    assert.ok(kinds.includes('ended'));
    assert.deepEqual(r.session.touched().sort(), ['billing.js', 'rates.js']);
  });

  test('an unknown tool is still told what the developer asked for', async () => {
    const where = await ground('run1b');
    const tool = await assistant('reader', `write('got.txt', await input());`);
    const gateway = new Gateway().register(observedOnly('reader', tool));
    const { session } = await gateway.delegate({
      effort: 'E1b', assistant: 'reader', ground: where,
      context: 'the export flow needs a progress indicator\nThen: use the existing spinner',
    });
    await session.start({ silence: 5000 });

    const { readFile } = await import('node:fs/promises');
    const got = await readFile(join(where, 'got.txt'), 'utf8');
    assert.match(got, /progress indicator/, 'it starts oriented, not cold');
    assert.match(got, /use the existing spinner/, 'every direction reaches it too');
  });

  test('a tool that fails is reported as failing, not as finishing', async () => {
    const where = await ground('run2');
    const tool = await assistant('breaker', `write('partial.js', 'half\\n'); process.exit(3);`);
    const gateway = new Gateway().register(observedOnly('breaker', tool));
    const { session } = await gateway.delegate({
      effort: 'E2', assistant: 'breaker', ground: where, context: 'x',
    });
    const { code } = await session.start({ silence: 5000 });

    assert.equal(code, 3);
    const last = session.facts().at(-1);
    assert.equal(last.kind, 'failed');
    assert.equal(last.code, 3);
  });

  test('an assistant that stops to ask is only caught if it says so', async () => {
    const where = await ground('run3');
    // A tool that asks a question and waits. Its process stays alive and it
    // writes nothing — indistinguishable from thinking, unless it tells us.
    const tool = await assistant('asker', `
      write('x.js', 'export const x = 1;\\n');
      say('May I remove the old column? [y/n]');
      await sleep(400);
    `);

    // First, with no adapter reading its output: we learn nothing.
    const blind = new Gateway().register(observedOnly('asker', tool));
    const a = await blind.delegate({ effort: 'E3', assistant: 'asker', ground: where, context: 'x' });
    await a.session.start({ silence: 10_000 });
    assert.equal(a.session.facts().some((f) => f.kind === 'asking'), false,
      'watching alone cannot tell a question from thinking');

    // Now with an adapter that recognises the question.
    const where2 = await ground('run3b');
    const taught = new Gateway().register(new Adapter({
      name: 'asker',
      present: async () => true,
      command: () => ({ file: tool[0], args: tool.slice(1) }),
      reads: (said) => (/\[y\/n\]/.test(said) ? { kind: 'asking', question: said.trim() } : null),
    }));
    const b = await taught.delegate({ effort: 'E4', assistant: 'asker', ground: where2, context: 'x' });
    await b.session.start({ silence: 10_000 });

    const asked = b.session.facts().find((f) => f.kind === 'asking');
    assert.ok(asked, 'a taught tool tells us immediately');
    assert.match(asked.question, /old column/);
  });

  test('the developer can stop an assistant without waiting for it', async () => {
    const where = await ground('run4');
    const tool = await assistant('dawdler', `write('a.js', 'x\\n'); await sleep(30000);`);
    const gateway = new Gateway().register(observedOnly('dawdler', tool));
    const { session } = await gateway.delegate({
      effort: 'E5', assistant: 'dawdler', ground: where, context: 'x',
    });

    const running = session.start({ silence: 60_000 });
    await settle(200);
    session.stop();
    const { code } = await running;

    assert.notEqual(code, 0, 'it was stopped rather than allowed to finish');
    assert.ok(session.endedAt !== null);
  });
});

describe('neutrality', () => {
  test('assistants are an unordered set with no favourite', async () => {
    const tool = await assistant('any', '');
    const gateway = new Gateway()
      .register(observedOnly('zebra', tool))
      .register(observedOnly('aardvark', tool))
      .register(observedOnly('mongoose', tool));

    const found = await gateway.available();
    assert.equal(found.length, 3);
    // Nothing in the Gateway's surface offers a default, a ranking or a preference.
    assert.equal(typeof gateway.default, 'undefined');
    assert.equal(typeof gateway.preferred, 'undefined');
    assert.equal(typeof gateway.recommend, 'undefined');
  });

  test('a tool that is not set up is declined honestly', async () => {
    const where = await ground('none');
    const gateway = new Gateway();
    const r = await gateway.delegate({
      effort: 'E6', assistant: 'nothing-here', ground: where, context: 'x',
    });
    assert.equal(r.ok, false);
    assert.ok(r.sentence && r.action);
  });

  test('who answers our questions is decided mechanically, not by preference', async () => {
    const tool = await assistant('any2', '');
    const gateway = new Gateway()
      .register(observedOnly('watched-only', tool))
      .register(new Adapter({
        name: 'can-answer', present: async () => true,
        command: () => ({ file: tool[0], args: tool.slice(1) }),
        inference: async (prompt) => `answering: ${prompt}`,
      }));

    // Nobody worked on this effort, so we take whoever can answer at all.
    const chosen = await gateway.inferenceFor('unknown-effort');
    assert.equal(chosen.name, 'can-answer');

    // Once a tool has worked on an effort, it answers about that effort —
    // because it already holds the context, not because we prefer it.
    const where = await ground('inference');
    const { session } = await gateway.delegate({
      effort: 'E7', assistant: 'can-answer', ground: where, context: 'x',
    });
    await session.start({ silence: 5000 });
    assert.equal((await gateway.inferenceFor('E7')).name, 'can-answer');
  });
});

describe('changing tools mid-effort', () => {
  test('the next assistant starts oriented, not cold', () => {
    const effort = {
      intent: 'the export flow needs a progress indicator',
      directions: ['use the existing spinner, not a new one'],
      assistants: ['claude-code', 'codex-cli'],
      summary: 'The export flow reports progress, but the bar does not move smoothly.',
      story: [
        { kind: 'account', ref: 'accounts/1.md' },
        { kind: 'delegated', detail: 'claude-code' },
      ],
    };

    const context = contextFor(effort);
    assert.match(context, /^the export flow needs a progress indicator/);
    assert.match(context, /Then: use the existing spinner/);
    assert.match(context, /already been done on this by: claude-code/);
    assert.match(context, /accounts\/1\.md/);
    assert.match(context, /Where it stands: The export flow reports progress/);
  });

  test('a fresh effort carries only what the developer said', () => {
    const context = contextFor({ intent: 'add billing', directions: [], assistants: ['claude-code'] });
    assert.equal(context, 'add billing');
  });
});
