import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import * as webpreview from '../webpreview.mjs';

let target;
let tooled;

before(async () => {
  target = await mkdtemp(join(tmpdir(), 'viberant-webpreview-'));
  await writeFile(join(target, 'index.html'), '<!doctype html><title>Preview me</title><p>hello</p>', 'utf8');
  await writeFile(join(target, 'app.js'), 'document.title = "ran";', 'utf8');
  tooled = await mkdtemp(join(tmpdir(), 'viberant-webpreview-tooled-'));
  await writeFile(join(tooled, 'index.html'), '<!doctype html>', 'utf8');
  await writeFile(join(tooled, 'package.json'), '{"scripts":{"dev":"vite"}}', 'utf8');
});

after(async () => {
  webpreview.closeEverything();
  await rm(target, { recursive: true, force: true });
  await rm(tooled, { recursive: true, force: true });
});

describe('previewing a web target', () => {
  test('serves the folder on this computer only, and finds it again rather than doubling', async () => {
    const first = await webpreview.open({ root: target });
    assert.equal(first.ok, true);
    assert.match(first.at, /^http:\/\/127\.0\.0\.1:\d+\/$/);

    const page = await fetch(first.at);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /Preview me/);
    assert.match(page.headers.get('content-type'), /text\/html/);

    const script = await fetch(`${first.at}app.js`);
    assert.equal(script.status, 200);
    assert.match(script.headers.get('content-type'), /javascript/);

    // A second ask — a redraw, a second press — is the same preview, not
    // another server. One press, one address.
    const second = await webpreview.open({ root: target });
    assert.equal(second.at, first.at);
    assert.equal(webpreview.openWindows().length, 1);
  });

  test('never serves anything outside the folder', async () => {
    const { at } = await webpreview.open({ root: target });
    for (const asked of ['../secret.txt', '..%2f..%2fsecret', '.git/config', '%2e%2e/up']) {
      const answer = await fetch(`${at}${asked}`);
      // Whatever comes back, it is the front page or nothing — never a file
      // from above the folder.
      const text = await answer.text();
      assert.ok(!text.includes('SECRET'), `${asked} must not escape the folder`);
    }
    assert.equal(webpreview.__testOnly.fileFor(target, '/../outside.txt'), null);
    assert.equal(webpreview.__testOnly.fileFor(target, '/.env'), null);
  });

  test('a target that builds with its own tools is refused with the reason, not shown broken', async () => {
    const out = await webpreview.open({ root: tooled });
    assert.equal(out.ok, false);
    assert.match(out.sentence, /its own tools/);
    assert.ok(out.action, 'a refusal carries one thing to do');
  });

  test('a folder with no front page is refused rather than served empty', async () => {
    const bare = await mkdtemp(join(tmpdir(), 'viberant-webpreview-bare-'));
    const out = await webpreview.open({ root: bare });
    assert.equal(out.ok, false);
    assert.match(out.sentence, /front page/);
    await rm(bare, { recursive: true, force: true });
  });

  test('closing stops the server and forgets it', async () => {
    const { at } = await webpreview.open({ root: target });
    const closed = webpreview.close(at);
    assert.equal(closed.ok, true);
    assert.equal(webpreview.openWindows().length, 0);
  });

  /**
   * A route asked for from inside the server, rather than off the wire.
   *
   * Preview needs to know where the web target is, and the answer to that is
   * already a route, so it asks it directly. Nothing arrives with it: there is
   * no address, no body, nobody asking. A route written to take those apart on
   * the way in then throws before it does anything — which is how pressing
   * Preview came to do nothing at all, with the failure never reaching a
   * sentence. So every route reached this way must be answerable with nothing.
   */
  test('a route the server asks itself can be asked with nothing', async () => {
    const source = (await readFile(new URL('../server.mjs', import.meta.url), 'utf8')).replaceAll('\r\n', '\n');

    const asked = [...source.matchAll(/routes\['([^']+)'\]\(\s*\)/g)].map((one) => one[1]);
    assert.ok(asked.length, 'nothing asks a route from inside any more, so this is watching nothing');

    for (const name of asked) {
      const at = source.indexOf(`async '${name}'(`);
      assert.notEqual(at, -1, `${name} is asked for from inside and is not there`);
      const takes = source.slice(at + `async '${name}'(`.length, source.indexOf(')', at));
      assert.ok(takes.trim() === '' || /=\s*\{\s*\}\s*$/.test(takes.trim()),
        `${name} is asked with nothing but insists on taking something apart: (${takes})`);
    }
  });
});
