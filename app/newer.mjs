/**
 * Whether there is a newer Viberant, and what it would take to get it.
 *
 * This one is worth reading before judging, because it deliberately stops half
 * way and that looks at first like something unfinished.
 *
 * An updater that fetches a file and runs it is four lines. It is also the most
 * dangerous four lines anybody can put in a desktop application: whoever can
 * answer that request once — a compromised account, a hijacked address, a
 * network you do not control — runs whatever they like on this computer, as
 * you, forever. The protection against that is not care and it is not HTTPS. It
 * is a signature: the installer is signed with a key only the author holds, the
 * computer checks that signature before running a byte, and an installer from
 * anybody else is refused by the operating system rather than by us.
 *
 * **That signature does not exist yet.** It needs a code-signing certificate,
 * bought from a certificate authority, kept somewhere it cannot be copied, and
 * a build that signs with it. Until it does, the honest options are exactly
 * two: do it properly, or do not do it. Fetching and running unsigned code
 * "for now" is worse than having no updater at all, because it teaches somebody
 * to press a button that will one day be the wrong button.
 *
 * So this does everything up to that line and stops:
 *
 *   it asks GitHub whether a newer version has been released;
 *   it says what is new, in the words the release was written in;
 *   it opens the page where the installer is, in your own browser.
 *
 * You download it, and Windows checks it, and you run it. The one step this
 * does not take on your behalf is the one step that would need trusting us
 * with something we have not earned yet. What has to happen for that step to
 * exist is written down in `signing()` below rather than left as a shrug.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import * as thisapp from './thisapp.mjs';

const run = promisify(execFile);
const quiet = async (fn, fallback = null) => { try { return await fn(); } catch { return fallback; } };

/**
 * Where releases of this app are published, if anywhere.
 *
 * Read out of `package.json` rather than written down here. It used to be one
 * person's account, in the source, in every copy that shipped — and a copy
 * with nothing written there now says it does not know where to look, which is
 * true, instead of asking a stranger's account whether you are up to date.
 */
export const releasesAt = async () => (await thisapp.whereItLives()).releases;

/** How long an answer is worth reusing. Asked once an hour, not once a click. */
const FRESH_FOR = 60 * 60 * 1000;

let held = null;

/**
 * Compare two versions the way a person would read them.
 *
 * `0.10.0` is newer than `0.9.0`, which string comparison gets backwards, and
 * getting it backwards means telling somebody they are behind when they are
 * ahead — which is the same class of lie as the two this project has already
 * caught. Anything that is not three numbers reads as nothing rather than as
 * something, so a release named oddly is ignored instead of guessed at.
 */
export function newerThan(there, here) {
  const read = (v) => {
    const m = /^v?(\d+)\.(\d+)\.(\d+)/.exec(String(v ?? '').trim());
    return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
  };
  const a = read(there);
  const b = read(here);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i += 1) {
    if (a[i] > b[i]) return true;
    if (a[i] < b[i]) return false;
  }
  return false;
}

/**
 * What has to be true before an update could install itself. Said plainly,
 * because "not implemented" tells nobody what is missing or who can supply it.
 */
export const signing = () => ({
  ready: false,
  sentence: 'Viberant cannot install its own updates, on purpose.',
  action: 'Downloading it yourself takes one press, and this computer checks the file before it runs. Installing it automatically needs the app to be signed first, which has not been done.',
  needs: [
    'A certificate that proves the installer came from whoever makes Viberant.',
    'That certificate kept somewhere it cannot be copied off the machine that builds with it.',
    'Every installer signed with it, so this computer can refuse one that is not.',
  ],
});

/**
 * Is there a newer one?
 *
 * Never throws, never blocks anything, and says nothing at all rather than
 * guessing when it could not ask. A version check that says "up to date"
 * because the network was down is the honesty fault this project exists to
 * avoid, so the shape here is three states and not two: newer, current, or
 * could not ask.
 */
export async function check(here, { force = false } = {}) {
  if (!force && held && Date.now() - held.at < FRESH_FOR) return held.answer;

  const where = await releasesAt();
  if (!where) {
    /*
     * Nowhere to look is a third thing, and it is not "up to date".
     *
     * The whole shape of this file is that not knowing is never reported as
     * good news, and a copy that does not say where its releases are published
     * knows less than it does when the network is down.
     */
    return {
      ok: true,
      known: false,
      newer: false,
      here,
      sentence: 'This copy does not say where its releases are published, so it cannot check.',
      action: 'It will not check again until it does.',
    };
  }

  let refused = null;
  const asked = await run('gh', [
    'release', 'view', '--repo', where,
    '--json', 'tagName,name,body,url,publishedAt',
  ], { maxBuffer: 4 * 1024 * 1024 }).catch((e) => { refused = e; return null; });

  /**
   * Nothing released yet is not the same as could not ask, and telling somebody
   * to check they are online when the truth is that no version exists is the
   * kind of wrong advice this product is supposed to be better than. Both come
   * back as a refusal, so the two are told apart by what was said.
   */
  if (!asked) {
    const why = String(refused?.stderr ?? refused?.message ?? '');
    const nothingYet = /release not found|no releases/i.test(why);
    const answer = nothingYet
      ? {
        ok: true, known: true, newer: false, here,
        sentence: `Nothing has been released yet, so ${here} is the newest there is.`,
        action: null,
      }
      : {
        ok: true, known: false, here,
        sentence: 'Whether there is a newer Viberant could not be checked just now.',
        action: 'Check you are online, and try again.',
      };
    held = { at: Date.now(), answer };
    return answer;
  }

  const out = (() => { try { return JSON.parse(asked.stdout); } catch { return null; } })();
  if (!out?.tagName) {
    const answer = {
      ok: true, known: false, here,
      sentence: 'What has been released could not be read.',
      action: 'Try again in a moment.',
    };
    held = { at: Date.now(), answer };
    return answer;
  }

  const there = String(out.tagName).replace(/^v/, '');
  const answer = newerThan(there, here)
    ? {
      ok: true,
      known: true,
      newer: true,
      here,
      there,
      name: out.name || `Viberant ${there}`,
      whatsNew: whatChanged(out.body),
      at: out.url ?? null,
      when: out.publishedAt ?? null,
      sentence: `Viberant ${there} is out. You have ${here}.`,
      action: 'Getting it opens the page in your browser. You download it and run it, and this computer checks the file on the way.',
    }
    : {
      ok: true, known: true, newer: false, here, there,
      sentence: `This is the newest Viberant there is (${here}).`,
      action: null,
    };

  held = { at: Date.now(), answer };
  return answer;
}

/**
 * What a release says about itself, kept short and kept as written.
 *
 * Not summarised and not rewritten. Whoever wrote the release said what
 * changed; putting a model between that and the reader would add a way for it
 * to be wrong for no gain at all.
 */
function whatChanged(body) {
  return String(body ?? '')
    .split('\n')
    .map((l) => l.replace(/^\s*[-*]\s*/, '').trim())
    .filter((l) => l && !l.startsWith('#') && !l.startsWith('<'))
    .slice(0, 8);
}

/** Forget what was asked, so the next check really asks. */
export const forget = () => { held = null; };
