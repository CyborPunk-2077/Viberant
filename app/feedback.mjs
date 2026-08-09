/**
 * Telling us what is wrong with this.
 *
 * Early on, the thing most worth collecting is the sentence somebody types the
 * moment a thing annoys them — before they have talked themselves out of it or
 * worked around it. Making that one press is worth more than any amount of
 * asking later.
 *
 * Where it goes: an issue on the project's own GitHub, using the account
 * already signed in here. There is no service of ours to send it to and there
 * is not going to be one, so it goes where the work is.
 *
 * Nothing is sent without being shown first. What leaves this computer is what
 * you typed, plus which computer and which version — no file names, no paths,
 * no contents, nothing about your projects.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { HOUSE } from './projects.mjs';
import * as thisapp from './thisapp.mjs';
import * as github from './github.mjs';

const run = promisify(execFile);
const quiet = async (fn, fallback = null) => { try { return await fn(); } catch { return fallback; } };

/**
 * Where a report about **this manager** goes, if anywhere.
 *
 * It used to be one person's own GitHub account, spelled out here and compiled
 * into every copy that shipped. A name in source travels to computers that have
 * nothing to do with whoever it names, cannot be changed without a rebuild, and
 * tells anybody reading the code whose account it is. None of that is worth a
 * fixed support address.
 *
 * Read out of `package.json` now, where a project already records where it
 * lives, and **allowed to be absent**: with nothing written there, no account
 * exists anywhere in this app. A report is then still written down here —
 * which was always the half that mattered — and says it has nowhere to go
 * rather than quietly reaching somebody's account.
 */
export const issuesGoTo = async () => (await thisapp.whereItLives()).issues;

const KEPT = join(HOUSE, 'feedback.jsonl');

export const KINDS = [
  { id: 'wrong', name: 'Something is wrong', blurb: 'It did the wrong thing, or nothing at all.' },
  { id: 'confusing', name: 'Something is confusing', blurb: 'You could not tell what it was going to do.' },
  { id: 'missing', name: 'Something is missing', blurb: 'You wanted to do a thing and there was no way to.' },
  { id: 'good', name: 'Something is good', blurb: 'Worth knowing too — it is what not to break.' },
];

/**
 * Send it, and keep a copy here either way.
 *
 * The copy matters: a person on a train with no signal should not lose the
 * sentence they just took the trouble to write.
 */
export async function send({ what, kind = 'wrong', about = {} }) {
  const text = String(what ?? '').trim();
  if (text.length < 3) {
    return { ok: false, sentence: 'There was nothing to send.', action: 'Say what happened first.' };
  }

  const named = KINDS.find((k) => k.id === kind) ?? KINDS[0];
  const one = { at: Date.now(), kind: named.id, what: text.slice(0, 4000), about };

  await mkdir(HOUSE, { recursive: true });
  await writeFile(KEPT, `${JSON.stringify(one)}\n`, { flag: 'a', encoding: 'utf8' });

  if (!(await github.haveGitHubTool()) || !(await github.who())) {
    return {
      ok: false,
      kept: true,
      sentence: 'That is written down here, but it has not been sent.',
      action: 'Sign in to GitHub and send it again — it takes a second.',
    };
  }

  const body = [
    text,
    '',
    '---',
    `Sent from ${about.machine ?? 'a computer'}${about.version ? `, version ${about.version}` : ''}.`,
  ].join('\n');

  const goesTo = await issuesGoTo();
  if (!goesTo) {
    return {
      ok: false,
      kept: true,
      nowhereToSend: true,
      sentence: 'That is written down here, and there is nowhere to send it.',
      action: 'This copy of Viberant does not say where its issue list is. What you wrote is in '
        + 'the record folder, and nothing left this computer.',
    };
  }

  const made = await quiet(() => run('gh', [
    'issue', 'create',
    '--repo', goesTo,
    '--title', `${named.name}: ${text.split('\n')[0].slice(0, 70)}`,
    '--body', body,
  ], { maxBuffer: 8 * 1024 * 1024 }));

  if (!made) {
    return {
      ok: false,
      kept: true,
      sentence: 'That is written down here, but it could not be sent.',
      action: 'It will still be in the record folder. Check you are online and try again.',
    };
  }

  const at = String(made.stdout ?? '').trim().split('\n').pop();
  return {
    ok: true,
    at: at?.startsWith('http') ? at : null,
    sentence: 'Sent. Thank you — this is the most useful thing anybody can do right now.',
    action: 'Only what you typed left this computer, with which computer and which version.',
  };
}

/** Everything said from this computer, newest first. */
export async function said() {
  if (!existsSync(KEPT)) return [];
  const text = await quiet(() => readFile(KEPT, 'utf8'), '');
  return String(text ?? '')
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => { try { return JSON.parse(l); } catch { return null; } })
    .filter(Boolean)
    .reverse();
}
