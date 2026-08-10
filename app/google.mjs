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
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { HOUSE } from './projects.mjs';

const WHO = join(HOUSE, 'google.json');
const here = dirname(fileURLToPath(import.meta.url));
const appOAuth = (() => {
  try { return JSON.parse(readFileSync(join(here, 'oauth.json'), 'utf8')); } catch { return {}; }
})();

const quiet = async (fn, fallback = null) => { try { return await fn(); } catch { return fallback; } };

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

/**
 * The Google accounts on this computer, and which one is in use.
 *
 * A list rather than one account, kept in the shape GitHub already uses — a
 * person with a work address and a personal one has two, and the file holding
 * exactly one meant signing in to the second silently replaced the first.
 *
 * Deliberately separate from GitHub in every respect. **Nothing here decides
 * anything about where work goes**: Google is a name on this computer, and no
 * version-control operation may ever read it (D-52, D-82).
 */
async function kept() {
  if (!existsSync(WHO)) return { accounts: [], active: null };
  const held = await quiet(async () => JSON.parse(await readFile(WHO, 'utf8')));
  if (!held) return { accounts: [], active: null };

  // The file used to hold one account on its own. Anybody upgrading has one,
  // and it becomes the first of a list rather than being thrown away.
  if (Array.isArray(held.accounts)) return held;
  return { accounts: [held], active: held.email ?? held.name ?? null };
}

async function keep(state) {
  await mkdir(HOUSE, { recursive: true });
  await writeFile(WHO, JSON.stringify(state, null, 2), 'utf8');
}

const nameOf = (a) => a?.email ?? a?.name ?? null;

/** Who Google says you are, if anybody. The one in use. */
export async function who() {
  const { accounts, active } = await kept();
  if (!accounts.length) return null;
  return accounts.find((a) => nameOf(a) === active) ?? accounts[0];
}

/** Every Google account here, and which is in use. */
export async function accounts() {
  const { accounts: all, active } = await kept();
  return {
    accounts: all.map((a) => ({
      name: nameOf(a),
      picture: a.picture ?? null,
      active: nameOf(a) === active,
    })),
    active,
  };
}

/** Use a different one. Changes a name on this computer and nothing else. */
export async function switchTo(name) {
  const state = await kept();
  if (!state.accounts.some((a) => nameOf(a) === name)) {
    return { ok: false, sentence: 'That account is not signed in here.', action: 'Sign in to it first.' };
  }
  state.active = name;
  await keep(state);
  return { ok: true, sentence: `${name} is the Google name on this computer now.` };
}

/**
 * Sign one out, or all of them.
 *
 * Signing out the one in use hands the position to whichever is left rather
 * than leaving none in use with accounts still here — a state where the app
 * would say "not signed in" while holding two accounts.
 */
export async function signOut(name = null) {
  const state = await kept();
  if (!name || state.accounts.length <= 1) {
    await rm(WHO, { force: true });
    going = null;
    return { ok: true, sentence: 'Signed out of Google on this computer.' };
  }

  state.accounts = state.accounts.filter((a) => nameOf(a) !== name);
  if (state.active === name) state.active = nameOf(state.accounts[0]);
  await keep(state);
  going = null;
  return { ok: true, sentence: `${name} is signed out on this computer.` };
}

/** Remember one, alongside any already here, and make it the one in use. */
export async function remember(account) {
  const state = await kept();
  const name = nameOf(account);
  state.accounts = [account, ...state.accounts.filter((a) => nameOf(a) !== name)];
  state.active = name;
  await keep(state);
  return account;
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

  clientId ||= process.env.VIBERANT_GOOGLE_CLIENT_ID || appOAuth.googleClientId;
  clientSecret ||= process.env.VIBERANT_GOOGLE_CLIENT_SECRET || appOAuth.googleClientSecret;

  if (!clientId || !clientSecret) {
    return {
      running: false,
      ok: false,
      needsSetup: true,
      sentence: 'This Viberant build has no Google sign-in identity.',
      action: 'The app publisher must configure the Viberant Google OAuth application for this build.',
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
      // Added to whatever is already here rather than replacing it. Signing in
      // to a second account used to sign you out of the first, silently.
      await remember({
        email: person?.email ?? null,
        name: person?.name ?? null,
        picture: person?.picture ?? null,
        at: Date.now(),
      });

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
