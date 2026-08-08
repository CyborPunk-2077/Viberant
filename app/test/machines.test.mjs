/**
 * Comparing two computers, and the one thing that must never be in it.
 *
 * "Why does this work on my machine and not on theirs" is answerable from a
 * short list of facts, and the most useful line in that list is about settings.
 * It is also the line one careless step away from putting somebody's database
 * password on a screen, in a log, and in a prompt to a company.
 *
 * So the tests here are about the shape of what is collected rather than about
 * arithmetic: **names and counts, never a value**, held structurally so it
 * survives whoever writes the next feature.
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
let root, machines, project;

before(async () => {
  root = await mkdtemp(join(tmpdir(), 'viberant-machines-'));
  await mkdir(join(root, 'home'), { recursive: true });
  process.env.USERPROFILE = join(root, 'home');
  process.env.HOME = join(root, 'home');

  machines = await import('../machines.mjs');

  project = join(root, 'Atlas');
  await mkdir(project, { recursive: true });
  await writeFile(join(project, 'package.json'), JSON.stringify({
    name: 'atlas', scripts: { build: 'vite build', dev: 'vite' }, devDependencies: { vite: '5.0.0' },
  }, null, 2));
  await writeFile(join(project, '.env.example'), 'DATABASE_URL=\nSTRIPE_KEY=\nAPI_BASE=\n');
  // The file with real values in it. Nothing may ever read this.
  await writeFile(join(project, '.env'),
    'DATABASE_URL=postgres://user:REAL-PASSWORD-HERE@db/app\nSTRIPE_KEY=sk-REALKEY0000\n');
});

after(async () => {
  await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
});

describe('what a computer says about itself', () => {
  test('the facts that have actually been the answer, and not a hundred others', async () => {
    const me = await machines.whatThisIs();

    assert.ok(me.name && me.kind);
    assert.match(me.tools.Node, /^\d+\.\d+/);
    assert.ok('npm' in me.tools, 'the package managers are what the answer usually turns on');
    assert.ok(Object.keys(me.tools).length <= 10, 'a wall of facts is a wall nobody reads');
  });

  test('with a project, it says what that project expects — by name', async () => {
    const me = await machines.whatThisIs({ dir: project });

    assert.deepEqual(me.project.expects.sort(), ['API_BASE', 'DATABASE_URL', 'STRIPE_KEY']);
    assert.equal(me.project.hasSettingsFile, true, 'whether there is one is worth knowing');
    assert.equal(me.project.canBuild, true);
  });

  test('and no value from the real settings file is anywhere in it', async () => {
    const me = await machines.whatThisIs({ dir: project });
    const everything = JSON.stringify(me);

    for (const secret of ['REAL-PASSWORD-HERE', 'sk-REALKEY0000', 'postgres://']) {
      assert.equal(everything.includes(secret), false, `${secret} reached the description of a machine`);
    }
  });
});

describe('two computers, side by side', () => {
  const aMachine = (over = {}) => ({
    name: 'Danni-PC',
    kind: 'Windows 10.0.26200',
    tools: { Node: '24.19.0', npm: '11.0.0', pnpm: '10.1.0', Git: '2.45.0' },
    project: {
      framework: 'Vite', manager: 'pnpm', expects: ['DATABASE_URL', 'STRIPE_KEY'],
      hasSettingsFile: true, canBuild: true, canRun: true,
    },
    ...over,
  });

  test('the differences are named, and the sameness is kept so the list is complete', () => {
    const mine = aMachine();
    const theirs = aMachine({
      name: 'Rahul-PC',
      tools: { Node: '22.11.0', npm: '11.0.0', pnpm: null, Git: '2.45.0' },
      project: { ...aMachine().project, manager: 'npm', canBuild: false },
    });

    const out = machines.compare(mine, theirs);
    const named = out.differences.map((d) => d.what);

    assert.ok(named.includes('Node'), 'the version that is usually the answer was not compared');
    assert.ok(named.includes('pnpm'));
    assert.ok(named.includes('Package manager'));
    assert.ok(out.same.some((s) => s.what === 'Git'), 'what matches has to be visible too');
    assert.match(out.sentence, /difference/);
  });

  test('two identical computers say so plainly', () => {
    const out = machines.compare(aMachine(), aMachine({ name: 'Other-PC' }));
    assert.deepEqual(out.differences.filter((d) => d.what !== 'This computer'), []);
    assert.match(out.sentence, /look the same/);
  });

  test('a tool neither has is not a difference', () => {
    const mine = aMachine({ tools: { Node: '24.0.0', bun: null } });
    const theirs = aMachine({ tools: { Node: '24.0.0', bun: null } });
    const out = machines.compare(mine, theirs);
    assert.equal(out.differences.some((d) => d.what === 'bun'), false);
  });

  test('settings are compared by name, and the row says so out loud', () => {
    const mine = aMachine();
    const theirs = aMachine({
      project: { ...aMachine().project, expects: ['DATABASE_URL'] },
    });

    const out = machines.compare(mine, theirs);
    const row = out.differences.find((d) => d.what === 'Settings expected, by name');

    assert.ok(row, 'the most useful line in the comparison is missing');
    assert.match(row.mine, /STRIPE_KEY only here/);
    assert.match(row.note, /Names only/);
    assert.match(row.note, /never leaves the computer it is on/);
  });
});

describe('what a model is told about somebody machines', () => {
  test('it is built in one place, so the rule cannot be forgotten at a call site', async () => {
    const source = await readFile(join(here, '..', 'machines.mjs'), 'utf8');
    const code = source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

    // Nothing in here opens a file at all, which is the strongest form of
    // "it never reads a value".
    // `.env` as a filename, rather than the word "environment", which the
    // first version of this caught and which is exactly what should be here.
    for (const way of [/readFile/, /createReadStream/, /readFileSync/, /['"`]\.env/]) {
      assert.equal(way.test(code), false, `machines.mjs can ${way}`);
    }
  });

  test('the text handed to a model carries names and counts and nothing else', async () => {
    const mine = await machines.whatThisIs({ dir: project });
    const theirs = { ...mine, name: 'Rahul-PC', tools: { ...mine.tools, Node: '22.1.0' } };
    const work = machines.compare(mine, theirs);

    const said = machines.forAModel(mine, theirs, work);

    for (const secret of ['REAL-PASSWORD-HERE', 'sk-REALKEY0000', 'postgres://']) {
      assert.equal(said.includes(secret), false, `${secret} was about to be sent to a company`);
    }
    assert.match(said, /Machine A/);
    assert.match(said, /Machine B/);
    assert.match(said, /by name only/, 'the model has to be told it will never get values');
  });
});

describe('asking about two machines never carries a value, and never runs anything', () => {
  test('every cross-machine question goes through the one redaction', async () => {
    const source = await readFile(join(here, '..', 'assistant.mjs'), 'utf8');

    for (const one of ['whyDifferent', 'likelyToBuildThere', 'whyItFailedThere']) {
      const at = source.indexOf(`export async function ${one}`);
      assert.ok(at > 0, `${one} is not there`);
      const body = source.slice(at, at + 2000);
      assert.match(body, /withoutSecrets\(/, `${one} builds a prompt without going through the redaction`);
    }
  });

  test('nothing in the assistant can start a process', async () => {
    const source = await readFile(join(here, '..', 'assistant.mjs'), 'utf8');
    const code = source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

    for (const way of [/spawn\(/, /exec\(/, /execFile/, /child_process/]) {
      assert.equal(way.test(code), false,
        `assistant.mjs can ${way} — a model recommending something must never be able to do it`);
    }
  });

  test('a recommendation about a remote build is told it cannot run anything', async () => {
    const source = await readFile(join(here, '..', 'assistant.mjs'), 'utf8');
    const at = source.indexOf('export async function likelyToBuildThere');
    const body = source.slice(at, at + 1600);
    assert.match(body, /not able to run anything/i);
  });
});
