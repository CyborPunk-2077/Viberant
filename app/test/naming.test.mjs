/**
 * The name a project goes by at Vercel, and whether it belongs there at all.
 *
 * `ValoVault` was refused. What came back said the name was invalid, which is
 * true and useless: nobody named anything. The folder was called what it was
 * called, and the tool names a project after the folder it is run in, so a
 * capital letter in somebody's folder name became a deploy that could not
 * work and a sentence that blamed a rule they had never read.
 *
 * The folder is never renamed. It is theirs. What changes is the name used at
 * Vercel, which is written down beside the project so the second deploy finds
 * the first site rather than making another one.
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
let root, providers;

before(async () => {
  root = await mkdtemp(join(tmpdir(), 'viberant-naming-'));
  await mkdir(join(root, 'home'), { recursive: true });
  process.env.USERPROFILE = join(root, 'home');
  process.env.HOME = join(root, 'home');
  providers = await import('../providers.mjs');
});

after(async () => {
  await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
});

describe('a folder name becomes a name Vercel will take', () => {
  const ways = [
    ['ValoVault', 'valovault'],
    ['My Cool App', 'my-cool-app'],
    ['Viberant_AI!!!', 'viberant-ai'],
    ['revenue-os', 'revenue-os'],
    ['My..App', 'my-app'],
    ['  spaced  out  ', 'spaced-out'],
    ['...leading', 'leading'],
    ['trailing---', 'trailing'],
    ['CAMERA SHAKING REBUFFED-324-1', 'camera-shaking-rebuffed-324-1'],
  ];

  for (const [was, becomes] of ways) {
    test(`${was} becomes ${becomes}`, () => {
      assert.equal(providers.slugFor(was), becomes);
    });
  }

  test('never the run of three hyphens Vercel refuses outright', () => {
    // Its own words: names "cannot contain the sequence '---'". Reached easily
    // from an ordinary name — three spaces, or a space either side of a dash.
    for (const was of ['a   b', 'a - b', 'x -- y', 'A!!!B', 'one _ - _ two']) {
      const slug = providers.slugFor(was);
      assert.equal(slug.includes('---'), false, `${was} became ${slug}`);
      assert.match(slug, /^[a-z0-9][a-z0-9.-]*[a-z0-9]$|^[a-z0-9]$/,
        `${was} became ${slug}, which Vercel would refuse`);
    }
  });

  test('and never longer than a hundred characters', () => {
    const slug = providers.slugFor('A'.repeat(400));
    assert.ok(slug.length <= 100);
    assert.equal(/[-.]$/.test(slug), false, 'cut at a hundred and left ending in a separator');
  });

  test('the same folder always reaches the same name', () => {
    // The whole reason a second deploy finds the first site rather than making
    // a second one.
    const once = providers.slugFor('My Cool App');
    for (let i = 0; i < 20; i += 1) assert.equal(providers.slugFor('My Cool App'), once);
  });

  test('something usable comes back even from a name with none of it', () => {
    assert.ok(providers.slugFor('ФайлЫ').length > 0);
    assert.ok(providers.slugFor('!!!').length > 0);
    assert.ok(providers.slugFor('').length > 0);
  });

  test('nothing here renames a folder', async () => {
    // The fear that would stop anybody trusting this, answered by reading it.
    const source = await readFile(join(here, '..', 'providers.mjs'), 'utf8');
    for (const never of [/\brename\(/, /\brenameSync/, /fs\.rename/]) {
      assert.equal(never.test(source), false, `putting a site online can ${never}`);
    }
  });
});

describe('not everything belongs on a hosting service', () => {
  const make = async (name, files) => {
    const at = join(root, name);
    await mkdir(at, { recursive: true });
    for (const [f, body] of Object.entries(files)) {
      const to = join(at, f);
      await mkdir(dirname(to), { recursive: true });
      await writeFile(to, body, 'utf8');
    }
    return at;
  };

  test('a desktop application says so, rather than being deployed', async () => {
    const at = await make('desk', {
      'package.json': JSON.stringify({ name: 'desk', scripts: { desktop: 'electron .' } }),
    });

    const web = await providers.webPartOf(at);
    assert.equal(web.ok, false);
    assert.equal(web.kind, 'desktop');
    assert.match(web.sentence, /desktop application/);
    assert.match(web.action, /application instead/);
  });

  test('and it is found whatever the script that starts it is called', async () => {
    // This project's own is called `desktop`, not `electron`. Looking for the
    // name rather than the thing missed it.
    const at = await make('desk2', {
      'package.json': JSON.stringify({ name: 'd2', scripts: { 'app:start': 'electron --no-sandbox .' } }),
    });
    assert.equal((await providers.webPartOf(at)).kind, 'desktop');
  });

  test('a folder of pages is a website, even with no index.html', async () => {
    // Requiring one filename refused a real static site. People put exactly
    // this on Vercel and it serves them at their own names.
    const at = await make('pages', { 'one.html': '<h1>one</h1>', 'two.html': '<h1>two</h1>' });

    const web = await providers.webPartOf(at);
    assert.equal(web.ok, true);
    assert.equal(web.root, at);
    assert.equal(web.look.frameworkId, 'static');
  });

  test('a desktop application with a website inside it deploys the website', async () => {
    const at = await make('both', {
      'package.json': JSON.stringify({ name: 'both', scripts: { desktop: 'electron .' } }),
      'web/package.json': JSON.stringify({ name: 'w', dependencies: { vite: '^5' }, scripts: { build: 'vite build' } }),
    });

    const web = await providers.webPartOf(at);
    assert.equal(web.ok, true, 'the website inside it was not found');
    assert.equal(web.inside, 'web');
    assert.equal(web.root, join(at, 'web'));
  });

  test('a project with nothing in it says that, and says why', async () => {
    const at = await make('empty', { 'notes.txt': 'hello' });
    const web = await providers.webPartOf(at);
    assert.equal(web.ok, false);
    assert.equal(web.kind, 'nothing');
    assert.ok(web.action);
  });
});

describe('what a deploy would do, worked out before it starts', () => {
  test('it carries its own folder, name and slug', async () => {
    const at = join(root, 'ValoLike');
    await mkdir(at, { recursive: true });
    await writeFile(join(at, 'page.html'), '<h1>hi</h1>', 'utf8');

    const plan = await providers.preflight(at, 'ValoLike', { token: 'x' });
    assert.equal(plan.ok, true);
    assert.equal(plan.slug, 'valolike');
    assert.equal(plan.projectRoot, at);
    assert.equal(plan.webRoot, at);
    assert.equal(plan.renamed, true);
  });

  test('and refuses a desktop project without running anything', async () => {
    const at = join(root, 'DeskOnly');
    await mkdir(at, { recursive: true });
    await writeFile(join(at, 'package.json'),
      JSON.stringify({ scripts: { desktop: 'electron .' } }), 'utf8');

    const plan = await providers.preflight(at, 'DeskOnly', { token: 'x' });
    assert.equal(plan.ok, false);
    assert.equal(plan.trouble, 'NOT_DEPLOYABLE');
  });

  test('a name Vercel would refuse needs a token, and says so before building', async () => {
    // Without one, the tool names the project after the folder and fails some
    // minutes in with a sentence about a rule nobody broke.
    const at = join(root, 'NeedsAToken');
    await mkdir(at, { recursive: true });
    await writeFile(join(at, 'i.html'), 'x', 'utf8');

    const plan = await providers.preflight(at, 'NeedsAToken', { token: null });
    assert.equal(plan.needsToken, true);

    const fine = await providers.preflight(at, 'needsatoken', { token: null });
    assert.equal(fine.needsToken, false, 'a name Vercel already takes was refused anyway');
  });

  test('the deploy runs in the website folder it worked out, never anywhere else', async () => {
    const source = await readFile(join(here, '..', 'providers.mjs'), 'utf8');
    const body = source.slice(source.indexOf('async deploy(job, jobs'));
    const mine = body.slice(0, body.indexOf('\n  },'));

    assert.match(mine, /cwd: plan\.webRoot/, 'it runs somewhere other than the website it found');
    assert.equal(/process\.cwd\(\)/.test(mine), false, 'it can fall back to whatever folder this process is in');
  });

  test('and everything worth writing down comes back with it', async () => {
    const source = await readFile(join(here, '..', 'providers.mjs'), 'utf8');
    const body = source.slice(source.indexOf('async deploy(job, jobs'));
    const mine = body.slice(0, body.indexOf('\n  },'));

    const binding = mine.slice(mine.indexOf('binding: {'));
    for (const named of ['projectRoot', 'webRoot', 'slug', 'projectId', 'account', 'url']) {
      // Written either way round: `account,` is the same as `account: account`.
      assert.match(binding, new RegExp(`\\b${named}\\s*[:,]`),
        `${named} is not written down against the project`);
    }
  });
});
