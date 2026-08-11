import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';

const run = promisify(execFile);
const git = (dir, ...args) => run('git', args, { cwd: dir, windowsHide: true });

test('a workspace member uses their own GitHub account to open a safe review request', async () => {
  const profile = await mkdtemp(join(tmpdir(), 'viberant-workspace-github-profile-'));
  const root = await mkdtemp(join(tmpdir(), 'viberant-workspace-github-'));
  const bare = join(root, 'shared.git');
  const seed = join(root, 'seed');
  const local = join(root, 'local');
  const other = join(root, 'other');
  const previousProfile = process.env.USERPROFILE;
  const previousFetch = globalThis.fetch;
  process.env.USERPROFILE = profile;

  try {
    await mkdir(seed);
    await git(root, 'init', '--bare', bare);
    await git(seed, 'init');
    await git(seed, 'config', 'user.name', 'Seed');
    await git(seed, 'config', 'user.email', 'seed@example.com');
    await writeFile(join(seed, 'work.txt'), 'start\n');
    await git(seed, 'add', '.'); await git(seed, 'commit', '-m', 'Start');
    await git(seed, 'branch', '-M', 'main');
    await git(seed, 'remote', 'add', 'origin', pathToFileURL(bare).href);
    await git(seed, 'push', '-u', 'origin', 'main');
    await git(root, '--git-dir', bare, 'symbolic-ref', 'HEAD', 'refs/heads/main');
    await git(root, 'clone', pathToFileURL(bare).href, local);
    await git(root, 'clone', pathToFileURL(bare).href, other);
    for (const dir of [local, other]) {
      await git(dir, 'config', 'user.name', 'Member');
      await git(dir, 'config', 'user.email', 'member@example.com');
    }
    await writeFile(join(other, 'theirs.txt'), 'theirs\n');
    await git(other, 'add', '.'); await git(other, 'commit', '-m', 'Other work'); await git(other, 'push');
    await writeFile(join(local, 'mine.txt'), 'mine\n');
    await git(local, 'add', '.'); await git(local, 'commit', '-m', 'My work');

    const publicRemote = 'https://github.com/shared-owner/shared-project.git';
    await git(local, 'remote', 'set-url', 'origin', publicRemote);
    await git(local, 'config', `url.${pathToFileURL(bare).href}.insteadOf`, publicRemote);

    const accountStore = join(profile, '.viberant', 'github-accounts.json');
    await mkdir(join(profile, '.viberant'), { recursive: true });
    await writeFile(accountStore, JSON.stringify({
      active: 'workspace-member',
      accounts: [{ name: 'workspace-member', id: 7, token: `plain:${Buffer.from('member-token').toString('base64')}` }],
    }));

    let review = null;
    globalThis.fetch = async (where, options = {}) => {
      const address = String(where);
      if (address.endsWith('/user')) return new Response(JSON.stringify({ login: 'workspace-member', id: 7 }), { status: 200 });
      if (address.endsWith('/repos/shared-owner/shared-project')) return new Response(JSON.stringify({
        name: 'shared-project', owner: { login: 'shared-owner' }, size: 1,
        default_branch: 'main', permissions: { push: true }, private: true,
      }), { status: 200 });
      if (address.endsWith('/repos/shared-owner/shared-project/pulls')) {
        review = JSON.parse(options.body);
        return new Response(JSON.stringify({ html_url: 'https://github.com/shared-owner/shared-project/pull/1' }), { status: 201 });
      }
      return previousFetch(where, options);
    };

    const github = await import(`../github.mjs?workspace-review=${Date.now()}`);
    const result = await github.requestReview(local, { title: 'Workspace changes' });
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(review.base, 'main');
    assert.match(review.head, /^viberant\/workspace-member-/);
    const refs = await git(root, '--git-dir', bare, 'for-each-ref', '--format=%(refname)', 'refs/heads/viberant');
    assert.match(refs.stdout, /refs\/heads\/viberant\/workspace-member-/);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousProfile === undefined) delete process.env.USERPROFILE;
    else process.env.USERPROFILE = previousProfile;
    await rm(profile, { recursive: true, force: true });
    await rm(root, { recursive: true, force: true });
  }
});
