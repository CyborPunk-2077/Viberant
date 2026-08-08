/**
 * What a model is told, and what it is allowed to do.
 *
 * Two rules are worth more than every feature built on top of them:
 *
 *   a secret never leaves this computer in a prompt;
 *   nothing a model suggests reaches a file without somebody agreeing to it.
 *
 * Both are the kind of rule that is easy to hold on the day it is written and
 * easy to lose on the day somebody adds a fifth call site. So neither is held
 * by care — the redaction is one function that everything goes through, the
 * approval is a separate route that nothing else can reach, and both are here.
 *
 * Nothing in this file reaches a model. What is being proved is what would be
 * sent and what would be written, which is decidable on this computer.
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let root, house, project;

before(async () => {
  root = await mkdtemp(join(tmpdir(), 'viberant-ai-'));
  house = join(root, 'home');
  await mkdir(house, { recursive: true });
  process.env.USERPROFILE = house;
  process.env.HOME = house;

  project = join(root, 'an-app');
  await mkdir(project, { recursive: true });
  await writeFile(join(project, 'package.json'), JSON.stringify({
    name: 'an-app', devDependencies: { vite: '5.0.0' }, scripts: { build: 'vite build' },
  }, null, 2));
  await writeFile(join(project, '.env.example'), 'DATABASE_URL=\nSTRIPE_KEY=\n');
  // The file with real values in it. Nothing may ever read this.
  await writeFile(join(project, '.env'),
    'DATABASE_URL=postgres://user:REAL-PASSWORD-HERE@db.example.com/app\n'
    + 'STRIPE_KEY=sk-REALKEY0000000000000000000000\n');
});

after(async () => {
  await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
});

describe('a secret never leaves this computer in a prompt', () => {
  test('the shapes a credential comes in are all replaced', async () => {
    const { withoutSecrets } = await import('../assistant.mjs');

    const cases = [
      ['STRIPE_SECRET_KEY=sk-abc123def456ghi789', 'sk-abc123def456ghi789'],
      ['DATABASE_PASSWORD=hunter2', 'hunter2'],
      ['"apiKey": "abc123def456"', 'abc123def456'],
      ['"access_token":"ghp_aaaaaaaaaaaaaaaaaaaa"', 'ghp_aaaaaaaaaaaaaaaaaaaa'],
      ['using sk-ant-api03-aaaaaaaaaaaaaaaaaaaaaa here', 'sk-ant-api03-aaaaaaaaaaaaaaaaaaaaaa'],
      ['token ghp_1234567890abcdefghij', 'ghp_1234567890abcdefghij'],
      ['postgres://user:swordfish@host/db', 'swordfish'],
      ['Authorization: Bearer eyJhbGciOiJIUzI1NiJ9', 'eyJhbGciOiJIUzI1NiJ9'],
      ['AWS key AKIAIOSFODNN7EXAMPLE used', 'AKIAIOSFODNN7EXAMPLE'],
    ];

    for (const [text, secret] of cases) {
      const clean = withoutSecrets(text);
      assert.equal(clean.includes(secret), false, `still leaks: ${text}`);
      assert.match(clean, /kept on this computer/, `did not say it was held back: ${text}`);
    }
  });

  test('ordinary text is left alone, so an answer is still useful', async () => {
    const { withoutSecrets } = await import('../assistant.mjs');
    const plain = 'Error: Cannot find module "vite" in /app/src/main.js at line 12';
    assert.equal(withoutSecrets(plain), plain);
  });

  test('the file with real values in it is never opened', async () => {
    const { contextFor } = await import('../assistant.mjs');
    const context = await contextFor(project);

    const everything = JSON.stringify(context);
    assert.equal(everything.includes('REAL-PASSWORD-HERE'), false);
    assert.equal(everything.includes('sk-REALKEY'), false);
    assert.equal(everything.includes('db.example.com'), false);

    // And the names, which are the useful half, are there.
    assert.deepEqual(context.expectedSettings.sort(), ['DATABASE_URL', 'STRIPE_KEY']);
    assert.equal(context.hasLocalSettingsFile, true,
      'that a local file exists is worth knowing; what is in it is not');

    // Only the named files, never a walk of the folder.
    assert.deepEqual(context.files.map((f) => f.name).sort(), ['.env.example', 'package.json']);
  });

  test('a build log with a key in it is cleaned before it could be sent', async () => {
    const { withoutSecrets } = await import('../assistant.mjs');
    const log = [
      '> vite build',
      'Loading env from .env',
      'DATABASE_URL=postgres://user:REAL-PASSWORD-HERE@db.example.com/app',
      'Error: connect ECONNREFUSED 127.0.0.1:5432',
    ].join('\n');

    const clean = withoutSecrets(log);
    assert.equal(clean.includes('REAL-PASSWORD-HERE'), false);
    // The part that says what went wrong survives, which is the whole point.
    assert.match(clean, /ECONNREFUSED/);
  });
});

describe('nothing reaches a file without being agreed to', () => {
  test('proposing changes nothing', async () => {
    const assistant = await import('../assistant.mjs');
    const target = join(project, 'src', 'made-up.js');

    const one = await assistant.propose({
      dir: project,
      what: 'Add the missing file',
      changes: [{ path: 'src/made-up.js', becomes: 'export const hello = 1;\n' }],
    });

    assert.equal(one.state, 'waiting for you');
    assert.equal(existsSync(target), false, 'a suggestion is not a change');
  });

  test('applying it changes exactly what it said it would', async () => {
    const assistant = await import('../assistant.mjs');
    const one = await assistant.propose({
      dir: project,
      what: 'Add a note',
      changes: [{ path: 'NOTES.md', becomes: '# notes\n' }],
    });

    const out = await assistant.apply(one.id);
    assert.equal(out.ok, true, out.sentence);
    assert.equal(await readFile(join(project, 'NOTES.md'), 'utf8'), '# notes\n');
  });

  test('the same suggestion cannot be applied twice', async () => {
    const assistant = await import('../assistant.mjs');
    const one = await assistant.propose({
      dir: project, what: 'Once', changes: [{ path: 'ONCE.md', becomes: 'a\n' }],
    });
    assert.equal((await assistant.apply(one.id)).ok, true);
    const again = await assistant.apply(one.id);
    assert.equal(again.ok, false);
    assert.match(again.sentence, /already/);
  });

  test('a suggestion that reaches outside the project is refused, and writes nothing', async () => {
    const assistant = await import('../assistant.mjs');
    const escaped = join(root, 'escaped.txt');

    const one = await assistant.propose({
      dir: project,
      what: 'Escape',
      changes: [
        { path: 'fine.txt', becomes: 'ok\n' },
        { path: '../escaped.txt', becomes: 'should never exist\n' },
      ],
    });

    const out = await assistant.apply(one.id);
    assert.equal(out.ok, false);
    assert.equal(existsSync(escaped), false, 'nothing outside the project');
    assert.equal(existsSync(join(project, 'fine.txt')), false,
      'and the acceptable half is not written either — it is one decision, not two');
  });

  test('with no key set, it says so rather than pretending', async () => {
    const assistant = await import('../assistant.mjs');
    const set = await assistant.ready();
    assert.equal(set.ok, false);
    assert.ok(set.sentence && set.action);
    assert.ok(set.where, 'and says where to get one');
  });
});

/**
 * A change that was asked for, before it is a change.
 *
 * The dangerous moment is not the model being wrong — it is the product being
 * clever about an answer it did not understand. A malformed reply has to be a
 * refusal, because guessing at one is exactly how something writes a file
 * nobody meant.
 */
describe('an answer that is not the shape asked for is refused', () => {
  test('fenced JSON is still read, because punctuation is not a reason to fail', async () => {
    const { __testOnly } = await import('../assistant.mjs');
    const shapes = [
      '{"what":"a","files":[]}',
      '```json\n{"what":"a","files":[]}\n```',
      '```\n{"what":"a","files":[]}\n```',
      'Here you go:\n{"what":"a","files":[]}\nhope that helps',
    ];
    for (const text of shapes) {
      assert.deepEqual(__testOnly.readJson(text), { what: 'a', files: [] }, text.slice(0, 24));
    }
  });

  test('anything that is not JSON at all reads as nothing, rather than as something', async () => {
    const { __testOnly } = await import('../assistant.mjs');
    for (const text of ['I would change src/app.js', '', 'null', '{ broken']) {
      assert.equal(__testOnly.readJson(text), null, text);
    }
  });

  test('a proposal keeps what each file was, so a change can be looked at', async () => {
    const assistant = await import('../assistant.mjs');
    const one = await assistant.propose({
      dir: project,
      what: 'Change the readme',
      changes: [{ path: 'README.md', was: 'old\n', becomes: 'new\n' }],
    });
    assert.equal(one.changes[0].was, 'old\n');
    assert.equal(one.changes[0].becomes, 'new\n');
  });
});
