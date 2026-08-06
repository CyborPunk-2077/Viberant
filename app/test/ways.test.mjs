/**
 * The ways into a project: which apps, which terminals, which folder.
 *
 * These three are the errand the manager exists for — you pick a place once and
 * everything else starts there. What is tested here is mostly refusal, because
 * the interesting cases are all "this is not on your computer" and the product
 * promise is that those are said plainly instead of failing halfway.
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, writeFile, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, delimiter } from 'node:path';
import { platform } from 'node:process';

const WINDOWS = platform === 'win32';
let root, bin, oldPath;

before(async () => {
  root = await mkdtemp(join(tmpdir(), 'viberant-ways-'));
  bin = join(root, 'bin');
  await mkdir(bin, { recursive: true });

  // A stand-in for an app that is only ever a terminal thing.
  if (WINDOWS) {
    await writeFile(join(bin, 'cursor-agent.cmd'), '@echo off\r\n');
  } else {
    await writeFile(join(bin, 'cursor-agent'), '#!/bin/bash\ntrue\n');
    await chmod(join(bin, 'cursor-agent'), 0o755);
  }

  oldPath = process.env.PATH;
  process.env.PATH = `${bin}${delimiter}${oldPath}`;
});

after(async () => {
  process.env.PATH = oldPath;
  await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
});

// ---------------------------------------------------------------------------

/**
 * An app with one way in and one way that is nowhere on this computer. Made up
 * on purpose: testing against a real app would prove something about whichever
 * machine the test happened to run on rather than about the manager.
 */
const halfHere = {
  id: 'halfhere',
  name: 'Half Here',
  ways: {
    terminal: { bin: 'cursor-agent' },
    desktop: { bin: 'definitely-not-installed-anywhere-xyz' },
  },
  signIn: { way: 'terminal', command: 'cursor-agent login', then: 'Follow the steps.' },
};

describe('which apps are here, and how they open', () => {
  test('an app is offered by the ways it actually has, not the ways it could have', async () => {
    const { waysIn } = await import('../tools.mjs');
    const ways = await waysIn(halfHere);
    assert.ok(ways.terminal, 'the command-line half is on the path in this test');
    assert.ok(!ways.desktop, 'and the window half is not, so it is not claimed');
  });

  test('asking for a way an app does not have here is declined, with the other way named', async () => {
    const { launch } = await import('../tools.mjs');
    const r = await launch({ tool: halfHere, dir: root, how: 'desktop' });
    assert.equal(r.ok, false);
    assert.match(r.sentence, /no window of its own/);
    assert.match(r.action, /the other way/);
  });

  test('an app that is nowhere on this computer says so, and says what to do', async () => {
    const { launch, find } = await import('../tools.mjs');
    const r = await launch({ tool: find('windsurf'), dir: root });
    assert.equal(r.ok, false);
    assert.match(r.sentence, /does not seem to be installed/);
    assert.match(r.action, /Install/);
  });

  test('every app the manager knows is listed, present or not, and none is recommended', async () => {
    const { installed } = await import('../tools.mjs');
    const all = await installed();
    assert.ok(all.length >= 8);
    assert.ok(all.some((t) => t.here === false), 'the ones that are missing are said to be missing');
    assert.ok(!all.some((t) => t.recommended || t.default || t.best),
      'nothing here is marked as the one you should use');
  });

  test('an app that signs you in inside itself is honest about that rather than pretending', async () => {
    const { find } = await import('../tools.mjs');
    assert.equal(find('code').signIn.way, 'inside');
    assert.equal(find('claude').signIn.way, 'terminal');
  });
});

describe('terminals, kept well away from the AI apps', () => {
  test('none of the AI apps is a terminal, and no terminal is an AI app', async () => {
    const { KNOWN } = await import('../tools.mjs');
    const { ALL } = await import('../terminals.mjs');
    const apps = KNOWN.map((t) => t.id);
    for (const t of ALL) {
      assert.ok(!apps.includes(t.id), `${t.name} must not appear among the AI apps`);
    }
    assert.ok(ALL.some((t) => /powershell/i.test(t.id)) || !WINDOWS,
      'PowerShell belongs here, on Windows');
  });

  test('every terminal offered says what it is in plain words', async () => {
    const { installed } = await import('../terminals.mjs');
    for (const t of await installed()) {
      assert.ok(t.name && t.blurb, `${t.id} needs a name and a plain description`);
      assert.ok(t.blurb.length < 70, 'a description is one short line, not a paragraph');
    }
  });

  test('a terminal that does not exist is declined plainly rather than opening something else', async () => {
    const { openTerminal } = await import('../terminals.mjs');
    const r = await openTerminal({ dir: root, which: 'not-a-real-terminal' });
    assert.equal(r.ok, false);
    assert.ok(r.sentence && r.action);
  });
});

describe('choosing a folder by looking at it', () => {
  test('what is inside a folder is folders only, and projects are pointed out', async () => {
    const { look } = await import('../browse.mjs');
    await mkdir(join(root, 'code', 'a-project'), { recursive: true });
    await mkdir(join(root, 'code', 'just-a-folder'), { recursive: true });
    await mkdir(join(root, 'code', '.hidden'), { recursive: true });
    await writeFile(join(root, 'code', 'a-file.txt'), 'x');
    await writeFile(join(root, 'code', 'a-project', 'package.json'), '{}');

    const r = await look(join(root, 'code'));
    assert.equal(r.ok, true);
    const names = r.folders.map((f) => f.name);
    assert.deepEqual(names, ['a-project', 'just-a-folder']);
    assert.equal(r.folders.find((f) => f.name === 'a-project').project, true);
    assert.equal(r.folders.find((f) => f.name === 'just-a-folder').project, false);
  });

  test('a folder that is not there is declined, not crashed on', async () => {
    const { look } = await import('../browse.mjs');
    const r = await look(join(root, 'nowhere-at-all'));
    assert.equal(r.ok, false);
    assert.ok(r.sentence && r.action);
  });

  test('there is always somewhere to start from', async () => {
    const { starts } = await import('../browse.mjs');
    const places = await starts();
    assert.ok(places.length > 0);
    assert.ok(places.every((p) => p.name && p.path));
  });
});
