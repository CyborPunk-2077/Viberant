/**
 * Putting something out into the world.
 *
 * Two errands, kept apart on purpose, because they are not the same errand and
 * pretending otherwise is how people end up with a half-uploaded folder and no
 * idea which half:
 *
 *   a website      — lives at an address, is visited, and is replaced whole
 *                    every time you put a new one up.
 *   an application — is downloaded, is installed, and lives on other people's
 *                    computers at whatever version they took. It has to be
 *                    built into something installable first, and old versions
 *                    stay out there whether you like it or not.
 *
 * Both run as watched errands (jobs.mjs) because both take minutes.
 *
 * Nothing here guesses. If a project cannot be put out a particular way, the
 * manager says which piece is missing rather than trying and failing halfway.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { platform } from 'node:process';

import * as jobs from './jobs.mjs';
import * as github from './github.mjs';
import * as signin from './signin.mjs';
import * as gitRuntime from './git-runtime.mjs';

const run = promisify(execFile);
const WINDOWS = platform === 'win32';

const quiet = async (fn, fallback = null) => { try { return await fn(); } catch { return fallback; } };
const onPath = async (bin) => !!(await quiet(() => run(WINDOWS ? 'where' : 'which', [bin])));

// ---------------------------------------------------------------------------
// What is here
// ---------------------------------------------------------------------------

async function packageFile(dir) {
  if (!existsSync(join(dir, 'package.json'))) return null;
  return quiet(async () => JSON.parse(await readFile(join(dir, 'package.json'), 'utf8')));
}

/** Where a built site usually lands. */
const SITE_OUTPUTS = ['dist', 'build', 'out', 'public', '_site', '.output/public'];

/** Where a built application usually lands. */
const APP_OUTPUTS = ['dist', 'build', 'out', 'release', 'target/release'];

const INSTALLABLE = /\.(exe|msi|msix|appx|dmg|pkg|deb|rpm|appimage|zip|tar\.gz|apk|jar)$/i;

/**
 * Everything the two Ship panels need to be honest about what is possible.
 */
export async function look(dir) {
  const pkg = await packageFile(dir);
  const scripts = pkg?.scripts ?? {};
  const picture = await github.picture(dir);

  const places = [];
  if (await onPath('vercel')) places.push(await vercelPlace());
  if (await onPath('netlify') || await onPath('ntl')) places.push(await netlifyPlace());
  places.push({
    id: 'pages',
    name: 'GitHub Pages',
    blurb: 'Free, and it uses the copy of this project you already have on GitHub.',
    here: await github.haveGitHubTool(),
    signedIn: !!(await github.who()),
    signIn: 'Sign in to GitHub with the account button at the bottom left.',
    ready: !!picture.shared,
    missing: picture.shared ? null : 'This project needs a copy on GitHub first.',
  });

  const site = {
    hasPage: existsSync(join(dir, 'index.html')),
    hasDocsPage: existsSync(join(dir, 'docs', 'index.html')),
    buildStep: scripts.build ? 'build' : null,
    built: (await Promise.all(SITE_OUTPUTS.map(async (d) => (existsSync(join(dir, d)) ? d : null)))).filter(Boolean),
    places,
  };

  const app = {
    packStep: ['dist', 'package', 'make', 'build'].find((s) => scripts[s]) ?? null,
    manager: pkg ? 'npm' : existsSync(join(dir, 'Cargo.toml')) ? 'cargo' : null,
    version: pkg?.version ?? null,
    name: pkg?.name ?? null,
    installers: await installersIn(dir),
    canRelease: !!picture.shared && await github.haveGitHubTool() && !!(await github.who()),
    shared: !!picture.shared,
  };

  return { site, app, project: { unsaved: picture.unsaved, shared: picture.shared, url: picture.url } };
}

async function vercelPlace() {
  const signedIn = !!(await quiet(() => run('vercel', ['whoami'], { timeout: 15000 })));
  return {
    id: 'vercel',
    name: 'Vercel',
    blurb: 'Builds the site itself and gives it an address in about a minute.',
    here: true,
    signedIn,
    signIn: 'Run vercel login once in a terminal.',
    ready: signedIn,
    missing: signedIn ? null : 'You are not signed in to Vercel on this computer.',
  };
}

async function netlifyPlace() {
  const bin = (await onPath('netlify')) ? 'netlify' : 'ntl';
  const signedIn = !!(await quiet(() => run(bin, ['status'], { timeout: 15000 })));
  return {
    id: 'netlify',
    name: 'Netlify',
    blurb: 'Same idea as Vercel. Good with plain folders of files.',
    here: true,
    signedIn,
    signIn: 'Run netlify login once in a terminal.',
    ready: signedIn,
    missing: signedIn ? null : 'You are not signed in to Netlify on this computer.',
  };
}

/** Anything already built that a person could actually install. */
async function installersIn(dir) {
  const found = [];
  for (const out of APP_OUTPUTS) {
    const at = join(dir, out);
    if (!existsSync(at)) continue;
    const entries = await quiet(() => readdir(at, { withFileTypes: true }), []);
    for (const e of entries ?? []) {
      if (!e.isFile() || !INSTALLABLE.test(e.name)) continue;
      const size = await quiet(async () => (await stat(join(at, e.name))).size, 0);
      found.push({ name: e.name, path: join(at, e.name), where: out, size });
    }
  }
  return found;
}

// ---------------------------------------------------------------------------
// A website
// ---------------------------------------------------------------------------

/**
 * Put a website online.
 *
 * Returns an errand to watch, straight away — this takes minutes and watching
 * it is the point.
 */
export function putSiteOnline({ dir, place, name }) {
  const job = jobs.begin({ what: `Putting ${name} online`, where: dir, kind: 'deploy', project: name });
  runSite(job, { dir, place }).catch((e) => {
    jobs.end(job, {
      ok: false,
      sentence: 'Putting the site online stopped part way through.',
      action: 'Look at what it printed below, then try again.',
    });
    jobs.write(job, String(e));
  });
  return job;
}

async function runSite(job, { dir, place }) {
  const pkg = await packageFile(dir);
  const scripts = pkg?.scripts ?? {};

  if (place !== 'vercel' && scripts.build) {
    jobs.step(job, 'Building the site.');
    if (!existsSync(join(dir, 'node_modules'))) {
      jobs.step(job, 'Getting the pieces it needs first. This is the slow part.');
      await jobs.runInto(job, { file: 'npm', args: ['install'], cwd: dir });
    }
    const built = await jobs.runInto(job, { file: 'npm', args: ['run', 'build'], cwd: dir });
    if (!built.ok) {
      return jobs.end(job, {
        ok: false,
        sentence: 'The site would not build, so nothing was put online.',
        action: 'The last lines below say what it did not like.',
      });
    }
  }

  if (place === 'vercel') return await toVercel(job, dir);
  if (place === 'netlify') return await toNetlify(job, dir);
  return await toPages(job, dir);
}

async function toVercel(job, dir) {
  jobs.step(job, 'Sending it to Vercel, which builds it and gives it an address.');
  const out = await jobs.runInto(job, { file: 'vercel', args: ['--prod', '--yes'], cwd: dir });
  if (!out.ok) {
    return jobs.end(job, {
      ok: false,
      sentence: 'Vercel did not put the site online.',
      action: 'If it asked you to sign in, run vercel login in a terminal and try again.',
    });
  }
  const address = job.lines.map((l) => l.match(/https:\/\/\S+\.vercel\.app\S*/)).filter(Boolean).pop();
  return jobs.end(job, {
    ok: true,
    at: address ? address[0] : null,
    sentence: address ? `Your site is live at ${address[0]}` : 'Your site is live.',
    action: 'Anyone with the address can see it now.',
  });
}

async function toNetlify(job, dir) {
  const bin = (await onPath('netlify')) ? 'netlify' : 'ntl';
  const folder = SITE_OUTPUTS.find((d) => existsSync(join(dir, d))) ?? '.';
  jobs.step(job, `Sending ${folder === '.' ? 'this folder' : `the ${folder} folder`} to Netlify.`);

  const out = await jobs.runInto(job, { file: bin, args: ['deploy', '--prod', '--dir', folder], cwd: dir });
  if (!out.ok) {
    return jobs.end(job, {
      ok: false,
      sentence: 'Netlify did not put the site online.',
      action: 'If it asked you to sign in, run netlify login in a terminal and try again.',
    });
  }
  const address = job.lines.map((l) => l.match(/https:\/\/\S+\.netlify\.app\S*/)).filter(Boolean).pop();
  return jobs.end(job, {
    ok: true,
    at: address ? address[0] : null,
    sentence: address ? `Your site is live at ${address[0]}` : 'Your site is live.',
    action: 'Anyone with the address can see it now.',
  });
}

/**
 * GitHub Pages serves files exactly as they sit in the project, so it can only
 * take a site that is already plain files. A site that has to be built is told
 * so plainly rather than half-uploaded.
 */
async function toPages(job, dir) {
  const at = existsSync(join(dir, 'index.html')) ? '/'
    : existsSync(join(dir, 'docs', 'index.html')) ? '/docs'
      : null;

  if (!at) {
    return jobs.end(job, {
      ok: false,
      sentence: 'GitHub Pages puts up files exactly as they are, and there is no finished page here to put up.',
      action: 'Use Vercel or Netlify instead — they build the site for you.',
    });
  }

  jobs.step(job, 'Making sure GitHub has the latest of everything.');
  const sent = await quiet(() => gitRuntime.run(dir, 'push'));
  if (!sent) jobs.write(job, 'Nothing new to send, or it could not be sent. Carrying on.');

  const line = await quiet(async () =>
    (await gitRuntime.run(dir, 'rev-parse', '--abbrev-ref', 'HEAD')).stdout.trim(), 'main');

  const binding = await github.bindingOf(dir);
  if (!binding?.owner || !binding?.repo) {
    return jobs.end(job, {
      ok: false,
      sentence: 'This project does not have a GitHub destination to publish Pages from.',
      action: 'Save and send it to GitHub first, then try again.',
    });
  }
  const pagePath = at === '/' ? '/' : '/docs';
  const pageRoute = `/repos/${encodeURIComponent(binding.owner)}/${encodeURIComponent(binding.repo)}/pages`;

  jobs.step(job, 'Asking GitHub to serve it as a website.');
  let out = await signin.request(pageRoute, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ source: { branch: line, path: pagePath } }),
  });

  if (!out.ok) {
    // Already serving. Point it at the right place instead of making it again.
    out = await signin.request(pageRoute, {
      method: 'PUT', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ source: { branch: line, path: pagePath } }),
    });
  }

  const page = await signin.request(pageRoute);
  const address = page.ok ? page.data?.html_url ?? null : null;

  if (!address) {
    return jobs.end(job, {
      ok: false,
      sentence: 'GitHub would not serve this project as a website.',
      action: 'Check the project has a copy on GitHub and that you are signed in as its owner.',
    });
  }

  // Asked for, rather than assumed. `git push` returning zero says the work
  // reached GitHub; it says nothing at all about whether a website exists at
  // the other end. GitHub builds these on its own schedule and can decide it
  // cannot — so this waits for it to say which, and reports what it said.
  const settled = await waitForPages(job, binding);

  return jobs.end(job, {
    ok: settled.ok,
    at: settled.ok ? address : null,
    sentence: settled.ok
      ? `${basename(dir)} is live at ${address}`
      : settled.sentence,
    action: settled.ok
      ? 'Anyone with the address can see it now.'
      : settled.action,
  });
}

/**
 * Wait for GitHub to say whether it built the site, rather than assuming it did.
 *
 * A push that returns zero means the work arrived. It says nothing about
 * whether a website exists at the other end — GitHub builds these on its own
 * schedule, and it can decide it cannot, in which case the address exists and
 * serves nothing. Reporting success at the push is how somebody ends up sending
 * a link to a page that is not there.
 *
 * Asked a handful of times with the gap growing, and given up on politely: a
 * build that is still going after two minutes is not a failure, it is a build
 * that is still going, and saying so is more honest than either verdict.
 */
async function waitForPages(job, binding) {
  jobs.step(job, 'Waiting for GitHub to build it.');
  const gaps = [3000, 5000, 8000, 12000, 15000, 20000, 25000, 30000];

  for (const gap of gaps) {
    await new Promise((r) => setTimeout(r, gap));

    const said = await signin.request(`/repos/${encodeURIComponent(binding.owner)}/${encodeURIComponent(binding.repo)}/pages/builds/latest`);
    if (!said.ok) continue;

    const status = said.data?.status;
    const why = said.data?.error?.message;
    if (status === 'built') return { ok: true };
    if (status === 'errored') {
      return {
        ok: false,
        sentence: 'GitHub would not build the site, so nothing is at that address.',
        action: why && why !== 'null' ? why : 'Check the site is a plain folder of finished files.',
      };
    }
    jobs.write(job, `GitHub says: ${status}`);
  }

  return {
    ok: false,
    sentence: 'GitHub is still building the site, so it is not there yet.',
    action: 'It usually takes a minute or two. Look again shortly.',
  };
}

// ---------------------------------------------------------------------------
// An application
// ---------------------------------------------------------------------------

/**
 * Build an installable application, and optionally give it to people.
 *
 * Building and handing out are separated because they fail for different
 * reasons and because plenty of days you want the first without the second.
 */
export function makeApplication({ dir, name, alsoGiveOut = false, version = null, notes = '' }) {
  const job = jobs.begin({ what: `Building ${name}`, where: dir, kind: 'build', project: name });
  runApp(job, { dir, alsoGiveOut, version, notes }).catch((e) => {
    jobs.end(job, {
      ok: false,
      sentence: 'Building the application stopped part way through.',
      action: 'Look at what it printed below, then try again.',
    });
    jobs.write(job, String(e));
  });
  return job;
}

async function runApp(job, { dir, alsoGiveOut, version, notes }) {
  const pkg = await packageFile(dir);
  const scripts = pkg?.scripts ?? {};
  const step = ['dist', 'package', 'make', 'build'].find((s) => scripts[s]);

  if (existsSync(join(dir, 'Cargo.toml')) && !step) {
    jobs.step(job, 'Building.');
    const built = await jobs.runInto(job, { file: 'cargo', args: ['build', '--release'], cwd: dir });
    if (!built.ok) {
      return jobs.end(job, {
        ok: false,
        sentence: 'The application would not build.',
        action: 'The last lines below say what it did not like.',
      });
    }
  } else if (step) {
    if (!existsSync(join(dir, 'node_modules'))) {
      jobs.step(job, 'Getting the pieces it needs first. This is the slow part.');
      const got = await jobs.runInto(job, { file: 'npm', args: ['install'], cwd: dir });
      if (!got.ok) {
        return jobs.end(job, {
          ok: false,
          sentence: 'The pieces this application needs could not be fetched.',
          action: 'Check you are online, then try again.',
        });
      }
    }
    jobs.step(job, `Building, using this project's own "${step}" step.`);
    const built = await jobs.runInto(job, { file: 'npm', args: ['run', step], cwd: dir });
    if (!built.ok) {
      return jobs.end(job, {
        ok: false,
        sentence: 'The application would not build.',
        action: 'The last lines below say what it did not like.',
      });
    }
  } else {
    return jobs.end(job, {
      ok: false,
      sentence: 'This project does not say how to build itself into something installable.',
      action: 'Open it in an AI app and ask it to add a build step.',
    });
  }

  const made = await installersIn(dir);
  if (!made.length) {
    return jobs.end(job, {
      ok: false,
      sentence: 'It built, but nothing came out that a person could install.',
      action: 'Check where this project puts what it builds.',
    });
  }

  jobs.step(job, `Made ${made.length === 1 ? 'one file' : `${made.length} files`} people can install.`);
  for (const m of made) jobs.write(job, `${m.name} — ${Math.round(m.size / 1024 / 1024)} MB`);

  if (!alsoGiveOut) {
    const one = made[0];
    return jobs.end(job, {
      ok: true,
      at: one.path,
      made: made.map((m) => ({ name: m.name, path: m.path, size: m.size })),
      sentence: made.length === 1
        ? `Built ${one.name} — ${Math.round(one.size / 1024 / 1024)} MB.`
        : `Built ${made.length} files people can install.`,
      action: `In ${dirname(one.path)}`,
    });
  }

  const tag = String(version || pkg?.version || '').trim();
  if (!tag) {
    return jobs.end(job, {
      ok: false,
      sentence: 'It built, but there is no version number to hand it out under.',
      action: 'Give it a version number and try again.',
    });
  }

  jobs.step(job, `Putting version ${tag} on GitHub for people to download.`);
  const binding = await github.bindingOf(dir);
  if (!binding?.owner || !binding?.repo) {
    return jobs.end(job, {
      ok: false,
      sentence: `It built, but version ${tag} has no GitHub destination.`,
      action: 'Save and send this project to GitHub first, then publish the release again.',
    });
  }
  const releaseRoute = `/repos/${encodeURIComponent(binding.owner)}/${encodeURIComponent(binding.repo)}/releases`;
  const out = await signin.request(releaseRoute, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      tag_name: `v${tag.replace(/^v/, '')}`,
      name: `v${tag.replace(/^v/, '')}`,
      body: notes || undefined,
      generate_release_notes: !notes,
    }),
  });

  if (!out.ok) {
    return jobs.end(job, {
      ok: false,
      sentence: `It built, but version ${tag} could not be put on GitHub.`,
      action: 'That version may already be out. Change the version number and try again.',
    });
  }

  const uploadBase = String(out.data?.upload_url ?? '').replace(/\{.*$/, '');
  for (const file of made) {
    const bytes = await quiet(() => readFile(file.path));
    if (!bytes || !uploadBase) {
      return jobs.end(job, {
        ok: false,
        sentence: `Version ${tag} was made, but ${file.name} could not be uploaded.`,
        action: 'The built file is still on this computer. Check the connection and try a new version number.',
      });
    }
    const uploaded = await signin.request(`${uploadBase}?name=${encodeURIComponent(file.name)}`, {
      method: 'POST', headers: { 'content-type': 'application/octet-stream' }, body: bytes,
    });
    if (!uploaded.ok) {
      return jobs.end(job, {
        ok: false,
        sentence: `Version ${tag} was made, but ${file.name} did not reach GitHub.`,
        action: 'The built file is still on this computer. Check the connection and use a new version number.',
      });
    }
  }
  const address = out.data?.html_url ?? null;

  return jobs.end(job, {
    ok: true,
    at: address ?? made[0]?.path ?? null,
    made: made.map((m) => ({ name: m.name, path: m.path, size: m.size })),
    release: address,
    sentence: `Version ${tag} is out — ${made.length === 1 ? made[0].name : `${made.length} files`}.`,
    action: address ? `Anyone can download it from ${address}` : 'Anyone can download and install it now.',
  });
}
