import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Line endings made the same, so what is checked is what is written rather
// than what this particular computer happened to check the files out as.
const asWritten = async (at) => (await readFile(new URL(at, import.meta.url), 'utf8')).replaceAll('\r\n', '\n');
const page = await asWritten('../ui/app.js');
const style = await asWritten('../ui/style.css');
const pkg = JSON.parse(await readFile(new URL('../../package.json', import.meta.url), 'utf8'));
const releaseCheck = await readFile(new URL('../../build/require-oauth.mjs', import.meta.url), 'utf8');

test('Home project commands land in Project Detail from any Home row', () => {
  const open = page.slice(page.indexOf('async function openProject'), page.indexOf('const MARK_GLYPH'));
  assert.match(open, /at\.tab = 'projects'/);
  assert.match(open, /at\.inside = true/);
  assert.match(open, /drawNav\(\)/);

  // Both places Home shows a project carry a way in: the card in recent work,
  // and the row opened out in the directory below it.
  assert.match(page, /class="home-work-card[\s\S]{0,700}?data-home-open=/,
    'a project card on Home offers no way to open it');
  assert.match(page, /class="home-directory-row[\s\S]{0,1600}?data-home-open=/,
    'a project row on Home offers no way to open it');
  assert.match(page, /for \(const row of document\.querySelectorAll\('\[data-home-open\]'\)\)/);

  // Every one of them is a real button, so it can be reached without a mouse.
  assert.match(page, /<button[^>]*data-home-open=/);
  assert.equal(/<(?!button)[a-z-]+[^>]*\sdata-home-open=/.test(page), false,
    'something other than a button is a way into a project, so it cannot be tabbed to');
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
  /*
   * And keeps watching after the sheet is gone. GitHub finishes when the person
   * finishes with it in their browser, which may be after they have navigated
   * somewhere else here — closing the sheet is not the same act as giving up,
   * so it steps aside and lets the attempt run rather than cancelling it.
   */
  const whenClosed = githubWayIn.slice(githubWayIn.indexOf('whenLayerCloses('));
  const closing = whenClosed.slice(0, whenClosed.indexOf('});') + 3);
  assert.match(closing, /if \(!stopping\) detached = true;/,
    'closing the sheet does not step aside, so what happens next is decided by a sheet nobody is looking at');
  assert.equal(/clearInterval/.test(closing), false,
    'closing the sheet stops watching, so an authorization finished in the browser is never noticed');
  assert.equal(/signin\/stop/.test(closing), false,
    'closing the sheet tells GitHub to give up on a sign-in nobody cancelled');

  // Only saying so does that.
  assert.match(githubWayIn, /if \(giveUp\) await post\('\/github\/signin\/stop'\)/);
  assert.match(githubWayIn, /\$\('#in-cancel'\)\.onclick = async \(\) => \{\s*await stop\(\{ giveUp: true/);
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
