/**
 * The half of the web companion handshake that runs in a browser.
 *
 * The fault this holds is the one that survived two rounds of "it works here":
 * the approval finishes in a *different window*, and when the one request that
 * crosses from a hosted page to this computer was refused by the browser rather
 * than by Viberant, the call threw, nothing caught it, and the handshake ended
 * in silence. One page said "waiting for approval" and the other said "not
 * connected", neither said why, and no test noticed because the browser doing
 * the testing allowed the request.
 *
 * So this runs the generated client's own source against a fake browser, with
 * the bridge refusing the way a browser refuses, and holds it to reporting a
 * reason to the window that is waiting.
 */

import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import * as webtarget from '../webtarget.mjs';

let client;

before(async () => {
  const root = await mkdtemp(join(tmpdir(), 'viberant-companion-client-'));
  const proj = join(root, 'Thing');
  await mkdir(proj, { recursive: true });
  await writeFile(join(proj, 'app.js'), "document.title = 'x';\n", 'utf8');
  await writeFile(join(proj, 'native.mjs'), "import { readFile } from 'node:fs/promises';\nexport const l = readFile;\n", 'utf8');
  const made = await webtarget.create(proj, { architecture: 'WEB_COMPANION' });
  assert.equal(made.ok, true, made.sentence);
  client = await readFile(join(proj, 'web', 'viberant-companion.js'), 'utf8');
  await rm(root, { recursive: true, force: true, maxRetries: 5 });
});

/** Enough of a browser for the handshake to run in, with one page's storage. */
function aBrowser({ href, fetch: fakeFetch, opener = null }) {
  const store = new Map();
  const storage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    get length() { return store.size; },
    key: (i) => [...store.keys()][i],
  };
  const listeners = new Map();
  const win = {
    location: new URL(href),
    localStorage: storage,
    opener,
    fetch: fakeFetch,
    crypto: { getRandomValues: (a) => { for (let i = 0; i < a.length; i += 1) a[i] = i; return a; }, subtle: { digest: async () => new Uint8Array(32) } },
    history: { replaceState: () => {} },
    document: { body: { dataset: {} }, querySelector: () => null },
    addEventListener: (name, fn) => listeners.set(name, [...(listeners.get(name) ?? []), fn]),
    removeEventListener: () => {},
    setTimeout, clearTimeout, setInterval, clearInterval,
    console: { log: () => {} },
    BroadcastChannel: class { constructor() {} postMessage() {} addEventListener() {} removeEventListener() {} },
    btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
    TextEncoder,
    URL, URLSearchParams,
  };
  win.window = win;
  win.location.search = new URL(href).search;
  return { win, storage };
}

/** Run the generated client inside that fake browser and hand back its globals. */
async function runClient(win) {
  const names = Object.keys(win);
  const fn = new Function(...names, `${client}\nreturn window.ViberantCompanion;`);
  const api = fn(...names.map((n) => win[n]));
  await new Promise((r) => setTimeout(r, 30));
  return api;
}

describe('the companion client says why, rather than stopping in silence', () => {
  test('it carries a runtime version, so what a page is running can be checked', () => {
    assert.match(client, /const RUNTIME = '[^']+'/);
    assert.match(client, /diagnostics/);
  });

  test('a browser refusing the local request is reported, not swallowed', async () => {
    const url = 'https://viberant.vercel.app/?viberant_code=abc&viberant_state=zzz';
    const { win, storage } = aBrowser({
      href: url,
      // What a browser does when it will not let a hosted page reach a local
      // address: the call rejects, rather than answering with a status.
      fetch: async () => { throw new TypeError('Failed to fetch'); },
    });
    storage.setItem('viberant:companion:'
      + client.match(/const PROJECT = '([^']+)'/)[1] + ':pending',
    JSON.stringify({ verifier: 'v', state: 'zzz', attempt: 'a', at: Date.now() }));

    await runClient(win);
    await new Promise((r) => setTimeout(r, 60));

    const project = client.match(/const PROJECT = '([^']+)'/)[1];
    const said = JSON.parse(storage.getItem(`viberant:companion:${project}:result`) ?? 'null');
    assert.ok(said, 'nothing was written down, so the waiting window waits for ever');
    assert.equal(said.ok, false);
    assert.equal(said.reason, 'bridge-unreachable');
    assert.match(said.action, /local network|Viberant is open/i);

    const log = JSON.parse(storage.getItem(`viberant:companion:${project}:log`) ?? '[]');
    assert.ok(log.some((one) => one.step === 'callback.exchangeThrew'), 'the step that failed is not named');
  });

  test('an approval that does not match this page is reported too', async () => {
    const project = client.match(/const PROJECT = '([^']+)'/)[1];
    const { win, storage } = aBrowser({
      href: 'https://viberant.vercel.app/?viberant_code=abc&viberant_state=wrong',
      fetch: async () => ({ ok: true, status: 200, json: async () => ({ ok: true, token: 't' }) }),
    });
    storage.setItem(`viberant:companion:${project}:pending`,
      JSON.stringify({ verifier: 'v', state: 'zzz', attempt: 'a', at: Date.now() }));

    await runClient(win);
    await new Promise((r) => setTimeout(r, 60));

    const said = JSON.parse(storage.getItem(`viberant:companion:${project}:result`) ?? 'null');
    assert.equal(said?.reason, 'state-mismatch');
    assert.equal(storage.getItem(`viberant:companion:${project}`), null, 'a mismatched approval still kept a session');
  });

  test('a good approval keeps the session and says so once', async () => {
    const project = client.match(/const PROJECT = '([^']+)'/)[1];
    const { win, storage } = aBrowser({
      href: 'https://viberant.vercel.app/?viberant_code=abc&viberant_state=zzz',
      fetch: async () => ({ ok: true, status: 200, json: async () => ({ ok: true, token: 'secret-token' }) }),
    });
    storage.setItem(`viberant:companion:${project}:pending`,
      JSON.stringify({ verifier: 'v', state: 'zzz', attempt: 'a', at: Date.now() }));

    const api = await runClient(win);
    await new Promise((r) => setTimeout(r, 60));

    assert.equal(api.connected(), true, 'the session was not kept');
    const said = JSON.parse(storage.getItem(`viberant:companion:${project}:result`) ?? 'null');
    assert.equal(said?.ok, true);
    assert.equal(storage.getItem(`viberant:companion:${project}:pending`), null, 'the half-handshake was left behind');

    // Nothing secret is ever put where the page shows it.
    const shown = JSON.stringify(api.diagnostics());
    assert.equal(/secret-token/.test(shown), false, 'a token reached the diagnostics');
  });
});
