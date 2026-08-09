/**
 * Which company gets the question, and gets paid for it.
 *
 * A question here costs money at whichever company answers it. That makes the
 * choice a spending decision, not a preference, and there are exactly two ways
 * to get it wrong:
 *
 *   asking a company the person did not choose, quietly;
 *   refusing to ask at all because a menu disagrees with the one key they set.
 *
 * The first is the serious one. The second is merely obtuse. Both are held here.
 *
 * Nothing in this file reaches a model. What is being proved is which one would
 * be asked and with which key, which is decidable on this computer.
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let root, house;

before(async () => {
  root = await mkdtemp(join(tmpdir(), 'viberant-who-'));
  house = join(root, 'home');
  await mkdir(house, { recursive: true });
  process.env.USERPROFILE = house;
  process.env.HOME = house;
});

after(async () => {
  await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
});

describe('more than one can be asked, and the choice is the persons', () => {
  test('with no key at all it says so, and names the one that was chosen', async () => {
    const assistant = await import('../assistant.mjs');
    const set = await assistant.ready();
    assert.equal(set.ok, false);
    assert.equal(set.name, 'Claude', 'the one chosen by default');
    assert.ok(set.where, 'and where to get a key for it');
  });

  test('the chosen one is asked when it has a key', async () => {
    const assistant = await import('../assistant.mjs');
    const settings = await import('../settings.mjs');

    await settings.set('openaiKey', 'sk-not-a-real-key-000000000000');
    await settings.set('askWho', 'openai');

    const set = await assistant.ready();
    assert.equal(set.ok, true);
    assert.equal(set.name, 'OpenAI');
    assert.equal(set.model.keySetting, 'openaiKey', 'and its own key, not another one');
  });

  test('a key for one company is never used against another', async () => {
    const assistant = await import('../assistant.mjs');
    const settings = await import('../settings.mjs');

    await settings.set('geminiKey', 'not-a-real-gemini-key');
    await settings.set('askWho', 'gemini');

    const set = await assistant.ready();
    assert.equal(set.model.keySetting, 'geminiKey');
    assert.match(set.model.at ?? '', /googleapis\.com/, 'and it goes to that company');

    // Every model has its own key setting and its own address. Sharing either
    // would send one company's key to another.
    const keys = assistant.MODELS.map((m) => m.keySetting);
    assert.equal(new Set(keys).size, keys.length, 'two models share a key setting');
  });

  test('one key and a menu that disagrees uses the key, and says it did', async () => {
    const assistant = await import('../assistant.mjs');
    const settings = await import('../settings.mjs');

    // The chosen one has no key; another does. Refusing here would be obtuse:
    // somebody who set one key meant that key.
    await settings.set('openaiKey', '');
    await settings.set('geminiKey', '');
    await settings.set('anthropicKey', 'sk-ant-not-a-real-key-0000');
    await settings.set('askWho', 'openai');

    const set = await assistant.ready();
    assert.equal(set.ok, true);
    assert.equal(set.name, 'Claude');
    assert.equal(set.insteadOf, 'OpenAI',
      'it must say which one it is not asking, or the person is billed by a company they did not pick without being told');
  });

  test('what the page is told carries names and never a key', async () => {
    const assistant = await import('../assistant.mjs');
    const who = await assistant.whoCanBeAsked();

    assert.equal(who.models.length, assistant.MODELS.length);
    assert.equal(who.chosen, 'openai');

    const said = JSON.stringify(who);
    assert.equal(said.includes('sk-ant-not-a-real-key'), false, 'a key reached the page');
    for (const one of who.models) {
      assert.equal(typeof one.ready, 'boolean', 'whether there is one, never what it is');
      assert.equal('key' in one, false);
    }
    assert.deepEqual(who.models.filter((m) => m.ready).map((m) => m.id), ['claude']);
  });
});

describe('every model is set up the same way, so none is a special case', () => {
  test('each has a name, a key setting, a model and somewhere to get a key', async () => {
    const { MODELS } = await import('../assistant.mjs');
    assert.ok(MODELS.length >= 3, `only ${MODELS.length} to choose from`);

    for (const m of MODELS) {
      for (const field of ['id', 'name', 'keySetting', 'where', 'model']) {
        assert.ok(m[field], `${m.id ?? '?'} has no ${field}`);
      }
      assert.equal(typeof m.ask, 'function', `${m.id} cannot be asked anything`);
      assert.match(m.where, /^https:\/\//, `${m.id} does not say where to get a key`);
    }
  });

  test('every one of them is offered in settings, or it cannot be chosen', async () => {
    const { MODELS } = await import('../assistant.mjs');
    const { KNOWN } = await import('../settings.mjs');

    const choice = KNOWN.find((s) => s.id === 'askWho');
    assert.ok(choice, 'there is no way to choose one');
    assert.deepEqual(choice.choices.map((c) => c.id).sort(), MODELS.map((m) => m.id).sort());

    // And each needs its own box for its own key.
    for (const m of MODELS) {
      const box = KNOWN.find((s) => s.id === m.keySetting);
      assert.ok(box, `${m.name} has nowhere to put a key`);
      assert.equal(box.kind, 'secret', `${m.name}'s key is not held as a secret`);
    }
  });
});
