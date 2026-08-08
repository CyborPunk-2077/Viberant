/**
 * What a build made, coming back from the computer that made it.
 *
 * A build on another machine is only half useful if what it produced stays
 * there. So: find what came out, send it as an ordinary parcel, unwrap it here.
 *
 * **The same wrap and the same unwrap.** Not "like a transfer" — a transfer.
 * The integrity check, the resume ledger and the refusal to accept a parcel
 * whose story does not add up all apply, because there is nothing else here for
 * them to apply to.
 *
 * **The output folder is decided by the project, not by the asker.** Which is
 * the same rule the remote build itself follows: a caller who could name a
 * folder could name `C:\Users`, and the capability would be "send me anything",
 * spelled differently.
 */

import { existsSync } from 'node:fs';
import { join, resolve, relative, sep } from 'node:path';

import * as parcel from './parcel.mjs';
import * as providers from './providers.mjs';

/**
 * Where a project puts what it builds.
 *
 * Read out of the project — the framework decides, and each of them has a
 * settled answer. Nothing here accepts a folder from anybody.
 */
export async function whatCameOut(dir) {
  const look = await providers.inspect(dir);
  const named = look?.output;

  if (!named || named === '.') {
    return {
      ok: false,
      sentence: 'This project does not say where it puts what it builds.',
      action: 'Nothing can be brought back until it does.',
    };
  }

  const at = join(resolve(dir), named);

  // The check that matters. `output` comes from this computer's own reading of
  // this computer's own project, and it is still checked, because a folder that
  // climbs out of the project is a folder that should never be sent whatever
  // put it there.
  const inside = resolve(at);
  const root = resolve(dir);
  if (inside !== root && !inside.startsWith(root + sep)) {
    return {
      ok: false,
      sentence: 'What this project says it builds into is outside the project.',
      action: 'Nothing was sent.',
    };
  }

  if (!existsSync(at)) {
    return {
      ok: false,
      sentence: `Nothing has been built here yet — there is no ${named} folder.`,
      action: 'Build it first, then bring it back.',
    };
  }

  const weight = await parcel.weigh(at, { everything: true });
  return {
    ok: true,
    at,
    named,
    files: weight.files,
    bytes: weight.bytes,
    sentence: `${named}: ${weight.files} files, ${parcel.inWords(weight.bytes)}.`,
  };
}

/**
 * Send what came out, down a channel.
 *
 * `everything: true`, because a build output *is* the folders a project would
 * normally leave behind — `dist` is on the list of things not worth sending
 * when it is a by-product, and is the entire point when it is the answer.
 */
export async function send(dir, channel) {
  const found = await whatCameOut(dir);
  if (!found.ok) {
    channel.fail(found.sentence);
    return found;
  }

  await channel.pour(parcel.wrap(found.at, { everything: true }));
  return { ok: true, files: found.files, bytes: found.bytes };
}

/**
 * Take what arrives and put it beside the project it belongs to.
 *
 * Beside rather than into: something built on a different computer landing on
 * top of what is here is exactly the surprise D-146 exists to prevent. It is
 * named for where it came from, so two machines' answers do not overwrite each
 * other either.
 */
export async function receive(channel, { into, from, named = 'built' }) {
  const where = join(resolve(into), `${named}-from-${String(from).replace(/[^\w-]+/g, '-').slice(0, 40)}`);

  const out = await parcel.unwrap(channel.incoming, where, { keep: false });
  if (!out.ok) return out;

  return {
    ok: true,
    at: out.at,
    files: out.files,
    bytes: out.bytes,
    sentence: `What ${from} built is here — ${out.files} files, ${parcel.inWords(out.bytes)}.`,
    action: 'It is beside the project rather than in it, so nothing of yours was replaced.',
  };
}
