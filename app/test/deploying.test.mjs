/**
 * Which project a deploy is about, and what it would do to it.
 *
 * The fault this guards against is the one that costs somebody a website:
 * switching from project A to project B and deploying B over A's site, because
 * something about A was still being held. The account is per computer and the
 * binding is per project, and those are different lifetimes.
 *
 * Nothing here reaches Vercel. What is being proved is what the product would
 * decide, which is decidable from files on this disk.
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let root, house;

const projectAt = async (name, pkg, extra = {}) => {
  const at = join(root, name);
  await mkdir(at, { recursive: true });
  if (pkg) await writeFile(join(at, 'package.json'), JSON.stringify(pkg, null, 2));
  for (const [file, text] of Object.entries(extra)) {
    await mkdir(join(at, file, '..'), { recursive: true });
    await writeFile(join(at, file), text);
  }
  return at;
};

before(async () => {
  root = await mkdtemp(join(tmpdir(), 'viberant-deploy-'));
  house = join(root, 'home');
  await mkdir(house, { recursive: true });
  process.env.USERPROFILE = house;
  process.env.HOME = house;
});

after(async () => {
  await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
});

describe('what a project is, read out of the project', () => {
  test('a framework is recognised by a dependency that is actually there', async () => {
    const providers = await import('../providers.mjs');

    const next = await projectAt('a-next-app', {
      name: 'a-next-app', dependencies: { next: '15.0.0', react: '19.0.0' },
      scripts: { build: 'next build', dev: 'next dev' },
    }, { 'package-lock.json': '{}' });

    const look = await providers.inspect(next);
    assert.equal(look.framework, 'Next.js');
    assert.equal(look.frameworkId, 'next');
    assert.equal(look.manager, 'npm');
    assert.equal(look.build, 'npm run build');
    assert.equal(look.needsBuild, true);
  });

  test('the package manager comes from which lock file is here', async () => {
    const providers = await import('../providers.mjs');

    const vite = await projectAt('a-vite-app', {
      name: 'a-vite-app', devDependencies: { vite: '5.0.0' }, scripts: { build: 'vite build' },
    }, { 'pnpm-lock.yaml': '' });

    const look = await providers.inspect(vite);
    assert.equal(look.framework, 'Vite');
    assert.equal(look.manager, 'pnpm');
    assert.equal(look.build, 'pnpm run build');
  });

  test('a folder of plain files is a website too, and says so', async () => {
    const providers = await import('../providers.mjs');
    const plain = await projectAt('a-plain-site', null, { 'index.html': '<h1>hello</h1>' });

    const look = await providers.inspect(plain);
    assert.equal(look.frameworkId, 'static');
    assert.equal(look.needsBuild, false);
    assert.equal(look.hasPackage, false);
  });

  test('a folder that is not a website at all is not called one', async () => {
    const providers = await import('../providers.mjs');
    const notes = await projectAt('just-notes', null, { 'notes.txt': 'hello' });

    const look = await providers.inspect(notes);
    assert.equal(look.frameworkId, null);
    assert.equal(providers.vercel.supports(look), false,
      'offering to deploy a folder of notes as a website would be a guess');
  });

  test('the names of settings are read, and never their values', async () => {
    const providers = await import('../providers.mjs');
    const app = await projectAt('has-secrets', { name: 'has-secrets' }, {
      '.env.example': 'DATABASE_URL=\nSTRIPE_KEY=\n',
      '.env': 'DATABASE_URL=postgres://real:secret@host/db\nSTRIPE_KEY=sk_live_do_not_read_me\n',
    });

    const look = await providers.inspect(app);
    assert.deepEqual(look.environment.expected.sort(), ['DATABASE_URL', 'STRIPE_KEY']);
    assert.equal(look.environment.hasLocalFile, true);

    // The whole of the point: no value out of that file may appear anywhere in
    // what this returns, because what this returns is shown, logged and — if AI
    // is ever asked about a project — sent.
    const everything = JSON.stringify(look);
    assert.equal(everything.includes('PRIVATE-VALUE-1'), false, 'a value must never be read into this');
    assert.equal(everything.includes('PRIVATE-VALUE-2'), false);
    assert.equal(everything.includes('postgres://'), false);
  });
});

describe('where a project deploys belongs to that project', () => {
  test('binding one leaves the other alone', async () => {
    const providers = await import('../providers.mjs');

    const a = await projectAt('site-a', { name: 'site-a', devDependencies: { vite: '5' }, scripts: { build: 'vite build' } });
    const b = await projectAt('site-b', { name: 'site-b', devDependencies: { vite: '5' }, scripts: { build: 'vite build' } });

    assert.equal(await providers.bindingFor(a), null);
    assert.equal(await providers.bindingFor(b), null);

    await providers.bind(a, { provider: 'vercel', url: 'https://site-a.vercel.app', name: 'site-a' });

    assert.equal((await providers.bindingFor(a)).url, 'https://site-a.vercel.app');
    assert.equal(await providers.bindingFor(b), null,
      'project B must not inherit project A deployment');

    await providers.bind(b, { provider: 'vercel', url: 'https://site-b.vercel.app', name: 'site-b' });

    assert.equal((await providers.bindingFor(a)).url, 'https://site-a.vercel.app',
      'and binding B must not move A');
    assert.equal((await providers.bindingFor(b)).url, 'https://site-b.vercel.app');
  });

  test('the same folder by another name is the same project', async () => {
    const providers = await import('../providers.mjs');
    const a = join(root, 'site-a');

    // Windows does not distinguish case, and neither may this — a binding found
    // only when the capitals match is a binding that goes missing.
    assert.equal((await providers.bindingFor(a.toUpperCase())).url, 'https://site-a.vercel.app');
  });
});
