/**
 * Every look is a whole look.
 *
 * A theme here is a set of variables, and a set with one missing does not fail
 * — it silently inherits the one above it, which is how a look ends up with the
 * wrong text colour on exactly one screen and nobody can say why.
 *
 * So each look is checked against the one that defines the full set. And the
 * rule that outranks all of them is checked too: **a look changes colours and
 * nothing else.** A look that redefined what green meant would make a failure
 * read as a success somewhere, which is the one thing no amount of taste
 * justifies (D-95).
 */

import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

let css, page;
before(async () => {
  css = await readFile(join(here, '..', 'ui', 'style.css'), 'utf8');
  page = await readFile(join(here, '..', 'ui', 'wallpaper.js'), 'utf8');
});

/** Every `[data-theme="x"]` block, as a name and the variables it sets. */
function looks(text) {
  const found = new Map();
  for (const m of text.matchAll(/\[data-theme="([\w-]+)"\][^{]*\{([^}]*)\}/g)) {
    const [, name, body] = m;
    const set = found.get(name) ?? new Set();
    for (const v of body.matchAll(/(--[\w-]+)\s*:/g)) set.add(v[1]);
    found.set(name, set);
  }
  return found;
}

describe('every look sets everything a look has to set', () => {
  test('nothing is left to be inherited from the look above it', () => {
    const all = looks(css);
    assert.ok(all.size >= 12, `only found ${all.size} looks`);

    // The one the app is designed in is the full set by definition.
    const complete = all.get('space');
    assert.ok(complete && complete.size >= 20, 'the reference look is not complete');

    const missing = [];
    for (const [name, set] of all) {
      // Set by a few looks that need dark text on a bright accent, and correctly
      // absent from the rest.
      for (const v of complete) {
        if (v === '--vibe-ink') continue;
        if (!set.has(v)) missing.push(`${name} is missing ${v}`);
      }
    }
    assert.deepEqual(missing, []);
  });

  test('a look never redefines what a colour means', () => {
    // Every look may choose its own greens and reds. What none of them may do
    // is drop one, because then a failure inherits whatever was there before.
    const all = looks(css);
    for (const [name, set] of all) {
      for (const meaning of ['--live', '--attention', '--trouble', '--cool']) {
        assert.equal(set.has(meaning), true,
          `${name} does not say what ${meaning} is, so it would inherit it — and a state that inherits its colour is a state that can read as the wrong one`);
      }
    }
  });
});

describe('a look that promises a picture has one', () => {
  test('every look offered with a scene is a scene that exists', async () => {
    // Read out of the source rather than by loading the module, which wants a
    // home folder to read settings out of and has nothing to say about looks.
    const source = await readFile(join(here, '..', 'settings.mjs'), 'utf8');

    const promised = [...source.matchAll(/\{\s*id:\s*'([\w-]+)',[^}]*scene:\s*true/g)]
      .map((m) => m[1]);
    assert.ok(promised.length >= 8, `only ${promised.length} looks promise a picture`);

    // Scenes are written inside the list; the one that draws a chosen picture
    // is a function of its own, because it has to wait for the file to arrive.
    const built = new Set([
      ...[...page.matchAll(/^ {2}(\w+)\(w, h\)\s*\{/gm)].map((m) => m[1]),
      ...[...page.matchAll(/^function (\w+)\(w, h\)\s*\{/gm)].map((m) => m[1]),
    ]);
    const known = new Set([...page.matchAll(/^ {2}(\w+): '(\w+)',$/gm)].map((m) => m[1]));

    for (const id of promised) {
      assert.equal(built.has(id), true, `${id} is offered with a picture but has no scene`);
      assert.equal(known.has(id), true, `${id} has a scene but the page is never told to use it`);
    }
  });

  test('no artwork is shipped and none is fetched from anywhere', () => {
    // Every scene is drawn here, which is what keeps somebody else's pictures
    // and somebody else's licence out of this product entirely. Exactly one
    // reads a file, and it is the one the person chose off their own computer.
    for (const way of [/fetch\(/, /XMLHttpRequest/, /https?:\/\//, /import\(/, /url\(/]) {
      assert.equal(way.test(page), false, `wallpaper.js must not use ${way}`);
    }

    const sources = [...page.matchAll(/\.src\s*=\s*[`'"]([^`'"$]*)/g)].map((m) => m[1]);
    assert.deepEqual(sources, ['/wall/picture?v='],
      'the only picture it loads is the chosen one, from this computer');
  });
});

/**
 * The route that serves the chosen picture.
 *
 * A wallpaper feature that took a path from the page would be a way to read any
 * file on this computer through a browser. It is not one, and that is a fact
 * about the code rather than an intention: the path is read back from the
 * setting, so the route can serve exactly one file.
 */
describe('the picture route can only ever serve the one that was chosen', () => {
  test('it never takes a path from whoever is asking', async () => {
    const server = await readFile(join(here, '..', 'server.mjs'), 'utf8');
    const fn = /async function servePicture\(([^)]*)\)\s*\{([\s\S]*?)\n\}/.exec(server);
    assert.ok(fn, 'servePicture is not there');

    const [, takes, body] = fn;
    assert.equal(/req|url|body|params|query/.test(takes), false,
      `servePicture takes ${takes} — it must not be able to see the request`);
    for (const way of [/searchParams/, /req\./, /body\./, /decodeURI/]) {
      assert.equal(way.test(body), false, `servePicture must not read ${way}`);
    }
    assert.match(body, /settings\.get\('wallPicture'\)/,
      'the path comes from the setting, and from nowhere else');
  });

  test('it serves pictures and nothing else', async () => {
    const server = await readFile(join(here, '..', 'server.mjs'), 'utf8');
    const list = /const PICTURES = \{([\s\S]*?)\}/.exec(server);
    assert.ok(list, 'the kinds it will serve are not written down');

    const kinds = [...list[1].matchAll(/'(\.[a-z0-9]+)'/g)].map((m) => m[1]);
    assert.ok(kinds.length >= 5, `only ${kinds.length} kinds of picture`);
    for (const bad of ['.env', '.json', '.js', '.mjs', '.txt', '.key', '.pem']) {
      assert.equal(kinds.includes(bad), false, `${bad} is not a picture`);
    }
  });
});
