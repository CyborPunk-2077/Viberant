import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { analyze, create } from '../webtarget.mjs';

let root;
before(async () => { root = await mkdtemp(join(tmpdir(), 'viberant-web-target-')); });
after(async () => { await rm(root, { recursive: true, force: true }); });

async function fixture(name, files) {
  const at = join(root, name);
  await mkdir(at, { recursive: true });
  for (const [file, text] of Object.entries(files)) {
    const target = join(at, file);
    await mkdir(join(target, '..'), { recursive: true });
    await writeFile(target, text, 'utf8');
  }
  return at;
}

describe('desktop to web analysis reports facts and never invents a translation', () => {
  test('an existing static website is web-safe and can be accepted as-is', async () => {
    const at = await fixture('site', { 'index.html': '<h1>Hello</h1>' });
    const report = await analyze(at);
    assert.equal(report.web.category, 'WEB_SAFE');
    assert.equal(report.recommendation, 'STANDALONE_WEB');
    assert.equal((await create(at)).ok, true);
  });

  test('native code with no browser surface stays explicitly desktop-only', async () => {
    const at = await fixture('native', {
      'package.json': JSON.stringify({ scripts: { desktop: 'electron .' }, devDependencies: { electron: '1.0.0' } }),
      'main.js': "import { app } from 'electron'; import { readFile } from 'node:fs';",
    });
    const report = await analyze(at);
    assert.equal(report.web.category, 'DESKTOP_ONLY');
    assert.equal((await create(at)).ok, false);
  });

  test('a browser surface that calls native features asks for adapters and a companion', async () => {
    const at = await fixture('companion', {
      'package.json': JSON.stringify({ scripts: { desktop: 'electron .' }, devDependencies: { electron: '1.0.0' } }),
      'src/ui.js': "document.body.textContent = 'Ready';",
      'src/main.js': "import { app } from 'electron'; import { readFile } from 'node:fs/promises';",
    });
    const report = await analyze(at);
    assert.equal(report.web.category, 'ADAPTER_REQUIRED');
    assert.equal(report.recommendation, 'WEB_COMPANION');
    assert.ok(report.blockers.some((one) => one.id === 'files'));
    assert.equal((await create(at)).ok, false, 'a decorative page must not be called a web version');
  });
});

