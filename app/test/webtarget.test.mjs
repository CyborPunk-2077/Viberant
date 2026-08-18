import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
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

    /*
     * And nothing is made for it.
     *
     * This used to write a card saying the project relies on a desktop
     * computer, and that card then *was* the web version: it was what Preview
     * showed and what Deploy put online, under the project's own name. A
     * connection dialog is not somebody's project, and putting it online is
     * not putting their project online. With nothing here that a browser could
     * show, the honest answer is to say so and leave no folder behind.
     */
    const made = await create(at);
    assert.equal(made.ok, false, 'a project with no browser surface was given a web version anyway');
    assert.equal(made.needsWork, true);
    assert.match(made.sentence, /no browser interface/i);
    assert.ok(made.action, 'a refusal carries one thing to do');
    assert.equal(existsSync(join(at, 'web')), false, 'an empty target was left behind to block the next attempt');
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
    const made = await create(at);
    assert.equal(made.ok, true, 'an isolated browser entry should become a real static target');
    assert.equal((await analyze(at)).web.category, 'WEB_SAFE');
  });

  test('a browser-safe React and TSX surface becomes a buildable target with its real dependency versions', async () => {
    const at = await fixture('react-desktop', {
      'package.json': JSON.stringify({
        scripts: { desktop: 'electron .' },
        dependencies: { react: '18.3.1', 'react-dom': '18.3.1' },
        devDependencies: { electron: '30.0.0', vite: '5.4.0', typescript: '5.6.2' },
      }),
      'desktop/main.mjs': "import { app } from 'electron'; import { readFile } from 'node:fs/promises';",
      'src/main.tsx': "import React from 'react'; import { createRoot } from 'react-dom/client'; import { App } from './App'; createRoot(document.getElementById('root')!).render(<App/>);",
      'src/App.tsx': "import React from 'react'; import './style.css'; export const App = () => <h1>Real app</h1>;",
      'src/style.css': 'h1 { color: rebeccapurple; }',
    });
    const report = await analyze(at);
    assert.equal(report.web.category, 'ADAPTER_REQUIRED');
    const made = await create(at);
    assert.equal(made.ok, true);
    const pkg = JSON.parse(await readFile(join(at, 'web', 'package.json'), 'utf8'));
    assert.equal(pkg.dependencies.react, '18.3.1');
    assert.equal(pkg.devDependencies.vite, '5.4.0');
    assert.match(await readFile(join(at, 'web', 'index.html'), 'utf8'), /src\/src\/main\.tsx/);
    assert.match(await readFile(join(at, 'web', 'viberant-companion.js'), 'utf8'), /web-companion\/pair/);
  });
});
