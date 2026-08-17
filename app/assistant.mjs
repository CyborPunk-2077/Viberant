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
    default: 'claude-sonnet-5',
    models: [
      { id: 'claude-sonnet-5', name: 'Sonnet 5', why: 'The balanced one. Use this unless you have a reason not to.' },
      { id: 'claude-opus-5', name: 'Opus 5', why: 'Slower and better at hard problems. Costs more per question.' },
      { id: 'claude-haiku-4-5-20251001', name: 'Haiku 4.5', why: 'Fast and cheap. Good for short questions about a file.' },
    ],
  },
  openai: {
    default: 'gpt-5-mini',
    models: [
      { id: 'gpt-5-mini', name: 'GPT-5 mini', why: 'The balanced one. Fast, and cheap enough to ask freely.' },
      { id: 'gpt-5', name: 'GPT-5', why: 'Better at hard problems. Costs more per question.' },
      { id: 'gpt-4.1-mini', name: 'GPT-4.1 mini', why: 'The older cheap one, if something needs it.' },
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
    apiIs: 'the Anthropic API account at console.anthropic.com',
    subscriptionIs: 'a Claude subscription',
    keySetting: 'anthropicKey',
    where: 'https://console.anthropic.com/settings/keys',
    topUp: 'https://console.anthropic.com/settings/billing',
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
      if (!res.ok) return theirRefusal(res, whatTheySent(await quiet(() => res.json(), null)));
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
  /**
   * **Named for what is being bought, which is not what most people picture.**
   *
   * This said `ChatGPT`, and the refusal that followed said *your ChatGPT
   * account has run out of credit* to somebody who pays for ChatGPT every
   * month and whose subscription was fine. They are two accounts at one
   * company: a subscription buys the website and the phone app, and an API key
   * is billed separately, per question, out of a balance the subscription
   * never touches. Telling somebody the wrong one is empty is worse than
   * telling them nothing — they go and check the thing that was never the
   * problem. `apiIs` is the words for the one that is.
   */
  {
    id: 'openai',
    name: 'OpenAI',
    apiIs: 'the OpenAI API account at platform.openai.com',
    subscriptionIs: 'a ChatGPT subscription',
    keySetting: 'openaiKey',
    where: 'https://platform.openai.com/api-keys',
    topUp: 'https://platform.openai.com/settings/organization/billing',
    model: 'gpt-4o',
    at: 'https://api.openai.com/v1/chat/completions',
    // The modern name for the same thing. `max_tokens` is the old one, and the
    // models this company has added since are refusing it outright.
    budgetField: 'max_completion_tokens',
    ask: askLikeOpenAi,
  },
  {
    id: 'gemini',
    name: 'Gemini',
    apiIs: 'the Google AI Studio key on this computer',
    subscriptionIs: 'a Gemini subscription',
    keySetting: 'geminiKey',
    where: 'https://aistudio.google.com/apikey',
    topUp: 'https://aistudio.google.com/apikey',
    model: 'gemini-flash-latest',
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
      [this.budgetField ?? 'max_tokens']: mostTokens,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: message },
      ],
    }),
  });
  if (!res.ok) return theirRefusal(res, whatTheySent(await quiet(() => res.json(), null)));

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
 * A refusal, kept whole: what they returned, what they called it, what they said.
 *
 * **The name they gave it is the part that was being thrown away**, and it is
 * the only part that does not move. A message is prose — it is rewritten,
 * translated, and appended to — so reading one with a regular expression is a
 * rule with an expiry date nobody is told about. `code` and `type` are the
 * same two strings this year as last, and they say precisely what a paragraph
 * of English only implies. Measured against all three companies: an empty
 * balance and a rejected key can arrive on the same status, with messages that
 * share four of their words, and different codes every time.
 */
function theirRefusal(res, said) {
  return {
    ok: false,
    status: res.status,
    // Never the message alone. All three of these are safe to show — they name
    // a fault, never an account and never a key.
    code: said?.error?.code ?? said?.error?.status ?? null,
    type: said?.error?.type ?? null,
    why: said?.error?.message ?? null,
    waitFor: howLongToWait(res, said),
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

/** Only model families belonging to the three supported providers. */
export function modelBelongsToProvider(providerId, modelId) {
  const id = String(modelId ?? '');
  return providerId === 'claude' ? /^claude-[a-z0-9.-]+$/i.test(id)
    : providerId === 'openai' ? /^(gpt-|chatgpt-|o[1-9])[a-z0-9.-]*$/i.test(id)
      : providerId === 'gemini' ? /^gemini-[a-z0-9.-]+$/i.test(id)
        : false;
}

/**
 * The catalogue endpoints also return image, speech, search and embedding
 * models. They may belong to the same company, but this assistant sends a text
 * conversation request, so offering one here would only turn a selection into
 * a predictable refusal. Google's response tells us the supported operation;
 * the other two use conservative family exclusions where no capability field
 * is published.
 */
export function modelCanAnswer(providerId, modelId, record = null) {
  const id = String(modelId ?? '');
  if (!modelBelongsToProvider(providerId, id)) return false;
  if (providerId === 'gemini') {
    const methods = record?.supportedGenerationMethods;
    if (Array.isArray(methods) && !methods.includes('generateContent')) return false;
  }
  return !/(?:image|audio|realtime|transcrib|speech|tts|search|embed|moderation|instruct|codex|computer-use)/i.test(id);
}

export const modelIsKnown = (providerId, modelId) => !!CATALOGUE[providerId]?.models
  ?.some((one) => one.id === modelId);

async function chosenModel(m) {
  const wanted = await settings.get(`model:${m.id}`);
  const verified = await settings.get(`verifiedModel:${m.id}`);
  const allowed = modelIsKnown(m.id, wanted) || (wanted && wanted === verified && modelCanAnswer(m.id, wanted));
  return allowed ? wanted : (CATALOGUE[m.id]?.default ?? m.model);
}

/** One company, named for one question, in the shape `ready` answers in. */
async function onlyThisOne(providerId) {
  const m = modelCalled(providerId);
  if (!m) return { ok: false, sentence: 'That is not one this can ask.', action: null };

  const key = await settings.get(m.keySetting);
  if (!key) {
    return {
      ok: false,
      name: m.name,
      where: m.where,
      setting: m.keySetting,
      sentence: `There is no ${m.name} key on this computer.`,
      action: 'Add one, and this can ask them.',
    };
  }

  const use = await chosenModel(m);
  return { ok: true, model: { ...m, model: use }, name: m.name, using: use };
}

/**
 * Which of a company's models this particular account is actually offered.
 *
 * **A catalogue is what somebody wrote down; this is what is true.** A model
 * retired since a version of this manager was built is a name that turns every
 * question into a refusal about an unknown model, and there is no way to find
 * that out by reading the source \u2014 it depends on the account, not on the code.
 * Two of the three companies will simply say, for the price of one request.
 *
 * It answers with the catalogue marked up rather than with everything the
 * account has: a hundred and eighteen names is not a menu, and most of them
 * are for things this does not do. Nothing here is remembered and nothing is
 * chosen automatically \u2014 it reports, and a person decides.
 */
export async function whatTheyOffer(providerId) {
  const m = modelCalled(providerId);
  if (!m) return { ok: false, sentence: 'That is not one this can ask.', action: null };

  const key = await settings.get(m.keySetting);
  if (!key) {
    return { ok: false, sentence: `No key for ${m.name} on this computer.`, action: 'Add one first.' };
  }

  const offered = CATALOGUE[m.id]?.models ?? [];

  /*
   * Only the two that publish a list. Anthropic's needs the same key and the
   * same version header as everything else; Google's list is under a different
   * shape entirely and is not worth a third code path for a menu of three.
   */
  const at = m.id === 'openai' ? 'https://api.openai.com/v1/models'
    : m.id === 'claude' ? 'https://api.anthropic.com/v1/models?limit=200'
      : `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`;

  const res = await quiet(() => fetch(at, {
    headers: m.id === 'openai'
      ? { authorization: `Bearer ${key}` }
      : m.id === 'claude' ? { 'x-api-key': key, 'anthropic-version': '2023-06-01' } : {},
  }));

  if (!res) {
    return { ok: false, kind: TROUBLE.networkError,
      sentence: `${m.name} could not be reached.`, action: 'Check you are online, and try again.' };
  }
  if (!res.ok) return whatThatMeant(m, theirRefusal(res, whatTheySent(await quiet(() => res.json(), null))));

  const body = await quiet(() => res.json(), null);
  const records = m.id === 'gemini' ? (body?.models ?? []) : (body?.data ?? []);
  const ids = records.map((one) => m.id === 'gemini'
    ? String(one.name ?? '').replace(/^models\//, '')
    : String(one.id));
  const have = new Set(ids.filter((id, index) => modelCanAnswer(m.id, id, records[index])));
  const known = new Map(offered.map((one) => [one.id, one]));
  const models = [...have].map((id) => ({
    id,
    name: known.get(id)?.name ?? id,
    why: known.get(id)?.why ?? 'Available to this connected API account.',
    free: known.get(id)?.free === true,
    offered: true,
  })).sort((a, b) => Number(b.id === CATALOGUE[m.id]?.default) - Number(a.id === CATALOGUE[m.id]?.default)
    || a.name.localeCompare(b.name));
  const missing = models.filter((one) => one.offered === false);

  return {
    ok: true,
    models,
    // Said plainly, because the only reason to look at this is to find out
    // whether the thing that is set is a thing that exists.
    sentence: missing.length
      ? `${missing.length} of these ${missing.length === 1 ? 'is' : 'are'} not offered to this account.`
      : `${have.size} compatible ${have.size === 1 ? 'model is' : 'models are'} offered to this API account.`,
    action: missing.length ? 'Pick one of the others.' : null,
  };
}

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
    const use = await chosenModel(m);
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
    models: await Promise.all(MODELS.map(async (m) => {
      const using = await chosenModel(m);
      const known = CATALOGUE[m.id]?.models ?? [];
      return {
        id: m.id,
        name: m.name,
        where: m.where,
        model: m.model,
        setting: m.keySetting,
        // Whether there is one, never what it is (D-81).
        ready: !!(await settings.get(m.keySetting)),
        models: known.some((one) => one.id === using) || !modelCanAnswer(m.id, using)
          ? known
          : [{ id: using, name: using, why: 'Selected from this API account.' }, ...known],
        using,
      };
    })),
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
    const limited = [TROUBLE.rateLimited, TROUBLE.billingRequired, TROUBLE.spendLimit];
    if (limited.includes(meant.kind)) {
      return {
        ok: true,
        name: m.name,
        limited: true,
        kind: meant.kind,
        sentence: `That key works — ${m.name} accepted it.`,
        action: meant.kind === TROUBLE.rateLimited
          ? `${m.name} is limiting how often it answers just now, which is why the check could not finish. The key is kept.`
          : `${meant.sentence} The key is kept and will work as soon as that is dealt with.`,
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

/**
 * Ask, once, of whoever is set up — or of one company named for this question.
 *
 * `justThisOnce` is the button that says *ask the other one instead*. It does
 * not change which company is chosen: being switched to a company you did not
 * pick, and finding out when the bill arrives, is exactly what choosing one is
 * there to prevent. One question goes elsewhere and the setting is untouched.
 */
async function askModel({ system, message, mostTokens, justThisOnce = null }) {
  const set = justThisOnce ? await onlyThisOne(justThisOnce) : await ready();
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

    /*
     * The company, not the wrapper `ready` puts around it.
     *
     * `ready` answers `{ ok, model, name, using }`, and this passed that whole
     * object where the company was wanted \u2014 so every sentence that reaches for
     * something only the company knows found nothing. The words about which of
     * two accounts is empty are exactly those words, so the refusal that was
     * rewritten to name the right account went back to naming neither.
     */
    last = whatThatMeant(set.model, out);

    // Anything that is not a queue is final for this company. It leaves the
    // loop rather than the function, because another company may still answer.
    if (last.kind !== TROUBLE.rateLimited) break;

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
  const worthAnotherOne = [
    TROUBLE.billingRequired, TROUBLE.spendLimit, TROUBLE.providerUnavailable,
  ].includes(last?.kind);

  /**
   * **This was unreachable, and had been since the day it was written.**
   *
   * The loop above returned on anything that was not a queue, so the only way
   * in was a rate limit longer than the wait budget \u2014 which is the one refusal
   * this deliberately does not switch for. An empty balance, the case it exists
   * for, went straight past it to the person. It looked correct in the source
   * and had never once run.
   */
  if (worthAnotherOne) {
    for (const other of MODELS) {
      if (other.id === set.model.id) continue;
      const theirKey = await settings.get(other.keySetting);
      if (!theirKey) continue;

      const withTheirs = { ...other, model: CATALOGUE[other.id]?.default ?? other.model };
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

  /*
   * Nobody switched, and somebody else could be asked by hand.
   *
   * The refusals this will not switch for on its own are the ones where
   * switching would hide something that needs fixing \u2014 a key that is wrong
   * stays wrong however many other companies answer. So it is offered rather
   * than done, named, and the question is still in the box.
   */
  const others = [];
  for (const other of MODELS) {
    if (other.id === set.model.id) continue;
    if (await settings.get(other.keySetting)) others.push({ id: other.id, name: other.name });
  }

  // Waited what it asked for and it is still saying no, so it goes to the
  // person — with the question kept, which is the whole point.
  return {
    ...last,
    waited: waited || null,
    triedFor: waited || null,
    couldAlsoAsk: others.length ? others : null,
  };
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
  billingRequired: 'BILLING_REQUIRED',
  spendLimit: 'SPEND_LIMIT',
  rateLimited: 'RATE_LIMITED',
  modelUnavailable: 'MODEL_UNAVAILABLE',
  askedWrong: 'INVALID_REQUEST',
  providerUnavailable: 'PROVIDER_UNAVAILABLE',
  networkError: 'NETWORK_ERROR',
  unknown: 'UNKNOWN',
};

/**
 * What each company calls each fault, as the two strings they actually send.
 *
 * `code` is asked first and `type` second, because at one of them a rejected
 * key arrives as `type: invalid_request_error, code: invalid_api_key` \u2014 read
 * by type it is a badly written request, read by code it is the truth. The more
 * specific of the two names wins, always.
 *
 * Everything here was seen, not guessed. Where a line is from documentation
 * rather than from a request this project actually made, it says so.
 */
const CALLED_IT = {
  // Seen: an empty balance at OpenAI, on 429.
  credit_balance_exhausted: TROUBLE.billingRequired,
  insufficient_quota: TROUBLE.billingRequired,
  // Documented: an account that has never been set up to pay.
  billing_not_active: TROUBLE.billingRequired,
  // A ceiling somebody set themselves, which is a different errand from an
  // empty balance: nothing needs buying, a number needs raising.
  billing_hard_limit_reached: TROUBLE.spendLimit,

  // Seen: a made-up key at OpenAI (401) and at Anthropic (401).
  invalid_api_key: TROUBLE.authInvalid,
  authentication_error: TROUBLE.authInvalid,
  invalid_authentication: TROUBLE.authInvalid,
  permission_error: TROUBLE.authInvalid,

  rate_limit_exceeded: TROUBLE.rateLimited,
  rate_limit_error: TROUBLE.rateLimited,
  // Google's word for a free allowance that refills by itself, in seconds.
  RESOURCE_EXHAUSTED: TROUBLE.rateLimited,

  model_not_found: TROUBLE.modelUnavailable,
  not_found_error: TROUBLE.modelUnavailable,

  invalid_request_error: TROUBLE.askedWrong,
  INVALID_ARGUMENT: TROUBLE.askedWrong,

  overloaded_error: TROUBLE.providerUnavailable,
  api_error: TROUBLE.providerUnavailable,
  server_error: TROUBLE.providerUnavailable,
  UNAVAILABLE: TROUBLE.providerUnavailable,
};

/**
 * Money, or a queue. Both of them say "quota" and they need opposite things.
 *
 * Only reached when neither of the two names came back. The words that decide
 * are the ones that are only ever about money \u2014 not the word *quota*, which
 * at one of these three is how a free allowance of so many questions a minute
 * is described. Read as money, somebody whose key was fine and whose allowance
 * refills in thirty seconds was sent off to top up an account with nothing
 * wrong with it.
 */
const aboutMoney = (why) => /credit balance|no credits|out of credit|insufficient_quota|plan and billing|billing details|purchase credit/i.test(why);

/**
 * A refusal, said as the thing that actually happened.
 *
 * Three questions in this order, and the order is the whole design:
 *
 *   **what did they call it** \u2014 a code, which does not move;
 *   **what did they say** \u2014 words, which do;
 *   **what did they return** \u2014 a status, which several faults share.
 *
 * It used to ask them the other way round, and the cost of that is on the
 * record twice. An empty balance comes back as 400 at one company, 429 at
 * another and 403 at a third \u2014 the same 403 a rejected key gets \u2014 so status
 * first reported a maxed-out card as a bad key and sent somebody to fetch a new
 * one. Then words-first read Google's *Quota exceeded for quota metric*, which
 * is a queue, as a bill.
 *
 * Nothing here counts anything or estimates anything. There is no meter: a
 * number this manager invented about somebody's money would be wrong within a
 * week of any price changing.
 */
/** A sentence starts with a capital, wherever the words in it came from. */
const capital = (line) => String(line).charAt(0).toUpperCase() + String(line).slice(1);

export function whatThatMeant(set, out) {
  const why = String(out.why ?? '');
  const name = set.name;
  const waitFor = out.waitFor ?? null;

  // What is safe to show a person and safe to keep: never a key, never an
  // account, never a header. A company, a model, a status and their own word
  // for the fault.
  const facts = {
    provider: set.id ?? set.model?.id ?? null,
    providerName: name,
    model: set.model?.model ?? set.model ?? null,
    status: out.status ?? null,
    code: out.code ?? null,
    type: out.type ?? null,
  };

  const named = CALLED_IT[out.code] ?? CALLED_IT[out.type] ?? null;

  const kind = named
    ?? (aboutMoney(why) ? TROUBLE.billingRequired : null)
    ?? (out.status === 401 || out.status === 403 ? TROUBLE.authInvalid : null)
    ?? (out.status === 429 ? TROUBLE.rateLimited : null)
    ?? (out.status === 404 || /model|does not exist|not found/i.test(why)
      ? TROUBLE.modelUnavailable : null)
    ?? (out.status >= 500 ? TROUBLE.providerUnavailable : null)
    ?? TROUBLE.unknown;

  /**
   * The one sentence this whole rewrite exists for.
   *
   * A subscription and an API key are two accounts at one company, and only one
   * of them is ever empty here. Somebody who pays every month and is told
   * *your account has run out of credit* goes and looks at the subscription,
   * finds it perfectly healthy, and has learnt nothing except that this manager
   * cannot be trusted about their money.
   */
  if (kind === TROUBLE.billingRequired) {
    return {
      ...facts,
      ok: false,
      kind,
      runningLow: true,
      sentence: capital(`${set.apiIs ?? `the ${name} key on this computer`} has no credit left.`),
      action: `Add credit there and this works again straight away. ${set.subscriptionIs
        ? `This is not ${set.subscriptionIs} \u2014 they are billed separately, and paying for one does not put credit on the other. `
        : ''}Your key is fine and nothing on this computer has changed.`,
      topUp: set.topUp ?? null,
    };
  }

  if (kind === TROUBLE.spendLimit) {
    return {
      ...facts,
      ok: false,
      kind,
      runningLow: true,
      sentence: `${name} has stopped answering because this account hit the limit set on it.`,
      action: 'Raise the limit on that account, or wait for the period it covers to turn over. There is nothing to buy and your key is fine.',
      topUp: set.topUp ?? null,
    };
  }

  if (kind === TROUBLE.authInvalid) {
    return {
      ...facts,
      ok: false,
      kind,
      sentence: `${name} would not accept the key on this computer.`,
      // Where the key goes is on the screen that says this, so it says "here"
      // rather than naming somewhere else to go and look.
      action: 'Check you pasted the whole of a current key, and try again.',
    };
  }

  if (kind === TROUBLE.rateLimited) {
    return {
      ...facts,
      ok: false,
      kind,
      tooFast: true,
      waitFor,
      sentence: `${name} is limiting how often it will answer.`,
      action: waitFor
        ? `It asked for ${waitFor} second${waitFor === 1 ? '' : 's'}. Your question is still here.`
        : 'Wait a minute and ask again. Your question is still here, and your key is fine.',
    };
  }

  if (kind === TROUBLE.modelUnavailable) {
    return {
      ...facts,
      ok: false,
      kind,
      sentence: `${name} does not offer the model this is set to use.`,
      action: 'Pick another model for it, and ask again.',
    };
  }

  if (kind === TROUBLE.providerUnavailable) {
    return {
      ...facts,
      ok: false,
      kind,
      sentence: `${name} is having trouble at their end.`,
      action: 'Nothing here is wrong. Try again in a few minutes.',
    };
  }

  if (kind === TROUBLE.askedWrong) {
    return {
      ...facts,
      ok: false,
      kind,
      sentence: `${name} would not take the question as it was sent.`,
      action: why || 'Pick another model for it, and ask again.',
    };
  }

  return {
    ...facts,
    ok: false,
    kind: TROUBLE.unknown,
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
export async function explainFailure({ dir, what, lines = [], command = null, code = null }) {
  const context = dir ? await contextFor(dir) : null;
  // The end of a log is where the reason is. The start is setup.
  const tail = withoutSecrets(lines.slice(-120).join('\n')).slice(-8000);

  /*
   * The facts of the failure itself, stated rather than left to be guessed
   * back out of the output: the exact command, how it ended, and what this
   * computer is. "pip is missing, install pip" is what a model says when it
   * only sees the words; given that the command was `python -m pip` on this
   * machine, it can say which Python has no pip and what actually fixes it.
   */
  const facts = [
    command ? `The exact command was: ${command}` : null,
    code !== null && code !== undefined ? `It ended with exit code ${code}.` : null,
    `The computer runs ${process.platform === 'win32' ? 'Windows' : process.platform}.`,
  ].filter(Boolean);

  return askModel({
    system: VOICE,
    mostTokens: 900,
    message: [
      `${what} failed${dir ? ' in this project' : ' on this computer'}. Say what most likely caused it and what to change.`,
      'Ground the answer in the command and environment below — name the actual thing that is wrong on this computer, not general advice.',
      '',
      facts.join('\n'),
      '',
      context ? asPrompt(context) : '',
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
export async function askAbout({ dir, question, justThisOnce = null }) {
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
    justThisOnce,
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
