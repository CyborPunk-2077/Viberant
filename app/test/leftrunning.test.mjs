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

describe('opening an errand to read it does not close it', () => {
  /**
   * The whole of the Activity fault, held as three lines of the page's source.
   *
   * When an errand finishes, the screen that started it is redrawn once so that
   * whatever changed underneath appears. Opening a *finished* errand to read it
   * went down the same path: painted, found it finished, and six hundred
   * milliseconds later redrew the page — which replaced the box the detail
   * had just been written into. From the outside the button did nothing.
   */
  test('it only redraws for an errand it actually watched running', () => {
    const body = bodyOf(page, 'async function paintJob(');

    assert.match(body, /if \(j\.running\) sawItRunning = true;/,
      'nothing records whether this watch ever saw it running');
    assert.match(body, /if \(!sawItRunning && !told\) return;/,
      'a finished errand opened to be read still triggers a redraw over the top of itself');

    // And the guard has to come before the redraw is scheduled, or it guards
    // nothing at all.
    assert.ok(body.indexOf('if (!sawItRunning && !told) return;') < body.indexOf('draw({ quietly: true })'),
      'the redraw is scheduled before the check that would prevent it');
  });

  test('and every watch starts out having seen nothing', () => {
    const body = bodyOf(page, 'async function watchJob(');
    assert.match(body, /sawItRunning = false;/,
      'the previous errand decides whether this one redraws');
  });

  test('Activity keeps what is open across a redraw, like every other screen', () => {
    const body = bodyOf(page, 'SCREENS.activity = async ()');
    assert.match(body, /if \(watching\) return paintJob\(\{ again: !jobTimer \}\);/,
      'a filter or a stop leaves an empty box where the detail was');
    // And it must not open a different one over the top of what somebody chose.
    assert.ok(body.indexOf('if (watching) return paintJob') < body.indexOf('if (running.length) watchJob'),
      'a running errand is opened over the one somebody deliberately opened');
  });

  test('and a press on a row is counted once', () => {
    const body = bodyOf(page, 'SCREENS.activity = async ()');
    const opening = body.slice(body.indexOf("querySelectorAll('[data-job-open]')"));
    assert.match(opening.slice(0, 600), /e\.stopPropagation\(\)/,
      'the button is inside the row, so one press arrives twice');
  });
});

describe('the same page written twice is written once', () => {
  /**
   * The flicker, and why the obvious version of this fix does not work.
   *
   * Setting `innerHTML` to the very same string still throws every element
   * away and builds them again — the browser does not compare, it obeys. So
   * a poll that finds nothing new still rebuilds the whole page, and for one
   * frame the page is gone.
   *
   * Comparing against what is *on the page* is the version that does not work,
   * and it took measuring to see why: several screens draw in two stages, so
   * the page is never equal to what the screen produces and the guard never
   * matches. Measured before the fix: nine rebuilds in fifty idle seconds on a
   * screen where nothing had happened. After: none.
   */
  test('a screen writing the page it already wrote changes nothing', () => {
    assert.match(page, /Object\.defineProperty\(view, 'innerHTML'/,
      'nothing stops an identical page being rebuilt');
    assert.match(page, /if \(lastPainted === html\) return;/,
      'the guard compares against something other than what a screen produced');
  });

  test('and it compares against what was produced, not what is on the page', () => {
    const at = page.indexOf("Object.defineProperty(view, 'innerHTML'");
    const body = page.slice(at, at + 1800);
    assert.equal(/__lookupGetter__\('innerHTML'\)\.call\(this\) === html/.test(body), false,
      'comparing with the page means a screen that fills something in later never matches itself');
  });

  test('the shell is never part of what a screen writes', () => {
    // The rail, the bar across the top and the picture behind everything are
    // written once. A screen that rebuilt them would be a screen that makes
    // the whole window blink.
    for (const one of ['SCREENS.workspace', 'SCREENS.activity', 'SCREENS.projects', 'SCREENS.settings']) {
      const body = bodyOf(page, `${one} = async ()`);
      for (const never of [/nav\.innerHTML/, /document\.body\.innerHTML/, /#wall/]) {
        assert.equal(never.test(body), false, `${one} writes ${never}`);
      }
    }
  });

  test('a screen that asks on its own behalf stops when you leave it', () => {
    const body = bodyOf(page, 'async function go(tab');
    assert.match(body, /clearTimeout\(activityTimer\)/,
      'a screen keeps asking after you have gone somewhere else');
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
