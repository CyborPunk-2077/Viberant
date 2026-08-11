/**
 * Signing in to Viberant itself with Google.
 *
 * Asked for repeatedly, and refused four times because of one hard fact worth
 * stating plainly: **a Google sign-in cannot exist without an application
 * registered with Google.** Not a limitation of this app — anybody's Google
 * sign-in button, anywhere, is backed by a client the developer registered.
 * There is no anonymous way in, by design.
 *
 * The publisher supplies one Desktop OAuth client ID. Viberant opens Google's
 * ordinary browser account chooser and receives the authorization code on a
 * short-lived loopback listener protected by PKCE and state. No confidential
 * value is shipped and nothing on this computer ever sees a password.
 *
 * What signing in with Google gets you, honestly: your name and picture on this
 * computer, and a second name for your other computers to know you by. It does
 * not replace GitHub — a second copy of your work still needs somewhere to go,
 * and that is what GitHub is for. Anybody who wants only the account and not the
 * storage can now have exactly that.
 */

import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { readFileSync, existsSync } from 'node:fs';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { HOUSE } from './projects.mjs';

const WHO = join(HOUSE, 'google.json');
const here = dirname(fileURLToPath(import.meta.url));
const appOAuth = (() => {
  try { return JSON.parse(readFileSync(join(here, 'oauth.json'), 'utf8')); } catch { return {}; }
})();

const quiet = async (fn, fallback = null) => { try { return await fn(); } catch { return fallback; } };

const AUTHORIZE = 'https://accounts.google.com/o/oauth2/v2/auth';
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
    browser: true,
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
export function begin({ clientId }) {
  if (going && going.finished === null) return state();

  clientId ||= process.env.VIBERANT_GOOGLE_CLIENT_ID || appOAuth.googleClientId;

  if (!clientId) {
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
    at: null,
    listener: null,
    timeout: null,
    finished: null,
    ok: null,
    sentence: null,
    action: null,
  };

  start(going, { clientId });
  return state();
}

async function start(mine, { clientId }) {
  const verifier = randomBytes(48).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const expectedState = randomBytes(24).toString('base64url');

  const listener = createServer(async (request, response) => {
    const address = listener.address();
    const callback = new URL(request.url ?? '/', `http://127.0.0.1:${address?.port ?? 0}`);
    if (callback.pathname !== '/oauth2/callback') {
      response.writeHead(404).end();
      return;
    }

    const receivedState = Buffer.from(callback.searchParams.get('state') ?? '');
    const wantedState = Buffer.from(expectedState);
    const stateMatches = receivedState.length === wantedState.length
      && timingSafeEqual(receivedState, wantedState);
    const code = callback.searchParams.get('code');
    const refused = callback.searchParams.get('error');

    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(`<!doctype html><meta charset="utf-8"><title>Viberant sign-in</title>
      <style>body{font:16px system-ui;background:#090b14;color:#eef0ff;display:grid;place-items:center;height:100vh;margin:0}main{max-width:34rem;padding:2rem;border:1px solid #33364d;border-radius:16px;background:#101321}h1{margin-top:0}</style>
      <main><h1>${code && stateMatches && !refused ? 'Connected to Viberant' : 'Viberant could not finish signing in'}</h1>
      <p>${code && stateMatches && !refused ? 'You can close this browser tab and return to Viberant.' : 'Return to Viberant and start the sign-in again.'}</p></main>`);

    if (going !== mine || mine.finished !== null) return;
    if (refused === 'access_denied') return settle(mine, {
      ok: false,
      sentence: 'That sign-in was turned down in the browser.',
      action: 'Start again if you still want to connect this account.',
    });
    if (!stateMatches || !code) return settle(mine, {
      ok: false,
      sentence: 'Google returned a sign-in that did not belong to this attempt.',
      action: 'Start the sign-in again from Viberant.',
    });

    const redirectUri = `http://127.0.0.1:${address.port}/oauth2/callback`;
    const got = await form(TOKEN, {
      client_id: clientId,
      code,
      code_verifier: verifier,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    });
    if (!got?.access_token) return settle(mine, {
      ok: false,
      sentence: 'Google authorized the browser but did not finish connecting Viberant.',
      action: 'Check the publisher OAuth configuration and try again.',
    });

    const person = await person_(got.access_token);
    if (!person?.email && !person?.name) return settle(mine, {
      ok: false,
      sentence: 'Google connected but did not return an identity.',
      action: 'Try signing in again.',
    });

    await remember({
      email: person.email ?? null,
      name: person.name ?? null,
      picture: person.picture ?? null,
      at: Date.now(),
    });
    settle(mine, {
      ok: true,
      sentence: `Signed in to Google as ${person.email ?? person.name}.`,
      action: null,
    });
  });
  mine.listener = listener;

  listener.on('error', () => {
    if (going === mine && mine.finished === null) settle(mine, {
      ok: false,
      sentence: 'Viberant could not open its private sign-in callback on this computer.',
      action: 'Restart Viberant and try again.',
    });
  });

  listener.listen(0, '127.0.0.1', () => {
    if (going !== mine || mine.finished !== null) return listener.close();
    const address = listener.address();
    const redirectUri = `http://127.0.0.1:${address.port}/oauth2/callback`;
    mine.at = `${AUTHORIZE}?${new URLSearchParams({
      client_id: clientId,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      prompt: 'select_account',
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: SCOPE,
      state: expectedState,
    })}`;
  });

  mine.timeout = setTimeout(() => settle(mine, {
    ok: false,
    sentence: 'That Google sign-in was left too long.',
    action: 'Start it again when you are ready.',
  }), 15 * 60 * 1000);
  mine.timeout.unref?.();
}

function settle(mine, how) {
  clearTimeout(mine.timeout);
  mine.listener?.close?.();
  mine.finished = Date.now();
  mine.ok = how.ok;
  mine.sentence = how.sentence;
  mine.action = how.action;
}

export async function forget() {
  if (going) {
    clearTimeout(going.timeout);
    going.listener?.close?.();
  }
  going = null;
  return { ok: true };
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
