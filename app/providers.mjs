/**
 * Places a website can go, and what each one needs to know.
 *
 * One shape, so adding a second place is a file rather than a rewrite of the
 * Deploy screen:
 *
 *   supports(look)   — can this place take this project at all
 *   inspect(dir)     — what it would do: framework, build step, output folder
 *   connect()        — the once-per-computer sign-in
 *   deploy(...)      — the errand, reporting into a job
 *
 * **The account is per computer. The binding is per project.** Those are
 * genuinely different lifetimes and keeping them apart is what stops project B
 * inheriting project A's deployment — the fault that shows up as a site being
 * replaced by somebody else's.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { platform } from 'node:process';

import { HOUSE } from './projects.mjs';

const run = promisify(execFile);
const WINDOWS = platform === 'win32';
const quiet = async (fn, fallback = null) => { try { return await fn(); } catch { return fallback; } };
const onPath = async (bin) => !!(await quiet(() => run(WINDOWS ? 'where' : 'which', [bin])));

const BINDINGS = join(HOUSE, 'deployments.json');

// ---------------------------------------------------------------------------
// What kind of project is this
// ---------------------------------------------------------------------------

/**
 * Read out of the project rather than guessed from its shape.
 *
 * Every one of these is decided by a file that is actually there — a dependency
 * named in package.json, or a config file with a known name. Guessing from a
 * folder layout is right until somebody arranges their folders differently.
 */
const KINDS = [
  { id: 'next', name: 'Next.js', needs: ['next'], out: '.next', builds: true },
  { id: 'nuxt', name: 'Nuxt', needs: ['nuxt'], out: '.output/public', builds: true },
  { id: 'astro', name: 'Astro', needs: ['astro'], out: 'dist', builds: true },
  { id: 'sveltekit', name: 'SvelteKit', needs: ['@sveltejs/kit'], out: 'build', builds: true },
  { id: 'remix', name: 'Remix', needs: ['@remix-run/dev'], out: 'build', builds: true },
  { id: 'vite', name: 'Vite', needs: ['vite'], out: 'dist', builds: true },
  { id: 'vue', name: 'Vue', needs: ['@vue/cli-service'], out: 'dist', builds: true },
  { id: 'cra', name: 'React', needs: ['react-scripts'], out: 'build', builds: true },
];

async function packageFile(dir) {
  const at = join(dir, 'package.json');
  if (!existsSync(at)) return null;
  return quiet(async () => JSON.parse(await readFile(at, 'utf8')));
}

/** What this project is, how it builds, and where it puts the result. */
export async function inspect(dir) {
  const at = resolve(dir);
  const pkg = await packageFile(at);
  const deps = { ...(pkg?.dependencies ?? {}), ...(pkg?.devDependencies ?? {}) };

  const kind = KINDS.find((k) => k.needs.some((n) => deps[n]));
  const scripts = pkg?.scripts ?? {};

  // The package manager this project actually uses, by which lock file is here.
  const manager = existsSync(join(at, 'pnpm-lock.yaml')) ? 'pnpm'
    : existsSync(join(at, 'yarn.lock')) ? 'yarn'
      : existsSync(join(at, 'bun.lockb')) ? 'bun'
        : pkg ? 'npm' : null;

  const plainPage = existsSync(join(at, 'index.html'));

  return {
    root: at,
    framework: kind?.name ?? (plainPage ? 'Plain files' : null),
    frameworkId: kind?.id ?? (plainPage ? 'static' : null),
    manager,
    install: manager ? `${manager} install` : null,
    dev: scripts.dev ? `${manager} run dev` : scripts.start ? `${manager} start` : null,
    build: scripts.build ? `${manager} run build` : null,
    output: kind?.out ?? (plainPage ? '.' : null),
    needsBuild: !!kind?.builds && !!scripts.build,
    hasPackage: !!pkg,
    name: pkg?.name ?? null,
    version: pkg?.version ?? null,
    // The names only. A value here would be a secret in a place secrets do not go.
    environment: await environmentNames(at),
  };
}

/**
 * The names of the settings a project expects, and never their values.
 *
 * Knowing that `DATABASE_URL` is missing is the useful half. The value is the
 * half that must never be read into this process, shown on a screen, put in a
 * log, or sent anywhere — so it is not read at all.
 */
async function environmentNames(dir) {
  const out = new Set();
  for (const file of ['.env.example', '.env.sample', '.env.template']) {
    const at = join(dir, file);
    if (!existsSync(at)) continue;
    const text = await quiet(() => readFile(at, 'utf8'), '');
    for (const line of String(text ?? '').split('\n')) {
      const m = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=/);
      if (m) out.add(m[1]);
    }
  }
  const has = existsSync(join(dir, '.env')) || existsSync(join(dir, '.env.local'));
  return { expected: [...out], hasLocalFile: has };
}

// ---------------------------------------------------------------------------
// Which place, and which project it is bound to
// ---------------------------------------------------------------------------

async function allBindings() {
  if (!existsSync(BINDINGS)) return {};
  return quiet(async () => JSON.parse(await readFile(BINDINGS, 'utf8')), {}) ?? {};
}

/** Where this project deploys to, if it has been told. Read by path. */
export async function bindingFor(dir) {
  const all = await allBindings();
  return all[resolve(dir).toLowerCase()] ?? null;
}

export async function bind(dir, binding) {
  const all = await allBindings();
  all[resolve(dir).toLowerCase()] = { ...binding, at: Date.now() };
  await mkdir(HOUSE, { recursive: true });
  await writeFile(BINDINGS, JSON.stringify(all, null, 2), 'utf8');
  return binding;
}

// ---------------------------------------------------------------------------
// Vercel
// ---------------------------------------------------------------------------

export const vercel = {
  id: 'vercel',
  name: 'Vercel',

  /** Is the command here, and is somebody signed in to it. */
  async state() {
    if (!(await onPath('vercel'))) {
      return {
        here: false,
        connected: false,
        missing: 'Vercel is not on this computer.',
        how: 'npm install -g vercel',
      };
    }
    const who = await quiet(() => run('vercel', ['whoami'], { timeout: 20000 }));
    const login = who ? String(who.stdout).trim() : null;
    return { here: true, connected: !!login, login };
  },

  /**
   * Sign in, once per computer.
   *
   * Vercel's own sign-in opens a browser and waits. The manager starts it and
   * never tries to be it — the same rule as every other sign-in here (D-59).
   */
  connect(job, jobs) {
    jobs.step(job, 'Opening your browser so Vercel can confirm it is you.');
    return jobs.runInto(job, { file: 'vercel', args: ['login'], timeout: 5 * 60 * 1000 });
  },

  supports(look) {
    return !!look.frameworkId;
  },

  /**
   * Put it up.
   *
   * Run from the project's own folder, always, and the address is read out of
   * what Vercel itself printed rather than assumed from a name.
   */
  async deploy(job, jobs, { dir, name }) {
    jobs.step(job, `Sending ${name} to Vercel from ${dir}.`);

    const out = await jobs.runInto(job, {
      file: 'vercel',
      args: ['--prod', '--yes'],
      cwd: dir,
      timeout: 20 * 60 * 1000,
    });

    const address = job.lines
      .map((l) => l.match(/https:\/\/[\w.-]+\.vercel\.app\S*/))
      .filter(Boolean).pop();

    if (!out.ok) {
      return {
        ok: false,
        sentence: `Vercel did not put ${name} online.`,
        action: 'The last lines below are what it said. A build that failed says why there.',
      };
    }
    if (!address) {
      return {
        ok: false,
        sentence: 'Vercel finished without giving an address, so there is nothing to open.',
        action: 'Look at what it printed below.',
      };
    }
    return { ok: true, at: address[0], provider: 'vercel' };
  },
};

export const PLACES = { vercel };
