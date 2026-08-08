/**
 * The vocabulary contract, held against the app rather than against a memo.
 *
 * The constitution's hardest promise is that no version-control vocabulary ever
 * appears where a person can see it. Until now that was a rule somebody had to
 * remember while writing a screen. This is that rule as a test: every line of
 * prose in the page and in the sentences the manager can say is read, and any
 * borrowed word fails the run.
 *
 * Two things are deliberately allowed, and only these two:
 *
 *   The names of programs you already have. GitHub is a place, and Git Bash is
 *   what the thing in your Start menu is called. Refusing to say a program's own
 *   name would not spare anybody the jargon, it would just leave them unable to
 *   find the button. Naming a tool is not describing your work in its terms.
 *
 *   The command a sign-in actually needs typing, where the manager is telling
 *   you what it is about to run on your behalf.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { FORBIDDEN } from '../../core/reference/src/lexicon.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const app = join(here, '..');

/** Program names, and the commands the manager offers to run for you. */
const NAMES = [
  'GitHub', 'GitHub Pages', 'GitHub CLI', 'Git Bash',
  'gh auth login', 'gh auth status', 'vercel login', 'netlify login',
  'cli.github.com', 'viberant-workspace',
];

/**
 * Everything a person can read, pulled out of the files that hold it.
 *
 * Prose is taken to be any quoted run of text with a space in it — which is
 * every sentence in these files and almost nothing else, because code rarely
 * puts two words in one string.
 */
async function proseIn(file) {
  const text = await readFile(join(app, file), 'utf8');

  const withoutComments = text
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^\s*\/\/.*$/gm, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    // Attributes nobody reads: a class called "head" is not somebody being told
    // about a head. The ones a person does read — what a box says before you
    // type in it, what a screen reader says out loud — are kept.
    .replace(/\s(?:class|id|style|href|src|data-[\w-]+)\s*=\s*"[^"]*"/g, ' ');

  const found = [];

  // Quoted strings, and the readable parts of the page's own templates.
  for (const m of withoutComments.matchAll(/'([^'\\\n]{12,})'|"([^"\\\n]{12,})"/g)) {
    found.push(m[1] ?? m[2]);
  }
  // Not `=>`, which is a function rather than the end of a tag. An arrow
  // followed anywhere later by a less-than reads as a whole run of code being
  // shown to somebody, and the words inside it are not sentences.
  //
  // Three characters, not twelve. Twelve was chosen to keep code out, and it
  // did — along with every short label on every screen. The word `Repository`
  // sat at the top of the deploy page for as long as this audit has existed:
  // ten characters wide, never once read by it, because a label is one word and
  // a sentence is not. A label is the most read thing on a screen.
  for (const m of withoutComments.matchAll(/(?<!=)>([^<>{}$`]{3,})</g)) {
    found.push(m[1]);
  }

  return found
    .map((s) => s.trim())
    // A single word is prose too, when it is what a column is called. What is
    // not prose is punctuation, a number, or a mark drawn instead of a word.
    .filter((s) => /[a-z]{3}/i.test(s))
    // Paths, addresses and format strings are machinery, not prose.
    .filter((s) => !/^[\w.-]+\/[\w.-]+$/.test(s))
    .filter((s) => !s.includes('://') && !s.startsWith('--') && !s.includes('${'))
    // Machinery that reading short runs newly reaches: the arguments this
    // manager hands to the tools it drives, and the addresses it asks them
    // about. `@{upstream}..HEAD` is not a sentence anybody sees; it is what one
    // program says to another. No sentence in this app has ever contained a
    // brace, an underscore, or a name in shouting capitals, and the surest way
    // to keep this rule honest is to say so rather than to lower the bar.
    .filter((s) => !/[{}_]/.test(s))
    .filter((s) => !/^[A-Z][A-Z0-9.\-/]*$/.test(s))
    .filter((s) => !(s.includes('/') && !/\s/.test(s)));
}

/** The same sentence with every allowed program name taken out of it. */
function withoutNames(sentence) {
  let s = sentence;
  for (const name of NAMES) s = s.split(name).join(' ');
  return s;
}

const WORDS = /[a-z0-9]+(?:[-'][a-z0-9]+)*/g;

function borrowedWordsIn(sentence) {
  const lower = withoutNames(sentence).toLowerCase();
  const words = lower.match(WORDS) ?? [];
  return FORBIDDEN.filter((term) => (term.includes(' ') || term.includes('/')
    ? lower.includes(term)
    : words.includes(term)));
}

// ---------------------------------------------------------------------------

const SURFACES = [
  'ui/app.js',
  'ui/shell.html',
  'tools.mjs',
  'terminals.mjs',
  'browse.mjs',
  'projects.mjs',
  'profiles.mjs',
  'github.mjs',
  'deploy.mjs',
  'jobs.mjs',
  'workspace.mjs',
  'server.mjs',
  // These three were missing from the audit for as long as it has existed, and
  // every one of them writes sentences a person reads: what a setting claims to
  // do, what a sign-in is waiting for, what went wrong on the way in.
  'settings.mjs',
  'signin.mjs',
  'google.mjs',
  // Written after the audit existed, and both say things to a person: what a
  // model refused and why, and whether there is a newer Viberant. A file that
  // is not in this list is a file where the rule is back to being a discipline.
  'assistant.mjs',
  'newer.mjs',
  'lan.mjs',
  'parcel.mjs',
  'providers.mjs',
];

describe('nothing a person reads is borrowed from somewhere else', () => {
  for (const file of SURFACES) {
    test(`${file} says everything in plain English`, async () => {
      const offences = [];
      for (const sentence of await proseIn(file)) {
        const borrowed = borrowedWordsIn(sentence);
        if (borrowed.length) offences.push(`"${sentence}" uses ${borrowed.join(', ')}`);
      }
      assert.deepEqual(offences, [], `${file} has words a person should not have to learn`);
    });
  }

  test('the audit is looking at something, rather than passing on an empty list', async () => {
    const lines = await proseIn('ui/app.js');
    assert.ok(lines.length > 40, `only found ${lines.length} lines of prose to check`);
    assert.ok(lines.some((l) => l.includes('save')), 'and it is finding the real sentences');
  });

  test('and it would notice if a borrowed word got in', () => {
    assert.deepEqual(borrowedWordsIn('Your commit was pushed to the repository.').sort(),
      ['commit', 'pushed', 'repository']);
    assert.deepEqual(borrowedWordsIn('Saved and sent to GitHub.'), [],
      'while the name of the place itself is fine');
    assert.deepEqual(borrowedWordsIn('Open a terminal in Git Bash.'), [],
      'and so is the name of a program you already have');
  });
});
