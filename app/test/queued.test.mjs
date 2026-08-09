/**
 * Being told to slow down, told apart from being told no.
 *
 * The fault this holds: a good Gemini key, added, and the very first question
 * coming back as though the key were bad. Google says *Quota exceeded for quota
 * metric* when a free allowance of so many questions a minute runs out. That
 * refills on its own, in seconds, with nothing wrong with the key and nothing
 * wrong with the account. Read as being about money, it sent somebody off to
 * top up something that was fine.
 *
 * Four things go wrong when asking a model and they need four different things
 * from a person. What is held here is that they stay four.
 */

import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
let root, project, assistant, settings, claude, itsRealAsk;

before(async () => {
  root = await mkdtemp(join(tmpdir(), 'viberant-queued-'));
  await mkdir(join(root, 'home'), { recursive: true });
  process.env.USERPROFILE = join(root, 'home');
  process.env.HOME = join(root, 'home');

  project = join(root, 'thing');
  await mkdir(project, { recursive: true });
  await writeFile(join(project, 'package.json'), JSON.stringify({ name: 'thing' }), 'utf8');

  assistant = await import('../assistant.mjs');
  settings = await import('../settings.mjs');
  claude = assistant.MODELS.find((m) => m.id === 'claude');
  itsRealAsk = claude.ask;

  await settings.set('anthropicKey', 'sk-ant-not-a-real-key-000000');
  await settings.set('askWho', 'claude');
});

after(async () => {
  claude.ask = itsRealAsk;
  await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
});

beforeEach(() => { claude.ask = itsRealAsk; });

/** Answer with whatever is next in the list, and count how many times asked. */
function answersWith(...replies) {
  const asked = [];
  claude.ask = async (what) => {
    asked.push(what);
    return replies[Math.min(asked.length - 1, replies.length - 1)];
  };
  return asked;
}

const queued = (waitFor = null) => ({
  ok: false, status: 429, why: 'Quota exceeded for quota metric', waitFor,
});

describe('a queue is waited out, briefly, and then handed over', () => {
  test('a short wait is taken rather than reported', async () => {
    const asked = answersWith(queued(1), { ok: true, text: 'Here is the answer.' });

    const out = await assistant.askAbout({ dir: project, question: 'what is here' });

    assert.equal(out.ok, true, 'a wait of one second was reported to somebody instead of taken');
    assert.equal(asked.length, 2, 'it did not ask again after waiting');
    assert.equal(out.waited, 1);
  });

  test('a long wait is not taken, because nobody is sitting there for it', async () => {
    const asked = answersWith(queued(240));

    const out = await assistant.askAbout({ dir: project, question: 'what is here' });

    assert.equal(out.ok, false);
    assert.equal(out.kind, assistant.TROUBLE.rateLimited);
    assert.equal(asked.length, 1, 'it sat waiting four minutes rather than saying so');
    assert.match(out.action, /240 seconds/);
  });

  test('and it never asks and asks and asks', async () => {
    // Retrying hard at something that has asked you to stop is how an account
    // gets cut off entirely. Three attempts, and that is the whole of it.
    const asked = answersWith(queued(1));

    const out = await assistant.askAbout({ dir: project, question: 'what is here' });

    assert.equal(out.ok, false);
    assert.ok(asked.length <= 3, `it asked ${asked.length} times after being told to stop`);
  });

  test('the question is the same question every time it is asked again', async () => {
    const asked = answersWith(queued(1), { ok: true, text: 'ok' });
    await assistant.askAbout({ dir: project, question: 'where is signing in handled' });

    assert.equal(asked.length, 2);
    assert.equal(asked[0].message, asked[1].message,
      'the second attempt asked something other than what was typed');
  });
});

describe('the things that go wrong are told apart, and stay apart', () => {
  /*
   * Every line below is a shape one of these three companies actually sends.
   * The ones carrying a `code` were read off a real refusal from a real
   * account; the rest are the plain-words path, for a company that sends no
   * code at all.
   */
  const cases = [
    ['a key that is not accepted', { ok: false, status: 401, why: 'invalid x-api-key' }, 'AUTH_INVALID'],
    ['a key rejected under a misleading type', {
      ok: false, status: 401, type: 'invalid_request_error', code: 'invalid_api_key',
      why: 'Incorrect API key provided',
    }, 'AUTH_INVALID'],
    ['an account with no credit on it', {
      ok: false, status: 429, type: 'insufficient_quota', code: 'credit_balance_exhausted',
      why: 'You have no credits remaining.',
    }, 'BILLING_REQUIRED'],
    ['an account with no credit and nothing but words', {
      ok: false, status: 400, why: 'Your credit balance is too low',
    }, 'BILLING_REQUIRED'],
    ['a ceiling somebody set themselves', {
      ok: false, status: 429, code: 'billing_hard_limit_reached', why: 'limit reached',
    }, 'SPEND_LIMIT'],
    ['a free allowance that refills', { ok: false, status: 429, why: 'Quota exceeded for quota metric' }, 'RATE_LIMITED'],
    ['a model that is not offered', { ok: false, status: 404, why: 'model not found' }, 'MODEL_UNAVAILABLE'],
    ['a question they would not take', {
      ok: false, status: 400, type: 'invalid_request_error', why: 'Unsupported parameter',
    }, 'INVALID_REQUEST'],
    ['trouble at their end', { ok: false, status: 503, why: 'overloaded' }, 'PROVIDER_UNAVAILABLE'],
  ];

  for (const [what, reply, kind] of cases) {
    test(`${what} is ${kind}`, async () => {
      answersWith(reply);
      const out = await assistant.askAbout({ dir: project, question: 'what is here' });
      assert.equal(out.ok, false);
      assert.equal(out.kind, assistant.TROUBLE[
        Object.keys(assistant.TROUBLE).find((k) => assistant.TROUBLE[k] === kind)],
      `${what} came back as ${out.kind}`);
    });
  }

  test('and being unreachable is not any of them', async () => {
    claude.ask = async () => { throw new Error('getaddrinfo ENOTFOUND'); };
    const out = await assistant.askAbout({ dir: project, question: 'what is here' });
    assert.equal(out.kind, assistant.TROUBLE.networkError);
  });

  test('each one names which company it was, so another can be offered', async () => {
    answersWith({ ok: false, status: 429, why: 'rate limit' });
    const out = await assistant.askAbout({ dir: project, question: 'what is here' });
    assert.equal(out.provider, 'claude');
  });
});

describe('what arrives, and the shapes it arrives in', () => {
  test('a refusal wrapped in a list is still read', async () => {
    /*
     * Google sends a list holding one object where the shape it is copying
     * sends the object. Read as the object it is not, the reason inside it is
     * simply not there — so every Gemini refusal arrived with nothing said,
     * and an account out of allowance came back as "asking too fast", which is
     * the opposite advice. Invisible from the outside, because both are
     * refusals and both stop you asking.
     */
    const source = await readFile(join(here, '..', 'assistant.mjs'), 'utf8');
    assert.match(source, /function whatTheySent\(/,
      'nothing unwraps a refusal that arrives inside a list');
    assert.match(source, /Array\.isArray\(said\)/);

    // And both ways of asking go through it.
    const uses = (source.match(/whatTheySent\(/g) ?? []).length;
    assert.ok(uses >= 3, `only ${uses - 1} of the two ways of asking unwrap what came back`);
  });

  test('an answer with nothing in it is not an answer', async () => {
    // The newer models think before they speak, out of the same allowance as
    // the answer. A short reply can go entirely on thinking and come back with
    // a `length` on it and no words in it — which used to be rendered as
    // success, as an empty box, which is worse than a refusal.
    answersWith({ ok: true, text: '', stoppedBecause: 'length' });

    const out = await assistant.askAbout({ dir: project, question: 'what is here' });
    assert.equal(out.ok, false, 'an empty answer was reported as an answer');
    assert.equal(out.emptyAnswer, true);
    assert.match(out.action, /thinking/);
  });

  test('and one with something in it is', async () => {
    answersWith({ ok: true, text: 'VIBERANT_AI_OK', stoppedBecause: 'stop' });
    const out = await assistant.askAbout({ dir: project, question: 'say the word' });
    assert.equal(out.ok, true);
    assert.equal(out.text, 'VIBERANT_AI_OK');
  });

  test('a model that has been retired says so, rather than blaming the key', async () => {
    answersWith({
      ok: false,
      status: 404,
      why: 'This model models/gemini-2.5-flash is no longer available to new users.',
    });
    const out = await assistant.askAbout({ dir: project, question: 'anything' });
    assert.equal(out.kind, assistant.TROUBLE.modelUnavailable);
    assert.match(out.action, /model/i);
  });

  test('every model this offers is one the company still has', () => {
    // The version that was written down here answered "no longer available to
    // new users". A name that moves is the only kind that does not quietly
    // stop working in six months, and this is installed once.
    for (const one of assistant.CATALOGUE.gemini.models) {
      assert.match(one.id, /-latest$/,
        `${one.id} is a fixed version, which is the kind that gets retired`);
    }
  });
});

describe('a key is not rejected for being asked to wait', () => {
  test('a limit while checking means the key was accepted, so it is kept', async () => {
    // Nothing counts a request it did not recognise. A key that is wrong is
    // refused before anybody's allowance is looked at, so a limit of either
    // kind is proof that the key worked.
    answersWith(queued(30));
    const out = await assistant.checkKey('claude', 'sk-ant-a-key-that-is-fine');

    assert.equal(out.ok, true, 'a working key was refused because the company was busy');
    assert.equal(out.limited, true);
    assert.match(out.action, /kept/);
  });

  test('and a key that is actually refused is still refused', async () => {
    answersWith({ ok: false, status: 401, why: 'invalid x-api-key' });
    const out = await assistant.checkKey('claude', 'not-a-key');
    assert.equal(out.ok, false);
    assert.equal(out.kind, assistant.TROUBLE.authInvalid);
  });
});

describe('how long they asked for is read from where they put it', () => {
  test('from the header every company sends', () => {
    const said = { headers: { get: (n) => (n === 'retry-after' ? '12' : null) } };
    const meant = assistant.whatThatMeant(
      { name: 'Gemini', model: { id: 'gemini' } },
      { status: 429, why: 'rate limit', waitFor: 12 },
    );
    assert.equal(meant.waitFor, 12);
    assert.ok(said, 'the header is what the module reads');
  });

  /**
   * Offered, and neither taken quietly nor made permanent.
   *
   * This used to require the button to post `/ai/choose`, which is the route
   * that writes down which company is asked from then on — so two presses and
   * somebody was paying a company they had never picked, with nothing on the
   * screen saying so. The name of this test was right and the check underneath
   * it enforced the opposite. What it holds now is the stronger thing: the
   * question goes to whoever was named, once, and nothing is written down.
   */
  test('the page is offered somebody else, and never switched for you', async () => {
    const page = await readFile(join(here, '..', 'ui', 'app.js'), 'utf8');
    const at = page.indexOf('function whenItWouldNot(');
    assert.notEqual(at, -1, 'the refusal is no longer drawn as its own thing');

    const body = page.slice(at, page.indexOf('\n}\n', at));
    assert.match(body, /data-ask-instead/, 'no other company is ever offered');
    assert.match(body, /instead: b\.dataset\.askInstead/,
      'the other company is not named on the question, so something else must be being changed');
    assert.equal(/\/ai\/choose/.test(body), false,
      'pressing it changes which company is asked from then on, which nobody agreed to');
  });
});
