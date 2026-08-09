/**
 * What this copy of Viberant is, read rather than written down in code.
 *
 * Two things used to be spelled out in the source: the account to send a report
 * about the manager to, and the account to look for releases on. Both were one
 * person's own GitHub account, and both were compiled into every copy that
 * shipped. That is somebody's name baked into a program, which is the wrong
 * place for a name of any kind — it travels to computers that have nothing to
 * do with them, it cannot be changed without a rebuild, and anybody reading the
 * source learns whose account it is.
 *
 * So it is read out of `package.json`, which is where a project already records
 * where it lives, and **it is allowed to be absent**. That is the point: with
 * nothing written there, no account exists anywhere in this app. The two
 * features that wanted one say plainly that they have nowhere to go rather than
 * quietly reaching some stranger's account.
 *
 * Read once. This does not change while the app is running.
 */

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

/**
 * `owner/name`, out of whatever shape the address was written in.
 *
 * A repository field is variously a bare string, an object with a `url`, an
 * address with `git+` on the front and `.git` on the end, or an `ssh` one.
 * All of them mean the same thing and none of them is what a command wants,
 * which is the two words.
 */
export function ownerAndName(said) {
  const raw = typeof said === 'string' ? said : said?.url ?? '';
  const text = String(raw).trim();
  if (!text) return null;

  const m = text
    .replace(/^git\+/, '')
    .replace(/\.git$/, '')
    .match(/(?:github\.com[/:])?([\w.-]+)\/([\w.-]+)$/);

  if (!m) return null;
  const [, owner, name] = m;
  // A path fragment is not an account. `./app` and `../core` both match the
  // shape and mean nothing here.
  if (owner === '.' || owner === '..' || !owner || !name) return null;
  return `${owner}/${name}`;
}

let read = null;

async function itsPackage() {
  if (read) return read;

  // Beside this folder when running from the source, and one further up inside
  // a built copy. Neither is guessed at: both are looked for.
  for (const at of [join(here, '..', 'package.json'), join(here, '..', '..', 'package.json')]) {
    if (!existsSync(at)) continue;
    try {
      read = JSON.parse(await readFile(resolve(at), 'utf8'));
      return read;
    } catch { /* a package file that cannot be read is the same as none */ }
  }

  read = {};
  return read;
}

/**
 * Where this app's own issues and releases live, if anywhere.
 *
 * `null` is a real answer and the one you get by default. Everything that uses
 * this has to say so rather than carry on.
 */
export async function whereItLives() {
  const pkg = await itsPackage();
  return {
    version: pkg.version ?? null,
    issues: ownerAndName(pkg.bugs?.url ?? pkg.bugs) ?? ownerAndName(pkg.repository),
    releases: ownerAndName(pkg.repository),
  };
}

export const forgetIt = () => { read = null; };
