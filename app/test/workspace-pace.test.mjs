/**
 * What the shared workspace costs to look at, and who it belongs to.
 *
 * Two faults, both measured rather than argued. Reading the workspace fetched
 * from GitHub every single time — on a timer, and on every click — so from
 * another network every interaction waited seconds on a round trip that had
 * just happened. And a write GitHub had already refused was retried on every
 * heartbeat, paying a failed round trip each time to learn the same thing.
 *
 * Held here as source facts, because the expensive parts are network calls that
 * a test must not actually make.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const here = new URL('.', import.meta.url);
const source = async (name) => (await readFile(new URL(name, here), 'utf8')).replaceAll('\r\n', '\n');

describe('looking at the workspace does not cost a round trip every time', () => {
  test('fetching is on a clock, not on every read', async () => {
    const ws = await source('../workspace.mjs');
    const sync = ws.slice(ws.indexOf('export async function sync('));
    const body = sync.slice(0, sync.indexOf('\n}\n'));

    assert.match(body, /if \(force \|\| Date\.now\(\) - lastPull > PULL_EVERY\)/,
      'the workspace is fetched from GitHub on every read again');
    assert.match(ws, /const PULL_EVERY = \d+/);

    // The one fetch there is happens after the clock is consulted, never before.
    const fetches = [...body.matchAll(/await pull\(\)/g)].map((one) => one.index);
    assert.equal(fetches.length, 1, 'the workspace is fetched more than once per read');
    assert.ok(fetches[0] > body.indexOf('lastPull > PULL_EVERY'),
      'it fetches before asking whether it needs to');
  });

  test('a refusal already known is not asked for again every beat', async () => {
    const ws = await source('../workspace.mjs');
    assert.match(ws, /const ASK_AGAIN = /);
    assert.match(ws, /if \(refusal && Date\.now\(\) - refusal\.at < ASK_AGAIN\) return refusal\.why/);

    const sync = ws.slice(ws.indexOf('export async function sync('));
    const body = sync.slice(0, sync.indexOf('\n}\n'));
    assert.match(body, /const barred = await whyItCannotWrite\(\)/);
    assert.ok(body.indexOf('const barred') < body.indexOf('await push('),
      'it tries the write before finding out it is refused');
  });

  test('who it belongs to is worked out once and kept', async () => {
    const ws = await source('../workspace.mjs');
    const fn = ws.slice(ws.indexOf('export async function belongsTo('));
    const body = fn.slice(0, fn.indexOf('\n}\n'));
    assert.match(body, /if \(!belonging\)/, 'the address is read from GitHub every time');
    assert.match(ws, /export function forgetWhoCanWrite/, 'nothing can ask it to look again');
  });
});

describe('the workspace account and the Viberant account are two things', () => {
  test('both are reported, and neither is guessed from the other', async () => {
    const ws = await source('../workspace.mjs');
    const fn = ws.slice(ws.indexOf('export async function belongsTo('));
    const body = fn.slice(0, fn.indexOf('\n}\n'));

    // The owner comes from the workspace's own address, never from the session.
    assert.match(body, /remote', 'get-url', 'origin'/);
    assert.match(body, /workspaceGithub/);
    assert.match(body, /signedInAs/);
    assert.match(body, /differentAccount/);
    assert.equal(/owner: .*session|owner: .*login/.test(body), false,
      'the owner is being taken from whoever is signed in');
  });

  test('a workspace on another account is explained, not called a network fault', async () => {
    const ws = await source('../workspace.mjs');
    assert.match(ws, /This workspace belongs to \$\{who\.owner\}\. Connect an account with access to continue syncing\./);
    assert.match(ws, /archived so it is read-only|repository was archived/,
      'an archived workspace is still reported as something else');
  });

  test('the page shows both accounts rather than one', async () => {
    const page = await source('../ui/app.js');
    assert.match(page, /Workspace owner/);
    assert.match(page, /Workspace GitHub/);
    assert.match(page, /Current Viberant GitHub/);
  });
});

describe('the account menu is a mark, a title and a line under it', () => {
  test('every row has a title of its own that can be laid out', async () => {
    const page = await source('../ui/app.js');
    const make = page.slice(page.indexOf('const row = (title, about)'));
    assert.match(make.slice(0, 300), /<b class="pick-title">\$\{title\}<\/b>/,
      'titles are bare text again, so nothing can wrap them');
    // Nothing in the menu may put the description beside the title by hand.
    const menu = page.slice(page.indexOf('panel.innerHTML = `'), page.indexOf('// It was placed while it said'));
    assert.equal(/<span class="grow">[^<]*[A-Za-z][^<]*<span class="sub">/.test(menu), false,
      'a row still runs its title and description together on one line');
  });

  test('the menu gives way rather than cutting words off', async () => {
    const style = await source('../ui/style.css');
    assert.match(style, /\.rail \.panel \.pick \{[^}]*grid-template-columns: auto minmax\(0, 1fr\)/,
      'the row cannot shrink, so long words are cut off at the edge');
    assert.match(style, /\.rail \.panel \.pick \.pick-title \{[^}]*display: block/);
    assert.match(style, /\.rail \.panel \.sub \{[^}]*display: block/);
  });
});
