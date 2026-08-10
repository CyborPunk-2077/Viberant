/** The workspace rail opens the hub; only explicit actions enter a workspace. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const page = await readFile(new URL('../ui/app.js', import.meta.url), 'utf8');

test('the main Workspace destination always establishes Home', () => {
  const go = page.slice(page.indexOf('async function go('), page.indexOf('// ---------------------------------------------------------------------------', page.indexOf('async function go(')));
  assert.match(go, /tab === 'workspace'\) workspacePlace = 'home'/);
  assert.match(page, /if \(workspacePlace === 'home'\) return drawWorkspaceHome\(\)/);
});

test('opening, creating, and joining are the ways into a workspace', () => {
  assert.match(page, /data-open-workspace/);
  assert.match(page, /post\('\/team\/open'/);
  assert.match(page, /if \(made\.ok\) workspacePlace = 'inside'/);
  assert.match(page, /if \(joined\.ok\) workspacePlace = 'inside'/);
});

test('back changes navigation without leaving membership', () => {
  const back = page.slice(page.indexOf("$('#ws-back').onclick"), page.indexOf("$('#ws-invite')", page.indexOf("$('#ws-back').onclick")));
  assert.match(back, /workspacePlace = 'home'/);
  assert.doesNotMatch(back, /team\/leave|workspace\/leave/);
});

test('Home reads real peer offers and exposes join by code', () => {
  const home = page.slice(page.indexOf('async function drawWorkspaceHome'), page.indexOf('SCREENS.workspace'));
  assert.match(home, /Join workspace/);
  assert.match(home, /Shared with you/);
  assert.match(page, /local\/offers\?machine=/);
  assert.match(page, /post\('\/local\/take'/);
});

test('an optimistic chat message and its event-stream copy share one id', () => {
  const send = page.slice(page.indexOf('async function sendOneNote'), page.indexOf('async function drawLegacyWorkspace'));
  assert.match(send, /crypto\.randomUUID\(\)/);
  assert.match(send, /heardAlready\.add\(eventId\)/);
  assert.match(send, /post\('\/workspace\/say', \{ text, id: eventId \}\)/);
});
