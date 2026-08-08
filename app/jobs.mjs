/**
 * Long errands, watched while they run.
 *
 * Putting a site online or building an application takes minutes, not
 * milliseconds. A spinner for four minutes is indistinguishable from a hang, so
 * these run in the open: every line the command prints is kept, and the page
 * reads whatever has arrived so far.
 *
 * This is the one place in the product where machine output is shown as it is,
 * and that is deliberate. The plain sentence still belongs to the manager — it
 * is the verdict. The lines underneath are evidence, shown because a build that
 * fails at line four hundred should not be summarised into a shrug.
 */

import { spawn } from 'node:child_process';
import { platform } from 'node:process';
import { randomUUID } from 'node:crypto';

const WINDOWS = platform === 'win32';
const KEEP_LINES = 600;
const KEEP_FINISHED = 20;

/** Everything that has run this session, newest last. */
const jobs = new Map();

/** One running or finished errand, in the shape the page reads. */
function snapshot(job) {
  return {
    id: job.id,
    what: job.what,
    where: job.where,
    kind: job.kind ?? 'other',
    project: job.project ?? null,
    started: job.started,
    finished: job.finished,
    running: job.finished === null,
    ok: job.ok,
    sentence: job.sentence,
    action: job.action,
    at: job.at ?? null,
    made: job.made ?? null,
    release: job.release ?? null,
    lines: job.lines,
    steps: job.steps,
  };
}

export function get(id) {
  const job = jobs.get(id);
  return job ? snapshot(job) : null;
}

export function all() {
  return [...jobs.values()].map(snapshot).sort((a, b) => b.started - a.started);
}

/**
 * What kind of errand this is.
 *
 * Written down rather than read back out of the sentence describing it. The
 * corner of the screen groups these — one transfer, one build — and grouping by
 * matching words against "Bringing" is the sort of rule that breaks the day
 * somebody rewords a sentence.
 */
export const KINDS = ['transfer', 'build', 'deploy', 'send', 'other'];

/** Start an errand. Returns straight away with something to watch. */
export function begin({ what, where, kind = 'other', project = null }) {
  const job = {
    id: randomUUID(),
    what,
    where,
    kind: KINDS.includes(kind) ? kind : 'other',
    project,
    started: Date.now(),
    finished: null,
    ok: null,
    sentence: null,
    action: null,
    lines: [],
    steps: [],
  };
  jobs.set(job.id, job);
  forget();
  return job;
}

/** Say what is happening now, in words rather than in output. */
export function step(job, sentence) {
  job.steps.push({ at: Date.now(), sentence });
  return job;
}

export function write(job, text) {
  for (const line of String(text).split(/\r?\n/)) {
    if (!line.trim()) continue;
    job.lines.push(line.slice(0, 500));
  }
  if (job.lines.length > KEEP_LINES) job.lines.splice(0, job.lines.length - KEEP_LINES);
}

/**
 * Settle it: one plain sentence about what is true, and one thing to do.
 *
 * `at` is where whatever this errand was doing ended up, and it is carried
 * rather than dropped. It used to be neither: the three fields below were
 * picked out by name and everything else thrown away, so a transfer that ended
 * with `{ ok: true, at: 'D:\\Projects\\thing' }` came back without the one
 * piece of that sentence anybody needed.
 *
 * What that produced is the reported fault — a folder that came across the
 * network completely and then **never appeared in Projects**. The line meant to
 * register it read `if (done.ok && done.at)`, and `done.at` was always
 * undefined, so it silently did nothing. Nothing failed; a step simply never
 * happened, which is this codebase's signature failure and the reason D-65
 * exists.
 */
export function end(job, { ok, sentence, action = null, at = null, made = null, release = null }) {
  job.finished = Date.now();
  job.ok = ok;
  job.sentence = sentence;
  job.action = action;
  job.at = at;
  // What the errand actually produced, so the panel can offer it rather than
  // describe it. Named fields rather than a spread, because a job is read by a
  // page and everything on it has to be something a page can show.
  job.made = made;
  job.release = release;
  return snapshot(job);
}

/**
 * Run one command inside an errand, and wait for it.
 *
 * Never throws. What comes back says whether it worked and what it printed,
 * because a command that fails is a fact about the errand, not an exception.
 */
export function runInto(job, { file, args = [], cwd, env = {}, timeout = 20 * 60 * 1000 }) {
  return new Promise((resolve) => {
    job.lines.push(`> ${file} ${args.join(' ')}`);

    let child;
    try {
      child = spawn(forShell(file), args.map(forShell), {
        cwd,
        env: { ...process.env, ...env, FORCE_COLOR: '0', NO_COLOR: '1' },
        shell: WINDOWS,
        windowsHide: true,
      });
    } catch {
      job.lines.push(`${file} would not start`);
      return resolve({ ok: false, code: null });
    }

    const timer = setTimeout(() => {
      job.lines.push('This was taking far too long, so it was stopped.');
      child.kill();
    }, timeout);

    child.stdout?.on('data', (d) => write(job, d));
    child.stderr?.on('data', (d) => write(job, d));
    child.on('error', () => {
      clearTimeout(timer);
      job.lines.push(`${file} is not on this computer.`);
      resolve({ ok: false, code: null });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ ok: code === 0, code });
    });
  });
}

/**
 * One word stays one word.
 *
 * Windows starts these through a shell, because npm and the GitHub helper are
 * small shims rather than programs. A shell hands anything with a space in it
 * over as two separate words, so a path like `C:\Program Files\...` arrives as
 * `C:\Program`, and the description you typed for a version arrives as its
 * first word. This is the same trap that broke launching apps once; it is worth
 * fixing in both places rather than remembering not to fall in.
 */
function forShell(word) {
  const s = String(word);
  if (!WINDOWS || !/[ "]/.test(s)) return s;
  return `"${s.replace(/"/g, '\\"')}"`;
}

/** Keep the recent past, let go of the rest. */
function forget() {
  const finished = [...jobs.values()].filter((j) => j.finished !== null)
    .sort((a, b) => a.finished - b.finished);
  while (finished.length > KEEP_FINISHED) jobs.delete(finished.shift().id);
}
