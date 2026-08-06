/**
 * GitHub, and putting things out into the world.
 *
 * Every test in here is asking one of two questions: can this destroy work the
 * person has not saved, and can this tell them something happened when it did
 * not. Nothing in this file needs a network — the paths that do are the ones
 * that refuse, and refusing is exactly what is worth proving.
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const run = promisify(execFile);
let root;

before(async () => { root = await mkdtemp(join(tmpdir(), 'viberant-gh-')); });
after(async () => { await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); });

async function project(name, { saves = 1 } = {}) {
  const dir = join(root, name);
  await mkdir(dir, { recursive: true });
  const git = (...a) => run('git', a, { cwd: dir });
  await git('init', '--quiet', '-b', 'main');
  await git('config', 'user.email', 'd@l');
  await git('config', 'user.name', 'D');
  for (let i = 0; i < saves; i++) {
    await writeFile(join(dir, `file-${i}.js`), `export const n = ${i}\n`);
    await git('add', '-A');
    await git('commit', '--quiet', '-m', `Save number ${i + 1}`);
  }
  return dir;
}

// ---------------------------------------------------------------------------

describe('where a project stands', () => {
  test('a saved project is read correctly, and its own words come back', async () => {
    const { picture } = await import('../github.mjs');
    const dir = await project('standing', { saves: 2 });
    const p = await picture(dir);

    assert.equal(p.tracked, true);
    assert.equal(p.unsaved, 0);
    assert.equal(p.saves, 2);
    assert.equal(p.shared, null);
    assert.equal(p.last.what, 'Save number 2');
    assert.ok(p.last.when, 'and when, as a person would say it');
  });

  test('with no copy anywhere, how far ahead we are is not guessed at', async () => {
    const { picture } = await import('../github.mjs');
    const p = await picture(await project('alone'));
    assert.equal(p.toSend, null, 'not zero — zero would be a claim we cannot make');
    assert.equal(p.toGet, null);
  });

  test('what changed is said in words, not in marks', async () => {
    const { whatChanged } = await import('../github.mjs');
    const dir = await project('changing');
    await writeFile(join(dir, 'file-0.js'), 'export const n = 99\n');
    await writeFile(join(dir, 'brand-new.js'), 'x\n');

    const { changes } = await whatChanged(dir);
    const said = Object.fromEntries(changes.map((c) => [c.name, c.says]));
    assert.equal(said['file-0.js'], 'changed');
    assert.equal(said['brand-new.js'], 'new, never saved');
  });

  test('a web address is worked out however the copy was written down', async () => {
    const { webAddress } = await import('../github.mjs');
    assert.equal(webAddress('git@github.com:you/thing.git'), 'https://github.com/you/thing');
    assert.equal(webAddress('https://github.com/you/thing.git'), 'https://github.com/you/thing');
    assert.equal(webAddress('/somewhere/local.git'), null);
  });
});

describe('nothing is done to work you have not saved', () => {
  test('getting the latest refuses while you have work in progress', async () => {
    const { getLatest } = await import('../github.mjs');
    const dir = await project('busy');
    await run('git', ['remote', 'add', 'origin', join(root, 'nowhere.git')], { cwd: dir });
    await writeFile(join(dir, 'in-progress.js'), 'half a thought\n');

    const r = await getLatest(dir);
    assert.equal(r.ok, false);
    assert.match(r.sentence, /not saved yet/);
    assert.match(r.action, /Save your work first/);
  });

  test('and it says so plainly when there is nowhere to get anything from', async () => {
    const { getLatest } = await import('../github.mjs');
    const r = await getLatest(await project('nowhere-to-get'));
    assert.equal(r.ok, false);
    assert.match(r.sentence, /no copy on GitHub/);
  });
});

describe('taking back a save', () => {
  test('the only save a project has is never taken back', async () => {
    const { undoLastSave } = await import('../github.mjs');
    const r = await undoLastSave(await project('only-one'));
    assert.equal(r.ok, false);
    assert.match(r.sentence, /only save/);
    assert.ok(r.action);
  });

  test('taking one back leaves every file exactly as it was', async () => {
    const { undoLastSave, picture } = await import('../github.mjs');
    const dir = await project('takeable', { saves: 3 });

    const r = await undoLastSave(dir);
    assert.equal(r.ok, true, r.sentence);

    const after = await picture(dir);
    assert.equal(after.saves, 2, 'one save fewer');
    assert.equal(after.unsaved, 1, 'and the work from it is sitting there, untouched');
    assert.match(r.sentence, /exactly as you left it/);
  });
});

describe('saving without sending', () => {
  test('saves, and says only that', async () => {
    const { saveOnly, picture } = await import('../github.mjs');
    const dir = await project('local-only');
    await writeFile(join(dir, 'more.js'), 'x\n');

    const r = await saveOnly(dir, 'Did a thing');
    assert.equal(r.ok, true, r.sentence);
    assert.equal(r.sentence, 'Saved on this computer.');
    assert.ok(!/sent/i.test(r.sentence), 'it never says sent, because nothing was');
    assert.equal((await picture(dir)).unsaved, 0);
  });

  test('with nothing new, it says nothing happened rather than pretending', async () => {
    const { saveOnly } = await import('../github.mjs');
    const r = await saveOnly(await project('nothing-new'), 'Nothing');
    assert.equal(r.ok, true);
    assert.equal(r.saved, false);
    assert.match(r.sentence, /nothing new to save/);
  });
});

describe('putting something out into the world', () => {
  test('a project that cannot build itself is told so before anything is attempted', async () => {
    const { look } = await import('../deploy.mjs');
    const dir = await project('plain');
    const d = await look(dir);
    assert.equal(d.app.packStep, null);
    assert.equal(d.app.canRelease, false);
  });

  test('a project that can build itself is read out of its own instructions', async () => {
    const { look } = await import('../deploy.mjs');
    const dir = await project('buildable');
    await writeFile(join(dir, 'package.json'),
      JSON.stringify({ name: 'thing', version: '2.1.0', scripts: { build: 'echo built' } }));

    const d = await look(dir);
    assert.equal(d.app.packStep, 'build');
    assert.equal(d.app.version, '2.1.0');
    assert.equal(d.site.buildStep, 'build');
  });

  test('anything already built and installable is found and measured', async () => {
    const { look } = await import('../deploy.mjs');
    const dir = await project('already-built');
    await mkdir(join(dir, 'dist'), { recursive: true });
    await writeFile(join(dir, 'dist', 'Thing-Setup-1.0.0.exe'), 'x'.repeat(2048));
    await writeFile(join(dir, 'dist', 'notes.txt'), 'not installable');

    const { app } = await look(dir);
    assert.deepEqual(app.installers.map((f) => f.name), ['Thing-Setup-1.0.0.exe']);
    assert.equal(app.installers[0].size, 2048);
  });

  test('a website and an application are never the same offer', async () => {
    const { look } = await import('../deploy.mjs');
    const d = await look(await project('two-errands'));
    assert.ok('site' in d && 'app' in d, 'they are asked about separately');
    assert.ok(Array.isArray(d.site.places), 'a website goes to a place');
    assert.ok(Array.isArray(d.app.installers), 'an application becomes a file');
  });
});

describe('a long errand, watched while it runs', () => {
  test('it starts running, keeps what it printed, and settles into one sentence', async () => {
    const jobs = await import('../jobs.mjs');
    const job = jobs.begin({ what: 'Trying something', where: root });
    jobs.step(job, 'Doing the first part.');

    const out = await jobs.runInto(job, {
      file: process.execPath, args: ['-e', 'console.log("hello from the errand")'], cwd: root,
    });
    assert.equal(out.ok, true);
    assert.ok(job.lines.some((l) => l.includes('hello from the errand')));

    const done = jobs.end(job, { ok: true, sentence: 'That worked.' });
    assert.equal(done.running, false);
    assert.equal(done.ok, true);
    assert.equal(jobs.get(job.id).sentence, 'That worked.');
  });

  test('a command that is not on the computer is a fact about the errand, not a crash', async () => {
    const jobs = await import('../jobs.mjs');
    const job = jobs.begin({ what: 'Trying nonsense', where: root });
    const out = await jobs.runInto(job, { file: 'definitely-not-a-command-xyz', args: [], cwd: root });
    assert.equal(out.ok, false);
    jobs.end(job, { ok: false, sentence: 'That did not work.', action: 'Try something else.' });
  });
});

describe('putting a project on GitHub for the first time', () => {
  test('what it writes is read out of the project, not invented', async () => {
    const first = await import('../firstpublish.mjs');
    const dir = await project('newbie');
    await writeFile(join(dir, 'package.json'), JSON.stringify({
      name: 'thing', description: 'Turns one thing into another thing.',
      scripts: { dev: 'vite', build: 'vite build', test: 'node --test' },
    }));

    const readme = await first.readmeFor(dir, { name: 'thing' });
    assert.match(readme, /^# thing/);
    assert.match(readme, /Turns one thing into another thing\./);
    assert.match(readme, /npm install/);
    assert.match(readme, /npm run dev/, 'how to actually run it');
    assert.match(readme, /npm run build/);
    assert.ok(!/TODO|lorem|placeholder/i.test(readme), 'and nothing left for somebody to fill in');
  });

  test('it borrows a description from the project rather than making one up', async () => {
    const first = await import('../firstpublish.mjs');
    const dir = await project('has-notes');
    await writeFile(join(dir, 'NOTES.md'),
      '# Notes\n\nA small manager that opens one project across several editors without fuss.\n');

    const readme = await first.readmeFor(dir, { name: 'has-notes' });
    assert.match(readme, /small manager that opens one project/);
    assert.match(readme, /NOTES\.md/, 'and says where it got it');
  });

  test('nothing you already wrote is ever overwritten', async () => {
    const first = await import('../firstpublish.mjs');
    const dir = await project('has-readme');
    await writeFile(join(dir, 'README.md'), '# Mine\n\nI wrote this myself.\n');

    const out = await first.prepare(dir, { name: 'has-readme' });
    assert.ok(out.leftAlone.includes('README.md'));
    assert.ok(!out.made.includes('README.md'));
    assert.equal(await readFile(join(dir, 'README.md'), 'utf8'), '# Mine\n\nI wrote this myself.\n');
  });

  test('what stays on your computer is chosen for the kind of project it is', async () => {
    const first = await import('../firstpublish.mjs');
    const dir = await project('ignoring');
    await writeFile(join(dir, 'Cargo.toml'), '[package]\nname = "x"\n');

    await first.prepare(dir, { name: 'ignoring' });
    const ignored = await readFile(join(dir, '.gitignore'), 'utf8');
    assert.match(ignored, /^target\/$/m, 'the folder this kind of project builds into');
    assert.match(ignored, /^\.env$/m, 'and anything holding a secret, always');
  });

  test('a licence is never chosen for you', async () => {
    const first = await import('../firstpublish.mjs');
    const dir = await project('unlicensed');

    const out = await first.prepare(dir, { name: 'unlicensed' });
    assert.ok(!out.made.includes('LICENSE'),
      'what other people may do with your work is not a default');

    const withOne = await first.prepare(await project('licensed'), { name: 'licensed', licence: 'mit', who: 'A Person' });
    assert.ok(withOne.made.includes('LICENSE'));
    assert.equal(first.LICENCES[0].id, 'none', 'and the first thing offered is to add none');
  });

  test('asking what is missing writes nothing at all', async () => {
    const first = await import('../firstpublish.mjs');
    const dir = await project('asking');

    const missing = first.whatIsMissing(dir);
    assert.deepEqual(missing.sort(), ['.gitignore', 'README.md']);
    assert.ok(!existsSync(join(dir, 'README.md')), 'asking is not doing');
    assert.ok(!existsSync(join(dir, '.gitignore')));
  });
});
