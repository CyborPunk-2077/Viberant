/**
 * Putting a site online, and finding out whether it actually went.
 *
 * Two faults live here and both of them lied in the same direction, which is
 * the direction this project cares about most.
 *
 * The first said a site was not up when it had been up the whole time. A
 * pattern that matched an address took the quotation mark printed after it as
 * part of the address; the check that fetched it then threw on something that
 * was not an address, quietly, once every three seconds for five minutes, and
 * reported "nothing was being served".
 *
 * The second is the one that was there before either: reporting that a command
 * exited as though that were a site being online. It is not. It is a command
 * exiting.
 */

import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { whatVercelSaid } from '../providers.mjs';

/*
 * The end of a function is found below by looking for a line that is only its
 * closing brace. On a computer whose files carry a carriage return as well,
 * that line is never found and the slice becomes the whole rest of the file —
 * so a check that this one function never does something quietly becomes a
 * search of everything after it. Made the same first.
 */
const sameLines = (text) => text.replaceAll('\r\n', '\n');

const here = dirname(fileURLToPath(import.meta.url));

/** Exactly what the command printed, on the day this was written. */
const REAL_OUTPUT = `> vercel.cmd deploy --prod --yes

Vercel CLI 58.8.0 (Node.js 24.19.0)
Loading teams…
  Directory       ~\\AppData\\Local\\Temp\\viberant-deploy-check
Searching for existing projects…
  No framework detected. Default Project Settings:
  Build Command: \`npm run vercel-build\` or \`npm run build\`
  Output Directory: \`public\` if it exists, or \`.\`
✓ Created         abhi-s-projects20/viberant-deploy-check
Deploying abhi-s-projects20/viberant-deploy-check
  Inspect         https://vercel.com/abhi-s-projects20/viberant-deploy-check/D8jhNH8JkCpxUyXHdMTGpk9HiSuP
  Production      https://viberant-deploy-check-czzrx4ye4-abhi-s-projects20.vercel.app
Building…
  Production      https://viberant-deploy-check-czzrx4ye4-abhi-s-projects20.vercel.app
Completing…
▲ Aliased         https://viberant-deploy-check.vercel.app
{
  "status": "ok",
  "deployment": {
    "id": "dpl_D8jhNH8JkCpxUyXHdMTGpk9HiSuP",
    "url": "https://viberant-deploy-check-czzrx4ye4-abhi-s-projects20.vercel.app",
    "inspectorUrl": "https://vercel.com/abhi-s-projects20/viberant-deploy-check/D8jhNH8JkCpxUyXHdMTGpk9HiSuP",
    "readyState": "READY",
    "target": "production"
  },
  "message": "Deployment viberant-deploy-check-czzrx4ye4-abhi-s-projects20.vercel.app ready.",
  "next": [
    {
      "command": "vercel curl https://viberant-deploy-check-czzrx4ye4-abhi-s-projects20.vercel.app",
      "when": "Verify deployment, including when Deployment Protection is enabled"
    }
  ]
}`;

let source;
before(async () => { source = sameLines(await readFile(join(here, '..', 'providers.mjs'), 'utf8')); });

describe('reading what the command printed', () => {
  test('the address is the short one, and nothing is stuck to the end of it', async () => {
    const said = whatVercelSaid(REAL_OUTPUT.split('\n'));

    assert.equal(said.address, 'https://viberant-deploy-check.vercel.app');
    assert.equal(/["'`).,\\]$/.test(said.address), false,
      'punctuation printed after the address was taken as part of it');
    assert.doesNotThrow(() => new URL(said.address), 'that is not an address anything could fetch');
  });

  test('the identifier is read, so the deployment can be asked about directly', async () => {
    const said = whatVercelSaid(REAL_OUTPUT.split('\n'));
    assert.equal(said.id, 'dpl_D8jhNH8JkCpxUyXHdMTGpk9HiSuP');
    assert.match(said.inspect, /^https:\/\/vercel\.com\//);
  });

  test('an older one that prints no machine-readable part still works', async () => {
    const said = whatVercelSaid([
      'Deploying somebody/thing',
      '  Inspect         https://vercel.com/somebody/thing/abc',
      '  Production      https://thing-h7d8f9a2k-somebody.vercel.app',
      '✓ Production: https://thing-h7d8f9a2k-somebody.vercel.app',
    ]);
    assert.equal(said.address, 'https://thing-h7d8f9a2k-somebody.vercel.app');
    assert.equal(said.id, null);
  });

  test('and one that printed nothing usable says so rather than guessing', async () => {
    assert.equal(whatVercelSaid(['Error: something went wrong']).address, null);
  });
});

describe('a command exiting is not a site being online', () => {
  test('the deploy asks afterwards, every time', () => {
    const body = source.slice(source.indexOf('async deploy(job, jobs'));
    const mine = body.slice(0, body.indexOf('\n  },'));

    assert.match(mine, /waitUntilLive|waitUntilAnswering/,
      'nothing checks whether the address serves anything');
    // And the check cannot be skipped on the strength of the exit code alone.
    assert.equal(/return \{\s*ok: true[^}]*\};\s*$/.test(mine.split('waitUntil')[0]), false,
      'there is a way to report success before anything is checked');
  });

  test('an answer that is not success is still an answer', () => {
    // Deployment protection replies 401. That is a site that is up and asking
    // who you are, and reporting it as a site that never came up is wrong.
    const body = source.slice(source.indexOf('async waitUntilAnswering('));
    assert.match(body.slice(0, 1600), /code !== 502 && code !== 503/,
      'only the two states Vercel serves while there is nothing to serve should fail this');
  });

  test('and the token never becomes part of a command', () => {
    const body = source.slice(source.indexOf('async deploy(job, jobs'));
    const mine = body.slice(0, body.indexOf('\n  },'));

    const args = mine.slice(mine.indexOf('args:'), mine.indexOf('cwd:'));
    assert.equal(/token/i.test(args), false, 'the token is in the arguments, which are written down');
    assert.match(mine, /env: \{ VERCEL_TOKEN/, 'the token no longer reaches the command at all');
  });
});

describe('being connected, and the three ways of not being', () => {
  test('a token that is refused is not a connection', () => {
    const body = source.slice(source.indexOf('async state('), source.indexOf('async checkToken('));
    assert.match(body, /said\.status === 401 \|\| said\.status === 403/);
    assert.match(body, /lastVercel = null/,
      'a refused token leaves the last good answer in place, which would keep reading as connected');
  });

  test('and being unable to ask is neither of the other two', () => {
    const body = source.slice(source.indexOf('async state('), source.indexOf('async checkToken('));
    assert.match(body, /said === null/, 'unreachable is not told apart from refused');
    assert.match(body, /reachable: false/);
  });

  test('the command being signed in on its own counts', () => {
    const body = source.slice(source.indexOf('async state('), source.indexOf('async checkToken('));
    assert.match(body, /whoTheCliThinks\(\)/,
      'somebody who signed the command in themselves is told they are not connected');
  });
});
