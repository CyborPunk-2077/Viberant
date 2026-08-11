import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test('Google Desktop OAuth returns through the PKCE loopback and updates identity', async () => {
  const profile = await mkdtemp(join(tmpdir(), 'viberant-google-oauth-'));
  const previousProfile = process.env.USERPROFILE;
  const previousFetch = globalThis.fetch;
  process.env.USERPROFILE = profile;

  globalThis.fetch = async (where, options) => {
    const address = String(where);
    if (address === 'https://oauth2.googleapis.com/token') {
      const body = new URLSearchParams(options?.body ?? '');
      assert.equal(body.get('grant_type'), 'authorization_code');
      assert.ok(body.get('code_verifier'));
      assert.match(body.get('redirect_uri'), /^http:\/\/127\.0\.0\.1:\d+\/oauth2\/callback$/);
      return new Response(JSON.stringify({ access_token: 'google-test-token' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (address === 'https://openidconnect.googleapis.com/v1/userinfo') {
      assert.equal(options?.headers?.authorization, 'Bearer google-test-token');
      return new Response(JSON.stringify({ email: 'person@example.com', name: 'Person' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    return previousFetch(where, options);
  };

  try {
    const google = await import(`../google.mjs?oauth-test=${Date.now()}`);
    const started = google.begin({ clientId: '123456789-viberant.apps.googleusercontent.com' });
    assert.equal(started.running, true);

    let state = google.state();
    for (let attempts = 0; attempts < 30 && !state?.at; attempts += 1) {
      await pause(10);
      state = google.state();
    }
    assert.match(state.at, /^https:\/\/accounts\.google\.com\/o\/oauth2\/v2\/auth\?/);

    const authorize = new URL(state.at);
    const callback = new URL(authorize.searchParams.get('redirect_uri'));
    callback.searchParams.set('code', 'authorized-code');
    callback.searchParams.set('state', authorize.searchParams.get('state'));
    const browserResult = await previousFetch(callback);
    assert.equal(browserResult.status, 200);

    for (let attempts = 0; attempts < 30 && google.state()?.running; attempts += 1) await pause(10);
    assert.equal(google.state().ok, true);
    assert.equal((await google.who()).email, 'person@example.com');
  } finally {
    globalThis.fetch = previousFetch;
    if (previousProfile === undefined) delete process.env.USERPROFILE;
    else process.env.USERPROFILE = previousProfile;
    await rm(profile, { recursive: true, force: true });
  }
});
