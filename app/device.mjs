/**
 * What this installation is, cryptographically.
 *
 * Until now a computer was known by the name somebody typed and a random
 * identifier in a file. That is fine on your own network, where being on the
 * network is itself a claim, and it is not fine the moment two computers talk
 * across the internet: a name is not a proof of anything, and neither is an
 * address.
 *
 * So every installation gets a key pair it makes itself and never gives away.
 *
 *   The **public half** is the device's name in the only sense that matters. It
 *   travels, it goes in the workspace, and other computers use it to check that
 *   something really came from here.
 *
 *   The **private half** never leaves this computer. Not to GitHub, not to the
 *   workspace, not into a log, not into diagnostics, not into a parcel. There
 *   is no code path here that returns it and no route that can reach it.
 *
 * Ed25519 for signing and X25519 for agreeing a shared secret, both out of
 * Node's own `crypto`, which is OpenSSL. **Nothing here invents cryptography.**
 * Every primitive is one somebody else designed, reviewed and shipped; this
 * file only decides where the keys live and who is allowed to see them.
 */

import {
  generateKeyPairSync, createPrivateKey, createPublicKey,
  sign as signWith, verify as verifyWith, diffieHellman, createHash,
  randomBytes, hkdfSync, createCipheriv, createDecipheriv, timingSafeEqual,
} from 'node:crypto';
import { readFile, writeFile, mkdir, chmod } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { hostname } from 'node:os';

import { HOUSE } from './projects.mjs';

const KEYS = join(HOUSE, 'device-key.json');

const quiet = async (fn, fallback = null) => { try { return await fn(); } catch { return fallback; } };

/**
 * The one thing in this file that is never allowed out.
 *
 * Held in memory rather than re-read, and deliberately not exported. Every
 * function below that needs it takes it from here; nothing returns it.
 */
let secret = null;
let mine = null;

/**
 * Make a device identity, or read the one already here.
 *
 * Two key pairs rather than one, because signing and key agreement are
 * different jobs and using one key for both is the kind of shortcut that is
 * fine until somebody finds the paper about why it is not.
 */
export async function identity() {
  if (mine) return mine;

  if (existsSync(KEYS)) {
    const held = await quiet(async () => JSON.parse(await readFile(KEYS, 'utf8')));
    if (held?.signPrivate && held?.agreePrivate) {
      secret = {
        sign: createPrivateKey({ key: Buffer.from(held.signPrivate, 'base64'), format: 'der', type: 'pkcs8' }),
        agree: createPrivateKey({ key: Buffer.from(held.agreePrivate, 'base64'), format: 'der', type: 'pkcs8' }),
      };
      mine = {
        deviceId: held.deviceId,
        signPublic: held.signPublic,
        agreePublic: held.agreePublic,
        displayName: held.displayName ?? hostname(),
        madeAt: held.madeAt,
      };
      return mine;
    }
  }

  const signing = generateKeyPairSync('ed25519');
  const agreeing = generateKeyPairSync('x25519');

  const signPublic = signing.publicKey.export({ format: 'der', type: 'spki' }).toString('base64');
  const agreePublic = agreeing.publicKey.export({ format: 'der', type: 'spki' }).toString('base64');

  const held = {
    // Derived from the public key rather than random, so it cannot be claimed
    // by anybody who does not hold the matching private half. Short enough to
    // show a person, long enough that guessing one is not a strategy.
    deviceId: fingerprint(signPublic),
    signPublic,
    agreePublic,
    signPrivate: signing.privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64'),
    agreePrivate: agreeing.privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64'),
    displayName: hostname(),
    madeAt: Date.now(),
  };

  await mkdir(HOUSE, { recursive: true });
  await writeFile(KEYS, JSON.stringify(held, null, 2), 'utf8');
  // As close to "only this account" as a file gets. Windows ignores the mode
  // and inherits the folder's own permissions, which for a profile folder is
  // already this account — so this helps everywhere else and harms nowhere.
  await quiet(() => chmod(KEYS, 0o600));

  secret = {
    sign: signing.privateKey,
    agree: agreeing.privateKey,
  };
  mine = {
    deviceId: held.deviceId,
    signPublic,
    agreePublic,
    displayName: held.displayName,
    madeAt: held.madeAt,
  };
  return mine;
}

/** A short, stable name for a public key. Safe to show and safe to log. */
export function fingerprint(publicKeyBase64) {
  const digest = createHash('sha256').update(publicKeyBase64).digest('hex');
  return digest.slice(0, 32);
}

/** What this device tells others about itself. Public halves only. */
export async function card() {
  const me = await identity();
  return {
    deviceId: me.deviceId,
    signPublic: me.signPublic,
    agreePublic: me.agreePublic,
    displayName: me.displayName,
  };
}

/** Change what this device calls itself. Its identity does not change. */
export async function rename(displayName) {
  const name = String(displayName ?? '').trim().slice(0, 60);
  if (!name) return { ok: false, sentence: 'A computer needs a name.', action: 'Type one.' };

  await identity();
  const held = JSON.parse(await readFile(KEYS, 'utf8'));
  held.displayName = name;
  await writeFile(KEYS, JSON.stringify(held, null, 2), 'utf8');
  mine = { ...mine, displayName: name };
  return { ok: true, sentence: `This computer is called ${name} now.` };
}

// ---------------------------------------------------------------------------
// Saying something and proving it was you
// ---------------------------------------------------------------------------

/** Sign some bytes with this device's private key. */
export async function signed(bytes) {
  await identity();
  return signWith(null, Buffer.from(bytes), secret.sign).toString('base64');
}

/** Was this really signed by the device that holds that public key? */
export function verify(bytes, signature, signPublicBase64) {
  try {
    const key = createPublicKey({
      key: Buffer.from(signPublicBase64, 'base64'), format: 'der', type: 'spki',
    });
    return verifyWith(null, Buffer.from(bytes), key, Buffer.from(signature, 'base64'));
  } catch { return false; }
}

// ---------------------------------------------------------------------------
// Agreeing a secret with one other device
// ---------------------------------------------------------------------------

/**
 * The key two devices share, which neither of them ever sends.
 *
 * X25519: each side combines its own private half with the other's public half
 * and both arrive at the same bytes. Anybody watching every packet learns
 * nothing, which is what makes a relay that forwards ciphertext acceptable —
 * the relay is one of the things watching.
 *
 * The result goes through HKDF rather than being used raw, because a raw
 * Diffie-Hellman output is not a uniformly random key and every guide says so.
 * Both sides mix in the same salt and the same label so a key agreed for one
 * purpose cannot be replayed as a key for another.
 */
export async function sharedWith(theirAgreePublicBase64, { salt, label = 'viberant-peer' }) {
  await identity();
  const theirs = createPublicKey({
    key: Buffer.from(theirAgreePublicBase64, 'base64'), format: 'der', type: 'spki',
  });
  const raw = diffieHellman({ privateKey: secret.agree, publicKey: theirs });
  return Buffer.from(hkdfSync('sha256', raw, Buffer.from(salt), Buffer.from(label), 32));
}

/**
 * A box only the other device can open.
 *
 * AES-256-GCM, which authenticates as well as hides: a relay that changes one
 * byte in the middle produces something that will not open, rather than
 * something that opens differently. The counter is random per box and travels
 * with it, because reusing one with the same key is the one mistake this
 * cipher does not survive.
 */
export function seal(key, plain) {
  const counter = randomBytes(12);
  const box = createCipheriv('aes-256-gcm', key, counter);
  const body = Buffer.concat([box.update(Buffer.from(plain)), box.final()]);
  return Buffer.concat([counter, box.getAuthTag(), body]);
}

/** Open one, or answer with nothing. A box that will not open is an answer. */
export function open(key, sealed) {
  try {
    const bytes = Buffer.from(sealed);
    if (bytes.length < 28) return null;
    const box = createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12));
    box.setAuthTag(bytes.subarray(12, 28));
    return Buffer.concat([box.update(bytes.subarray(28)), box.final()]);
  } catch { return null; }
}

/** Compare two secrets without saying how far along they stopped matching. */
export function same(a, b) {
  const one = Buffer.from(String(a ?? ''));
  const two = Buffer.from(String(b ?? ''));
  return one.length === two.length && timingSafeEqual(one, two);
}

/**
 * Forget everything held in memory. For tests, and for signing out.
 *
 * The file stays: a device that forgets its own identity is a new device, and
 * every workspace it was in would have to be told about it again.
 */
export const forget = () => { secret = null; mine = null; };

export const KEY_FILE = KEYS;
