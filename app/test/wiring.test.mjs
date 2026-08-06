/**
 * Every button reaches something.
 *
 * This exists because of a bug that produced no error anywhere: the page asked
 * the server a *question* where it meant to give an *instruction*, got a 404
 * back, failed while turning that into an answer, and — because the failure
 * landed inside a promise nobody was watching — did precisely nothing. Visibly,
 * a button that did not work. In the logs, silence.
 *
 * A running test cannot press every button, but it can read the page and the
 * server and check that every address the page names exists, by the verb the
 * page uses. That is the whole class of fault, caught without a browser.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const app = join(here, '..');

/** Every address the server answers, and by which verb. */
async function whatTheServerAnswers() {
  const text = await readFile(join(app, 'server.mjs'), 'utf8');
  const routes = new Set();
  for (const m of text.matchAll(/async '(GET|POST) (\/[^']*)'\(/g)) {
    routes.add(`${m[1]} ${m[2]}`);
  }
  return routes;
}

/** Every address the page names, and by which verb it names it. */
async function whatThePageAsksFor() {
  const text = await readFile(join(app, 'ui', 'app.js'), 'utf8');
  const calls = [];

  for (const m of text.matchAll(/\b(get|post)\(\s*[`'"]([^`'"]+)[`'"]/g)) {
    const verb = m[1].toUpperCase();
    // A query string is not part of the address the server answers on.
    const path = m[2].split('?')[0].split('${')[0];
    if (!path.startsWith('/')) continue;
    calls.push({ verb, path, where: m[0] });
  }
  return calls;
}

// ---------------------------------------------------------------------------

describe('the page and the server agree with each other', () => {
  test('every address the page names is one the server answers', async () => {
    const answered = await whatTheServerAnswers();
    const asked = await whatThePageAsksFor();

    const missing = asked
      .filter(({ verb, path }) => !answered.has(`${verb} ${path}`))
      .map(({ verb, path }) => `${verb} ${path}`);

    assert.deepEqual([...new Set(missing)], [],
      'the page presses something the server does not answer, which fails in silence');
  });

  test('nothing is asked as a question that is meant as an instruction', async () => {
    const answered = await whatTheServerAnswers();
    const asked = await whatThePageAsksFor();

    // The exact shape of the original fault: the address exists, but only for
    // the other verb. Worth its own test because the message is the useful part.
    const wrongVerb = asked
      .filter(({ verb, path }) => !answered.has(`${verb} ${path}`)
        && answered.has(`${verb === 'GET' ? 'POST' : 'GET'} ${path}`))
      .map(({ verb, path }) => `${path} is asked with ${verb}, but the server only answers the other way`);

    assert.deepEqual([...new Set(wrongVerb)], []);
  });

  test('the check is looking at something rather than passing on an empty list', async () => {
    const answered = await whatTheServerAnswers();
    const asked = await whatThePageAsksFor();

    assert.ok(answered.size > 30, `only found ${answered.size} addresses on the server`);
    assert.ok(asked.length > 40, `only found ${asked.length} calls in the page`);
    assert.ok(asked.some((c) => c.verb === 'POST' && c.path === '/tidy'),
      'and it can see the one that started all this');
  });

  test('and it would notice a button that reaches nothing', async () => {
    const answered = await whatTheServerAnswers();
    assert.ok(!answered.has('GET /tidy'), 'clearing the list is an instruction, not a question');
    assert.ok(answered.has('POST /tidy'));
  });
});
