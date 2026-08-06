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
    .replace(/<!--[\s\S]*?-->/g, ' ');

  const found = [];

  // Quoted strings, and the readable parts of the page's own templates.
  for (const m of withoutComments.matchAll(/'([^'\\\n]{12,})'|"([^"\\\n]{12,})"/g)) {
    found.push(m[1] ?? m[2]);
  }
  for (const m of withoutComments.matchAll(/>([^<>{}$`]{12,})</g)) {
    found.push(m[1]);
  }

  return found
    .map((s) => s.trim())
    .filter((s) => /\s/.test(s))
    // Paths, addresses and format strings are machinery, not prose.
    .filter((s) => !/^[\w.-]+\/[\w.-]+$/.test(s))
    .filter((s) => !s.includes('://') && !s.startsWith('--') && !s.includes('${'));
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
