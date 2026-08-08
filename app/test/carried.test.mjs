/**
 * How much went which way, and the line this stays behind.
 *
 * A relay costs somebody money to run and a direct connection does not, so the
 * difference is worth counting before there is a price on it — a number
 * invented afterwards is a number nobody can check.
 *
 * The line: **this is not telemetry.** Nothing here is sent anywhere, nothing
 * records who or what, and a month is the longest anything is kept by day. The
 * tests are mostly about that rather than about addition.
 */

import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
let root, carried;

before(async () => {
  root = await mkdtemp(join(tmpdir(), 'viberant-carried-'));
  await mkdir(join(root, 'home'), { recursive: true });
  process.env.USERPROFILE = join(root, 'home');
  process.env.HOME = join(root, 'home');
  carried = await import('../carried.mjs');
});

after(async () => {
  await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
});

beforeEach(async () => { await carried.forget(); });

describe('bytes are counted by how they travelled', () => {
  test('each way is counted apart from the others', async () => {
    await carried.went('lan', 1000);
    await carried.went('direct', 500);
    await carried.went('relay', 250);
    await carried.went('relay', 250);

    const so = await carried.sofar();
    assert.equal(so.ever.lan, 1000);
    assert.equal(so.ever.direct, 500);
    assert.equal(so.ever.relay, 500);
  });

  test('the two numbers somebody would actually ask for', async () => {
    await carried.went('lan', 1000);
    await carried.went('direct', 2000);
    await carried.went('relay', 300);

    const so = await carried.sofar();
    assert.equal(so.throughARelay, 300, 'the only one that costs anybody anything');
    assert.equal(so.straightAcross, 3000);
  });

  test('a way of travelling nobody has heard of is not counted', async () => {
    await carried.went('carrier-pigeon', 9999);
    await carried.went('lan', 0);
    await carried.went('lan', null);

    const so = await carried.sofar();
    assert.equal(so.ever.lan + so.ever.direct + so.ever.relay, 0);
  });

  test('deleting it is somebody own to do', async () => {
    await carried.went('relay', 5000);
    assert.equal((await carried.sofar()).throughARelay, 5000);

    const out = await carried.forget();
    assert.equal(out.ok, true);
    assert.equal((await carried.sofar()).throughARelay, 0);
  });
});

describe('what is kept, and what is deliberately not', () => {
  test('nothing about who, what, or when beyond a day', async () => {
    await carried.went('relay', 1234);
    await carried.save();

    const onDisk = JSON.parse(await readFile(carried.BOOK_AT, 'utf8'));
    const shape = JSON.stringify(onDisk);

    // Days and three numbers. Nothing else may be in there.
    for (const day of Object.values(onDisk.days)) {
      assert.deepEqual(Object.keys(day).sort(), ['direct', 'lan', 'relay']);
    }
    for (const never of ['device', 'project', 'peer', 'path', 'file', 'who', 'name']) {
      assert.equal(shape.includes(never), false, `${never} is in what is counted`);
    }
  });

  test('a day is the finest it gets, so this is not a record of when somebody worked', async () => {
    await carried.went('lan', 10);
    await carried.save();
    const onDisk = JSON.parse(await readFile(carried.BOOK_AT, 'utf8'));

    for (const day of Object.keys(onDisk.days)) {
      assert.match(day, /^\d{4}-\d{2}-\d{2}$/, 'something finer than a day was written down');
    }
  });

  test('older than a month is folded into one total, so it cannot grow', async () => {
    await carried.went('lan', 100);
    await carried.save();

    // A day from well before the window, put in by hand.
    const onDisk = JSON.parse(await readFile(carried.BOOK_AT, 'utf8'));
    onDisk.days['2020-01-01'] = { lan: 7, direct: 0, relay: 3 };
    const { writeFile } = await import('node:fs/promises');
    await writeFile(carried.BOOK_AT, JSON.stringify(onDisk), 'utf8');

    // Read afresh, then written again, which is when the folding happens.
    const fresh = await import(`../carried.mjs?again=${Date.now()}`);
    await fresh.went('lan', 1);
    await fresh.save();

    const after = JSON.parse(await readFile(carried.BOOK_AT, 'utf8'));
    assert.equal('2020-01-01' in after.days, false, 'an old day was kept');
    assert.equal(after.before.relay, 3, 'and what it counted was lost rather than folded');
  });

  test('nothing in it can reach the network', async () => {
    const source = await readFile(join(here, '..', 'carried.mjs'), 'utf8');
    const code = source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

    for (const way of [/fetch\(/, /http/, /XMLHttpRequest/, /\.send\(/, /socket/i]) {
      assert.equal(way.test(code), false,
        `carried.mjs can ${way} — a counter that can talk is telemetry`);
    }
  });
});

describe('the background is awake only while something is', () => {
  test('it is one number, moving one thing, by a very little', async () => {
    const source = await readFile(join(here, '..', 'ui', 'wallpaper.js'), 'utf8');

    const at = source.indexOf('export function somethingIsHappening');
    assert.ok(at > 0, 'the signal is not there');

    // Four percent. Anything larger and it stops being a background.
    assert.match(source, /const AWAKE_BY = 0\.0[1-6];/,
      'the signal is big enough to notice, which is the one thing it must not be');

    // And it eases rather than switching.
    assert.match(source.slice(at, at + 1200), /requestAnimationFrame/);
  });

  test('it is driven by errands that are actually running', async () => {
    const page = await readFile(join(here, '..', 'ui', 'app.js'), 'utf8');
    const at = page.indexOf('wall.somethingIsHappening');
    assert.ok(at > 0, 'nothing drives it');

    // From the same list the corner is drawn from, so the room and the corner
    // can never disagree about whether anything is happening.
    const around = page.slice(at - 400, at + 100);
    assert.match(around, /moving = now;/);
    assert.match(page.slice(at, at + 60), /somethingIsHappening\(now\.length\)/);
  });

  test('nothing else in the page moves because of it', async () => {
    const css = await readFile(join(here, '..', 'ui', 'style.css'), 'utf8');
    const uses = [...css.matchAll(/--wall-awake/g)].length;
    assert.ok(uses <= 3, `--wall-awake is used ${uses} times; it should move one thing`);
    assert.match(css, /#wall-veil\s*\{[^}]*--wall-awake/,
      'the one thing it moves is how much of the picture shows');
  });
});
