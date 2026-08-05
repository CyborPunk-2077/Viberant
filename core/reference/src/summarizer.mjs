/**
 * The Summarizer.
 *
 * "If the AI did forty things, the developer should read one sentence." That
 * promise is the product. This file is where it is kept or broken.
 *
 * Two rules shape everything here.
 *
 * **Core writes the sentence; the assistant is only an engine** (decision D-8).
 * The prompt, the constraints and the validation all live here. A borrowed
 * assistant supplies inference and nothing else. Without this, the product's
 * voice would change depending on which tool the developer happened to install,
 * and a uniform voice is most of what makes a small interface feel like one
 * thing rather than a pile of integrations.
 *
 * **A summary is never allowed to gate anything.** It is a lossy view, computed
 * after the fact, recomputable forever, and always replaceable by a plain
 * description. Nothing waits for it. An effort with no summary is an effort with
 * no summary, not an effort that is stuck.
 */

import { checkSentence } from './lexicon.mjs';

const MAX_ATTEMPTS = 2;

/**
 * Produce the one sentence for an effort.
 *
 * Always succeeds. If no assistant can answer, or answers badly twice, we fall
 * back to a plain description of what changed — which is honest, if less useful,
 * and never wrong.
 *
 * @returns {{sentence: string, source: string, kind: 'account'|'description'}}
 */
export async function summarize({ effort, touched = [], account = null, inference = null }) {
  if (inference) {
    let complaints = null;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      let said;
      try {
        said = await inference.inference(prompt({ effort, touched, account, complaints }));
      } catch {
        break; // A tool that cannot answer is not a failure of the effort.
      }
      const sentence = tidy(said);
      const check = checkSentence(sentence);
      if (check.ok) {
        return { sentence, source: inference.name, kind: 'account' };
      }
      complaints = check.problems;
    }
  }

  return { sentence: describe(touched), source: 'description', kind: 'description' };
}

/**
 * The prompt. Core's, entirely.
 *
 * Note what it does not do: it never asks for a summary "of the diff," never
 * mentions tooling, and never invites the model to be impressive. It asks for
 * one sentence a colleague would say out loud.
 */
export function prompt({ effort, touched, account, complaints }) {
  const parts = [];

  parts.push(
    'Write exactly one sentence describing what happened, for a developer who ' +
    'stepped away and has just come back.',
    '',
    'They asked for: ' + effort.intent,
  );

  for (const d of effort.directions ?? []) parts.push('Then they said: ' + d);

  if (touched.length) {
    parts.push('', 'What was touched:');
    for (const t of touched.slice(0, 40)) parts.push(`  ${t.kind} ${t.path}`);
    if (touched.length > 40) parts.push(`  and ${touched.length - 40} more`);
  }

  if (account) {
    parts.push('', 'What the assistant reported doing:', trim(account, 4000));
  }

  parts.push(
    '',
    'Rules for your sentence:',
    '  Say what is now true, not what steps were taken.',
    '  Plain English a colleague would say out loud. No jargon.',
    '  Never mention version control in any form.',
    '  Never begin with a count of files.',
    '  No exclamation marks, no capitals for emphasis, no error text.',
    '  Under 160 characters.',
    '  If something went wrong, say so plainly and say where it stopped.',
    '  Reply with the sentence alone and nothing else.',
  );

  if (complaints) {
    parts.push(
      '',
      'Your previous answer was rejected because it ' + complaints.join(', and it ') + '.',
      'Write a different sentence that does not do that.',
    );
  }

  return parts.join('\n');
}

/** Strip the wrapping models like to add, and keep the first sentence only. */
function tidy(said) {
  let s = String(said ?? '').trim();
  s = s.replace(/^```[a-z]*\n?/i, '').replace(/```$/, '').trim();
  s = s.replace(/^["'`]|["'`]$/g, '').trim();
  s = s.replace(/^(here(?:'s| is)[^:]*:|summary:|sentence:)\s*/i, '').trim();
  const firstLine = s.split('\n').map((l) => l.trim()).filter(Boolean)[0] ?? '';
  return firstLine;
}

const trim = (s, n) => (s.length > n ? s.slice(0, n) + '\n…' : s);

// ---------------------------------------------------------------------------
// The description: what we say when nobody can answer.
//
// This path is always available and must therefore be genuinely decent, not a
// placeholder. It cannot know what the work *means* — so it does not pretend to.
// It says what was touched, in the plainest English available, and stops.
// ---------------------------------------------------------------------------

/** @param {{path: string, kind: 'added'|'changed'|'removed'}[]} touched */
export function describe(touched) {
  if (!touched.length) return 'Nothing has changed here yet.';

  const by = { added: [], changed: [], removed: [] };
  for (const t of touched) (by[t.kind] ?? by.changed).push(t.path);

  const phrases = [
    by.added.length && phrase('added', by.added),
    by.changed.length && phrase('changed', by.changed),
    by.removed.length && phrase('removed', by.removed),
  ].filter(Boolean);

  const areas = new Set(touched.map((t) => area(t.path)).filter(Boolean));
  const sentence = areas.size === 1
    ? `Work in ${[...areas][0]}: ${join(phrases)}.`
    : capitalise(join(phrases)) + '.';

  // The description is the last line of defence, so it must never be the thing
  // that produces an unspeakable sentence. If it somehow would, say less.
  return checkSentence(sentence).ok ? sentence : shortest(touched);
}

function phrase(verb, paths) {
  const names = paths.map(basename);
  if (names.length === 1) return `${verb} ${names[0]}`;
  if (names.length === 2) return `${verb} ${names[0]} and ${names[1]}`;
  return `${verb} ${names[0]} and ${count(names.length - 1)} others`;
}

function join(phrases) {
  if (phrases.length === 1) return phrases[0];
  if (phrases.length === 2) return `${phrases[0]} and ${phrases[1]}`;
  return `${phrases.slice(0, -1).join(', ')}, and ${phrases.at(-1)}`;
}

const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven',
  'eight', 'nine', 'ten', 'eleven', 'twelve'];
const count = (n) => WORDS[n] ?? String(n);

function basename(p) { return String(p).split(/[\\/]/).filter(Boolean).pop() ?? p; }

/** The part of a path a developer would name out loud. */
function area(p) {
  const parts = String(p).split(/[\\/]/).filter(Boolean);
  if (parts.length < 2) return null;
  const head = parts[0] === 'src' || parts[0] === 'lib' || parts[0] === 'app'
    ? parts[1] : parts[0];
  return head && head !== basename(p) ? head : null;
}

const capitalise = (s) => s.charAt(0).toUpperCase() + s.slice(1);

function shortest(touched) {
  const n = touched.length;
  return n === 1
    ? `Something changed in ${basename(touched[0].path)}.`
    : `Something changed in ${count(n)} places.`;
}

/**
 * Compress a stretch of activity the developer slept through.
 *
 * Workflow B asks that forty actions read as one sentence at glance time. This
 * is that, for the case where several things happened rather than one.
 */
export function whileYouWereAway(efforts) {
  const settled = efforts.filter((e) => e.state === 'done').length;
  const waiting = efforts.filter((e) => e.state === 'waiting').length;
  const moving = efforts.filter((e) => e.state === 'moving').length;

  const bits = [];
  if (waiting) bits.push(`${count(waiting)} ${waiting === 1 ? 'effort is' : 'efforts are'} waiting on you`);
  if (moving) bits.push(`${count(moving)} still moving`);
  if (settled) bits.push(`${count(settled)} settled`);

  if (!bits.length) return 'Nothing needs you.';
  return capitalise(join(bits)) + '.';
}
