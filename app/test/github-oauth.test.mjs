import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test('GitHub device authorization notices browser completion and updates the active account', async () => {
  const profile = await mkdtemp(join(tmpdir(), 'viberant-github-oauth-'));
  const previousProfile = process.env.USERPROFILE;
  const previousPoll = process.env.VIBERANT_OAUTH_POLL_MS;
  const previousFetch = globalThis.fetch;
  process.env.USERPROFILE = profile;
  process.env.VIBERANT_OAUTH_POLL_MS = '15';

  globalThis.fetch = async (where, options) => {
    const address = String(where);
    if (address === 'https://github.com/login/device/code') {
      return new Response(JSON.stringify({
        device_code: 'device-code', user_code: 'ABCD-EFGH',
        verification_uri: 'https://github.com/login/device', expires_in: 900, interval: 5,
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (address === 'https://github.com/login/oauth/access_token') {
      const body = new URLSearchParams(options?.body ?? '');
      assert.equal(body.get('device_code'), 'device-code');
      return new Response(JSON.stringify({ access_token: 'github-test-token', token_type: 'bearer' }), {
        status: 200, headers: { 'content-type': 'application/json' },
      });
    }
    if (address === 'https://api.github.com/user') {
      assert.equal(options?.headers?.authorization, 'Bearer github-test-token');
      return new Response(JSON.stringify({ login: 'signed-in-person', id: 42 }), {
        status: 200, headers: { 'content-type': 'application/json' },
      });
    }
    return previousFetch(where, options);
  };

  try {
    const signin = await import(`../signin.mjs?oauth-test=${Date.now()}`);
    assert.equal(signin.begin().running, true);
    for (let attempts = 0; attempts < 100 && signin.state()?.running; attempts += 1) await pause(10);
    assert.equal(signin.state()?.ok, true, JSON.stringify(signin.state()));
    assert.equal((await signin.accounts()).active, 'signed-in-person');
    assert.equal(await signin.activeToken(), 'github-test-token');
  } finally {
    globalThis.fetch = previousFetch;
    if (previousProfile === undefined) delete process.env.USERPROFILE;
    else process.env.USERPROFILE = previousProfile;
    if (previousPoll === undefined) delete process.env.VIBERANT_OAUTH_POLL_MS;
    else process.env.VIBERANT_OAUTH_POLL_MS = previousPoll;
    await rm(profile, { recursive: true, force: true });
  }
});
