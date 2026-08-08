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
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { platform } from 'node:process';

import { HOUSE } from './projects.mjs';
import * as settings from './settings.mjs';

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
    // The named things this project says it can do. Carried through so a
    // computer being asked to build one can decide what "build" means by
    // reading the project rather than by trusting the asker.
    scripts,
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

/**
 * Whether this project could actually run, said as facts rather than a score.
 *
 * Every line is something checked, and anything that cannot be checked is left
 * out rather than guessed at. A health panel that invents a green tick is worse
 * than no health panel — it is the thing somebody believes right up until they
 * press Build.
 */
export async function health(dir) {
  const at = resolve(dir);
  const look = await inspect(at);
  const out = [];

  if (look.manager) {
    const installed = existsSync(join(at, 'node_modules'));
    out.push({
      name: 'Dependencies',
      state: installed ? 'good' : 'missing',
      says: installed ? 'Installed' : `Not installed — run ${look.install}`,
    });
  }

  if (look.hasPackage) {
    const runtime = await quiet(async () => (await run('node', ['--version'])).stdout.trim(), null);
    if (runtime) out.push({ name: 'Node', state: 'good', says: runtime.replace(/^v/, '') });
  }

  out.push({
    name: 'Build',
    state: look.build ? 'good' : 'missing',
    says: look.build ? look.build : 'This project does not say how to build itself',
  });

  const expected = look.environment.expected ?? [];
  if (expected.length) {
    out.push({
      name: 'Environment',
      state: look.environment.hasLocalFile ? 'good' : 'missing',
      // The names, because the names are the useful half and the values must
      // never be read (D-123).
      says: look.environment.hasLocalFile
        ? `${expected.length} expected, and a local file is here`
        : `${expected.length} expected and no local file: ${expected.join(', ')}`,
    });
  }

  return { framework: look.framework, checks: out };
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

/**
 * Where a token for Vercel is kept, and how long an answer about it is trusted.
 *
 * The token lives in the settings file in this computer's own home folder, the
 * same place the keys for the models live, and it is never written into a
 * project, a log, a command line, or anything that travels between computers.
 * It reaches the tool it drives through the surroundings of the process rather
 * than as an argument, because arguments are printed and surroundings are not.
 */
const VERCEL_TOKEN = 'vercelToken';
const VERCEL_API = 'https://api.vercel.com';
export const VERCEL_TOKEN_PAGE = 'https://vercel.com/account/tokens';

/** What was last true, so a moment offline is not reported as being signed out. */
let lastVercel = null;
const WORTH_KEEPING_FOR = 20 * 1000;

export function forgetVercel() { lastVercel = null; }

/**
 * Ask Vercel something over its own interface.
 *
 * Three outcomes, kept apart on purpose, because collapsing them is how an
 * expired token comes to be reported as being connected and a moment offline
 * comes to be reported as being signed out:
 *
 *   `{ ok: true, body }`     it answered
 *   `{ ok: false, status }`  it answered, and said no
 *   `null`                   it could not be reached at all
 */
async function askVercel(path, token, { timeout = 15000, send = null, how = 'GET' } = {}) {
  const stop = AbortSignal.timeout(timeout);
  try {
    const res = await fetch(`${VERCEL_API}${path}`, {
      method: send ? 'POST' : how,
      headers: {
        authorization: `Bearer ${token}`,
        ...(send ? { 'content-type': 'application/json' } : {}),
      },
      body: send ? JSON.stringify(send) : undefined,
      signal: stop,
    });
    const body = await quiet(() => res.json(), null);
    if (!res.ok) return { ok: false, status: res.status, body, why: body?.error?.message ?? null };
    return { ok: true, body };
  } catch {
    return null;
  }
}

/**
 * Who Vercel's own command believes this computer is, if anybody.
 *
 * Asked through a shell on Windows, which is the whole of an older bug: what
 * npm installs globally there is a batch file plus an extensionless script
 * beside it, `where` finds the script, and starting the script without a shell
 * cannot run it at all — so this failed every time and failed silently.
 *
 * The command is a constant and so are its arguments. Nothing here comes from
 * anybody.
 */
async function whoTheCliThinks() {
  const said = await quiet(() => (WINDOWS
    ? run('vercel whoami', [], { timeout: 25000, shell: true, windowsHide: true })
    : run('vercel', ['whoami'], { timeout: 25000 })));
  if (!said) return null;
  // The last non-empty line of what it printed; it puts its own name above.
  const login = String(said.stdout ?? '').split('\n').map((l) => l.trim()).filter(Boolean).pop();
  return login && !/\s/.test(login) ? login : null;
}

/**
 * A folder name turned into a name Vercel will accept.
 *
 * Vercel takes lower case, digits, dots and hyphens, and nothing else. A folder
 * called `ValoVault` is refused outright \u2014 and what came back said the name
 * was invalid, which is true and useless, because nobody named anything: the
 * folder was called what it was called and this passed it straight through.
 *
 * **The folder is never renamed.** Somebody's folder is theirs. This is a name
 * used at Vercel and written down beside the project, and the two are allowed
 * to differ.
 *
 *   ValoVault        \u2192 valovault
 *   My Cool App      \u2192 my-cool-app
 *   Viberant_AI!!!   \u2192 viberant-ai
 *
 * Deterministic, so the same folder reaches the same project every time \u2014
 * which is what stops a second deploy making a second site.
 */
export function slugFor(name) {
  const out = String(name ?? '')
    .toLowerCase()
    // Anything Vercel will not take becomes one hyphen, however many there were.
    .replace(/[^a-z0-9.-]+/g, '-')
    // A run of separators of any kind is one hyphen. `a--b` and `a.-.b` are
    // both refused, and both are things ordinary folder names produce.
    .replace(/[-.]{2,}/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 100)
    .replace(/[-.]+$/, '');

  // Nothing usable left \u2014 a folder named entirely in a script Vercel does not
  // take. Something rather than a refusal, and still deterministic.
  return out || 'project';
}

/** Is this already a name Vercel would take, exactly as it stands? */
export const alreadyASlug = (name) => slugFor(name) === String(name ?? '');

// ---------------------------------------------------------------------------
// Is there a website in here at all
// ---------------------------------------------------------------------------

/**
 * Where the website is, if there is one.
 *
 * Not every project belongs on a hosting service, and running a deploy against
 * one that does not is a slow way of finding that out. A desktop application is
 * the case that matters here: Viberant itself is one, and pointing Vercel at it
 * produces a confusing failure several minutes later rather than a sentence
 * straight away.
 *
 * Read out of real files, never guessed from a folder's shape. Three answers:
 *
 *   the project itself is the website
 *   the website is a folder inside it, and here it is
 *   there is no website here, and this says so
 */
export async function webPartOf(dir) {
  const at = resolve(dir);
  const mine = await inspect(at);

  // A page you could serve, or a framework that makes one. Either is a website.
  if (mine.frameworkId && mine.frameworkId !== 'static') return { ok: true, root: at, look: mine };
  if (existsSync(join(at, 'vercel.json'))) return { ok: true, root: at, look: mine };
  if (mine.frameworkId === 'static') return { ok: true, root: at, look: mine };

  /*
   * A desktop application with a website inside it.
   *
   * Common enough to be worth looking for: the application is the outer folder
   * and the part people actually visit is `web`, `site`, `www`, `docs` or
   * `frontend` within it. Only one level down, and only where that folder is
   * itself a website by the test above \u2014 anything deeper is guessing.
   */
  for (const named of ['web', 'site', 'www', 'frontend', 'client', 'docs', 'apps/web', 'packages/web']) {
    const inside = join(at, ...named.split('/'));
    if (!existsSync(inside)) continue;
    const theirs = await inspect(inside);
    if (theirs.frameworkId) return { ok: true, root: inside, look: theirs, inside: named };
  }

  /*
   * Pages with no `index.html` among them.
   *
   * A folder of `.html` files is a website — people put exactly this on
   * Vercel and it serves them at their own names. Requiring `index.html`
   * refused a real static site for the sake of one filename, which is the kind
   * of rule that only ever refuses the right thing.
   */
  const pages = await quiet(async () => (await readdir(at))
    .filter((f) => /\.html?$/i.test(f)), []);
  if (pages.length) {
    return { ok: true, root: at, look: { ...mine, framework: 'Plain files', frameworkId: 'static', output: '.' } };
  }

  /*
   * A desktop application, read from what it actually says.
   *
   * Any script that starts Electron counts, whatever it is called — this
   * project's own is `desktop`, not `electron`, and looking for the name
   * rather than the thing missed it. So does a dependency on Electron, or the
   * file that builds an installer.
   */
  const runsElectron = Object.values(mine.scripts ?? {}).some((line) => /\belectron\b/.test(String(line)));
  const desktop = !!(runsElectron
    || existsSync(join(at, 'electron-builder.yml'))
    || existsSync(join(at, 'electron-builder.json')));

  return {
    ok: false,
    root: null,
    look: mine,
    kind: desktop ? 'desktop' : 'nothing',
    sentence: desktop
      ? 'This is a desktop application, so there is no website in it to put online.'
      : 'There is no website in this project to put online.',
    action: desktop
      ? 'Build it as an application instead \u2014 that is the other half of this page.'
      : 'A website needs a page to serve, or something that builds one. Nothing here does either.',
  };
}

/**
 * What a deploy would do, worked out before anything is started.
 *
 * Every one of these is a fact about this project, read now, from the project
 * that is open at the moment of the press. The whole point is that a deploy
 * carries its own answers rather than asking again half way through, which is
 * how project B came to inherit project A's site.
 */
export async function preflight(dir, name, { token = null, connected = null } = {}) {
  const at = resolve(dir);
  const web = await webPartOf(at);

  if (!web.ok) {
    return {
      ok: false,
      trouble: 'NOT_DEPLOYABLE',
      kind: web.kind,
      sentence: web.sentence,
      action: web.action,
      look: web.look,
    };
  }

  const slug = slugFor(name);
  const bound = await bindingFor(at);

  return {
    ok: true,
    projectRoot: at,
    webRoot: web.root,
    inside: web.inside ?? null,
    look: web.look,
    slug,
    renamed: slug !== String(name),
    // What is already written down for this project, so a second deploy goes
    // to the same place rather than making a second site.
    bound: bound ?? null,
    needsToken: !token && !alreadyASlug(name),
    account: connected ?? null,
    environment: web.look.environment?.expected ?? [],
  };
}

/**
 * The project at Vercel this folder belongs to \u2014 found, or made.
 *
 * Made deliberately rather than left to happen. The tool names a project after
 * the folder it is run in, which is how `ValoVault` reached Vercel as
 * `ValoVault` and was refused for having capitals in it. Doing it here means
 * the name is one Vercel takes, the same one every time, and written down
 * afterwards so a second deploy finds the first site rather than making a
 * second one.
 *
 * Three outcomes, and the middle one is the one that used to be a raw error
 * shown to somebody: a name already in use by a project this folder is not
 * bound to.
 */
async function projectAtVercel(token, { slug, bound, framework }) {
  // Already bound, and still there. The fastest and the commonest path.
  if (bound?.projectId) {
    const still = await askVercel(`/v9/projects/${encodeURIComponent(bound.projectId)}`, token);
    if (still === null) return { ok: false, trouble: 'NETWORK_ERROR' };
    if (still.ok) return { ok: true, id: still.body.id, name: still.body.name, made: false, reused: true };
    // Gone from Vercel. Fall through and make it again rather than refusing.
  }

  const found = await askVercel(`/v9/projects/${encodeURIComponent(slug)}`, token);
  if (found === null) return { ok: false, trouble: 'NETWORK_ERROR' };

  if (found.ok) {
    return { ok: true, id: found.body.id, name: found.body.name, made: false, reused: !bound };
  }
  if (found.status !== 404) {
    return {
      ok: false,
      trouble: found.status === 401 || found.status === 403 ? 'AUTH_EXPIRED' : 'PROVIDER_FAILED',
      status: found.status,
      why: found.why,
    };
  }

  const made = await askVercel('/v11/projects', token, {
    send: { name: slug, ...(framework ? { framework } : {}) },
  });
  if (made === null) return { ok: false, trouble: 'NETWORK_ERROR' };

  if (!made.ok) {
    const why = String(made.why ?? '');
    if (/name/i.test(why) && /invalid|lower|character/i.test(why)) {
      return { ok: false, trouble: 'INVALID_PROJECT_NAME', why, slug };
    }
    if (made.status === 409 || /already/i.test(why)) {
      return { ok: false, trouble: 'PROJECT_CONFLICT', why, slug };
    }
    if (made.status === 401 || made.status === 403) return { ok: false, trouble: 'AUTH_EXPIRED', why };
    if (made.status === 429) return { ok: false, trouble: 'RATE_LIMITED', why };
    return { ok: false, trouble: 'PROVIDER_FAILED', status: made.status, why };
  }

  return { ok: true, id: made.body.id, name: made.body.name, made: true, reused: false };
}

/**
 * Which framework Vercel calls this one.
 *
 * Its own names, not ours. Anything not on the list is left unsaid rather than
 * guessed \u2014 Vercel works it out itself, and a wrong answer here would make it
 * build the project the wrong way.
 */
const VERCEL_CALLS_IT = {
  next: 'nextjs',
  nuxt: 'nuxtjs',
  astro: 'astro',
  sveltekit: 'sveltekit',
  remix: 'remix',
  vite: 'vite',
  vue: 'vue',
  cra: 'create-react-app',
};

/**
 * Tell the tool which project this folder is, without touching the folder's
 * own files any more than it already does.
 *
 * `.vercel/project.json` is the tool's own note to itself about which project
 * a folder belongs to \u2014 it writes one anyway on the first deploy. Writing it
 * here means it writes the right one: the project named properly, rather than
 * one named after the folder and refused.
 */
async function linkFolder(root, { projectId, orgId }) {
  const at = join(root, '.vercel');
  await mkdir(at, { recursive: true });
  await writeFile(join(at, 'project.json'), JSON.stringify({ projectId, orgId }, null, 2), 'utf8');
}

export const vercel = {
  id: 'vercel',
  name: 'Vercel',
  where: VERCEL_TOKEN_PAGE,

  /**
   * Is this computer connected to Vercel, and as whom.
   *
   * **This used to start Vercel's own sign-in and wait for a browser.** Inside
   * an app with no terminal attached, that command has nowhere to print the
   * address it wants you to visit and nothing to read your answer from: it
   * waits, forever, and the only thing anybody sees is a spinner. The browser
   * half sometimes succeeded, which made it worse — authorised over there, and
   * still "Not connected" over here, with a process left running.
   *
   * A token instead. It is Vercel's own supported way for something that is not
   * a terminal to act on your behalf, it is made on a page in your browser in
   * about twenty seconds, it survives restarting this app because it is written
   * down, and there is nothing left running afterwards.
   *
   * Three answers, never two. Connected; not connected and here is why; and
   * "could not ask", which is not the same as either and used to be reported as
   * the second.
   */
  async state({ fresh = false } = {}) {
    const token = await settings.get(VERCEL_TOKEN);
    const cli = await onPath('vercel');

    if (!token) {
      // Nothing pasted here. But somebody who has already signed the command
      // itself in, in a terminal, *is* connected — telling them they are not
      // and asking for a token would be this app failing to look.
      const already = cli ? await whoTheCliThinks() : null;
      if (already) {
        return {
          here: true,
          connected: true,
          login: already,
          reachable: true,
          how: 'cli',
          sentence: `Vercel is signed in on this computer as ${already}.`,
          action: null,
        };
      }

      return {
        here: cli,
        connected: false,
        login: null,
        reachable: true,
        needsToken: true,
        where: VERCEL_TOKEN_PAGE,
        sentence: 'Vercel is not connected on this computer.',
        action: 'Make a token on your Vercel account page and paste it in. It takes a minute.',
      };
    }

    if (!fresh && lastVercel && Date.now() - lastVercel.at < WORTH_KEEPING_FOR) {
      return { ...lastVercel.state, here: cli };
    }

    const said = await askVercel('/v2/user', token);

    if (said === null) {
      // Could not be asked. What was true last time, said as being out of date.
      return {
        here: cli,
        connected: !!lastVercel?.state?.connected,
        login: lastVercel?.state?.login ?? null,
        reachable: false,
        stale: !!lastVercel,
        sentence: 'Vercel could not be reached just now.',
        action: 'Check you are online. Nothing has changed here.',
      };
    }

    if (!said.ok) {
      // Answered, and said no. An old token is not a connected one, and this
      // is the line that stops one being drawn as though it were.
      lastVercel = null;
      const gone = said.status === 401 || said.status === 403;
      return {
        here: cli,
        connected: false,
        login: null,
        reachable: true,
        needsToken: true,
        where: VERCEL_TOKEN_PAGE,
        sentence: gone
          ? 'The Vercel token on this computer is no longer accepted.'
          : `Vercel refused to say who this is (${said.status}).`,
        action: gone ? 'Make a new one and paste it in.' : 'Try again in a moment.',
      };
    }

    const who = said.body?.user ?? said.body ?? {};
    const login = who.username ?? who.name ?? who.email ?? null;
    const state = {
      connected: true,
      login,
      reachable: true,
      how: 'token',
      id: who.id ?? null,
      email: who.email ?? null,
    };
    lastVercel = { at: Date.now(), state };
    return { ...state, here: cli };
  },

  /**
   * Does this token work, asked before it is kept.
   *
   * The same rule as a key for a model: a token one character short looks
   * exactly like a working one until the first deploy fails for a reason
   * nobody can act on.
   */
  async checkToken(token) {
    const clean = String(token ?? '').trim();
    if (!clean) return { ok: false, sentence: 'No token was pasted.', action: 'Paste it and try again.' };

    const said = await askVercel('/v2/user', clean);
    if (said === null) {
      return {
        ok: false,
        sentence: 'Vercel could not be reached to check that token.',
        action: 'Check you are online, and try again.',
      };
    }
    if (!said.ok) {
      return {
        ok: false,
        sentence: said.status === 401 || said.status === 403
          ? 'Vercel did not accept that token.'
          : `Vercel answered ${said.status} when asked about that token.`,
        action: 'Make a new one on your account page and paste the whole of it.',
      };
    }

    const who = said.body?.user ?? said.body ?? {};
    const login = who.username ?? who.name ?? who.email ?? null;
    return { ok: true, login, sentence: `That token works. Vercel is connected as ${login}.` };
  },

  supports(look) {
    return !!look.frameworkId;
  },

  /**
   * Put it up, and then find out whether it is actually up.
   *
   * Two halves, and the second one is the point. The tool builds and uploads
   * and prints an address; that address exists the moment it is printed and
   * says nothing about whether anything is being served from it. So the address
   * is then asked about, over Vercel's own interface, until it says ready or
   * says it failed. **A tool exiting with nothing to complain about is not a
   * site being online**, and reporting it as one is the exact shape of lie this
   * whole project exists to not tell.
   *
   * The token goes in the surroundings of the process and never in its
   * arguments, so nothing that is written down anywhere contains it.
   */
  /**
   * Put it up, and then find out whether it is actually up.
   *
   * Four parts, and the first three exist because the fourth used to be the
   * only one. It ran the tool in the folder and read what it printed. The tool
   * names a project after the folder it is run in, so `ValoVault` was sent as
   * `ValoVault` and refused for having capitals \u2014 reported as an invalid
   * project name, which is true and useless, because nobody named anything.
   *
   *   work out what this is, and whether it is a website at all
   *   find or make the project at Vercel, under a name Vercel takes
   *   build and upload, from the website's own folder
   *   ask whether that address is serving anything
   *
   * **The last one is the point.** A tool exiting with nothing to complain
   * about is not a site being online, and reporting it as one is the exact
   * shape of lie this project exists not to tell.
   */
  async deploy(job, jobs, { dir, name, token, account = null }) {
    jobs.step(job, `Reading ${name} and working out what it builds into.`);

    const plan = await preflight(dir, name, { token, connected: account });
    if (!plan.ok) return { ...plan, stage: 'preparing' };

    if (plan.inside) {
      jobs.step(job, `The website in ${name} is the ${plan.inside} folder, so that is what goes up.`);
    }

    /*
     * Naming it properly needs a token, and this is where that is said.
     *
     * Without one the tool names the project after the folder, and a folder
     * whose name Vercel will not take fails several minutes in with a sentence
     * about an invalid name that nobody caused. Said here, before anything is
     * built, with the thing to do about it.
     */
    if (plan.needsToken) {
      return {
        ok: false,
        stage: 'preparing',
        trouble: 'INVALID_PROJECT_NAME',
        sentence: `Vercel will not take "${name}" as a name \u2014 it only takes lower case, digits, dots and hyphens.`,
        action: `Connect Vercel with a token and this will be put up as "${plan.slug}". Your folder is not renamed.`,
        needsToken: true,
        slug: plan.slug,
      };
    }

    let linked = null;
    if (token) {
      jobs.step(job, plan.bound?.projectId
        ? `Using the Vercel project this one already goes to.`
        : `Making sure Vercel has a project called ${plan.slug}.`);

      const at = await projectAtVercel(token, {
        slug: plan.slug,
        bound: plan.bound,
        framework: VERCEL_CALLS_IT[plan.look.frameworkId] ?? null,
      });

      if (!at.ok) return { ...whatVercelMeant(at, { name, slug: plan.slug }), stage: 'preparing' };

      linked = at;
      const who = await askVercel('/v2/user', token);
      const orgId = who?.ok ? (who.body?.user?.id ?? null) : null;
      if (orgId) await quiet(() => linkFolder(plan.webRoot, { projectId: at.id, orgId }));

      if (at.made) jobs.step(job, `Made a Vercel project called ${at.name}.`);
      else if (at.reused) jobs.step(job, `Vercel already had a project called ${at.name}, so that is the one used.`);
    }

    jobs.step(job, `Building and uploading from ${plan.webRoot}.`);
    const out = await jobs.runInto(job, {
      file: WINDOWS ? 'vercel.cmd' : 'vercel',
      args: ['deploy', '--prod', '--yes'],
      // The website's own folder, worked out above and never assumed. Not this
      // process's folder, not the last project, not the one above it.
      cwd: plan.webRoot,
      // Never an argument. `runInto` writes the arguments into what you can
      // read afterwards, and a token there would be a token in a log.
      env: { VERCEL_TOKEN: token, VERCEL_CLI_BANNER: '0' },
      timeout: 20 * 60 * 1000,
    });

    const said = whatVercelSaid(job.lines);

    if (!out.ok) {
      return {
        ok: false,
        stage: 'building',
        ...whatTheBuildSaid(job.lines, { name, environment: plan.environment }),
        framework: plan.look.framework,
        slug: plan.slug,
      };
    }
    if (!said.address) {
      return {
        ok: false,
        stage: 'building',
        trouble: 'PROVIDER_FAILED',
        sentence: 'Vercel finished without giving an address, so there is nothing to open.',
        action: 'Look at what it printed below.',
      };
    }

    const address = said.address;
    jobs.step(job, 'Asking whether that address is actually serving anything yet.');

    /*
     * Two ways to find out, and both of them are asking rather than assuming.
     *
     * With a token, Vercel's own interface says what state the deployment is
     * in and what the production address for it is, which is not the address
     * the command printed. Without one \u2014 when the command is signed in on
     * its own and this app has no credential of its own to use \u2014 the address
     * is fetched until something answers, which is a smaller answer but a true
     * one. Neither of them is "the command exited, so it worked".
     */
    const checked = token
      ? await vercel.waitUntilLive(said.id ?? address, token, { onWord: (word) => jobs.step(job, word) })
      : await vercel.waitUntilAnswering(address, { onWord: (word) => jobs.step(job, word) });

    if (!checked.ok) {
      return {
        ...checked, at: address, inspect: said.inspect, framework: plan.look.framework, slug: plan.slug,
      };
    }

    /*
     * Live, and whether the front door actually opens.
     *
     * Vercel saying a deployment is ready is true and is not the whole truth:
     * a folder of pages with no `index.html` is served perfectly and answers
     * nothing at all at `/`. Saying "it is live" and handing over an address
     * that shows a not-found page is the shape of lie this project exists not
     * to tell, so the address is opened once and the answer said out loud.
     */
    const front = await quiet(async () => (await fetch(checked.at ?? address, {
      redirect: 'follow', signal: AbortSignal.timeout(10000),
    })).status);

    return {
      ok: true,
      at: checked.at ?? address,
      frontPage: front ?? null,
      noFrontPage: front === 404,
      inspect: checked.inspect ?? said.inspect ?? null,
      provider: 'vercel',
      framework: plan.look.framework,
      // Everything worth writing down against this project, so the next press
      // goes to the same place and project B never inherits project A's site.
      binding: {
        provider: 'vercel',
        projectRoot: plan.projectRoot,
        webRoot: plan.webRoot,
        slug: plan.slug,
        projectId: linked?.id ?? null,
        account,
        url: checked.at ?? address,
        inspect: checked.inspect ?? said.inspect ?? null,
      },
    };
  },

  /**
   * Fetch the address until something is served from it.
   *
   * What this can prove is smaller than what the interface can prove: that
   * something is answering there, not what state Vercel thinks the deployment
   * is in. It is still an answer to the question "is it up", which is the
   * question, and it is still not the same as a command having exited.
   */
  async waitUntilAnswering(address, { onWord = () => {}, mostSeconds = 300 } = {}) {
    const until = Date.now() + mostSeconds * 1000;
    let toldThem = false;

    while (Date.now() < until) {
      const code = await quiet(async () => {
        const res = await fetch(address, { redirect: 'follow', signal: AbortSignal.timeout(10000) });
        return res.status;
      });

      /*
       * Anything that answers counts, and that includes answers people do not
       * think of as success. A 404 is the site being up with no page at that
       * path. A 401 is deployment protection, which is the site being up and
       * deliberately asking who you are. The only ones that are not the site
       * are the two Vercel serves while there is nothing to serve.
       */
      if (code && code !== 502 && code !== 503) return { ok: true, at: address };

      if (!toldThem) { onWord('Waiting for it to start answering.'); toldThem = true; }
      await new Promise((r) => setTimeout(r, 3000));
    }

    return {
      ok: false,
      stage: 'verifying',
      sentence: 'Nothing was being served from that address five minutes later.',
      action: `It may still finish. The address is ${address}.`,
    };
  },

  /**
   * Ask about one deployment until it stops being in the middle of something.
   *
   * Vercel's own name for the address, without the front of it, is what its
   * interface takes as the name of a deployment. Asked about every three
   * seconds for at most five minutes, which is longer than any build this would
   * be used for and short enough that a stuck one is reported rather than
   * waited on forever.
   */
  async waitUntilLive(address, token, { onWord = () => {}, mostSeconds = 300 } = {}) {
    const host = String(address).replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    const until = Date.now() + mostSeconds * 1000;
    let said = null;
    let toldThem = null;

    while (Date.now() < until) {
      said = await askVercel(`/v13/deployments/${encodeURIComponent(host)}`, token);

      if (said === null) {
        return {
          ok: false,
          stage: 'verifying',
          sentence: 'Vercel could not be reached to check whether that is live.',
          action: `The address is ${address}. Open it and see.`,
        };
      }
      if (!said.ok) {
        return {
          ok: false,
          stage: 'verifying',
          sentence: `Vercel would not say anything about that deployment (${said.status}).`,
          action: `The address is ${address}. Open it and see.`,
        };
      }

      const body = said.body ?? {};
      const where = String(body.readyState ?? body.status ?? '').toUpperCase();

      if (where === 'READY') {
        // The address people should be given is the one Vercel calls the
        // production one, which is not the address the tool printed.
        const aliases = (body.alias ?? []).filter(Boolean);
        const best = aliases.find((a) => !/-[a-z0-9]{9,}\./.test(a)) ?? aliases[0] ?? host;
        return {
          ok: true,
          at: `https://${String(best).replace(/^https?:\/\//, '')}`,
          inspect: body.inspectorUrl ?? null,
        };
      }

      if (where === 'ERROR' || where === 'CANCELED') {
        return {
          ok: false,
          stage: 'verifying',
          sentence: where === 'CANCELED'
            ? 'That deployment was stopped before it finished.'
            : 'Vercel built it and the build failed, so nothing is being served.',
          action: 'What it printed is below, and the whole of it is on Vercel.',
          inspect: body.inspectorUrl ?? null,
        };
      }

      const word = where === 'BUILDING' ? 'Vercel is building it.'
        : where === 'QUEUED' ? 'Vercel has it queued.'
          : where === 'INITIALIZING' ? 'Vercel is getting ready to build it.'
            : 'Waiting for Vercel to finish.';
      if (word !== toldThem) { onWord(word); toldThem = word; }

      await new Promise((r) => setTimeout(r, 3000));
    }

    return {
      ok: false,
      stage: 'verifying',
      sentence: 'Vercel was still working on it five minutes later.',
      action: `It may still finish. The address is ${address}.`,
    };
  },
};

/**
 * What Vercel's command actually said, out of everything it printed.
 *
 * Three things are in there and only one of them is the address to give
 * somebody. It prints a per-deployment address, a link to its own inspector,
 * and — last — the alias, which is the short stable address the site
 * really lives at. Newer versions also print a small block of machine-readable
 * text at the end holding the identifier, which is what lets the deployment be
 * asked about directly rather than guessed at from a hostname.
 *
 * **This is where the first attempt went wrong,** and it is worth writing down
 * because it looked like a deploy failure and was not. A pattern that matched
 * an address took the quotation mark after it as part of the address. The
 * fetch that checked whether the site was up then threw on an address that was
 * not one, silently, once every three seconds for five minutes, and reported
 * "nothing was being served" about a site that had been live the whole time.
 */
export function whatVercelSaid(lines) {
  const text = lines.join('\n');

  // The machine-readable block at the end, if this version prints one.
  let told = null;
  const brace = text.lastIndexOf('\n{');
  if (brace !== -1) {
    try {
      const parsed = JSON.parse(text.slice(brace));
      told = parsed?.deployment ?? null;
    } catch { /* an older version, or a line that merely began with a brace */ }
  }

  const clean = (u) => String(u ?? '').replace(/^[^h]*/, '').replace(/["'`).,\\]+$/, '').trim();

  // Every address it printed, in order, with nothing stuck to the end of it.
  const all = [...text.matchAll(/https:\/\/[\w.-]+\.vercel\.app[^\s"'`\\]*/g)].map((m) => clean(m[0]));

  // The alias is the short one: no team suffix, no build identifier in it.
  const aliased = clean((text.match(/Aliased\s+(\S+)/) ?? [])[1]);
  const shortest = [...all].sort((a, b) => a.length - b.length)[0] ?? null;

  const printedInspect = clean((text.match(/Inspect\s+(https:\/\/vercel\.com\/\S+)/) ?? [])[1]);

  return {
    // The alias when there is one, because that is the address that stays the
    // same next time. Otherwise the shortest it printed, which is the one
    // without a build identifier buried in it.
    address: aliased || shortest || clean(told?.url) || null,
    id: told?.id ?? null,
    inspect: told?.inspectorUrl ?? (printedInspect || null),
  };
}

/**
 * A refusal from Vercel's own interface, said as the thing that happened.
 *
 * The one that mattered: an invalid project name used to arrive as Vercel's own
 * sentence about it, which names a rule nobody knew existed and blames a name
 * nobody chose. It is the folder's name, and the answer is not to rename the
 * folder.
 */
function whatVercelMeant(at, { name, slug }) {
  const kind = at.trouble;

  if (kind === 'INVALID_PROJECT_NAME') {
    return {
      ok: false,
      trouble: kind,
      sentence: `Vercel would not accept "${slug}" as a name for this.`,
      action: 'Rename the project in Viberant to something with only letters, digits and hyphens in it. Your folder is not touched.',
    };
  }
  if (kind === 'PROJECT_CONFLICT') {
    return {
      ok: false,
      trouble: kind,
      sentence: `There is already something called "${slug}" on your Vercel account, and it is not this project.`,
      action: `Rename this project in Viberant, or delete that one at Vercel. Nothing here has been changed.`,
    };
  }
  if (kind === 'AUTH_EXPIRED') {
    return {
      ok: false,
      trouble: kind,
      needsToken: true,
      sentence: 'The Vercel token on this computer is no longer accepted.',
      action: 'Connect Vercel again with a new token. Nothing that is already online was touched.',
    };
  }
  if (kind === 'RATE_LIMITED') {
    return {
      ok: false,
      trouble: kind,
      sentence: 'Vercel is limiting how often it will answer just now.',
      action: 'Wait a minute and try again. Nothing has been changed.',
    };
  }
  if (kind === 'NETWORK_ERROR') {
    return {
      ok: false,
      trouble: kind,
      sentence: 'Vercel could not be reached.',
      action: 'Check you are online, and try again. Nothing has been changed.',
    };
  }
  return {
    ok: false,
    trouble: 'PROVIDER_FAILED',
    sentence: `Vercel would not set ${name} up${at.status ? ` (${at.status})` : ''}.`,
    action: at.why ? String(at.why).slice(0, 300) : 'Try again in a moment.',
  };
}

/**
 * Why a build failed, out of the four hundred lines it printed.
 *
 * One line of a build log matters and it is never the last one. The two that
 * are worth telling apart by hand are a missing setting \u2014 which is a thing
 * somebody can fix in a minute and would otherwise read as a broken project \u2014
 * and everything else, which goes to the log with a sentence saying so.
 */
function whatTheBuildSaid(lines, { name, environment = [] }) {
  const text = lines.slice(-200).join('\n');

  const missing = environment.filter((one) => new RegExp(`\\b${one}\\b`).test(text));
  if (missing.length && /undefined|not set|missing|required/i.test(text)) {
    return {
      trouble: 'ENVIRONMENT_MISSING',
      sentence: `${name} needs ${missing.length === 1 ? 'a setting' : 'settings'} that Vercel does not have: ${missing.join(', ')}.`,
      action: 'Add them to the project at Vercel, then try again. Their values never leave this computer through Viberant.',
    };
  }

  return {
    trouble: 'BUILD_FAILED',
    sentence: `Vercel did not put ${name} online \u2014 the build failed.`,
    action: 'What it printed is below, and the reason is in it.',
  };
}

export const PLACES = { vercel };
