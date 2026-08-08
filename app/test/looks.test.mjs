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

    const built = new Set([...page.matchAll(/^ {2}(\w+)\(w, h\)\s*\{/gm)].map((m) => m[1]));
    const known = new Set([...page.matchAll(/^ {2}(\w+): '(\w+)',$/gm)].map((m) => m[1]));

    for (const id of promised) {
      assert.equal(built.has(id), true, `${id} is offered with a picture but has no scene`);
      assert.equal(known.has(id), true, `${id} has a scene but the page is never told to use it`);
    }
  });

  test('no scene reaches for a file, because nothing here is downloaded', () => {
    // These are drawn rather than shipped, which is what keeps somebody else's
    // artwork out of this product entirely.
    for (const way of [/new Image\(/, /\.src\s*=/, /url\(/, /fetch\(/, /import\(/]) {
      assert.equal(way.test(page), false, `wallpaper.js must not ${way}`);
    }
  });
});
