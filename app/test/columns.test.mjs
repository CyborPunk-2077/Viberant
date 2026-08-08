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
