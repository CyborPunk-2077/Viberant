/**
 * A way back, taken before anything is replaced.
 *
 * The rule this exists to keep: **nothing overwrites somebody's work without a
 * way to undo it.** A sync that lands on top of an afternoon's editing is the
 * one failure that loses a person's trust permanently, and "we verified the
 * bytes arrived correctly" is no comfort at all when the bytes that arrived
 * were the wrong ones.
 *
 * **This is not another version control system.** It has no history, no
 * branches, no merging and no opinion about what a change means. It copies the
 * files that are about to be replaced, keeps them beside the project, and can
 * put them back. That is the entire feature, and keeping it that small is what
 * makes it trustworthy — a safety net with a configuration screen is not one.
 *
 * Where a project is already looked after by Git, that is respected rather than
 * competed with: the snapshot exists for the moment *between* a person's last
 * save and something arriving on top of it, which is exactly the window Git
 * does not cover.
 *
 * **Nothing secret is copied anywhere shared.** Snapshots live beside the
 * project on this computer, never in the workspace, never in a parcel, and
 * never anywhere another machine can ask for them.
 */

import { mkdir, rm, copyFile, readdir, writeFile, readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname, relative, sep } from 'node:path';

import { HOUSE } from './projects.mjs';

const SHELF = join(HOUSE, 'ways-back');

/** How many are kept per project before the oldest is let go. */
export const KEEP = 5;

const quiet = async (fn, fallback = null) => { try { return await fn(); } catch { return fallback; } };

/** Where the ways back for one project live. */
const shelfFor = (dir) => join(SHELF, String(dir).replace(/[^a-zA-Z0-9]+/g, '-').slice(-80));

/**
 * Copy what is about to be replaced.
 *
 * Only those files. A snapshot of a whole ten-gigabyte project before every
 * sync would cost more than the sync and fill a disk by Thursday, and it would
 * be copying nine and a half gigabytes that were never in danger.
 */
export async function before({ dir, files, why }) {
  const wanted = [...new Set(files ?? [])].filter(Boolean);
  if (!wanted.length) return { ok: true, taken: false, sentence: 'Nothing here was going to be replaced.' };

  const at = join(shelfFor(dir), String(Date.now()));
  await mkdir(at, { recursive: true });

  const kept = [];
  let bytes = 0;

  for (const path of wanted) {
    // A snapshot never makes a second copy of somebody's keys in a folder they
    // will forget exists.
    if (!wouldCopy(path)) continue;
    const from = join(dir, path);
    if (!existsSync(from)) continue;
    const to = join(at, path);
    await mkdir(dirname(to), { recursive: true });
    const done = await quiet(async () => {
      await copyFile(from, to);
      bytes += (await stat(to)).size;
      return true;
    });
    if (done) kept.push(path);
  }

  if (!kept.length) {
    await quiet(() => rm(at, { recursive: true, force: true }));
    return { ok: true, taken: false, sentence: 'None of what is arriving is here yet, so there is nothing to keep.' };
  }

  await writeFile(join(at, '.what-this-was'), JSON.stringify({
    // What was actually copied, never what was asked for. A list that claims a
    // file it skipped is a way back that quietly does not go all the way back.
    dir, why, at: Date.now(), files: kept, bytes,
  }, null, 2), 'utf8');

  await tidy(dir);

  return {
    ok: true,
    taken: true,
    id: at,
    files: kept.length,
    bytes,
    sentence: `${kept.length} file${kept.length === 1 ? '' : 's'} that would be replaced were kept first.`,
    action: 'They can be put back from the project page.',
  };
}

/** Every way back this project has, newest first. */
export async function forProject(dir) {
  const shelf = shelfFor(dir);
  if (!existsSync(shelf)) return [];

  const out = [];
  for (const name of await readdir(shelf).catch(() => [])) {
    const held = await quiet(async () => JSON.parse(await readFile(join(shelf, name, '.what-this-was'), 'utf8')));
    if (held) out.push({ id: join(shelf, name), ...held, files: held.files.length, kept: held.files });
  }
  return out.sort((a, b) => b.at - a.at);
}

/**
 * Put one back.
 *
 * Every file it holds, over whatever is there now. Deliberately blunt: a
 * partial restore is a state nobody asked for, and somebody reaching for this
 * has already decided what they want.
 */
export async function restore(id) {
  const held = await quiet(async () => JSON.parse(await readFile(join(id, '.what-this-was'), 'utf8')));
  if (!held) {
    return { ok: false, sentence: 'That way back is not there any more.', action: 'Look at the list again.' };
  }

  let put = 0;
  for (const path of held.files) {
    const from = join(id, path);
    if (!existsSync(from)) continue;
    const to = join(held.dir, path);
    await mkdir(dirname(to), { recursive: true });
    if (await quiet(async () => { await copyFile(from, to); return true; })) put += 1;
  }

  return {
    ok: true,
    files: put,
    sentence: `${put} file${put === 1 ? '' : 's'} put back as they were.`,
    action: 'Nothing else in the project was touched.',
  };
}

/** Let go of the oldest, so this cannot grow forever. */
async function tidy(dir) {
  const all = await forProject(dir);
  for (const one of all.slice(KEEP)) {
    await quiet(() => rm(one.id, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));
  }
}

/** Throw one away on purpose. */
export async function forget(id) {
  await quiet(() => rm(id, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));
  return { ok: true, sentence: 'That way back is gone.' };
}

/**
 * Files a snapshot must never copy.
 *
 * A snapshot lives on this computer and is never sent anywhere, so this is not
 * about a leak across the wire — it is about not making a second copy of
 * somebody's keys in a folder they will forget exists. The file with real
 * values in it is never read anywhere in this product (D-125) and it is not
 * going to start being read here.
 */
export const NEVER_COPY = [/(^|[\\/])\.env$/, /(^|[\\/])\.env\.[^\\/]*$/,
  /(^|[\\/])id_rsa$/, /(^|[\\/])\.npmrc$/, /(^|[\\/])\.netrc$/];

export const wouldCopy = (path) => !NEVER_COPY.some((one) => one.test(String(path)));

export const SHELF_AT = SHELF;
export const __testOnly = { shelfFor };
