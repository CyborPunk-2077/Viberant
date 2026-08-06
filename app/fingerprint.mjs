/**
 * A short answer to "is this folder the same as that folder".
 *
 * Two computers cannot compare projects by sending each other the projects.
 * They need something small they can each work out on their own that comes out
 * identical when the folders match and different when they do not — and that is
 * cheap enough to work out every few seconds without anybody noticing.
 *
 * That is all this is: walk the meaningful files, take each one's path, size and
 * the moment it was last written, and hash the lot. Nothing is read. A hundred
 * megabytes of project costs the same as an empty one, because only the
 * directory entries are touched.
 *
 * What it is not: a checksum of the contents. Two files with the same size,
 * written at the same millisecond, with different bytes inside would look the
 * same to this. That is a real limit and it is the right trade: the alternative
 * is reading every byte of every project every few seconds, and the failure it
 * would protect against does not happen when one person is working on their own
 * two computers.
 */

import { createHash } from 'node:crypto';
import { readdir, stat } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

import { HEAVY } from './parcel.mjs';

/** Enough to answer the question. Beyond this, the answer would not change. */
const MOST_FILES = 30_000;

/**
 * The state of a folder, as a short string plus the numbers worth showing.
 *
 * `mark` is what the comparison uses. `newest` is when anything in it last
 * changed, which is what decides who is ahead when two computers differ.
 */
export async function of(dir) {
  const parts = [];
  let files = 0;
  let bytes = 0;
  let newest = 0;
  let capped = false;

  const walk = async (at) => {
    if (capped) return;
    const entries = await readdir(at, { withFileTypes: true }).catch(() => []);
    // Sorted, so two computers walking the same folder produce the same list.
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

    for (const entry of entries) {
      if (capped) return;
      const path = join(at, entry.name);

      if (entry.isDirectory()) {
        // The same folders the parcel leaves behind. A project whose
        // node_modules differs is not a project that has changed.
        if (HEAVY.includes(entry.name) || entry.name === '.git') continue;
        await walk(path);
        continue;
      }
      if (!entry.isFile()) continue;

      const s = await stat(path).catch(() => null);
      if (!s) continue;

      files += 1;
      if (files > MOST_FILES) { capped = true; return; }
      bytes += s.size;
      // Whole seconds: two computers' clocks agree to about that, and a file
      // copied across a network keeps its time only to that precision anyway.
      const when = Math.floor(s.mtimeMs / 1000);
      if (when > newest) newest = when;
      parts.push(`${relative(dir, path).split(sep).join('/')}:${s.size}:${when}`);
    }
  };

  await walk(dir);

  return {
    mark: createHash('sha256').update(parts.join('\n')).digest('hex').slice(0, 24),
    files,
    bytes,
    newest: newest * 1000,
    capped,
  };
}

/**
 * What is different between two of these, in words.
 *
 * Deliberately vague about *what* changed — that would need the contents. It is
 * precise about the two things that decide what to offer: whether they differ at
 * all, and which one was touched more recently.
 */
export function compare(mine, theirs) {
  if (!mine || !theirs) return { same: false, know: false };
  if (mine.mark === theirs.mark) return { same: true, know: true };

  const gap = (theirs.newest ?? 0) - (mine.newest ?? 0);
  return {
    same: false,
    know: true,
    theirsIsNewer: gap > 0,
    // Under a minute apart, saying who is "newer" is not a claim worth making —
    // two clocks and two people are not that well synchronised.
    tooCloseToCall: Math.abs(gap) < 60_000,
    files: (theirs.files ?? 0) - (mine.files ?? 0),
    bytes: (theirs.bytes ?? 0) - (mine.bytes ?? 0),
  };
}
