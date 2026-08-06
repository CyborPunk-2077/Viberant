/**
 * Folders moving between your computers.
 *
 * Two things are being proved here and they matter in this order:
 *
 *   Nobody else can take your work. A computer on the same network that does
 *   not hold the key gets nothing, whatever it claims to be. That is the whole
 *   safety of this feature and it is tested first.
 *
 *   A folder that arrives is the folder that left. Every file, every byte, and
 *   nothing outside the folder it was put into — including when the other end
 *   says something it should not.
 *
 * A parcel cut off half way is tested too, because a project that is two thirds
 * there and looks finished is worse than one that never arrived.
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { createHmac } from 'node:crypto';
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { platform } from 'node:process';

const WINDOWS = platform === 'win32';

let root, oldHome;
const restore = (name, was) => { if (was === undefined) delete process.env[name]; else process.env[name] = was; };

/** A door of our own, so a copy of the app already running is not disturbed. */
const CARRY = 47893;
const CALL = 47894;
const KEY = 'a-key-only-your-own-computers-have-abcdef0123456789';
const ACCOUNT = 'someone';

before(async () => {
  root = await mkdtemp(join(tmpdir(), 'viberant-across-'));
  oldHome = { HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE };
  process.env.HOME = join(root, 'home');
  process.env.USERPROFILE = join(root, 'home');
  await mkdir(join(root, 'home'), { recursive: true });
});

after(async () => {
  const lan = await import('../lan.mjs');
  await lan.stop();
  restore('HOME', oldHome.HOME);
  restore('USERPROFILE', oldHome.USERPROFILE);
  await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
});

/** A folder with something in it, and something in it that should not travel. */
async function folder(name) {
  const at = join(root, name);
  await mkdir(join(at, 'src', 'deep'), { recursive: true });
  await mkdir(join(at, 'node_modules', 'a-package'), { recursive: true });
  await writeFile(join(at, 'readme.txt'), 'the point of the project\n');
  await writeFile(join(at, 'src', 'deep', 'thing.js'), 'x'.repeat(9000));
  await writeFile(join(at, 'src', 'empty.txt'), '');
  await writeFile(join(at, 'node_modules', 'a-package', 'huge.bin'), 'y'.repeat(50_000));
  return at;
}

const goodPass = () => createHmac('sha256', KEY)
  .update(`${ACCOUNT}|${Math.floor(Date.now() / 60000)}`).digest('hex');

/** Ask the door a question, the way another computer would. */
function knock(path, pass) {
  return new Promise((done) => {
    const req = request({
      host: '127.0.0.1', port: CARRY, path,
      headers: pass ? { 'x-viberant-pass': pass } : {},
    }, (res) => done(res));
    req.on('error', () => done(null));
    req.end();
  });
}

const readAll = async (res) => {
  let body = '';
  for await (const chunk of res) body += chunk;
  return body;
};

// ---------------------------------------------------------------------------

describe('wrapping a folder up so it can travel', () => {
  test('what comes out the other end is what went in', async () => {
    const parcel = await import('../parcel.mjs');
    const from = await folder('going');

    const out = await parcel.unwrap(parcel.wrap(from), join(root, 'arrived'));
    assert.equal(out.ok, true, out.sentence);

    assert.equal(await readFile(join(root, 'arrived', 'readme.txt'), 'utf8'), 'the point of the project\n');
    assert.equal((await readFile(join(root, 'arrived', 'src', 'deep', 'thing.js'))).length, 9000);
    assert.ok(existsSync(join(root, 'arrived', 'src', 'empty.txt')), 'an empty file is still a file');
  });

  test('the folders that get rebuilt anyway are left behind, unless you say otherwise', async () => {
    const parcel = await import('../parcel.mjs');
    const from = await folder('heavy');

    const light = await parcel.weigh(from);
    const all = await parcel.weigh(from, { everything: true });
    assert.equal(light.files, 3);
    assert.equal(all.files, 4);
    assert.ok(all.bytes > light.bytes + 40_000);

    await parcel.unwrap(parcel.wrap(from), join(root, 'light'));
    assert.ok(!existsSync(join(root, 'light', 'node_modules')));

    await parcel.unwrap(parcel.wrap(from, { everything: true }), join(root, 'all'));
    assert.ok(existsSync(join(root, 'all', 'node_modules', 'a-package', 'huge.bin')));
  });

  test('nothing can be made to land outside the folder it was put into', async () => {
    const parcel = await import('../parcel.mjs');
    const into = join(root, 'safe');
    assert.equal(parcel.safely(into, '../../elsewhere.txt'), null);
    assert.equal(parcel.safely(into, '..\\..\\elsewhere.txt'), null);
    assert.equal(parcel.safely(into, '/etc/passwd'), join(into, 'etc', 'passwd'));
    assert.ok(parcel.safely(into, 'src/fine.js').startsWith(into));
  });

  test('a parcel cut off half way leaves nothing behind that looks finished', async () => {
    const parcel = await import('../parcel.mjs');
    const { PassThrough } = await import('node:stream');
    const from = await folder('cut');

    // Wrapped whole first, then handed over with the end missing — which is
    // what a network that drops half way actually looks like.
    const pieces = [];
    for await (const chunk of parcel.wrap(from)) pieces.push(chunk);
    const whole = Buffer.concat(pieces);

    const half = new PassThrough();
    half.end(whole.subarray(0, Math.floor(whole.length * 0.6)));

    const out = await parcel.unwrap(half, join(root, 'partial'));
    assert.equal(out.ok, false);
    assert.match(out.sentence, /stopped arriving/);
    assert.ok(!existsSync(join(root, 'partial')), 'nothing was left where a finished folder would be');
  });
});

describe('the door your other computers knock on', () => {
  test('it does not open at all until this computer has a key', async () => {
    const lan = await import('../lan.mjs');
    const r = await lan.start({ machine: 'me', name: 'This one', account: ACCOUNT, key: null });
    assert.equal(r.ok, false);
    assert.match(r.sentence, /cannot find each other/);
    assert.equal(lan.isOn(), false, 'and nothing is listening');
  });

  test('with a key, it opens', async () => {
    const lan = await import('../lan.mjs');
    const r = await lan.start({
      machine: 'me', name: 'This one', account: ACCOUNT, key: KEY, carryPort: CARRY, callPort: CALL,
    });
    assert.equal(r.ok, true, r.sentence);
    assert.equal(lan.isOn(), true);
  });

  test('a stranger on the same network is told nothing', async () => {
    for (const pass of [null, 'not-the-key', createHmac('sha256', 'a-different-key').update('x').digest('hex')]) {
      const res = await knock('/offers', pass);
      assert.equal(res.statusCode, 403, `a pass of ${pass} must not get in`);
      res.resume();
    }
  });

  test('and cannot take a folder either, even knowing exactly what to ask for', async () => {
    const lan = await import('../lan.mjs');
    const made = await lan.offer({ path: await folder('offered'), about: 'the one being tested' });
    assert.equal(made.ok, true, made.sentence);

    const res = await knock(`/parcel?id=${made.offer.id}`, 'not-the-key');
    assert.equal(res.statusCode, 403);
    res.resume();
  });

  test('your own computer, holding the key, is told what is on offer', async () => {
    const res = await knock('/offers', goodPass());
    assert.equal(res.statusCode, 200);
    const said = JSON.parse(await readAll(res));
    assert.equal(said.ok, true);
    assert.deepEqual(said.offers.map((o) => o.name), ['offered']);
    assert.equal(said.offers[0].files, 3, 'and how much of it there is, before taking any');
  });

  test('and can take it, whole', async () => {
    const lan = await import('../lan.mjs');
    const parcel = await import('../parcel.mjs');
    const [one] = await lan.offers();

    const res = await knock(`/parcel?id=${one.id}`, goodPass());
    assert.equal(res.statusCode, 200);
    assert.equal(res.headers['x-viberant-name'], 'offered');

    const out = await parcel.unwrap(res, join(root, 'taken'));
    assert.equal(out.ok, true, out.sentence);
    assert.equal(out.files, 3);
    assert.equal(await readFile(join(root, 'taken', 'readme.txt'), 'utf8'), 'the point of the project\n');
  });

  test('what is offered can be taken back, and then it is gone', async () => {
    const lan = await import('../lan.mjs');
    const [one] = await lan.offers();
    const r = await lan.withdraw(one.id);
    assert.equal(r.ok, true);
    assert.match(r.sentence, /no longer offered/);

    const res = await knock(`/parcel?id=${one.id}`, goodPass());
    assert.equal(res.statusCode, 404);
    res.resume();
  });

  test('a computer that is not on this network cannot be asked for anything', async () => {
    const lan = await import('../lan.mjs');
    const r = await lan.offeredBy('a-computer-that-is-not-here');
    assert.equal(r.ok, false);
    assert.match(r.sentence, /not on this network/);
    assert.ok(r.action);
  });

  test('turning it off closes the door', async () => {
    const lan = await import('../lan.mjs');
    await lan.stop();
    assert.equal(lan.isOn(), false);
    assert.equal(await knock('/offers', goodPass()), null, 'nothing answers any more');
  });
});

describe('telling a window from a terminal program', () => {
  test('a program says which of the two it is, and is believed', { skip: !WINDOWS }, async () => {
    const { kindOfProgram } = await import('../windowed.mjs');
    assert.equal(await kindOfProgram(process.execPath), 'terminal', 'Node is a terminal program');

    const explorer = join(process.env.SystemRoot ?? 'C:\\Windows', 'explorer.exe');
    if (existsSync(explorer)) {
      assert.equal(await kindOfProgram(explorer), 'window', 'Explorer is a window');
    }
  });

  test('anything that is not a program at all is not guessed about', async () => {
    const { kindOfProgram, isWindowed } = await import('../windowed.mjs');
    const notAProgram = join(root, 'plain.txt');
    await writeFile(notAProgram, 'just some words');
    assert.equal(await kindOfProgram(notAProgram), null);
    assert.equal(await kindOfProgram(join(root, 'nothing-here.exe')), null);
    assert.equal(await isWindowed(notAProgram), false);
  });
});

describe('settings', () => {
  test('everything has a sensible answer before anybody has said anything', async () => {
    const settings = await import('../settings.mjs');
    const now = await settings.all();
    assert.ok(now.machineName, 'this computer has a name whether or not you gave it one');
    assert.equal(now.appearance, 'system');
    assert.equal(now.opening, true);
  });

  test('changing one keeps it, and it comes back described in plain words', async () => {
    const settings = await import('../settings.mjs');
    const r = await settings.set('appearance', 'dark');
    assert.equal(r.ok, true, r.sentence);

    const described = await settings.described();
    const one = described.find((s) => s.id === 'appearance');
    assert.equal(one.value, 'dark');
    assert.equal(one.isDefault, false);
    assert.ok(one.why.length > 20, 'and it says what it does');
  });

  test('a setting that is not a setting, and a choice that is not a choice, are declined', async () => {
    const settings = await import('../settings.mjs');
    const nope = await settings.set('turboMode', true);
    assert.equal(nope.ok, false);
    assert.ok(nope.action);

    const bad = await settings.set('appearance', 'chartreuse');
    assert.equal(bad.ok, false);
    assert.ok(bad.action);
  });

  test('putting them back leaves everything else alone', async () => {
    const settings = await import('../settings.mjs');
    await settings.set('machineName', 'The laptop');
    assert.equal(await settings.get('machineName'), 'The laptop');

    await settings.forgetAll();
    assert.equal(await settings.get('appearance'), 'system');
    assert.notEqual(await settings.get('machineName'), 'The laptop');
  });
});
