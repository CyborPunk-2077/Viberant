/**
 * Signing in to Viberant itself with Google.
 *
 * Asked for repeatedly, and refused four times because of one hard fact worth
 * stating plainly: **a Google sign-in cannot exist without an application
 * registered with Google.** Not a limitation of this app — anybody's Google
 * sign-in button, anywhere, is backed by a client the developer registered.
 * There is no anonymous way in, by design.
 *
 * So this is the whole flow, built and working, waiting on the one thing only
 * the owner of the app can supply: a client of your own, made once, in about
 * five minutes. Paste its two values into Settings and the button becomes real.
 *
 * What it uses is Google's device flow — the one televisions use. Your browser
 * shows the account picker, the code travels from here to there, and nothing on
 * this computer ever sees your password.
 *
 * What signing in with Google gets you, honestly: your name and picture on this
 * computer, and a second name for your other computers to know you by. It does
 * not replace GitHub — a second copy of your work still needs somewhere to go,
 * and that is what GitHub is for. Anybody who wants only the account and not the
 * storage can now have exactly that.
 */

import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { HOUSE } from './projects.mjs';

const WHO = join(HOUSE, 'google.json');

const DEVICE_CODE = 'https://oauth2.googleapis.com/device/code';
const TOKEN = 'https://oauth2.googleapis.com/token';
const PERSON = 'https://openidconnect.googleapis.com/v1/userinfo';
const SCOPE = 'openid email profile';

/** Where to go to make one, said once so it is not guessed at. */
export const HOW_TO_REGISTER = 'https://console.cloud.google.com/apis/credentials';

let going = null;

export const state = () => (going
  ? {
    running: going.finished === null,
    code: going.code,
    at: going.at,
    ok: going.ok,
    sentence: going.sentence,
    action: going.action,
  }
  : null);

/** Who Google says you are, if anybody. */
export async function who() {
  if (!existsSync(WHO)) return null;
  try { return JSON.parse(await readFile(WHO, 'utf8')); } catch { return null; }
}

export async function signOut() {
  await rm(WHO, { force: true });
  going = null;
  return { ok: true, sentence: 'Signed out of Google on this computer.' };
}

/**
 * Begin. Returns straight away; the page watches `state()` for the code.
 *
 * The record for this attempt exists before the first `await`, because
 * returning the previous attempt's ending as this one's beginning is a mistake
 * this codebase has now made twice (D-64).
 */
export function begin({ clientId, clientSecret }) {
  if (going && going.finished === null) return state();

  if (!clientId || !clientSecret) {
    return {
      running: false,
      ok: false,
      needsSetup: true,
      sentence: 'Viberant has no Google application of its own yet.',
      action: 'Make one in the Google Cloud console and paste its two values into Settings. It takes about five minutes and is asked once.',
    };
  }

  going = {
    code: null,
    at: 'https://www.google.com/device',
    deviceCode: null,
    finished: null,
    ok: null,
    sentence: null,
    action: null,
  };

  start(going, { clientId, clientSecret });
  return state();
}

async function start(mine, { clientId, clientSecret }) {
  const asked = await form(DEVICE_CODE, { client_id: clientId, scope: SCOPE });
  if (going !== mine) return;

  if (!asked || !asked.device_code) {
    return settle(mine, {
      ok: false,
      sentence: 'Google would not start a sign-in for this application.',
      action: 'Check the client ID and secret in Settings, and that the consent screen is published.',
    });
  }

  mine.code = asked.user_code;
  mine.at = asked.verification_url ?? asked.verification_uri ?? mine.at;
  mine.deviceCode = asked.device_code;

  const every = Math.max(5, Number(asked.interval) || 5) * 1000;
  const until = Date.now() + (Number(asked.expires_in) || 900) * 1000;

  // Google says how often to ask and gets cross if you ask faster.
  const poll = async () => {
    if (going !== mine || mine.finished !== null) return;

    if (Date.now() > until) {
      return settle(mine, {
        ok: false,
        sentence: 'That sign-in was left too long, so Google stopped it.',
        action: 'Start it again when you are ready.',
      });
    }

    const got = await form(TOKEN, {
      client_id: clientId,
      client_secret: clientSecret,
      device_code: mine.deviceCode,
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
    });

    if (got?.access_token) {
      const person = await person_(got.access_token);
      await mkdir(HOUSE, { recursive: true });
      await writeFile(WHO, JSON.stringify({
        email: person?.email ?? null,
        name: person?.name ?? null,
        picture: person?.picture ?? null,
        at: Date.now(),
      }, null, 2), 'utf8');

      return settle(mine, {
        ok: true,
        sentence: `Signed in to Google as ${person?.email ?? 'your account'}.`,
        action: null,
      });
    }

    // Still waiting is not a failure; anything else is.
    if (got?.error && got.error !== 'authorization_pending' && got.error !== 'slow_down') {
      return settle(mine, {
        ok: false,
        sentence: got.error === 'access_denied'
          ? 'That sign-in was turned down in the browser.'
          : 'Google did not finish the sign-in.',
        action: 'Try again.',
      });
    }

    setTimeout(poll, every).unref?.();
  };

  setTimeout(poll, every).unref?.();
}

function settle(mine, how) {
  mine.finished = Date.now();
  mine.ok = how.ok;
  mine.sentence = how.sentence;
  mine.action = how.action;
}

/** One form post, never throwing — a network that is not there is an answer. */
async function form(where, fields) {
  try {
    const res = await fetch(where, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(fields).toString(),
    });
    return await res.json();
  } catch { return null; }
}

async function person_(token) {
  try {
    const res = await fetch(PERSON, { headers: { authorization: `Bearer ${token}` } });
    return await res.json();
  } catch { return null; }
}
