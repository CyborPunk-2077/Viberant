/**
 * A device's identity, and the half of it that must never leave.
 *
 * Everything reaching across the internet stands on this. A name is not a proof
 * and an address is not a proof; a signature made with a key only one computer
 * holds is. So the tests that matter here are not "does signing work" — they
 * are **can the private half get out**, asked of every route a byte could take.
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
let root;

before(async () => {
  root = await mkdtemp(join(tmpdir(), 'viberant-device-'));
  await mkdir(join(root, 'home'), { recursive: true });
  process.env.USERPROFILE = join(root, 'home');
  process.env.HOME = join(root, 'home');
});

after(async () => {
  await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
});

describe('a device knows what it is, and stays that thing', () => {
  test('it makes an identity once and reads the same one back', async () => {
    const device = await import('../device.mjs');

    const first = await device.identity();
    assert.match(first.deviceId, /^[0-9a-f]{32}$/);
    assert.ok(first.signPublic && first.agreePublic);

    device.forget();
    const again = await device.identity();
    assert.equal(again.deviceId, first.deviceId, 'a computer must not become a new one on restart');
    assert.equal(again.signPublic, first.signPublic);
  });

  test('the identifier comes from the key, so it cannot be claimed', async () => {
    const device = await import('../device.mjs');
    const me = await device.identity();
    assert.equal(me.deviceId, device.fingerprint(me.signPublic));

    // Somebody else's key gives somebody else's name, always.
    assert.notEqual(device.fingerprint('a-different-key'), me.deviceId);
  });

  test('renaming changes the name and not the identity', async () => {
    const device = await import('../device.mjs');
    const before_ = await device.identity();
    assert.equal((await device.rename('RTX-PC')).ok, true);
    const after_ = await device.identity();

    assert.equal(after_.displayName, 'RTX-PC');
    assert.equal(after_.deviceId, before_.deviceId, 'a rename must not orphan it from every workspace');
    assert.equal((await device.rename('   ')).ok, false, 'and a name is required');
  });
});

describe('the private half never leaves this computer', () => {
  test('nothing this module hands out contains it', async () => {
    const device = await import('../device.mjs');
    const held = JSON.parse(await readFile(device.KEY_FILE, 'utf8'));

    const secrets = [held.signPrivate, held.agreePrivate];
    for (const s of secrets) assert.ok(s && s.length > 40, 'the fixture is wrong');

    // Everything with a name that anybody could call.
    const shown = JSON.stringify({
      identity: await device.identity(),
      card: await device.card(),
      fingerprint: device.fingerprint((await device.identity()).signPublic),
    });

    for (const s of secrets) {
      assert.equal(shown.includes(s), false, 'a private key came back out of this module');
    }
  });

  test('no function here returns it, and none is exported that could', async () => {
    const source = await readFile(join(here, '..', 'device.mjs'), 'utf8');
    const code = source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

    // The variable holding it must not be exported, and must not be returned.
    assert.equal(/export\s+(const|let|var|function)\s+secret\b/.test(code), false,
      'the private key is exported by name');
    assert.equal(/export\s*\{[^}]*\bsecret\b/.test(code), false,
      'the private key is exported in a list');
    assert.equal(/\breturn\s+secret\b/.test(code), false,
      'a function hands the private key back');
    assert.equal(/\bsecret\s*[,:}]/.test(code.replace(/secret\s*=/g, '')), false,
      'the private key is put into an object that something could return');

    // And nothing prints it.
    assert.equal(/console\.(log|error|warn|info)/.test(code), false,
      'nothing in here may print, because the only thing in here worth printing is the one thing that must not be');
  });

  test('what a device tells others is public halves only', async () => {
    const device = await import('../device.mjs');
    const said = await device.card();
    assert.deepEqual(Object.keys(said).sort(),
      ['agreePublic', 'deviceId', 'displayName', 'signPublic']);
  });
});

describe('a signature says who, and a changed message says nothing', () => {
  test('this device can prove something came from it', async () => {
    const device = await import('../device.mjs');
    const me = await device.identity();

    const sig = await device.signed('join workspace 7K2F');
    assert.equal(device.verify('join workspace 7K2F', sig, me.signPublic), true);
  });

  test('one changed byte and the proof is gone', async () => {
    const device = await import('../device.mjs');
    const me = await device.identity();
    const sig = await device.signed('bring me the project Atlas');

    assert.equal(device.verify('bring me the project atlas', sig, me.signPublic), false);
    assert.equal(device.verify('bring me the project Atlas', sig, 'not-a-key'), false);
    assert.equal(device.verify('bring me the project Atlas', 'not-a-signature', me.signPublic), false);
  });
});

describe('two devices agree a secret neither of them sends', () => {
  /** A second device, made the way a second computer would make one. */
  const another = async () => {
    const { generateKeyPairSync, diffieHellman, createPublicKey, hkdfSync } = await import('node:crypto');
    const pair = generateKeyPairSync('x25519');
    return {
      agreePublic: pair.publicKey.export({ format: 'der', type: 'spki' }).toString('base64'),
      shared: (theirsBase64, salt) => {
        const theirs = createPublicKey({
          key: Buffer.from(theirsBase64, 'base64'), format: 'der', type: 'spki',
        });
        const raw = diffieHellman({ privateKey: pair.privateKey, publicKey: theirs });
        return Buffer.from(hkdfSync('sha256', raw, Buffer.from(salt), Buffer.from('viberant-peer'), 32));
      },
    };
  };

  test('both ends reach the same key without it crossing the wire', async () => {
    const device = await import('../device.mjs');
    const me = await device.identity();
    const them = await another();
    const salt = 'a-shared-salt-for-this-conversation';

    const ours = await device.sharedWith(them.agreePublic, { salt });
    const theirs = them.shared(me.agreePublic, salt);

    assert.equal(Buffer.compare(ours, theirs), 0);
    assert.equal(ours.length, 32);
  });

  test('a different conversation is a different key, so nothing replays', async () => {
    const device = await import('../device.mjs');
    const them = await another();

    const one = await device.sharedWith(them.agreePublic, { salt: 'conversation-one' });
    const two = await device.sharedWith(them.agreePublic, { salt: 'conversation-two' });
    assert.notEqual(Buffer.compare(one, two), 0);
  });

  test('what is sealed can be opened by the other end and nobody else', async () => {
    const device = await import('../device.mjs');
    const them = await another();
    const me = await device.identity();

    const ours = await device.sharedWith(them.agreePublic, { salt: 's' });
    const box = device.seal(ours, 'the whole of a project parcel');

    assert.equal(box.includes(Buffer.from('the whole of a project parcel')), false,
      'a relay watching this would read it');

    const theirs = them.shared(me.agreePublic, 's');
    assert.equal(device.open(theirs, box).toString(), 'the whole of a project parcel');

    // Somebody else's key opens nothing.
    const stranger = await another();
    const wrong = stranger.shared(me.agreePublic, 's');
    assert.equal(device.open(wrong, box), null);
  });

  test('a box changed in the middle will not open at all', async () => {
    const device = await import('../device.mjs');
    const them = await another();
    const key = await device.sharedWith(them.agreePublic, { salt: 's' });

    const box = device.seal(key, 'run this command');
    for (const at of [0, 15, box.length - 1]) {
      const tampered = Buffer.from(box);
      tampered[at] ^= 0xFF;
      assert.equal(device.open(key, tampered), null,
        `a byte changed at ${at} produced something that opened`);
    }
  });
});
