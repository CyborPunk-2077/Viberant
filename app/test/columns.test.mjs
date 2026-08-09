/**
 * Narrowing a table must never hide a row.
 *
 * This is here because of a fault nobody could see by reading. A sheet is a
 * grid; each row inside it is a subgrid, so the row's own children are the
 * columns. Dropping a column on a narrow window was written as
 *
 *     .projects-cols > :nth-child(4) { display: none; }
 *
 * which selects the fourth **child of the sheet** — the fourth row. It was
 * hiding the fourth project. And the third computer. And whichever row landed
 * on that number in every list that had one of these rules.
 *
 * It survived every audit because each list was short enough that the number
 * fell past the last row. The Workspace list of computers was the first with
 * three real rows in it, and the third one disappeared on a 1120-wide window.
 *
 * The rule this holds is one sentence: **a selector that hides something inside
 * a sheet must be aimed at a row's children, never at the sheet's.** That is
 * decidable from the stylesheet, so it is decided here rather than by looking.
 */

import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

let css;
before(async () => {
  css = await readFile(join(here, '..', 'ui', 'style.css'), 'utf8');
});

/** Every rule, as a selector and what it sets, comments taken out. */
function rules(text) {
  const out = [];
  const bare = text.replace(/\/\*[\s\S]*?\*\//g, ' ');
  for (const m of bare.matchAll(/([^{}@]+)\{([^{}]*)\}/g)) {
    out.push({ selector: m[1].trim().replace(/\s+/g, ' '), body: m[2].trim() });
  }
  return out;
}

describe('narrowing a table hides a column, never a row', () => {
  test('nothing hides a direct child of a sheet', () => {
    const offences = [];
    for (const { selector, body } of rules(css)) {
      if (!/display\s*:\s*none/.test(body)) continue;
      for (const one of selector.split(',').map((s) => s.trim())) {
        // A sheet, then a direct-child position — which is a row, not a column.
        if (/-cols\s*>\s*:nth-child/.test(one)) offences.push(one);
      }
    }
    assert.deepEqual(offences, [],
      'a sheet\'s children are its rows: this hides data rather than narrowing a table');
  });

  test('every column that is dropped is dropped from the heading too', () => {
    const dropped = new Map();
    for (const { selector, body } of rules(css)) {
      if (!/display\s*:\s*none/.test(body)) continue;
      for (const one of selector.split(',').map((s) => s.trim())) {
        const m = /\.([\w-]+-cols)\s+\.(trow|thead)\s*>\s*:nth-child\((\d+)\)/.exec(one);
        if (!m) continue;
        const key = `${m[1]}:${m[3]}`;
        dropped.set(key, (dropped.get(key) ?? new Set()).add(m[2]));
      }
    }

    assert.ok(dropped.size >= 4, `only found ${dropped.size} dropped columns to check`);
    for (const [key, which] of dropped) {
      assert.deepEqual([...which].sort(), ['thead', 'trow'],
        `${key} is dropped from ${[...which]} only — a heading keeping a column the rows lost is a table whose labels are wrong`);
    }
  });

  test('a sheet that drops a column also says what it narrows to', () => {
    // Hiding one without restating the columns leaves the row a track short and
    // the last item wraps onto a line of its own, on top of the first.
    const narrowed = new Set();
    const restated = new Set();
    for (const { selector, body } of rules(css)) {
      const m = /\.([\w-]+-cols)/.exec(selector);
      if (!m) continue;
      if (/display\s*:\s*none/.test(body) && /:nth-child/.test(selector)) narrowed.add(m[1]);
      if (/grid-template-columns/.test(body)) restated.add(m[1]);
    }
    for (const name of narrowed) {
      assert.equal(restated.has(name), true,
        `${name} drops a column without restating its columns, so the last item wraps`);
    }
  });
});

/**
 * A control shaped like a row starts where the row starts.
 *
 * The other fault of this shape, and it was on the most-looked-at surface in
 * the product. `button` sets `justify-content: center`, which is right for a
 * button with a word on it. Every control shaped like a row is also a button,
 * inherits it, and centres its own contents — so the mark and the label of each
 * one sit wherever that row's label length puts them.
 *
 * Measured in the rail before the fix: eight places, eight different left
 * edges, 62px to 76px, the longest label furthest left. Nothing was misaligned
 * by a pixel; every row was aligned to a different thing. It is invisible in
 * the source, because the declaration that does it is four hundred lines away
 * and applies by not being overridden.
 *
 * So it is decided from the stylesheet: **a rule that says its text is
 * left-aligned and that it is a flex container must say where its content
 * starts.** Both halves are required — a rule with neither is not a row.
 */
describe('a row-shaped control starts at the start', () => {
  // Left-aligned, laid out in a line, and actually a line — a flex container
  // stacking downwards is a group of rows, not one, and where its contents
  // start across is not what decides anything.
  const looksLikeARow = ({ body }) => /text-align\s*:\s*left/.test(body)
    && /display\s*:\s*(inline-)?flex/.test(body)
    && !/flex-direction\s*:\s*column/.test(body);

  test('every one of them says so, rather than inheriting the opposite', () => {
    const offences = [];
    for (const one of rules(css)) {
      if (!looksLikeARow(one)) continue;
      if (/justify-content/.test(one.body)) continue;
      offences.push(one.selector);
    }
    assert.deepEqual(offences, [],
      `these centre their own contents, so each row starts at a different place: ${offences.join(', ')}`);
  });

  test('and there are enough of them for that to have been worth checking', () => {
    const found = rules(css).filter(looksLikeARow);
    assert.ok(found.length >= 10,
      `only ${found.length} row-shaped controls found, so the check above is looking at nothing`);
  });

  /*
   * The rail is the one that was reported, so it is named rather than left to
   * be covered by the rule above.
   */
  test('the rail says it outright', () => {
    const tab = rules(css).find(({ selector }) => selector === '.rail .tab');
    assert.ok(tab, 'the rail places are no longer styled as one thing');
    assert.match(tab.body, /justify-content\s*:\s*flex-start/,
      'the places in the rail centre themselves, so no two labels start at the same place');
  });
});
