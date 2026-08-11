import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

let profile;
let project;
let companion;

before(async () => {
  profile = await mkdtemp(join(tmpdir(), 'viberant-companion-profile-'));
  project = await mkdtemp(join(tmpdir(), 'viberant-companion-project-'));
  process.env.VIBERANT_WEB_COMPANION_STORE = join(profile, 'web-companions.json');
  companion = await import(`../webcompanion.mjs?test=${Date.now()}`);
  await mkdir(join(project, 'src'));
  await writeFile(join(project, 'src', 'hello.txt'), 'hello from desktop', 'utf8');
  await writeFile(join(project, '.env'), 'SECRET=no', 'utf8');
});

after(async () => {
  await rm(profile, { recursive: true, force: true });
  await rm(project, { recursive: true, force: true });
});

describe('Web Companion pairing', () => {
  test('binds a PKCE token to one HTTPS origin and one project', async () => {
    const verifier = randomBytes(48).toString('base64url');
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    const state = randomBytes(24).toString('base64url');
    const origin = 'https://web.example';
    const begun = companion.beginPairing({
      origin, returnTo: `${origin}/app`, challenge, state,
      project: { id: companion.projectId(project), name: 'Companion test', path: project },
    });
    assert.ok(begun?.id);
    const redirected = new URL(companion.approve(begun.id));
    const issued = await companion.exchange({
      code: redirected.searchParams.get('viberant_code'), verifier, origin,
    });
    assert.ok(issued?.token);
    assert.equal(await companion.authorize({ authorization: `Bearer ${issued.token}`, origin: 'https://other.example' }), null);
    const session = await companion.authorize({ authorization: `Bearer ${issued.token}`, origin });
    assert.ok(session);
    assert.equal((await companion.call(session, { method: 'files.read', path: 'src/hello.txt' })).text, 'hello from desktop');
    assert.equal((await companion.call(session, { method: 'files.read', path: '.env' })).ok, false);
  });

  test('refuses insecure public origins', () => {
    assert.equal(companion.beginPairing({
      origin: 'http://web.example', returnTo: 'http://web.example/app',
      challenge: 'a'.repeat(43), state: 'b'.repeat(24),
      project: { id: companion.projectId(project), name: 'No', path: project },
    }), null);
  });
});
