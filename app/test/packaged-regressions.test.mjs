import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const page = await readFile(new URL('../ui/app.js', import.meta.url), 'utf8');
const style = await readFile(new URL('../ui/style.css', import.meta.url), 'utf8');
const pkg = JSON.parse(await readFile(new URL('../../package.json', import.meta.url), 'utf8'));
const releaseCheck = await readFile(new URL('../../build/require-oauth.mjs', import.meta.url), 'utf8');

test('Home project commands land in Project Detail from any Home row', () => {
  const open = page.slice(page.indexOf('async function openProject'), page.indexOf('const MARK_GLYPH'));
  assert.match(open, /at\.tab = 'projects'/);
  assert.match(open, /at\.inside = true/);
  assert.match(open, /drawNav\(\)/);
  assert.match(page, /class="home-featured-copy" data-home-open=/);
  assert.match(page, /for \(const row of document\.querySelectorAll\('\[data-home-open\]'\)\)/);
  assert.match(style, /\.home-project-line:focus-visible/);
});

test('the AI picker mounts before stale provider discovery begins', () => {
  const picker = page.slice(page.indexOf('async function setUpAi'), page.indexOf('async function askAssistant'));
  const sheetAt = picker.indexOf('sheet({');
  const discoveryAt = picker.indexOf("get(`/ai/models?provider=", sheetAt);
  assert.ok(sheetAt >= 0 && discoveryAt > sheetAt, 'live discovery still blocks the sheet');
  assert.match(picker, /AI_MODEL_CACHE_MS/);
  assert.match(picker, /aiModelLists\.set/);
  assert.match(picker, /checking this API account in the background/);
});

test('entered Workspace exposes separate navigation, leave, delete, and inline context', () => {
  const room = page.slice(page.indexOf('SCREENS.workspace = async'), page.indexOf('function projectInWorkspace'));
  assert.match(room, /id="ws-back"/);
  assert.match(room, /id="ws-manage"/);
  assert.match(room, /id="ws-context"/);
  assert.match(room, /Recent activity/);
  assert.match(page, /<b>Leave Workspace<\/b>/);
  assert.match(page, /<b>Delete Workspace\\u2026<\/b>/);
  assert.match(page, /confirm: 'Delete Workspace'/);
  assert.match(page, /workspacePlace = 'home'/);
  assert.match(style, /grid-template-columns:\s*minmax\(14\.5rem,\s*16\.5rem\).*minmax\(16rem,\s*19rem\)/);
});

test('production packaging refuses a missing publisher GitHub identity', () => {
  assert.match(pkg.scripts.build, /require-oauth\.mjs/);
  assert.match(releaseCheck, /VIBERANT_GITHUB_CLIENT_ID/);
  assert.match(releaseCheck, /Production packaging stopped/);
  assert.match(releaseCheck, /client secret was supplied/);
});

test('device authorization keeps watching when the code arrives', () => {
  const githubWayIn = page.slice(page.indexOf('async function signInToGitHub'), page.indexOf('async function signInToGoogle'));
  assert.match(githubWayIn, /const existing = \$\('#github-device-code'\)/);
  assert.match(githubWayIn, /existing\.textContent = code/);
  assert.match(githubWayIn, /whenLayerCloses\(\(\) => \{[\s\S]*clearInterval\(watching\)/);
  assert.match(githubWayIn, /if \(!stopping\) post\('\/github\/signin\/stop'\)/);
});

test('production packaging requires public Google Desktop OAuth and rejects a secret', () => {
  assert.match(releaseCheck, /VIBERANT_GOOGLE_CLIENT_ID/);
  assert.match(releaseCheck, /Google Desktop OAuth application/);
  assert.match(releaseCheck, /Google client secret was supplied/);
  assert.match(releaseCheck, /authorization-code flow with PKCE/);
});

test('desktop studios use the full canvas and compact navigation stays named', () => {
  assert.match(page, /const READING = new Set\(\);/);
  assert.match(page, /aria-label="\$\{esc\(t\.name\)\}"/);
  assert.match(page, /aria-label="Account"/);
  assert.match(page, /aria-label="Search Viberant"/);
});

test('the cursor atmosphere stays centered on the pointer', () => {
  const auraPolish = style.slice(style.lastIndexOf('#cursor-aura {'));
  assert.match(auraPolish, /margin:\s*0/);
  assert.doesNotMatch(auraPolish, /margin:\s*-52px/);
});
