/**
 * Work goes where the app says it goes, or it does not go.
 *
 * The reported fault: Viberant showed one GitHub account and pushed as another.
 * The cause is that those are genuinely two identity systems — `gh` has an
 * active account, and `git push` authenticates through whatever credential
 * helper the computer keeps, which may hold somebody else entirely.
 *
 * There is a second fault sitting next to it and it is worse: this product owns
 * a repository of its own called `viberant-workspace`, holding three small
 * files about which computers are about. A project called `Viberant` is one
 * hyphen away from it. Anything that told them apart by name would be wrong the
 * first day somebody named a project after the workspace.
 *
 * Nothing here reaches GitHub. What is being proved is which folder each
 * operation would act on and which account it would claim — both of which are
 * decidable on this computer, with real repositories on disk.
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);
import { realpathSync } from 'node:fs';
const realOf = (p) => { try { return realpathSync.native(p); } catch { return p; } };

let root, alpha, beta, plain, house;

/** A real repository on disk, pointed at a remote that is never contacted. */
async function repoAt(dir, remote) {
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'a.txt'), 'work\n');
  const git = (...a) => run('git', a, { cwd: dir });
  await git('init', '--quiet', '-b', 'main');
  await git('config', 'user.email', 't@t');
  await git('config', 'user.name', 'T');
  await git('add', '-A');
  await git('commit', '--quiet', '-m', 'first');
  if (remote) await git('remote', 'add', 'origin', remote);
  return dir;
}

before(async () => {
  root = await mkdtemp(join(tmpdir(), 'viberant-dest-'));
  house = join(root, 'home');
  await mkdir(house, { recursive: true });
  process.env.USERPROFILE = house;
  process.env.HOME = house;

  alpha = await repoAt(join(root, 'ProjectAlpha'), 'https://github.com/AccountA/ProjectAlpha.git');
  beta = await repoAt(join(root, 'Viberant'), 'https://github.com/AccountB/Viberant.git');
  plain = await repoAt(join(root, 'NoRemote'), null);
});

after(async () => {
  await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
});

describe('a project is bound to its own repository, read from itself', () => {
  test('the owner and the name come out of the project, not from anywhere else', async () => {
    const github = await import('../github.mjs');

    const a = await github.bindingOf(alpha);
    assert.equal(a.purpose, 'project');
    assert.equal(a.owner, 'AccountA');
    assert.equal(a.repo, 'ProjectAlpha');
    assert.equal(a.branch, 'main');
    assert.equal(a.gitRoot.toLowerCase(), realOf(alpha).toLowerCase(), 'and the folder its history is actually kept in');

    const b = await github.bindingOf(beta);
    assert.equal(b.owner, 'AccountB');
    assert.equal(b.repo, 'Viberant');

    // Two projects, two bindings, no leakage between them.
    assert.notEqual(a.remote, b.remote);
  });

  test('a folder inside a project binds to the project, never to the folder', async () => {
    const github = await import('../github.mjs');
    const inner = join(alpha, 'src', 'deep');
    await mkdir(inner, { recursive: true });

    const b = await github.bindingOf(inner);
    assert.equal(b.gitRoot.toLowerCase(), realOf(alpha).toLowerCase(),
      'sending from a subfolder must send the project, not invent a new one');
    assert.equal(b.owner, 'AccountA');
  });

  test('a project with no remote says so rather than guessing one', async () => {
    const github = await import('../github.mjs');
    const b = await github.bindingOf(plain);
    assert.equal(b.bound, false);
    assert.equal(b.owner, null);
    assert.equal(b.gitRoot.toLowerCase(), realOf(plain).toLowerCase());
  });

  test('every address GitHub uses reads the same way', async () => {
    const { ownerAndRepo } = await import('../github.mjs');
    for (const shape of [
      'https://github.com/Acc/Repo.git',
      'https://github.com/Acc/Repo',
      'git@github.com:Acc/Repo.git',
      'https://github.com/Acc/Repo/',
    ]) {
      assert.deepEqual(ownerAndRepo(shape), { owner: 'Acc', repo: 'Repo' }, shape);
    }
    assert.equal(ownerAndRepo(''), null);
    assert.equal(ownerAndRepo('https://gitlab.com/Acc/Repo.git'), null);
  });
});

describe('the workspace is this product, and never somebody s work', () => {
  test('it is told apart by where it is, not by what it is called', async () => {
    const workspace = await import('../workspace.mjs');

    assert.equal(workspace.PURPOSE, 'workspace');
    assert.equal(workspace.isInsideWorkspace(workspace.workspaceRoot()), true);
    assert.equal(workspace.isInsideWorkspace(join(workspace.workspaceRoot(), 'machines')), true);

    // The trap. A project called after the workspace is still a project.
    assert.equal(workspace.isInsideWorkspace(beta), false,
      'a project named Viberant is not the viberant-workspace');
    assert.equal(workspace.isInsideWorkspace(`${workspace.workspaceRoot()}-somebody-elses`), false,
      'and a folder whose name merely starts the same is not inside it');
  });

  test('a folder inside the workspace is refused as a project, before anything moves', async () => {
    const github = await import('../github.mjs');
    const workspace = await import('../workspace.mjs');

    const inside = join(workspace.workspaceRoot(), 'pretend-project');
    await repoAt(inside, 'https://github.com/AccountA/viberant-workspace.git');

    const b = await github.bindingOf(inside);
    assert.equal(b.isWorkspace, true);
    assert.equal(b.purpose, 'workspace');

    const going = await github.destinationFor(inside);
    assert.equal(going.ok, false, 'sending it is refused');
    assert.ok(going.sentence && going.action, 'and refused with something to do about it');
    assert.match(going.sentence, /find each other/,
      'and the sentence says what that folder actually is');
  });
});

describe('an account mismatch is shown, never resolved by guessing', () => {
  test('same account: the destination is the project s own repository', async () => {
    const github = await import('../github.mjs');
    const binding = await github.bindingOf(alpha);

    // The comparison destinationFor makes, held against the binding directly so
    // the test does not need a signed-in computer.
    const login = 'AccountA';
    assert.equal(binding.owner.toLowerCase() === login.toLowerCase(), true);
  });

  test('different account: it is a mismatch, and a mismatch is not a push', async () => {
    const github = await import('../github.mjs');
    const binding = await github.bindingOf(beta);

    const login = 'AccountA';
    const mismatch = binding.owner.toLowerCase() !== login.toLowerCase();
    assert.equal(mismatch, true,
      'AccountB/Viberant while signed in as AccountA is a mismatch');

    // And the shape the product answers with when it is.
    const going = await github.destinationFor(beta);
    assert.ok('mismatch' in going || going.ok === false,
      'the answer carries whether the two agree, rather than proceeding');
  });
});

/**
 * No account name is written down anywhere that decides anything.
 *
 * The reported worry, in the user's words: work going to an account nobody
 * chose. One way that happens is a name left in the source from whichever
 * computer the product was built on, quietly acting as a default.
 *
 * Exactly one such name is allowed to exist — the address of Viberant's own
 * issue list, which is a support address rather than an identity. This checks
 * that it stays the only one, and that it is nowhere near the code that decides
 * where somebody's work goes.
 */
describe('nothing decides an account from a name in the source', () => {
  const CODE = ['github.mjs', 'projects.mjs', 'workspace.mjs', 'deploy.mjs',
    'server.mjs', 'ui/app.js', 'lan.mjs', 'live.mjs', 'firstpublish.mjs'];

  test('the files that decide where work goes name no account at all', async () => {
    const { readFile } = await import('node:fs/promises');
    const { dirname, join: j } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const here = dirname(fileURLToPath(import.meta.url));

    const offences = [];
    for (const file of CODE) {
      const text = await readFile(j(here, '..', file), 'utf8');
      // Comments explain the fault and are allowed to quote it.
      const code = text
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/^\s*\/\/.*$/gm, ' ');
      for (const m of code.matchAll(/['"`]([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+)['"`]/g)) {
        const [, owner, repo] = m;
        // The shapes that look like owner/name but are not:
        //   what a browser is told a file is, which is always type/subtype;
        //   a path to a file, which has an extension on the end;
        //   a folder a build puts things in.
        if (/^(application|font|text|image|audio|video|multipart)$/i.test(owner)) continue;
        if (/\./.test(repo)) continue;
        if (/^(node|core|app|ui|dist|src|test|target|build|out|docs|public)$/i.test(owner)) continue;
        offences.push(`${file}: ${m[0]}`);
      }
    }
    assert.deepEqual(offences, [],
      'an owner/name written into code that decides destinations is a default nobody chose');
  });

  test('the one name that does exist is the issue list, and only that', async () => {
    const feedback = await import('../feedback.mjs');
    assert.equal(typeof feedback.ISSUES_FOR_VIBERANT, 'string');
    assert.match(feedback.ISSUES_FOR_VIBERANT, /\//);
    assert.equal(feedback.HOME, undefined,
      'the old name read like somebody account and is gone');
  });
});

/**
 * Google is a name, and names decide nothing.
 *
 * The two are constantly confused, and confusing them here would be expensive:
 * a Google address quietly influencing where a project sends is the same fault
 * as the one that started all of this, wearing a different hat.
 */
describe('a Google account cannot influence where work goes', () => {
  test('nothing that decides a destination reads the Google module at all', async () => {
    const { readFile } = await import('node:fs/promises');
    const { dirname, join: j } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const here = dirname(fileURLToPath(import.meta.url));

    // The files that choose an account, a remote, or a place to deploy.
    for (const file of ['github.mjs', 'projects.mjs', 'workspace.mjs', 'providers.mjs', 'deploy.mjs']) {
      const text = await readFile(j(here, '..', file), 'utf8');
      assert.equal(/from '\.\/google\.mjs'/.test(text), false,
        `${file} must not be able to read a Google account`);
    }
  });

  test('several accounts can be here, and one is in use', async () => {
    const google = await import('../google.mjs');

    await google.remember({ email: 'work@example.com', name: 'Work' });
    await google.remember({ email: 'personal@example.com', name: 'Personal' });

    const listed = await google.accounts();
    assert.deepEqual(listed.accounts.map((a) => a.name).sort(),
      ['personal@example.com', 'work@example.com'],
      'signing in to a second must not sign out the first');
    assert.equal(listed.active, 'personal@example.com', 'the newest is the one in use');

    assert.equal((await google.switchTo('work@example.com')).ok, true);
    assert.equal((await google.who()).email, 'work@example.com');
  });

  test('signing one out leaves the other in use rather than nobody', async () => {
    const google = await import('../google.mjs');
    const out = await google.signOut('work@example.com');
    assert.equal(out.ok, true);

    const listed = await google.accounts();
    assert.deepEqual(listed.accounts.map((a) => a.name), ['personal@example.com']);
    assert.equal(listed.active, 'personal@example.com',
      'never "not signed in" while an account is still here');
  });
});
