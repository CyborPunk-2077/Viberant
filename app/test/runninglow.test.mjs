/**
 * "Your account has run out of credit", and the fake version of it.
 *
 * The gap said nothing tracks whether your accounts are running low. The
 * tempting fix is to guess: count the questions, estimate what each cost, draw
 * a bar. That is a number this manager would be making up about somebody's
 * money, and it would be wrong within a week of any price changing.
 *
 * What can be said honestly is what the company itself said, when it said it.
 * So this proves two things: that a refusal is turned into the sentence that is
 * actually true, and that **nothing anywhere counts, estimates or predicts what
 * anything costs** — which is the part somebody would add later with the best
 * of intentions.
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { mkdtemp, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
let root;

before(async () => {
  root = await mkdtemp(join(tmpdir(), 'viberant-low-'));
  await mkdir(join(root, 'home'), { recursive: true });
  process.env.USERPROFILE = join(root, 'home');
  process.env.HOME = join(root, 'home');
});

after(async () => {
  await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
});

const asked = { name: 'Claude' };

describe('a refusal is said as the thing that actually happened', () => {
  test('no credit reads as no credit, and says what fixes it', async () => {
    const { whatThatMeant } = await import('../assistant.mjs');

    // The wording each of them actually uses, when it is actually about money.
    const ways = [
      { status: 400, why: 'Your credit balance is too low to access the Anthropic API' },
      { status: 429, why: 'You exceeded your current quota, please check your plan and billing details' },
      { status: 429, code: 'credit_balance_exhausted', why: 'You have no credits remaining.' },
    ];

    for (const one of ways) {
      const said = whatThatMeant(asked, one);
      assert.equal(said.ok, false);
      assert.equal(said.runningLow, true, `not read as running low: ${one.why}`);
      assert.match(said.sentence, /no credit left/);
      assert.match(said.action, /Add credit/);
      assert.match(said.action, /nothing on this computer has changed/i,
        'because the first thing somebody does is start looking for what they broke');
    }
  });

  /**
   * The complaint this was rewritten for, held so it cannot come back.
   *
   * Somebody who pays for a subscription every month was told *your ChatGPT
   * account has run out of credit* \u2014 by a manager that had never seen their
   * subscription and could not have. They are two accounts at one company,
   * billed separately, and only the second one was ever empty. Being told the
   * wrong one sends somebody to check the thing that was never the problem.
   */
  test('and it never says a subscription is empty, because it cannot know that', async () => {
    const { whatThatMeant, MODELS } = await import('../assistant.mjs');
    const openAi = MODELS.find((m) => m.id === 'openai');

    const said = whatThatMeant(openAi, {
      status: 429, type: 'insufficient_quota', code: 'credit_balance_exhausted',
      why: 'You have no credits remaining.',
    });

    assert.match(said.sentence, /API account/,
      'it did not say which of the two accounts is empty');
    assert.match(said.action, /billed separately/,
      'somebody paying a subscription is not told why that is not the answer');
    assert.equal(/ChatGPT (account|subscription) has (run out|no credit)/i.test(
      `${said.sentence} ${said.action}`,
    ), false, 'it claimed something about an account it has never seen');
  });

  test('a ceiling set on the account is not something to go and buy', async () => {
    const { whatThatMeant, TROUBLE } = await import('../assistant.mjs');
    const said = whatThatMeant(asked, { status: 429, code: 'billing_hard_limit_reached', why: 'limit' });

    assert.equal(said.kind, TROUBLE.spendLimit);
    assert.match(said.action, /Raise the limit/);
    assert.match(said.action, /nothing to buy/i);
  });

  /*
   * A code outranks a message, and this is the case that proves why. Read by
   * type it is a badly written request; read by code it is a rejected key.
   */
  test('what they called it outranks what they wrote about it', async () => {
    const { whatThatMeant, TROUBLE } = await import('../assistant.mjs');
    const said = whatThatMeant(asked, {
      status: 401, type: 'invalid_request_error', code: 'invalid_api_key',
      why: 'Incorrect API key provided: sk-proj-****',
    });
    assert.equal(said.kind, TROUBLE.authInvalid);
  });

  test('and what is carried back is safe to show and safe to keep', async () => {
    const { whatThatMeant, MODELS } = await import('../assistant.mjs');
    const openAi = MODELS.find((m) => m.id === 'openai');
    const said = whatThatMeant({ ...openAi, model: { model: 'gpt-4o' } }, {
      status: 429, type: 'insufficient_quota', code: 'credit_balance_exhausted', why: 'no credits',
    });

    assert.equal(said.status, 429);
    assert.equal(said.code, 'credit_balance_exhausted');
    assert.equal(said.type, 'insufficient_quota');
    assert.equal(said.provider, 'openai');
    assert.equal(said.model, 'gpt-4o');

    // Four facts about a fault. Nothing about an account and nothing about a key.
    for (const value of Object.values(said)) {
      assert.equal(/sk-[a-z]*-[A-Za-z0-9]{8}/.test(String(value)), false,
        'something shaped like a key came back in a refusal');
    }
  });

  /**
   * The reversal. This line used to be in the list above.
   *
   * `Quota exceeded for quota metric` is what Google says when a free allowance
   * of so many questions a minute runs out — which refills on its own, in
   * seconds, with nothing wrong with the account and nothing wrong with the
   * key. Reading the word `quota` as being about money sent somebody with a
   * perfectly good Gemini key off to top up an account that was fine. It was
   * the first thing that happened after adding a key, every time.
   *
   * So: the words that are only ever about money decide that it is about money.
   * Everything else at 429 is a queue, and a queue passes.
   */
  test('a free allowance running out is a queue, not a bill', async () => {
    const { whatThatMeant, TROUBLE } = await import('../assistant.mjs');
    const said = whatThatMeant(asked, { status: 429, why: 'Quota exceeded for quota metric: generate_content_free_tier_requests' });

    assert.equal(said.kind, TROUBLE.rateLimited);
    assert.notEqual(said.runningLow, true,
      'somebody with a working key was told to go and buy more of something they already had');
    assert.match(said.action, /your key is fine/i);
  });

  test('and how long they asked for is carried through when they said', async () => {
    const { whatThatMeant } = await import('../assistant.mjs');
    const said = whatThatMeant(asked, { status: 429, why: 'rate limit', waitFor: 7 });
    assert.equal(said.waitFor, 7);
    assert.match(said.action, /7 seconds/);
  });

  test('asking too fast is a different sentence, because it needs a different thing', async () => {
    const { whatThatMeant } = await import('../assistant.mjs');
    const said = whatThatMeant(asked, { status: 429, why: 'rate_limit_error: too many requests' });

    assert.equal(said.tooFast, true);
    assert.notEqual(said.runningLow, true,
      'telling somebody to top up an account that is fine wastes their money and their afternoon');
    assert.match(said.action, /Wait a minute/);
  });

  test('a bad key is neither of those', async () => {
    const { whatThatMeant } = await import('../assistant.mjs');
    for (const status of [401, 403]) {
      const said = whatThatMeant(asked, { status, why: 'invalid x-api-key' });
      assert.match(said.sentence, /would not accept the key/);
      assert.notEqual(said.runningLow, true);
    }
  });

  test('their trouble is named as theirs, so nobody goes looking here', async () => {
    const { whatThatMeant } = await import('../assistant.mjs');
    const said = whatThatMeant(asked, { status: 503, why: 'overloaded_error' });
    assert.match(said.sentence, /trouble at their end/);
    assert.match(said.action, /Nothing here is wrong/);
  });

  test('anything else keeps what they said rather than replacing it', async () => {
    const { whatThatMeant } = await import('../assistant.mjs');
    const said = whatThatMeant(asked, { status: 400, why: 'max_tokens must be greater than 0' });
    assert.equal(said.action, 'max_tokens must be greater than 0');
  });

  test('and with nothing said at all there is still something to do', async () => {
    const { whatThatMeant } = await import('../assistant.mjs');
    const said = whatThatMeant(asked, { status: 400, why: null });
    assert.ok(said.sentence && said.action, 'one sentence and one thing to do, always');
  });
});

/**
 * The number nobody may invent.
 *
 * This is the whole reason the feature is shaped this way, so it is held
 * structurally rather than by intent: there is no counter, no running total and
 * no arithmetic about money anywhere in the module that talks to these
 * companies. Somebody adding one later has to argue with a test.
 */
describe('nothing counts, estimates or predicts what anything costs', () => {
  test('the module that asks holds no tally and no prices', async () => {
    const source = await readFile(join(here, '..', 'assistant.mjs'), 'utf8');
    const code = source
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/^\s*\/\/.*$/gm, ' ');

    for (const invented of [
      /costPer/i, /pricePer/i, /\bspent\b/i, /\bbudget\b/i, /estimateCost/i,
      /tokensUsed/i, /remainingCredit/i, /usdPer/i,
      // An amount of money, rather than a `$1` standing in for a match — which
      // is what the first version of this caught, in the redaction rules.
      /\$\d+\.\d/,
    ]) {
      assert.equal(invented.test(code), false,
        `assistant.mjs has ${invented} in it — a number this manager made up about somebody's money`);
    }
  });

  test('what it says about an account comes from the reply and nowhere else', async () => {
    const { whatThatMeant } = await import('../assistant.mjs');

    // Given a refusal that says nothing about credit, it must not decide on its
    // own that an account is low — however many times it has been asked.
    for (let i = 0; i < 50; i += 1) {
      const said = whatThatMeant(asked, { status: 400, why: 'something unrelated' });
      assert.notEqual(said.runningLow, true);
    }
  });
});
