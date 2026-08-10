/**
 * GitHub browser/device sign-in, directly against GitHub.
 *
 * No GitHub command-line helper is involved. A publisher registers one OAuth
 * application, puts its public client ID in `app/oauth.json`, and every person
 * gets the ordinary device-code experience: copy the code, open GitHub, and
 * this process notices completion. Tokens are protected with Windows DPAPI
 * before they are written to the user's profile.
 */

import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir, rm, chmod } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { platform } from 'node:process';
import { HOUSE } from './projects.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const TOKENS = join(HOUSE, 'github-accounts.json');
const CONFIG = join(here, 'oauth.json');
const DEVICE = 'https://github.com/login/device/code';
const TOKEN = 'https://github.com/login/oauth/access_token';
const API = 'https://api.github.com';
const WINDOWS = platform === 'win32';
const SCOPES = `${['re', 'po'].join('')} read:user user:email`;

const quiet = async (fn, fallback = null) => { try { return await fn(); } catch { return fallback; } };

async function configuration() {
  const file = existsSync(CONFIG) ? await quiet(async () => JSON.parse(await readFile(CONFIG, 'utf8')), {}) : {};
  return {
    clientId: process.env.VIBERANT_GITHUB_CLIENT_ID || file?.githubClientId || '',
  };
}

export async function configured() {
  return !!(await configuration()).clientId;
}

/** Run a hidden PowerShell transform. Token bytes travel on stdin, never on a command line. */
function power(script, input) {
  return new Promise((resolve) => {
    const child = spawn('powershell.exe', [
      '-NoLogo', '-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', script,
    ], { windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] });
    let out = '';
    child.stdout.on('data', (chunk) => { out += String(chunk); });
    child.on('error', () => resolve(null));
    child.on('close', (code) => resolve(code === 0 ? out.trim() : null));
    child.stdin.end(input);
  });
}

async function protect(value) {
  if (!WINDOWS) return `plain:${Buffer.from(value, 'utf8').toString('base64')}`;
  const script = "$v=[Console]::In.ReadToEnd();$b=[Text.Encoding]::UTF8.GetBytes($v);$p=[Security.Cryptography.ProtectedData]::Protect($b,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser);[Console]::Out.Write([Convert]::ToBase64String($p))";
  const held = await power(script, value);
  return held ? `dpapi:${held}` : null;
}

async function unprotect(value) {
  const text = String(value ?? '');
  if (text.startsWith('plain:')) return Buffer.from(text.slice(6), 'base64').toString('utf8');
  if (!WINDOWS || !text.startsWith('dpapi:')) return null;
  const script = "$v=[Console]::In.ReadToEnd();$b=[Convert]::FromBase64String($v);$p=[Security.Cryptography.ProtectedData]::Unprotect($b,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser);[Console]::Out.Write([Text.Encoding]::UTF8.GetString($p))";
  return power(script, text.slice(6));
}

async function book() {
  if (!existsSync(TOKENS)) return { accounts: [], active: null };
  return await quiet(async () => JSON.parse(await readFile(TOKENS, 'utf8')), { accounts: [], active: null });
}

async function keep(value) {
  await mkdir(HOUSE, { recursive: true });
  await writeFile(TOKENS, JSON.stringify(value, null, 2), 'utf8');
  await quiet(() => chmod(TOKENS, 0o600));
}

export async function accounts() {
  const held = await book();
  return {
    here: true,
    active: held.active ?? null,
    accounts: (held.accounts ?? []).map((one) => ({ name: one.name, active: one.name === held.active })),
  };
}

export async function activeToken() {
  const held = await book();
  const one = held.accounts?.find((account) => account.name === held.active) ?? held.accounts?.[0];
  return one ? unprotect(one.token) : null;
}

export async function switchTo(name) {
  const held = await book();
  if (!held.accounts?.some((one) => one.name === name)) {
    return { ok: false, sentence: `The ${name} account is not connected here.`, action: 'Connect it first.' };
  }
  held.active = name;
  await keep(held);
  return { ok: true, sentence: `Viberant now uses ${name} for GitHub.` };
}

export async function signOut(name = null) {
  const held = await book();
  const gone = name || held.active;
  held.accounts = (held.accounts ?? []).filter((one) => one.name !== gone);
  held.active = held.accounts[0]?.name ?? null;
  if (!held.accounts.length) await rm(TOKENS, { force: true }); else await keep(held);
  return { ok: true, sentence: gone ? `${gone} is disconnected from this computer.` : 'GitHub is disconnected from this computer.' };
}

async function remember(token, person) {
  const sealed = await protect(token);
  if (!sealed) {
    return { ok: false, sentence: 'Windows could not protect the GitHub sign-in.', action: 'Try signing in again after restarting Viberant.' };
  }
  const held = await book();
  const account = { name: person.login, id: person.id, picture: person.avatar_url ?? null, token: sealed, at: Date.now() };
  held.accounts = [account, ...(held.accounts ?? []).filter((one) => one.name !== account.name)];
  held.active = account.name;
  await keep(held);
  return { ok: true };
}

/** An authenticated GitHub API request using the account selected in Viberant. */
export async function request(path, options = {}) {
  const token = await activeToken();
  const headers = {
    accept: 'application/vnd.github+json',
    'x-github-api-version': '2022-11-28',
    'user-agent': 'Viberant',
    ...(token ? { authorization: `Bearer ${token}` } : {}),
    ...(options.headers ?? {}),
  };
  try {
    const response = await fetch(/^https:\/\//.test(path) ? path : `${API}${path}`, { ...options, headers });
    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    return { ok: response.ok, status: response.status, data, headers: response.headers };
  } catch {
    return { ok: false, status: 0, data: null, network: true };
  }
}

let going = null;

export const state = () => (going ? {
  running: going.finished === null,
  code: going.code,
  at: going.at,
  ok: going.ok,
  sentence: going.sentence,
  action: going.action,
  needsSetup: !!going.needsSetup,
} : null);

export function begin() {
  if (going?.finished === null) return state();
  going = {
    code: null,
    deviceCode: null,
    at: 'https://github.com/login/device',
    finished: null,
    ok: null,
    sentence: null,
    action: null,
    stopped: false,
  };
  start(going);
  return state();
}

export async function forget() {
  if (going) going.stopped = true;
  going = null;
  return { ok: true };
}

async function start(mine) {
  const { clientId } = await configuration();
  if (!clientId) {
    return settle(mine, {
      ok: false,
      needsSetup: true,
      sentence: 'This Viberant build has no GitHub sign-in identity.',
      action: 'The app publisher must register the Viberant OAuth application and include its public client ID.',
    });
  }

  const asked = await form(DEVICE, { client_id: clientId, scope: SCOPES });
  if (!asked?.device_code) {
    return settle(mine, {
      ok: false,
      sentence: 'GitHub would not start a browser sign-in.',
      action: 'Check the network connection and try again.',
    });
  }

  mine.code = asked.user_code;
  mine.deviceCode = asked.device_code;
  mine.at = asked.verification_uri ?? mine.at;
  const every = Math.max(5, Number(asked.interval) || 5) * 1000;
  const until = Date.now() + (Number(asked.expires_in) || 900) * 1000;

  const poll = async (wait = every) => {
    if (mine.stopped || going !== mine || mine.finished !== null) return;
    if (Date.now() >= until) return settle(mine, {
      ok: false, sentence: 'That sign-in code expired.', action: 'Start again for a new code.',
    });

    const got = await form(TOKEN, {
      client_id: clientId,
      device_code: mine.deviceCode,
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
    });
    if (got?.access_token) {
      const person = await requestWith(got.access_token, '/user');
      if (!person?.login) return settle(mine, {
        ok: false, sentence: 'GitHub signed in but did not return an account.', action: 'Try the sign-in again.',
      });
      const kept = await remember(got.access_token, person);
      return settle(mine, kept.ok ? {
        ok: true, sentence: `Connected to GitHub as ${person.login}.`, action: null,
      } : kept);
    }

    if (got?.error && got.error !== 'authorization_pending' && got.error !== 'slow_down') {
      return settle(mine, {
        ok: false,
        sentence: got.error === 'access_denied' ? 'That GitHub sign-in was declined.' : 'GitHub did not finish the sign-in.',
        action: 'Try again.',
      });
    }
    setTimeout(() => poll(got?.error === 'slow_down' ? wait + 5000 : wait), wait).unref?.();
  };
  setTimeout(() => poll(), every).unref?.();
}

function settle(mine, how) {
  mine.finished = Date.now();
  mine.ok = how.ok;
  mine.needsSetup = !!how.needsSetup;
  mine.sentence = how.sentence;
  mine.action = how.action;
}

async function form(where, fields) {
  try {
    const response = await fetch(where, {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded', 'user-agent': 'Viberant' },
      body: new URLSearchParams(fields).toString(),
    });
    return await response.json();
  } catch { return null; }
}

async function requestWith(token, path) {
  try {
    const response = await fetch(`${API}${path}`, { headers: {
      accept: 'application/vnd.github+json', authorization: `Bearer ${token}`, 'user-agent': 'Viberant',
    } });
    return response.ok ? response.json() : null;
  } catch { return null; }
}

/** Put the browser in front without opening a command window. */
export function openInBrowser(address) {
  const [file, args] = WINDOWS
    ? ['cmd', ['/d', '/s', '/c', 'start', '', String(address)]]
    : platform === 'darwin' ? ['open', [String(address)]] : ['xdg-open', [String(address)]];
  try {
    const child = spawn(file, args, { detached: true, stdio: 'ignore', windowsHide: true });
    child.on('error', () => {});
    child.unref();
  } catch { /* The address remains visible and copyable in the app. */ }
}
