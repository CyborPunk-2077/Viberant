/**
 * What is actually in a project.
 *
 * The old version of this showed two lists of file names and called it a
 * picture. It answered "which files did git notice" — a question nobody asks.
 * The questions people actually bring to a folder they have not opened in three
 * weeks are these, in this order:
 *
 *   What is this thing?          — what it is built with, what it says about itself
 *   How big is it?               — files, size, how long it has been going
 *   What was I doing?            — the last few things saved, in your own words
 *   What is unfinished?          — what is changed and not saved
 *   Where does it live?          — on this computer only, or also on GitHub
 *
 * Everything here is read cheaply and read once. A folder walk is capped, and
 * the folders that hold other people's code are skipped — counting node_modules
 * tells you about npm, not about your project.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readdir, stat, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, extname, basename } from 'node:path';

import { HEAVY } from './parcel.mjs';
import * as github from './github.mjs';

const run = promisify(execFile);
const git = (dir, ...args) => run('git', args, { cwd: dir, maxBuffer: 32 * 1024 * 1024 });
const quiet = async (fn, fallback = null) => { try { return await fn(); } catch { return fallback; } };

/** Enough of a walk to answer the question, and no more. */
const MOST_FILES = 25_000;

const LANGUAGES = {
  '.js': 'JavaScript', '.mjs': 'JavaScript', '.cjs': 'JavaScript', '.jsx': 'JavaScript',
  '.ts': 'TypeScript', '.tsx': 'TypeScript',
  '.py': 'Python', '.rs': 'Rust', '.go': 'Go', '.java': 'Java', '.kt': 'Kotlin',
  '.rb': 'Ruby', '.php': 'PHP', '.cs': 'C#', '.cpp': 'C++', '.c': 'C', '.swift': 'Swift',
  '.dart': 'Dart', '.sh': 'Shell', '.ps1': 'PowerShell', '.sql': 'SQL',
  '.html': 'HTML', '.css': 'CSS', '.scss': 'CSS', '.vue': 'Vue', '.svelte': 'Svelte',
  '.md': 'Writing', '.json': 'Settings', '.yml': 'Settings', '.yaml': 'Settings', '.toml': 'Settings',
};

/** Walk the project, skipping what is not yours. */
async function measure(dir) {
  let files = 0;
  let bytes = 0;
  let skipped = 0;
  let capped = false;
  const languages = new Map();
  const folders = [];

  const walk = async (at, depth) => {
    if (capped) return;
    for (const entry of await readdir(at, { withFileTypes: true }).catch(() => [])) {
      if (capped) return;
      if (entry.name.startsWith('.') && depth === 0 && entry.name !== '.github') continue;

      const path = join(at, entry.name);
      if (entry.isDirectory()) {
        if (HEAVY.includes(entry.name) || entry.name === '.git') { skipped += 1; continue; }
        if (depth === 0) folders.push(entry.name);
        await walk(path, depth + 1);
        continue;
      }
      if (!entry.isFile()) continue;

      files += 1;
      if (files > MOST_FILES) { capped = true; return; }
      bytes += await stat(path).then((s) => s.size).catch(() => 0);

      const language = LANGUAGES[extname(entry.name).toLowerCase()];
      if (language) languages.set(language, (languages.get(language) ?? 0) + 1);
    }
  };

  await walk(dir, 0);

  const made = [...languages.entries()]
    .filter(([name]) => name !== 'Settings')
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([name, count]) => ({ name, count }));

  return { files, bytes, skipped, capped, madeOf: made, folders: folders.sort().slice(0, 12) };
}

/** The first real sentence out of whatever the project says about itself. */
async function whatItSaysAboutItself(dir) {
  for (const name of ['README.md', 'readme.md', 'README.txt', 'README']) {
    const path = join(dir, name);
    if (!existsSync(path)) continue;
    const text = await quiet(() => readFile(path, 'utf8'), '');
    for (const line of String(text ?? '').split('\n')) {
      const clean = line.replace(/^[#>*\-\s]+/, '').trim();
      if (clean.length > 25 && !clean.startsWith('[') && !clean.startsWith('!')) {
        return { from: name, says: clean.slice(0, 240) };
      }
    }
  }
  return null;
}

/** Files a well-kept project on GitHub usually has, and whether this one does. */
export const EXPECTED = [
  { file: 'README.md', why: 'What this is, for anybody who finds it.' },
  { file: '.gitignore', why: 'Keeps build output and secrets out of what gets sent.' },
  { file: 'LICENSE', why: 'What other people are allowed to do with it.' },
];

function whatIsMissing(dir) {
  return EXPECTED.map((e) => ({
    ...e,
    // A licence can be called several things, and so can a readme.
    there: existsSync(join(dir, e.file))
      || existsSync(join(dir, e.file.toLowerCase()))
      || (e.file === 'LICENSE' && (existsSync(join(dir, 'LICENSE.md')) || existsSync(join(dir, 'LICENSE.txt')))),
  }));
}

/** How long this has been going. */
async function howLong(dir) {
  const first = await quiet(async () =>
    (await git(dir, 'log', '--reverse', '--format=%cI', '--max-parents=0')).stdout.trim().split('\n')[0], null);
  return first || null;
}

// ---------------------------------------------------------------------------

/** Everything the Contents panel shows, gathered once. */
export async function of(dir) {
  const name = basename(dir);
  const [picture, size, about, changes, history, began] = await Promise.all([
    github.picture(dir),
    measure(dir),
    whatItSaysAboutItself(dir),
    github.whatChanged(dir),
    github.history(dir, 6),
    howLong(dir),
  ]);

  const changed = changes.changes ?? [];
  const byKind = new Map();
  for (const c of changed) byKind.set(c.says, (byKind.get(c.says) ?? 0) + 1);

  return {
    name,
    dir,
    about,
    size,
    began,
    missing: whatIsMissing(dir),
    saves: history.saves ?? [],
    changed: {
      total: changed.length,
      // Grouped, because "31 changed, 4 new, 1 deleted" is a picture and a list
      // of thirty-six file names is not.
      kinds: [...byKind.entries()].map(([says, count]) => ({ says, count })),
      files: changed.slice(0, 60),
      more: Math.max(0, changed.length - 60),
    },
    where: {
      shared: picture.shared,
      url: picture.url,
      visibility: picture.visibility,
      toSend: picture.toSend,
      saves: picture.saves,
    },
  };
}

/** Said the way a person says it. */
export const inWords = (bytes) => (bytes >= 1e9
  ? `${(bytes / 1e9).toFixed(1)} GB`
  : bytes >= 1e6 ? `${Math.round(bytes / 1e6)} MB`
    : bytes >= 1e3 ? `${Math.round(bytes / 1e3)} KB` : `${bytes} bytes`);
