/**
 * Two computers, one project, both of you working.
 *
 * This is the part that had to be got right rather than got done, because it is
 * the only thing in the product that can destroy work. Everything below follows
 * from four rules, in this order:
 *
 *   **Nothing is ever synced by itself.** A computer noticing a difference
 *   raises it. A person decides. There is no automatic anything.
 *
 *   **Unsaved work is never walked over.** If your copy has changes you have
 *   not saved, syncing refuses and says so. Saving takes one press and then it
 *   is recoverable forever; taking it away is not.
 *
 *   **Your copy is kept before it is replaced.** Even after refusing all the
 *   above, the folder that was here is moved aside rather than deleted, and the
 *   sentence afterwards says where it went.
 *
 *   **Two changes at once is a fact, not a problem to solve.** When both of you
 *   have moved, the manager will not pick a winner. It says both changed, shows
 *   which is which, and makes you choose — because a merge nobody asked for is
 *   how people lose an afternoon and never find out why.
 *
 * How the noticing works: each computer keeps a short fingerprint of every
 * project it shares (fingerprint.mjs) and answers for it on the local network.
 * The others ask every few seconds. Comparing two short strings is instant, so
 * "your laptop has newer work" appears within seconds of it being true, without
 * anything being copied to find out.
 */

import { rename, mkdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, basename } from 'node:path';

import { HOUSE } from './projects.mjs';
import * as fingerprint from './fingerprint.mjs';
import * as lan from './lan.mjs';
import * as github from './github.mjs';

/** Where a copy goes before it is replaced. Never inside the project. */
const ASIDE = join(HOUSE, 'kept-aside');

/**
 * What the last sync of each project settled on, so a difference that has
 * already been accounted for is not raised again for ever.
 */
const settled = new Map();

/**
 * Everything worth saying about projects that differ between computers.
 *
 * Returns one entry per project that is not the same everywhere, each already
 * carrying the sentence that describes it and what may be done about it.
 */
export async function look({ mine }) {
  if (!lan.isOn()) return { on: false, news: [] };

  const everyone = await lan.whatEveryoneHas();
  if (!everyone.length) return { on: true, news: [], computers: 0 };

  const here = new Map(mine.map((p) => [p.name, p]));
  const news = [];

  for (const { peer, state } of everyone) {
    for (const theirs of state.projects ?? []) {
      const ours = here.get(theirs.name);
      if (!ours) {
        // They have something this computer has never had. That is an offer,
        // not a difference — no risk, nothing of ours to lose.
        news.push({
          kind: 'new',
          name: theirs.name,
          from: peer.machine,
          fromName: state.name,
          files: theirs.state?.files ?? 0,
          bytes: theirs.state?.bytes ?? 0,
          sentence: `${state.name} has ${theirs.name}, and this computer does not.`,
          action: 'Bring it here and it becomes a project you can open.',
          may: ['bring'],
        });
        continue;
      }

      const how = fingerprint.compare(ours.state, theirs.state);
      if (how.same || !how.know) continue;

      const already = settled.get(`${peer.machine}|${theirs.name}`);
      if (already === theirs.state?.mark && already !== undefined) continue;

      const bothMoved = ours.changedSinceSync && how.tooCloseToCall;

      news.push({
        kind: bothMoved ? 'collision' : how.theirsIsNewer ? 'behind' : 'ahead',
        name: theirs.name,
        path: ours.path,
        from: peer.machine,
        fromName: state.name,
        unsaved: ours.unsaved ?? 0,
        theirs: theirs.state,
        ours: ours.state,
        ...saying({ bothMoved, how, them: state.name, name: theirs.name, unsaved: ours.unsaved ?? 0 }),
      });
    }
  }

  return { on: true, computers: everyone.length, news };
}

/** The one sentence, and what may honestly be offered with it. */
function saying({ bothMoved, how, them, name, unsaved }) {
  if (bothMoved) {
    return {
      sentence: `You and ${them} have both changed ${name}.`,
      action: 'Nothing will be picked for you. Look at both, then choose which one to keep.',
      may: unsaved ? ['save'] : ['takeTheirs', 'keepMine'],
    };
  }
  if (how.theirsIsNewer) {
    const more = how.files > 0 ? `${how.files} more file${how.files === 1 ? '' : 's'}` : 'different work';
    return {
      sentence: `${them} has newer work in ${name} — ${more}.`,
      action: unsaved
        ? `You have ${unsaved} unsaved change${unsaved === 1 ? '' : 's'} here. Save them first and this can come across.`
        : 'Bring it across and your copy is kept aside first.',
      may: unsaved ? ['save'] : ['takeTheirs'],
    };
  }
  return {
    sentence: `This computer has newer work in ${name} than ${them}.`,
    action: `Nothing to do here. ${them} will be told, and can take it when somebody there asks.`,
    may: [],
  };
}

/**
 * Take another computer's copy of a project, safely.
 *
 * Refuses on unsaved work. Keeps what is here before replacing it. Says where
 * the kept copy went, every time, whether or not anybody asked.
 */
export async function take({ name, from, path, job, jobs }) {
  if (!path || !existsSync(path)) {
    return jobs.end(job, {
      ok: false,
      sentence: `${name} is not on this computer, so there is nothing to bring it into.`,
      action: 'Bring it across as a new project instead.',
    });
  }

  jobs.step(job, 'Checking there is nothing here you would lose.');
  const picture = await github.picture(path);
  if (picture.unsaved > 0) {
    return jobs.end(job, {
      ok: false,
      sentence: `You have ${picture.unsaved} unsaved change${picture.unsaved === 1 ? '' : 's'} in ${name}, so nothing was brought across.`,
      action: 'Save your work first. Then this can come over and your copy is still kept aside.',
    });
  }

  await mkdir(ASIDE, { recursive: true });
  const kept = join(ASIDE, `${basename(path)}-${new Date().toISOString().replace(/[:.]/g, '-')}`);

  jobs.step(job, `Keeping your copy aside, at ${kept}.`);
  try {
    await rename(path, kept);
  } catch {
    return jobs.end(job, {
      ok: false,
      sentence: 'Your copy could not be moved aside, so nothing was replaced.',
      action: 'Something in the folder is open somewhere else. Close it and try again.',
    });
  }

  const done = await lan.takeProject({ machine: from, name, into: path, job, jobs });

  if (!done?.ok) {
    // It did not arrive. Put back exactly what was here — this is the whole
    // reason the old copy is moved rather than deleted.
    await rm(path, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }).catch(() => {});
    await rename(kept, path).catch(() => {});
    return done;
  }

  settled.set(`${from}|${name}`, null);
  return { ...done, keptAt: kept };
}

/** Stop being told about a difference you have looked at and decided to leave. */
export function leaveItAlone({ from, name, mark }) {
  settled.set(`${from}|${name}`, mark ?? null);
  return { ok: true, sentence: `${name} will stop being raised until it changes again.` };
}

export const keptAsideIn = ASIDE;
