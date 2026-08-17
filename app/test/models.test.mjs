/**
 * Which model, and a key that is checked before it is believed.
 *
 * Two things people were left holding. A model name written into the request
 * and nowhere else, so a retired one turned every question into an error about
 * something nobody had ever chosen. And a key that was kept the moment it was
 * typed, so a key with a character missing looked exactly like a working one
 * until the first real question came back refused.
 *
 * Nothing here reaches a model. What is being proved is what would be sent and
 * what would be kept, both of which are decidable on this computer.
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/*
 * The end of a function is found below by looking for a line that is only its
 * closing brace. On a computer whose files carry a carriage return as well,
 * that line is never found and the slice becomes the whole rest of the file —
 * so a check that this one function never does something quietly becomes a
 * search of everything after it. Made the same first.
 */
const sameLines = (text) => text.replaceAll('\r\n', '\n');

const here = dirname(fileURLToPath(import.meta.url));
let root, assistant, settings;

before(async () => {
  root = await mkdtemp(join(tmpdir(), 'viberant-models-'));
  await mkdir(join(root, 'home'), { recursive: true });
  process.env.USERPROFILE = join(root, 'home');
  process.env.HOME = join(root, 'home');
  assistant = await import('../assistant.mjs');
  settings = await import('../settings.mjs');
});

after(async () => {
  await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
});

describe('the models are listed in one place', () => {
  test('every company offers something, and its default is one of them', () => {
    for (const [id, one] of Object.entries(assistant.CATALOGUE)) {
      assert.ok(one.models.length >= 1, `${id} offers nothing`);
      assert.ok(one.models.some((m) => m.id === one.default),
        `${id} defaults to a model it does not offer`);
      for (const m of one.models) {
        assert.ok(m.name && m.why, `${m.id} has no words a person could choose by`);
      }
    }
  });

  test('every company this can ask has a catalogue', () => {
    for (const m of assistant.MODELS) {
      assert.ok(assistant.CATALOGUE[m.id], `${m.id} has no models listed`);
    }
  });

  test('nothing offers a model by a name written somewhere else as well', () => {
    // The point of one catalogue is that there is one. A second list of names
    // is how the first one goes out of date without anybody noticing.
    const seen = new Set();
    for (const one of Object.values(assistant.CATALOGUE)) {
      for (const m of one.models) {
        assert.equal(seen.has(m.id), false, `${m.id} is listed twice`);
        seen.add(m.id);
      }
    }
  });
});

describe('which model gets asked', () => {
  test('the default, when nobody has said otherwise', async () => {
    await settings.set('anthropicKey', 'sk-ant-not-a-real-key-0000');
    await settings.set('askWho', 'claude');

    const set = await assistant.ready();
    assert.equal(set.ok, true);
    assert.equal(set.using, assistant.CATALOGUE.claude.default);
    assert.equal(set.model.model, assistant.CATALOGUE.claude.default,
      'the request would go out with a different model from the one reported');
  });

  test('the chosen one, when somebody has', async () => {
    const other = assistant.CATALOGUE.claude.models.find(
      (m) => m.id !== assistant.CATALOGUE.claude.default);
    await settings.set('model:claude', other.id);

    const set = await assistant.ready();
    assert.equal(set.using, other.id);
    assert.equal(set.model.model, other.id);
  });

  test('a model that is not offered any more falls back rather than failing', async () => {
    // What happens to everybody who chose a model a year ago: it is retired,
    // and the honest thing is to ask the sensible one rather than to send a
    // name the company has never heard of and report its refusal as a fault.
    await settings.set('model:claude', 'claude-from-a-previous-era');

    const set = await assistant.ready();
    assert.equal(set.using, assistant.CATALOGUE.claude.default);
  });

  test('a choice for one company does not change another', async () => {
    await settings.set('model:claude', assistant.CATALOGUE.claude.models[2].id);
    await settings.set('openaiKey', 'sk-not-a-real-key-000000');
    await settings.set('askWho', 'openai');

    const set = await assistant.ready();
    assert.equal(set.using, assistant.CATALOGUE.openai.default,
      'a model chosen for one company was sent to another');

    await settings.set('askWho', 'claude');
    await settings.set('model:claude', '');
  });
});

describe('what the page is told about each company', () => {
  test('what it offers and what it is using, for all of them', async () => {
    const who = await assistant.whoCanBeAsked();
    for (const m of who.models) {
      assert.ok(m.models.length >= 1, `${m.id} offers nothing to choose`);
      assert.ok(m.models.some((one) => one.id === m.using),
        `${m.id} says it is using something it does not offer`);
    }
  });

  test('whether there is a key, and never what it is', async () => {
    await settings.set('geminiKey', 'a-very-recognisable-secret-value');

    const who = await assistant.whoCanBeAsked();
    const said = JSON.stringify(who);
    assert.equal(said.includes('a-very-recognisable-secret-value'), false,
      'a key was handed to the page');
    assert.equal(who.models.find((m) => m.id === 'gemini').ready, true);

    await settings.set('geminiKey', '');
  });
});

describe('a key is checked before it is kept', () => {
  test('an empty one is refused without asking anybody', async () => {
    const out = await assistant.checkKey('claude', '   ');
    assert.equal(out.ok, false);
    assert.match(out.action, /Paste/);
  });

  test('a company nobody offers is refused too', async () => {
    const out = await assistant.checkKey('somebody-else', 'anything');
    assert.equal(out.ok, false);
  });

  test('checking one never writes it down', async () => {
    // The check happens before anybody has agreed to keep the key. A check that
    // saved it would keep a key that turned out not to work.
    const source = sameLines(await readFile(join(here, '..', 'assistant.mjs'), 'utf8'));
    const body = source.slice(source.indexOf('export async function checkKey'));
    const mine = body.slice(0, body.indexOf('\n}\n') + 2);

    for (const never of [/settings\.set/, /writeFile/, /appendFile/]) {
      assert.equal(never.test(mine), false, `checking a key can ${never}`);
    }
  });

  test('and the one that is checked is a real model, not a made-up name', async () => {
    const source = sameLines(await readFile(join(here, '..', 'assistant.mjs'), 'utf8'));
    const body = source.slice(source.indexOf('export async function checkKey'));
    assert.match(body.slice(0, 1400), /CATALOGUE\[m\.id\]\?\.default/,
      'the check sends a model name of its own, which can go out of date on its own');
  });
});
