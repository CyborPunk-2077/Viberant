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
import * as github from './github.mjs';

const run = promisify(execFile);
const quiet = async (fn, fallback = null) => { try { return await fn(); } catch { return fallback; } };

/**
 * Where a report about **this manager** goes.
 *
 * This is the one account name written down anywhere in this product, and it is
 * deliberately not an identity: it is the address of Viberant's own issue list,
 * the way a support address is fixed. It is never the account you are signed in
 * as, never a project's owner, and never a default for anything.
 *
 * Named `ISSUES_FOR_VIBERANT` rather than `HOME`, because `HOME` beside an
 * owner/name pair reads like somebody's account and that is exactly the
 * confusion worth removing. A test below holds it to the one use it has.
 */
export const ISSUES_FOR_VIBERANT = 'rSlashGIT/Viberant';

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

  const made = await quiet(() => run('gh', [
    'issue', 'create',
    '--repo', ISSUES_FOR_VIBERANT,
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
