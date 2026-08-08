/**
 * Asking a model about *this* project.
 *
 * Not a chat window with a text box. Everything here answers one specific
 * question about the project you have open, and the shape of the answer is
 * known before it is asked — a diagnosis, a summary, a proposal — so the page
 * can draw it as something you act on rather than as a wall of prose.
 *
 * Three rules, and they are the whole design:
 *
 *   **Nothing is applied without being pressed.** A proposal is a thing you
 *   read and then approve. There is no path from a model's answer to a changed
 *   file that does not go through somebody agreeing to it, and there is not
 *   going to be one. Reading is free; changing is not.
 *
 *   **The context is this project, and only what the question needs.** Not the
 *   whole folder. Not another project. Not the workspace. A model is asked
 *   about a build failure with the build output and the files that decide how
 *   it builds — not with somebody's entire disk.
 *
 *   **A secret never leaves this computer in a prompt.** Anything that looks
 *   like a key, a token or a password is replaced before the text is sent, and
 *   the file that holds real values is never opened at all (D-123). This is the
 *   rule most easily broken by accident, so it is applied in one place that
 *   everything goes through rather than remembered at each call.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';

import { HOUSE } from './projects.mjs';
import * as settings from './settings.mjs';
import * as providers from './providers.mjs';

const quiet = async (fn, fallback = null) => { try { return await fn(); } catch { return fallback; } };

// ---------------------------------------------------------------------------
// Which model, and the key for it
// ---------------------------------------------------------------------------

/**
 * The models this can talk to.
 *
 * A shape rather than one hard-coded service, so changing model or provider is
 * a line here rather than a change to anything anybody looks at.
 */
export const MODELS = [
  {
    id: 'claude',
    name: 'Claude',
    keySetting: 'anthropicKey',
    where: 'https://console.anthropic.com/settings/keys',
    model: 'claude-sonnet-4-5-20250929',
    async ask({ key, system, message, mostTokens = 1600 }) {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: mostTokens,
          system,
          messages: [{ role: 'user', content: message }],
        }),
      });
      if (!res.ok) {
        const said = await quiet(() => res.json(), null);
        return { ok: false, status: res.status, why: said?.error?.message ?? null };
      }
      const body = await res.json();
      return { ok: true, text: (body.content ?? []).map((c) => c.text ?? '').join('').trim() };
    },
  },
];

/** Which model is set up here, if any. */
export async function ready() {
  for (const m of MODELS) {
    const key = await settings.get(m.keySetting);
    if (key) return { ok: true, model: m, name: m.name };
  }
  const first = MODELS[0];
  return {
    ok: false,
    name: first.name,
    where: first.where,
    setting: first.keySetting,
    sentence: `Viberant has no key for ${first.name} yet, so it cannot look at anything.`,
    action: 'Settings has a box for it. The key stays on this computer.',
  };
}

// ---------------------------------------------------------------------------
// Taking secrets out of anything before it is sent
// ---------------------------------------------------------------------------

/**
 * Anything shaped like a credential, replaced.
 *
 * Deliberately generous: a false positive costs a model a little context, and a
 * false negative sends somebody's key to a company. Those are not comparable,
 * so this errs the safe way every time.
 *
 * One function, and everything that builds a prompt goes through it — because
 * this is exactly the rule that gets remembered at four call sites and
 * forgotten at the fifth.
 */
export function withoutSecrets(text) {
  return String(text ?? '')
    // NAME=value, where the name says it is a secret.
    .replace(/\b([A-Z][A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIAL|AUTH)[A-Z0-9_]*)\s*=\s*\S+/g,
      (_, name) => `${name}=[kept on this computer]`)
    // "key": "value" in anything JSON-shaped.
    .replace(/("(?:[\w-]*(?:key|token|secret|password|auth)[\w-]*)"\s*:\s*)"[^"]*"/gi,
      '$1"[kept on this computer]"')
    // Things that are recognisably a credential wherever they appear.
    .replace(/\b(sk-[A-Za-z0-9_-]{16,}|ghp_[A-Za-z0-9]{16,}|gho_[A-Za-z0-9]{16,}|github_pat_[A-Za-z0-9_]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16})\b/g,
      '[kept on this computer]')
    // A password sitting inside an address.
    .replace(/([a-z][\w+.-]*:\/\/)([^\s:@/]+):([^\s@/]+)@/gi, '$1$2:[kept on this computer]@')
    // A bearer token in a header somebody pasted.
    .replace(/\b(Authorization\s*:\s*Bearer\s+)\S+/gi, '$1[kept on this computer]');
}

// ---------------------------------------------------------------------------
// What the model is told about a project
// ---------------------------------------------------------------------------

/** Files worth reading to answer a question about how a project is built. */
const WORTH_READING = [
  'package.json', 'tsconfig.json', 'vite.config.js', 'vite.config.ts',
  'next.config.js', 'next.config.mjs', 'astro.config.mjs', 'svelte.config.js',
  'nuxt.config.ts', 'vercel.json', 'netlify.toml', 'Dockerfile',
  '.env.example', 'requirements.txt', 'pyproject.toml', 'Cargo.toml',
];

const MOST_PER_FILE = 6000;

/**
 * What is true about this project, in a form a model can read.
 *
 * Built from what the product already knows plus a small, named set of files
 * that decide how a project builds. Never a walk of the whole folder: the
 * question is "why will this not build", and the answer is not in somebody's
 * photographs.
 */
export async function contextFor(dir, { includeFiles = true } = {}) {
  const at = resolve(dir);
  const look = await providers.inspect(at);

  const files = [];
  if (includeFiles) {
    for (const name of WORTH_READING) {
      const path = join(at, name);
      if (!existsSync(path)) continue;
      // The example file is read for its names. The real one never is (D-123).
      const text = await quiet(() => readFile(path, 'utf8'), null);
      if (text === null) continue;
      files.push({
        name,
        text: withoutSecrets(text.slice(0, MOST_PER_FILE)),
        clipped: text.length > MOST_PER_FILE,
      });
    }
  }

  return {
    name: look.name ?? at.split(/[\\/]/).pop(),
    framework: look.framework,
    manager: look.manager,
    build: look.build,
    dev: look.dev,
    output: look.output,
    // Names only, always.
    expectedSettings: look.environment.expected,
    hasLocalSettingsFile: look.environment.hasLocalFile,
    files,
  };
}

/** The context as the text actually sent. Everything passes through here. */
function asPrompt(context) {
  const bits = [
    `Project: ${context.name}`,
    context.framework ? `Built with: ${context.framework}` : null,
    context.manager ? `Package manager: ${context.manager}` : null,
    context.build ? `Build command: ${context.build}` : null,
    context.output ? `Build output folder: ${context.output}` : null,
    context.expectedSettings?.length
      ? `Environment variables this project expects (names only): ${context.expectedSettings.join(', ')}`
      : null,
    context.hasLocalSettingsFile === false && context.expectedSettings?.length
      ? 'There is no local environment file, so those are probably unset.'
      : null,
  ].filter(Boolean);

  for (const f of context.files ?? []) {
    bits.push(`\n--- ${f.name} ---\n${f.text}${f.clipped ? '\n[…rest not included]' : ''}`);
  }
  return withoutSecrets(bits.join('\n'));
}

// ---------------------------------------------------------------------------
// The errands
// ---------------------------------------------------------------------------

const VOICE = [
  'You are helping inside Viberant, a desktop manager for developer projects.',
  'Answer about this project only, from what you are given.',
  'Be direct and specific. Name files and commands exactly.',
  'If the information given is not enough to be sure, say what is missing rather than guessing.',
  'Never invent file names, versions, or error messages that were not given to you.',
  'Keep it under 200 words unless asked for more.',
].join(' ');

async function askModel({ system, message, mostTokens }) {
  const set = await ready();
  if (!set.ok) return set;

  const key = await settings.get(set.model.keySetting);
  const out = await quiet(() => set.model.ask({ key, system, message, mostTokens }));

  if (!out) {
    return {
      ok: false,
      sentence: `${set.name} could not be reached.`,
      action: 'Check you are online, then try again.',
    };
  }
  if (!out.ok) {
    return {
      ok: false,
      sentence: out.status === 401 || out.status === 403
        ? `${set.name} would not accept the key on this computer.`
        : `${set.name} could not answer.`,
      action: out.status === 401 || out.status === 403
        ? 'Put a current key in Settings and try again.'
        : out.why ?? 'Try again in a moment.',
    };
  }
  return { ok: true, text: out.text, model: set.name };
}

/**
 * Why did this go wrong.
 *
 * Given the output of something that failed, plus what the project is. This is
 * the highest-value thing here: a build log is four hundred lines and the
 * useful part is one of them.
 */
export async function explainFailure({ dir, what, lines = [] }) {
  const context = await contextFor(dir);
  // The end of a log is where the reason is. The start is setup.
  const tail = withoutSecrets(lines.slice(-120).join('\n')).slice(-8000);

  return askModel({
    system: VOICE,
    mostTokens: 900,
    message: [
      `${what} failed in this project. Say what most likely caused it and what to change.`,
      '',
      asPrompt(context),
      '',
      '--- what it printed ---',
      tail,
    ].join('\n'),
  });
}

/** Why will this project not run. */
export async function diagnose({ dir }) {
  const context = await contextFor(dir);
  return askModel({
    system: VOICE,
    mostTokens: 900,
    message: [
      'Look at this project and say whether anything obvious would stop it running or building,',
      'and what to do about each thing. If it looks fine, say so plainly rather than inventing work.',
      '',
      asPrompt(context),
    ].join('\n'),
  });
}

/** What changed here, and is any of it worth a second look. */
export async function reviewChanges({ dir, diff, files = [] }) {
  const context = await contextFor(dir, { includeFiles: false });
  return askModel({
    system: VOICE,
    mostTokens: 800,
    message: [
      'These are the unsaved changes in this project. Do three things, briefly:',
      '1. Say in one sentence what this change does.',
      '2. Name anything in it that looks risky or accidental, or say there is nothing.',
      '3. Suggest one short line describing the change, in plain English, with no version-control words.',
      '',
      asPrompt(context),
      '',
      `Files changed: ${files.join(', ') || 'unknown'}`,
      '',
      '--- what changed ---',
      withoutSecrets(String(diff ?? '')).slice(0, 12000),
    ].join('\n'),
  });
}

/** A question about this project, answered from this project. */
export async function askAbout({ dir, question }) {
  const context = await contextFor(dir);
  const found = await lookInside(dir, question);

  return askModel({
    system: VOICE,
    mostTokens: 1000,
    message: [
      `Question about this project: ${question}`,
      '',
      asPrompt(context),
      found.length ? `\n--- files that mention what was asked about ---\n${found.map((f) => `${f.name}\n${f.text}`).join('\n\n')}` : '',
    ].join('\n'),
  });
}

/**
 * Files in this project that mention what somebody asked about.
 *
 * A small, local search rather than sending the folder. It reads at most a
 * handful of files and only ones that are plainly text, so asking "where is
 * signing in handled" costs a directory walk rather than an upload.
 */
async function lookInside(dir, question) {
  const at = resolve(dir);
  const words = String(question).toLowerCase().match(/[a-z][a-z0-9_-]{3,}/g) ?? [];
  const wanted = [...new Set(words)].filter((w) => !STOP.has(w)).slice(0, 6);
  if (!wanted.length) return [];

  const { readdir } = await import('node:fs/promises');
  const out = [];
  const skip = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'out', 'target', '.venv']);
  const TEXT = /\.(js|mjs|cjs|ts|tsx|jsx|json|md|py|rs|go|java|rb|php|css|html|yml|yaml|toml)$/i;

  const walk = async (folder, depth) => {
    if (out.length >= 5 || depth > 4) return;
    for (const e of await readdir(folder, { withFileTypes: true }).catch(() => [])) {
      if (out.length >= 5) return;
      if (e.name.startsWith('.') && e.name !== '.env.example') continue;
      const path = join(folder, e.name);
      if (e.isDirectory()) {
        if (skip.has(e.name)) continue;
        await walk(path, depth + 1);
      } else if (e.isFile() && TEXT.test(e.name)) {
        const text = await quiet(() => readFile(path, 'utf8'), null);
        if (!text || text.length > 200_000) continue;
        const low = text.toLowerCase();
        if (!wanted.some((w) => low.includes(w))) continue;
        out.push({
          name: relative(at, path).split(/[\\/]/).join('/'),
          text: withoutSecrets(text.slice(0, 3000)),
        });
      }
    }
  };

  await walk(at, 0);
  return out;
}

const STOP = new Set(['where', 'what', 'which', 'this', 'that', 'does', 'from', 'with',
  'here', 'there', 'have', 'file', 'files', 'project', 'handled', 'happens', 'work']);

// ---------------------------------------------------------------------------
// Proposals, which are never applied on their own
// ---------------------------------------------------------------------------

const PROPOSALS = join(HOUSE, 'proposals.json');

/**
 * A change a model suggested, held until somebody agrees to it.
 *
 * Written down rather than kept in the page, so an answer that took thirty
 * seconds to produce is not lost by pressing a tab. Nothing here touches a file
 * — `apply` is a separate press, in a separate route, and the two cannot be
 * reached by accident from one another.
 */
export async function propose({ dir, what, changes }) {
  const one = {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    at: Date.now(),
    dir: resolve(dir),
    what,
    state: 'waiting for you',
    changes: (changes ?? []).map((c) => ({
      path: c.path, was: c.was ?? null, becomes: c.becomes,
    })),
  };
  const all = await allProposals();
  all[one.id] = one;
  await mkdir(HOUSE, { recursive: true });
  await writeFile(PROPOSALS, JSON.stringify(all, null, 2), 'utf8');
  return one;
}

async function allProposals() {
  if (!existsSync(PROPOSALS)) return {};
  return quiet(async () => JSON.parse(await readFile(PROPOSALS, 'utf8')), {}) ?? {};
}

export async function proposal(id) {
  return (await allProposals())[id] ?? null;
}

/**
 * Do what was proposed, having been asked to.
 *
 * Every path is checked against the project it belongs to before anything is
 * written — a proposal that names `..\..\Windows` is refused rather than
 * followed, for the same reason a parcel from another computer is (parcel.mjs).
 * A model is not more trusted than the network.
 */
export async function apply(id) {
  const one = await proposal(id);
  if (!one) {
    return { ok: false, sentence: 'That suggestion is no longer being kept.', action: 'Ask again.' };
  }
  if (one.state === 'done') {
    return { ok: false, sentence: 'That was already applied.', action: 'Ask again if you want another look.' };
  }

  const root = resolve(one.dir);
  for (const c of one.changes) {
    const path = resolve(root, c.path);
    if (path !== root && !path.startsWith(root + (process.platform === 'win32' ? '\\' : '/'))) {
      return {
        ok: false,
        sentence: 'That suggestion wanted to change a file outside the project, so nothing was changed.',
        action: 'Nothing on this computer was touched.',
      };
    }
  }

  for (const c of one.changes) {
    const path = resolve(root, c.path);
    await mkdir(join(path, '..'), { recursive: true });
    await writeFile(path, c.becomes, 'utf8');
  }

  one.state = 'done';
  const all = await allProposals();
  all[id] = one;
  await writeFile(PROPOSALS, JSON.stringify(all, null, 2), 'utf8');

  return {
    ok: true,
    sentence: `${one.changes.length === 1 ? 'One file was' : `${one.changes.length} files were`} changed.`,
    action: 'Look at what changed before you save it.',
  };
}
