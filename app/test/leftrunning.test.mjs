/**
 * Things that were left running after the thing that started them had gone.
 *
 * A page that asks the manager something every half-second is fine while
 * somebody is looking at it. The same page asking forever, after it has been
 * closed, is a slow leak that ends in the worst possible way: the answer
 * arrives, and the code that handles it writes over whatever screen the person
 * has moved on to since.
 *
 * Both ways in — GitHub and Google — had exactly that. Cancel stopped the
 * asking; closing the window in the corner, or clicking the darkened
 * background, did not. Nobody noticed because nothing looks wrong until a
 * sign-in finishes and announces itself over the top of an unrelated screen.
 *
 * This reads the page's own source, because that is where the answer is: a
 * clock is either handed to the thing that clears it or it is not.
 */

import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
let page;

before(async () => { page = await readFile(join(here, '..', 'ui', 'app.js'), 'utf8'); });

/**
 * The body of one function, braces balanced.
 *
 * The brace that opens the body is not the first brace on the line: several of
 * these take their arguments as one, and counting from the first would have
 * matched the argument list and returned four characters. So the parentheses
 * are followed to their end first, and the body starts after that.
 */
function bodyOf(source, opening) {
  const at = source.indexOf(opening);
  assert.notEqual(at, -1, `${opening} is not there any more`);

  let i = at;
  let round = 0;
  let entered = false;
  for (; i < source.length; i += 1) {
    if (source[i] === '(') { round += 1; entered = true; }
    if (source[i] === ')') round -= 1;
    if (entered && round === 0) break;
  }
  while (i < source.length && source[i] !== '{') i += 1;

  let depth = 0;
  for (let j = i; j < source.length; j += 1) {
    if (source[j] === '{') depth += 1;
    if (source[j] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(at, j + 1);
    }
  }
  return source.slice(at);
}

describe('a layer takes what it started away with it', () => {
  test('closing one runs whatever it left to be stopped', () => {
    const body = bodyOf(page, 'function closeLayer()');
    assert.match(body, /runClosingJobs\(\)/,
      'closing a layer no longer stops what it had running');
  });

  test('and so does writing another one over the top of it', () => {
    // The way that was missing. A sheet replacing a sheet ends the first one as
    // finally as closing it does, and for a while it did so silently.
    const body = bodyOf(page, 'function sheet({');
    assert.match(body, /runClosingJobs\(\)/,
      'a sheet drawn over another leaves the first one ticking');

    // And it must happen before the new one is drawn, or the new one's own
    // clock would be cleared along with the old one's.
    assert.ok(body.indexOf('runClosingJobs()') < body.indexOf('layer.innerHTML'),
      'the stopping happens after the new sheet is written, which would stop the new one');
  });
});

describe('nothing asks forever', () => {
  const shouldStop = [
    ['signing in to GitHub', 'async function signInToGitHub'],
    ['signing in to Google', 'async function signInToGoogle'],
  ];

  for (const [what, opening] of shouldStop) {
    test(`${what} stops when its window goes, however it goes`, () => {
      const body = bodyOf(page, opening);
      assert.match(body, /setInterval/, `${what} no longer asks repeatedly, so this test is stale`);
      assert.match(body, /whenLayerCloses\(\(\) => clearInterval\(watching\)\)/,
        `${what} keeps asking after its window is closed from the corner`);
    });
  }

  test('every clock the page starts is handed to something that clears it', () => {
    // Counted rather than named, so a new one that nobody clears fails here
    // rather than in six months on somebody's machine.
    const started = (page.match(/setInterval\(/g) ?? []).length;
    const cleared = (page.match(/clearInterval\(/g) ?? []).length;
    assert.ok(cleared >= started,
      `${started} clocks are started and only ${cleared} are ever stopped`);
  });
});

describe('what a page shows is what a person can reach', () => {
  test('every control with a name has something listening for it', () => {
    const named = new Set();
    for (const m of page.matchAll(/<(?:button|a|input|select|textarea)\b[^>]*?\bid="([a-z0-9-]+)"/gi)) {
      named.add(m[1]);
    }
    assert.ok(named.size > 60, 'the page has stopped naming its controls, so this proves nothing');

    const dead = [...named].filter((id) => !(
      page.includes(`'#${id}'`) || page.includes(`"#${id}"`) || page.includes(`#${id}\``)
    ));
    assert.deepEqual(dead, [], 'these are drawn and do nothing when pressed');
  });

  test('and nothing is marked up for a handler that was taken away', () => {
    const marks = new Set();
    for (const m of page.matchAll(/<(?:button|a|div|span|input|select)\b[^>]*?\bdata-([a-z0-9-]+)=/gi)) {
      marks.add(m[1]);
    }

    const readByTheLook = ['tip', 'key', 'cols', 'floats', 'theme'];
    const asCamel = (a) => a.replace(/-([a-z])/g, (_, c) => c.toUpperCase());

    const unread = [...marks].filter((a) => !readByTheLook.includes(a) && !(
      page.includes(`[data-${a}`) || page.includes(`dataset.${asCamel(a)}`)
    ));
    assert.deepEqual(unread, [], 'these are written into the page and never read back');
  });
});
