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
 * The models each company offers, in one place.
 *
 * A catalogue rather than a name buried in each provider, because "which model"
 * is a question somebody asks once a year and gets wrong for months afterwards:
 * a name written into a request is a name nobody finds when it is retired.
 *
 * Each entry says which is the sensible default and what the others are for, in
 * words rather than in parameter counts. Nobody choosing between these knows
 * how many billion anything is.
 */
export const CATALOGUE = {
  claude: {
    default: 'claude-sonnet-4-5-20250929',
    models: [
      { id: 'claude-sonnet-4-5-20250929', name: 'Sonnet 4.5', why: 'The balanced one. Use this unless you have a reason not to.' },
      { id: 'claude-opus-4-1-20250805', name: 'Opus 4.1', why: 'Slower and better at hard problems. Costs more per question.' },
      { id: 'claude-3-5-haiku-20241022', name: 'Haiku 3.5', why: 'Fast and cheap. Good for short questions about a file.' },
    ],
  },
  openai: {
    default: 'gpt-4o',
    models: [
      { id: 'gpt-4o', name: 'GPT-4o', why: 'The balanced one.' },
      { id: 'gpt-4o-mini', name: 'GPT-4o mini', why: 'Fast and cheap.' },
      { id: 'o3-mini', name: 'o3-mini', why: 'Thinks for longer before answering.' },
    ],
  },
  /*
   * Google's own moving names, on purpose.
   *
   * The ones with a number in them are retired for new accounts without being
   * removed from anybody's documentation — `gemini-2.5-flash` answers *this
   * model is no longer available to new users*, and the version that was
   * written down here answered the same. A name that moves is the only kind
   * that does not quietly stop working in six months, and this is a manager
   * somebody installs once.
   */
  gemini: {
    default: 'gemini-flash-latest',
    models: [
      { id: 'gemini-flash-latest', name: 'Gemini Flash', why: 'Free to use, with a limit per minute. Start here.', free: true },
      { id: 'gemini-flash-lite-latest', name: 'Gemini Flash Lite', why: 'Free too, and faster. Good for short questions.', free: true },
      { id: 'gemini-pro-latest', name: 'Gemini Pro', why: 'Better at hard problems. This one is paid.' },
    ],
  },
};

/**
 * Which company will answer without being paid first.
 *
 * The one thing somebody wanting to try this needs to know, and it was nowhere
 * on screen: two of these three want a card before they will say anything, and
 * the third has a free allowance that is plenty for asking about a project.
 * Somebody who pasted a key and got "out of credit" had done everything right
 * and been told nothing useful.
 */
export const FREE_TO_START = 'gemini';
export const isFree = (providerId, modelId) => !!CATALOGUE[providerId]?.models
  ?.find((one) => one.id === modelId)?.free;

/**
 * The companies this can talk to.
 *
 * A shape rather than one hard-coded service, so changing provider is a line
 * here rather than a change to anything anybody looks at. Which of a company's
 * models gets asked is in the catalogue above; this is how to reach it.
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
        const said = whatTheySent(await quiet(() => res.json(), null));
        return {
          ok: false,
          status: res.status,
          why: said?.error?.message ?? null,
          waitFor: howLongToWait(res, said),
        };
      }
      const body = await res.json();
      return {
        ok: true,
        text: (body.content ?? []).map((c) => c.text ?? '').join('').trim(),
        stoppedBecause: body.stop_reason ?? null,
      };
    },
  },

  /**
   * The two other companies with a key you can buy in five minutes.
   *
   * Both take the same shape of request as each other, so they share one `ask`
   * rather than being written out twice. Neither is a recommendation and
   * neither is a fallback: the point of having more than one is that somebody
   * who already pays for one of these does not have to start paying for another
   * to use this at all.
   */
  {
    id: 'openai',
    name: 'ChatGPT',
    keySetting: 'openaiKey',
    where: 'https://platform.openai.com/api-keys',
    model: 'gpt-4o',
    at: 'https://api.openai.com/v1/chat/completions',
    ask: askLikeOpenAi,
  },
  {
    id: 'gemini',
    name: 'Gemini',
    keySetting: 'geminiKey',
    where: 'https://aistudio.google.com/apikey',
    model: 'gemini-2.0-flash',
    at: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    ask: askLikeOpenAi,
  },
];

/**
 * One request shape, used by everything that is not Claude.
 *
 * Both of the others answer the same request, so this is written once. The
 * system message goes as its own turn, which is what that shape calls a system
 * message, and the answer comes out of the same place in both.
 */
async function askLikeOpenAi({ key, system, message, mostTokens = 1600 }) {
  const res = await fetch(this.at, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: this.model,
      max_tokens: mostTokens,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: message },
      ],
    }),
  });
  if (!res.ok) {
    const said = whatTheySent(await quiet(() => res.json(), null));
    return {
      ok: false,
      status: res.status,
      why: said?.error?.message ?? null,
      waitFor: howLongToWait(res, said),
    };
  }

  const body = await res.json();
  return {
    ok: true,
    text: String(body.choices?.[0]?.message?.content ?? '').trim(),
    // Why it stopped. `length` with nothing in it means the whole allowance
    // went on thinking and there was none left to answer with, which is a
    // real answer to give somebody rather than an empty box.
    stoppedBecause: body.choices?.[0]?.finish_reason ?? null,
  };
}

/**
 * The refusal itself, out of whichever shape it arrived in.
 *
 * Google sends a **list holding one object** where the shape it is copying
 * sends the object. Read as the object it is not, the reason inside it is
 * simply not there — so every Gemini refusal arrived with nothing said, and
 * an account out of allowance came back as "asking too fast", which is the
 * opposite advice. One line, and it was invisible from the outside because
 * both are still refusals.
 */
function whatTheySent(said) {
  if (Array.isArray(said)) return said.find((one) => one?.error) ?? said[0] ?? null;
  return said;
}

/**
 * How long they asked you to wait, in seconds, if they said.
 *
 * Two places to look, because they do not agree. The header is the one every
 * company sends; Google also buries one in the body, in a shape of its own,
 * and does not always send the header. Anything longer than five minutes is
 * treated as "they are not telling you anything useful" — nobody is going to
 * sit here for that, and pretending to count it down would be theatre.
 */
function howLongToWait(res, said) {
  const header = Number(res.headers?.get?.('retry-after'));
  if (Number.isFinite(header) && header > 0) return Math.min(header, 300);

  const buried = (said?.error?.details ?? []).find((d) => String(d['@type'] ?? '').includes('RetryInfo'));
  const written = String(buried?.retryDelay ?? '').match(/^([\d.]+)s?$/);
  if (written) {
    const secs = Number(written[1]);
    if (Number.isFinite(secs) && secs > 0) return Math.min(Math.ceil(secs), 300);
  }
  return null;
}

/** One by its name, or nothing. */
export const modelCalled = (id) => MODELS.find((m) => m.id === id) ?? null;

/**
 * Which model is set up here, if any.
 *
 * The chosen one if it has a key. Otherwise whichever does — because somebody
 * who put in one key and never touched the choice meant that key, and refusing
 * to use it on the grounds that a menu says otherwise would be obtuse.
 */
export async function ready() {
  /**
   * Which model, out of the catalogue, honouring what was chosen.
   *
   * A name that is no longer offered falls back to that company's default
   * rather than being sent anyway — a model retired since somebody last opened
   * Settings should not turn every question into an error about an unknown
   * model.
   */
  const withModel = async (m) => {
    const wanted = await settings.get(`model:${m.id}`);
    const offered = CATALOGUE[m.id]?.models ?? [];
    const use = offered.some((one) => one.id === wanted) ? wanted : (CATALOGUE[m.id]?.default ?? m.model);
    return { ...m, model: use };
  };

  const chosen = modelCalled(await settings.get('askWho'));
  if (chosen && await settings.get(chosen.keySetting)) {
    const m = await withModel(chosen);
    return { ok: true, model: m, name: m.name, using: m.model };
  }

  /*
   * Whichever has a key, and the free one first.
   *
   * Somebody who has set up more than one and whose chosen company has run out
   * wants the question answered, not a lecture about which company they picked
   * a fortnight ago. The order here is the order of "will this actually answer"
   * — free allowance before anything that needs topping up.
   */
  const orderly = [...MODELS].sort((a, b) => Number(b.id === FREE_TO_START) - Number(a.id === FREE_TO_START));
  for (const one of orderly) {
    const key = await settings.get(one.keySetting);
    if (key) {
      const m = await withModel(one);
      return { ok: true, model: m, name: m.name, using: m.model, insteadOf: chosen?.name ?? null };
    }
  }

  const want = chosen ?? MODELS[0];

  /*
   * One of several, rather than none at all.
   *
   * Only reachable when the chosen one has no key and neither does any other,
   * because the loop above takes any that does. Kept apart anyway, because the
   * two need different sentences and the difference is exactly what was wrong.
   */
  return {
    ok: false,
    name: want.name,
    where: want.where,
    setting: want.keySetting,
    // Named for what is true: nothing is set up. Saying "no key for Claude"
    // when nothing at all is connected reads as though Claude were the only
    // one there is, and sends somebody to open an account they may not want.
    noneAtAll: true,
    sentence: 'No AI is connected yet, so questions about a project cannot be answered.',
    // Not "there is a box for this somewhere else". Somebody who has just typed
    // a question should not be sent four presses away to be able to ask it.
    action: 'Set one up here — it takes a minute, and the key stays on this computer.',
  };
}

/** Every model, whether each has a key, and which is chosen. Never the keys. */
export async function whoCanBeAsked() {
  const chosen = await settings.get('askWho');
  return {
    chosen: modelCalled(chosen)?.id ?? MODELS[0].id,
    models: await Promise.all(MODELS.map(async (m) => ({
      id: m.id,
      name: m.name,
      where: m.where,
      model: m.model,
      setting: m.keySetting,
      // Whether there is one, never what it is (D-81).
      ready: !!(await settings.get(m.keySetting)),
      // What this company offers, and which of them is in use here.
      models: CATALOGUE[m.id]?.models ?? [],
      using: (await settings.get(`model:${m.id}`)) || CATALOGUE[m.id]?.default || m.model,
    }))),
  };
}

/**
 * Does this key actually work?
 *
 * Asked before it is saved, because a key that is one character short is
 * indistinguishable from a working one until somebody asks a question and gets
 * a refusal they cannot interpret. One tiny request, and the answer is a
 * sentence rather than a status code.
 *
 * **The key is never written anywhere by this function.** It is used once, in
 * memory, and the caller decides whether to keep it.
 */
export async function checkKey(providerId, key) {
  const m = modelCalled(providerId);
  if (!m) return { ok: false, sentence: 'That is not one this can ask.', action: null };
  if (!String(key ?? '').trim()) {
    return { ok: false, sentence: 'No key was typed.', action: 'Paste the key and try again.' };
  }

  const out = await quiet(() => m.ask.call(
    { ...m, model: CATALOGUE[m.id]?.default ?? m.model },
    { key: String(key).trim(), system: 'Reply with the single word: ok', message: 'ok', mostTokens: 8 },
  ));

  if (!out) {
    return {
      ok: false,
      kind: TROUBLE.networkError,
      sentence: `${m.name} could not be reached to check that key.`,
      action: 'Check you are online, and try again.',
    };
  }

  if (!out.ok) {
    const meant = whatThatMeant({ ...m, model: m }, out);

    /*
     * Being told to slow down, or being out of allowance, means the key worked.
     *
     * Nothing counts a request it did not recognise. A key that is wrong is
     * refused before anybody's allowance is looked at — so a limit, of either
     * kind, is proof the key was accepted. Refusing to keep it on those grounds
     * is what made a good Gemini key impossible to add at all: the check ran,
     * hit the free allowance, and reported it as a key that would not work.
     */
    if (meant.kind === TROUBLE.rateLimited || meant.kind === TROUBLE.quotaExceeded) {
      return {
        ok: true,
        name: m.name,
        limited: true,
        kind: meant.kind,
        sentence: `That key works — ${m.name} accepted it.`,
        action: meant.kind === TROUBLE.rateLimited
          ? `${m.name} is limiting how often it answers just now, which is why the check could not finish. The key is kept.`
          : `${m.name} says there is no allowance left on that account. The key is kept and will work when there is.`,
      };
    }

    return meant;
  }

  return { ok: true, sentence: `That key works. ${m.name} is ready.`, name: m.name };
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
/**
 * The files worth reading about any project, in the order they answer things.
 *
 * The ones that say what a project *is* come first, and they were missing
 * entirely. Asked "what is this project about", the search below matched the
 * words `project` and `about` against every file in the folder and answered
 * out of whichever deeply nested one happened to mention them — a correct
 * description of one file, presented as a description of the whole thing.
 *
 * A README is a person explaining their own project. Nothing else here comes
 * close, and it should have been first from the start.
 */
const WORTH_READING = [
  'README.md', 'README', 'readme.md', 'ARCHITECTURE.md', 'CONTRIBUTING.md',
  'docs/README.md', 'docs/index.md', 'docs/architecture.md',
  'package.json', 'tsconfig.json', 'vite.config.js', 'vite.config.ts',
  'next.config.js', 'next.config.mjs', 'astro.config.mjs', 'svelte.config.js',
  'nuxt.config.ts', 'vercel.json', 'netlify.toml', 'Dockerfile',
  '.env.example', 'requirements.txt', 'pyproject.toml', 'Cargo.toml',
];

/**
 * Is this somebody asking what the whole thing is?
 *
 * A different question from every other one asked here, and it needs the
 * opposite retrieval: the files that describe the project rather than the files
 * that mention the words in the question. Searching for `project` and `about`
 * across a folder finds nothing useful and anchors the answer on whatever it
 * happened to hit.
 */
const ABOUT_THE_WHOLE_THING = /^\s*(what|what's|whats|tell me|explain|describe|give me)\b[^?]{0,60}\b(this|the)?\s*(project|repo|app|application|codebase|thing|it)\b|^\s*(overview|summary|what is it)\b/i;

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

  /*
   * Waiting out a short queue, at most twice, and never for long.
   *
   * A rate limit that clears in four seconds is not worth reporting to
   * somebody, and a manager that reports it has made them press a button to do
   * what it could have done itself. A rate limit that clears in three minutes
   * is worth reporting, because nobody is sitting there for three minutes.
   *
   * Twice, bounded, and only ever after being told to wait — never a loop
   * that decides for itself how often to try. Retrying hard against something
   * that has asked you to stop is how an account gets cut off entirely.
   */
  const MOST_TRIES = 3;
  const LONGEST_WORTH_WAITING = 15;
  let waited = 0;
  let last = null;

  for (let tries = 0; tries < MOST_TRIES; tries += 1) {
    const out = await quiet(() => set.model.ask({ key, system, message, mostTokens }));

    if (!out) {
      return {
        ok: false,
        kind: TROUBLE.networkError,
        provider: set.model.id,
        sentence: `${set.name} could not be reached.`,
        action: 'Check you are online, then try again.',
      };
    }
    if (out.ok && out.text) {
      return {
        ok: true,
        text: out.text,
        model: set.name,
        using: set.using ?? null,
        waited: waited || null,
      };
    }

    /*
     * It answered, and said nothing.
     *
     * The newer models think before they speak, and the thinking comes out of
     * the same allowance as the answer. Ask for a short reply and the whole
     * allowance can go on thinking, leaving a reply with a `length` on it and
     * no words in it. Rendered as success that is an empty box, which is worse
     * than a refusal because there is nothing to act on.
     */
    if (out.ok) {
      return {
        ok: false,
        kind: TROUBLE.unknown,
        provider: set.model.id,
        emptyAnswer: true,
        sentence: `${set.name} answered without saying anything.`,
        action: out.stoppedBecause === 'length'
          ? 'It used the whole reply thinking and had none left to answer with. Ask something smaller, or pick a different model for it.'
          : 'Ask again — this usually passes.',
      };
    }

    last = whatThatMeant(set, out);
    if (last.kind !== TROUBLE.rateLimited) return last;

    const askedFor = last.waitFor ?? 5;
    if (askedFor > LONGEST_WORTH_WAITING || tries === MOST_TRIES - 1) break;

    await new Promise((r) => setTimeout(r, askedFor * 1000));
    waited += askedFor;
  }

  /*
   * The chosen company cannot answer, and another one here can.
   *
   * Only for the two refusals that are about the company rather than about the
   * question: an account with nothing left on it, and a company having trouble.
   * A bad key is not one of these — quietly asking somebody else would hide
   * the thing that needs fixing — and neither is a queue, which passes.
   *
   * It says which one answered, in the answer. Being charged by a company you
   * did not pick is a surprise nobody should get from a manager, and the way to
   * avoid that is to say so, not to refuse to be useful.
   */
  const worthAnotherOne = last?.kind === TROUBLE.quotaExceeded
    || last?.kind === TROUBLE.providerUnavailable;

  if (worthAnotherOne) {
    for (const other of MODELS) {
      if (other.id === set.model.id) continue;
      const theirKey = await settings.get(other.keySetting);
      if (!theirKey) continue;

      const withTheirs = {
        ...other,
        model: CATALOGUE[other.id]?.default ?? other.model,
      };
      const out = await quiet(() => withTheirs.ask.call(
        withTheirs, { key: theirKey, system, message, mostTokens },
      ));

      if (out?.ok && out.text) {
        return {
          ok: true,
          text: out.text,
          model: other.name,
          using: withTheirs.model,
          insteadOf: set.name,
          becauseOf: last.sentence,
        };
      }
    }
  }

  // Waited what it asked for and it is still saying no, so it goes to the
  // person — with the question kept, which is the whole point.
  return { ...last, waited: waited || null, triedFor: waited || null };
}

/**
 * A refusal, said as the thing that actually happened.
 *
 * "Nothing tracks whether your accounts are running low" was written down as a
 * gap, and the tempting fix is to *guess* — count questions, estimate what they
 * cost, put a bar on a page. That would be a number this manager made up about
 * somebody's money, and it would be wrong within a week of any price changing.
 *
 * What can be said honestly is what the company itself said, at the moment it
 * said it. There is no polling and nothing is kept: a refusal for want of
 * credit reads as a refusal for want of credit, rather than as "could not
 * answer", which is the sentence that sends somebody looking at their network.
 */
export const TROUBLE = {
  authInvalid: 'AUTH_INVALID',
  rateLimited: 'RATE_LIMITED',
  quotaExceeded: 'QUOTA_EXCEEDED',
  modelUnavailable: 'MODEL_UNAVAILABLE',
  providerUnavailable: 'PROVIDER_UNAVAILABLE',
  networkError: 'NETWORK_ERROR',
  unknown: 'UNKNOWN',
};

export function whatThatMeant(set, out) {
  const why = String(out.why ?? '');
  const name = set.name;
  const waitFor = out.waitFor ?? null;

  /**
   * The words decide, and they decide before the number does.
   *
   * Being out of credit comes back as 400 at one of them, 429 at another and
   * **403 at a third** — the same 403 a rejected key gets. Read by status
   * first, a maxed-out card was reported as a bad key, and the advice was to go
   * and find a new one: the wrong errand entirely, and the person would come
   * back with a fresh key and the same refusal.
   *
   * So what they said outranks what they returned, everywhere below.
   */
  /*
   * Money, or a queue. Both of them say "quota" and they need opposite things.
   *
   * This used to read the word `quota` as being about money, and for one of
   * these three companies that is wrong nearly every time. Google's message
   * for a free allowance of so many questions a minute — which refills on its
   * own, in seconds — is *Quota exceeded for quota metric*. Read as money,
   * somebody with a working key and nothing wrong with their account is told to
   * go and top it up, which does not help and costs them their afternoon. It is
   * exactly what was happening to Gemini, on the first question after a key was
   * added.
   *
   * So money is decided by the words that are only ever about money — credit,
   * balance, billing, a plan — and everything else at 429 is a queue.
   */
  const aboutMoney = /credit|balance|billing|insufficient_quota|plan and billing|hard[_ ]limit/i.test(why);

  if (aboutMoney) {
    return {
      ok: false,
      kind: TROUBLE.quotaExceeded,
      runningLow: true,
      provider: set.model?.id ?? set.id ?? null,
      sentence: `Your ${name} account has run out of credit.`,
      action: `Top it up with ${name}, and this will work again straight away. Nothing on this computer has changed, and your key is fine.`,
    };
  }

  if (out.status === 401 || out.status === 403) {
    return {
      ok: false,
      kind: TROUBLE.authInvalid,
      provider: set.model?.id ?? set.id ?? null,
      sentence: `${name} would not accept the key on this computer.`,
      // Where the key goes is on the screen that says this, so it says "here"
      // rather than naming somewhere else to go and look.
      action: 'Check you pasted the whole of a current key, and try again.',
    };
  }

  if (out.status === 429) {
    return {
      ok: false,
      kind: TROUBLE.rateLimited,
      tooFast: true,
      provider: set.model?.id ?? set.id ?? null,
      waitFor,
      sentence: `${name} is limiting how often it will answer.`,
      action: waitFor
        ? `It asked for ${waitFor} second${waitFor === 1 ? '' : 's'}. Your question is still here.`
        : 'Wait a minute and ask again. Your question is still here, and your key is fine.',
    };
  }

  if (out.status === 404 || /model|not found|does not exist|unsupported/i.test(why)) {
    return {
      ok: false,
      kind: TROUBLE.modelUnavailable,
      provider: set.model?.id ?? set.id ?? null,
      sentence: `${name} does not offer the model this is set to use.`,
      action: 'Pick another model for it, and ask again.',
    };
  }

  if (out.status >= 500) {
    return {
      ok: false,
      kind: TROUBLE.providerUnavailable,
      provider: set.model?.id ?? set.id ?? null,
      sentence: `${name} is having trouble at their end.`,
      action: 'Nothing here is wrong. Try again in a few minutes.',
    };
  }

  return {
    ok: false,
    kind: TROUBLE.unknown,
    provider: set.model?.id ?? set.id ?? null,
    sentence: `${name} could not answer.`,
    action: why || 'Try again in a moment.',
  };
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
  const broad = ABOUT_THE_WHOLE_THING.test(String(question));

  // A broad question is answered from what describes the project. A targeted
  // one is answered from the files that mention what was asked about. Doing
  // the second for the first is what produced a careful explanation of one
  // deeply nested file in answer to "what is this project about".
  const found = broad ? [] : await lookInside(dir, question);

  const shape = broad
    ? [
      '',
      'This is a broad question about the whole project. Answer it in this order,',
      'in plain language a person could follow without knowing the codebase:',
      '  1. what it is, in one sentence',
      '  2. what it does for whoever uses it',
      '  3. what it is built with',
      '  4. roughly how it fits together',
      'Do not lead with one file. Do not list files unless they matter to the',
      'shape of the answer. If what you were given does not say enough to answer,',
      'say which part is missing in one short line at the end and nothing more.',
    ].join('\n')
    : '';

  return askModel({
    system: VOICE,
    mostTokens: broad ? 1300 : 1000,
    message: [
      `Question about this project: ${question}`,
      shape,
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

/**
 * Ask for a change, and get it back as something to approve.
 *
 * The model is asked for whole files rather than for a patch. A patch has to
 * apply cleanly against text it was not shown all of, and when it does not the
 * failure is a half-edited file — which is the worst outcome available here.
 * A whole file either replaces the old one or does not.
 *
 * What comes back is *read* into a proposal and never executed. If it is not
 * the shape asked for, that is a refusal rather than a best effort: guessing at
 * a malformed answer is how something writes a file nobody meant.
 */
export async function proposeChange({ dir, wanted }) {
  const context = await contextFor(dir);
  const only = (context.files ?? []).map((f) => f.name);

  const out = await askModel({
    mostTokens: 4000,
    system: [
      VOICE,
      'You are being asked for a change to this project.',
      'Answer with JSON and nothing else — no explanation outside it, no code fences.',
      'Shape: {"what":"one sentence saying what this does","files":[{"path":"relative/path","becomes":"the entire new contents of that file"}]}',
      'Give the COMPLETE new contents of each file, not a fragment and not a patch.',
      'Change as few files as possible. Never touch a file you were not shown unless creating it.',
      'If you cannot do it safely from what you were given, answer {"what":"...","files":[]} saying why.',
    ].join(' '),
    message: [
      `Wanted: ${wanted}`,
      '',
      asPrompt(context),
      '',
      only.length ? `Files you have been shown in full: ${only.join(', ')}` : '',
    ].join('\n'),
  });

  if (!out.ok) return out;

  const said = readJson(out.text);
  if (!said || !Array.isArray(said.files)) {
    return {
      ok: false,
      sentence: 'The answer did not come back in a shape that can be applied, so nothing was changed.',
      action: 'Ask again, or ask it to explain instead.',
    };
  }

  const changes = said.files
    .filter((f) => typeof f?.path === 'string' && typeof f?.becomes === 'string')
    .map((f) => ({ path: f.path.replace(/^[./\\]+/, ''), becomes: f.becomes }));

  if (!changes.length) {
    return {
      ok: true,
      nothingToDo: true,
      sentence: said.what || 'It did not find a change it could make safely.',
      action: 'Try describing what you want differently.',
      model: out.model,
    };
  }

  // What each file is now, so the page can show the difference rather than
  // only the result — approving a change you cannot see is not approving it.
  for (const c of changes) {
    const at = join(resolve(dir), c.path);
    c.was = existsSync(at) ? await quiet(() => readFile(at, 'utf8'), null) : null;
  }

  const one = await propose({ dir, what: said.what || wanted, changes });
  return { ok: true, proposal: one, model: out.model };
}

/**
 * JSON out of an answer, whether or not it arrived on its own.
 *
 * Models put fences round things. Reading past them is worth four lines;
 * refusing the whole answer because of punctuation is not.
 */
function readJson(text) {
  const raw = String(text ?? '').trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(raw.slice(start, end + 1)); } catch { return null; }
}

/**
 * Reachable from a test, because reading somebody else's answer is where a
 * mistake turns into a written file. Nothing in the app calls this directly.
 */
export const __testOnly = { readJson };

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

// ---------------------------------------------------------------------------
// Two computers, and why one of them will not build
// ---------------------------------------------------------------------------

/**
 * Why does this work here and not there?
 *
 * The question everybody has actually asked out loud, answered from facts
 * rather than from guessing: two lists of versions, two package managers, two
 * sets of setting *names*. `machines.mjs` gathers them and decides what a model
 * may be told; this asks the question.
 *
 * **No secret value can reach this**, and not because the prompt is careful —
 * because the comparison it is given has never held one. The only environment
 * facts in it are names and counts, and the file with real values in it is
 * never opened anywhere in this product (D-125).
 */
export async function whyDifferent({ mine, theirs, comparison, what = null }) {
  const machines = await import('./machines.mjs');
  const side = machines.forAModel(mine, theirs, comparison);

  return askModel({
    system: [
      VOICE,
      'You are comparing two developer machines to explain a difference in behaviour.',
      'Name the most likely cause first, then the evidence for it from the list given.',
      'If the list does not contain enough to be sure, say which fact would settle it.',
      'Environment settings are given by name only. Never ask for their values.',
    ].join(' '),
    mostTokens: 900,
    message: withoutSecrets([
      what ? `What is happening: ${what}` : 'Something works on machine A and not on machine B.',
      '',
      side,
    ].join('\n')),
  });
}

/**
 * Is this build likely to work over there?
 *
 * Asked before starting something that takes twenty minutes on somebody else's
 * computer. It answers from the same two lists, and it answers with a
 * recommendation rather than an instruction — **nothing here may start
 * anything.** A model saying "this will work on RTX-PC" is a sentence on a
 * screen next to a button a person presses.
 */
export async function likelyToBuildThere({ mine, theirs, comparison, project = null }) {
  const machines = await import('./machines.mjs');

  return askModel({
    system: [
      VOICE,
      'You are judging whether a build that works on machine A would work on machine B.',
      'Answer with: likely, unlikely, or cannot tell — then why, in one short paragraph.',
      'Base it only on the differences listed. Do not invent versions or settings.',
      'You are not able to run anything. Do not write instructions as though you were.',
    ].join(' '),
    mostTokens: 600,
    message: withoutSecrets([
      project ? `Project: ${project}` : '',
      machines.forAModel(mine, theirs, comparison),
    ].filter(Boolean).join('\n')),
  });
}

/**
 * Why did that fail over there?
 *
 * The same explanation `explainFailure` gives, with the difference between the
 * two machines added — because on a remote build the difference between the
 * machines *is* usually the answer, and without it a model is looking at a log
 * from a computer it knows nothing about.
 */
export async function whyItFailedThere({ what, lines = [], mine, theirs, comparison }) {
  const machines = await import('./machines.mjs');
  const tail = lines.slice(-60).join('\n');

  return askModel({
    system: [
      VOICE,
      'A build or run failed on a different machine from the one it works on.',
      'Say the likely cause, the evidence in the output, and one thing to try.',
      'The two machines differ as listed. Consider that first before anything else.',
    ].join(' '),
    mostTokens: 900,
    message: withoutSecrets([
      `What was being done: ${what}`,
      '',
      'The two machines:',
      machines.forAModel(mine, theirs, comparison),
      '',
      'What it said, at the end:',
      tail,
    ].join('\n')),
  });
}
