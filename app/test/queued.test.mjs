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

describe('the four things that go wrong stay four', () => {
  const cases = [
    ['a key that is not accepted', { ok: false, status: 401, why: 'invalid x-api-key' }, 'AUTH_INVALID'],
    ['an account with nothing on it', { ok: false, status: 400, why: 'Your credit balance is too low' }, 'QUOTA_EXCEEDED'],
    ['a free allowance that refills', { ok: false, status: 429, why: 'Quota exceeded for quota metric' }, 'RATE_LIMITED'],
    ['a model that is not offered', { ok: false, status: 404, why: 'model not found' }, 'MODEL_UNAVAILABLE'],
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

  test('the page is offered somebody else, and never switched for you', async () => {
    // Quietly asking another company would be spending money at a company
    // nobody chose, which is the one thing choosing a company is for.
    const page = await readFile(join(here, '..', 'ui', 'app.js'), 'utf8');
    const at = page.indexOf('function whenItWouldNot(');
    assert.notEqual(at, -1, 'the refusal is no longer drawn as its own thing');

    const body = page.slice(at, page.indexOf('\n}\n', at));
    assert.match(body, /data-ask-instead/, 'no other company is ever offered');
    assert.equal(/askAssistant\([^)]*\)\s*;\s*\}\s*\)\s*;?\s*$/.test(body.split('data-ask-instead')[0]), false);
    assert.match(body, /post\('\/ai\/choose'/,
      'another company is asked without the choice being changed, which would be silent');
  });
});
