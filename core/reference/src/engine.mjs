/**
 * The Workspace Engine.
 *
 * Everything about version control lives in this file and nowhere else. That is
 * not a convention — it is how the constitution's hardest promise is kept. "No
 * version-control vocabulary on any surface, ever" is guaranteed structurally
 * because the seam does not carry it: every argument in is a domain object,
 * every value out is a domain object, and every sentence out has passed the
 * vocabulary contract before it leaves.
 *
 * Nothing above this file knows how any of this works. If the mechanism were
 * replaced entirely, the domain would not change — which is the test of whether
 * an abstraction is genuine rather than decorative.
 *
 * What this Engine does NOT do:
 *   - stop a running assistant (that is the Gateway's; abandonment asks it first)
 *   - decide anything (Core decides; this executes)
 *   - name its mechanisms to anyone above it
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, rm, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { checkSentence } from './lexicon.mjs';

const run = promisify(execFile);

/**
 * A refusal, in the one shape the whole product uses: what is true, and the one
 * thing to do about it. Architecture §10 calls this "honest capability
 * reporting" — where the mechanism cannot do what the domain asked, it says so
 * in the domain's own language rather than leaking its own.
 */
function refuse(sentence, action) {
  const s = checkSentence(sentence), a = checkSentence(action);
  if (!s.ok || !a.ok) {
    // A refusal that cannot be spoken is a bug in this file, never something a
    // developer should see. Fail loudly here rather than quietly on a surface.
    throw new Error(
      `the Engine tried to emit an unspeakable refusal: ${[...s.problems, ...a.problems].join('; ')}`,
    );
  }
  return Object.freeze({ ok: false, sentence, action });
}

const done = (extra = {}) => Object.freeze({ ok: true, ...extra });

export class Engine {
  #root;        // where the developer's project lives
  #groundRoot;  // where isolated ground is kept, outside the project
  #project;

  /**
   * @param {{project: string, location: string, groundRoot: string}} args
   */
  constructor({ project, location, groundRoot }) {
    this.#project = project;
    this.#root = resolve(location);
    this.#groundRoot = resolve(groundRoot);
  }

  // ---- the sealed interface -------------------------------------------
  // Six operations. Exactly the domain's needs and nothing more.

  /**
   * Prepare isolated ground for an effort, derived from the project's settled
   * reality. Called at first delegation, never at creation (decision D-5,
   * measured: ground costs the full size of the project's files every time).
   */
  async prepare(effort) {
    const where = this.#groundFor(effort);
    if (existsSync(where)) return done({ ground: where });

    const health = await this.#healthCheck();
    if (health) return health;

    try {
      await mkdir(this.#groundRoot, { recursive: true });
      await this.#git(['worktree', 'add', '--quiet', '-b', this.#lane(effort), where, 'HEAD']);
      return done({ ground: where });
    } catch (e) {
      return refuse(
        'This project could not be set up to work on separately just now.',
        'Try starting it again in a moment.',
      );
    }
  }

  /**
   * What an effort actually changed, as raw material for its one-sentence
   * account. Returns paths and shapes of change — never a mechanism's output.
   */
  async describe(effort) {
    const where = this.#groundFor(effort);
    if (!existsSync(where)) return done({ touched: [], settledCount: 0 });

    const { stdout: pending } = await this.#git(['status', '--porcelain'], where);
    const { stdout: against } = await this.#git(
      ['diff', '--name-status', `${await this.#mainline()}...HEAD`], where,
    );

    const touched = new Map();
    for (const line of pending.split('\n')) {
      if (!line.trim()) continue;
      const path = line.slice(3).trim();
      touched.set(path, line.trim().startsWith('??') ? 'added' : 'changed');
    }
    for (const line of against.split('\n')) {
      if (!line.trim()) continue;
      const [code, path] = line.split(/\s+/, 2);
      if (!path) continue;
      touched.set(path, code.startsWith('A') ? 'added' : code.startsWith('D') ? 'removed' : 'changed');
    }

    return done({
      touched: [...touched].map(([path, kind]) => ({ path, kind })),
      hasWork: await this.#hasWork(where),
    });
  }

  /**
   * Settle accepted work into the project.
   *
   * One commit, titled with the developer's own sentence (decision D-11). Forty
   * machine steps become one entry a human wrote — which leaves a shared project
   * more readable for people who do not use this app, not merely unharmed.
   *
   * @param {string} effort
   * @param {string} intent the developer's own words; used verbatim
   */
  async settle(effort, intent) {
    const where = this.#groundFor(effort);
    if (!existsSync(where)) {
      return refuse(
        'There is no work here to settle.',
        'Send this effort to an assistant first.',
      );
    }

    // Gather whatever the assistant left behind, including anything it never
    // got around to tidying.
    await this.#git(['add', '--all'], where);
    const { stdout: staged } = await this.#git(['status', '--porcelain'], where);
    if (staged.trim()) {
      await this.#git(['-c', 'user.name=assistant', '-c', 'user.email=assistant@local',
        'commit', '--quiet', '--no-verify', '-m', 'work in progress'], where);
    }

    if (!(await this.#hasWork(where))) {
      return refuse(
        'Nothing changed in this effort, so there is nothing to settle.',
        'Send it back with more direction, or let it go.',
      );
    }

    // Never settle on top of work the developer has in progress themselves.
    // Recovering from a collision means putting the project back as it was, and
    // we must know there is nothing of theirs to lose before we do that. The app
    // never silently acts on the developer's own work.
    const { stdout: inProgress } = await this.#git(['status', '--porcelain']);
    if (inProgress.trim()) {
      return refuse(
        'You have work of your own in progress here, so this cannot be settled on top of it yet.',
        'Put your own work somewhere safe first, then accept this again.',
      );
    }

    const lane = this.#lane(effort);
    try {
      await this.#git(['merge', '--squash', '--no-commit', lane]);
    } catch {
      // A squash that stops partway leaves the project mid-thought. Because we
      // checked above that nothing of the developer's was in flight, putting it
      // back exactly as it was is safe.
      await this.#git(['reset', '--hard', 'HEAD']).catch(() => {});
      await this.#git(['clean', '--force', '-d']).catch(() => {});
      return refuse(
        'This work and the rest of the project have both changed the same things, so it cannot be settled as it stands.',
        'Send it back and ask for it to be brought up to date.',
      );
    }

    try {
      await this.#git(['commit', '--quiet', '--no-verify', '-m', intent]);
    } catch {
      await this.#git(['reset', '--hard', 'HEAD']).catch(() => {});
      return refuse(
        'The project would not accept this work just now.',
        'Try accepting it again in a moment.',
      );
    }

    await this.#teardown(effort);
    return done({ settled: true });
  }

  /**
   * Send settled work to the shared copy (decision D-1).
   *
   * Only for projects the developer marked as shared. This is the one place the
   * product reaches the network on the developer's behalf, and it is an effect
   * of a verdict they rendered — never something that happens on its own.
   */
  async publish() {
    const shared = await this.#sharedCopy();
    if (!shared) {
      return refuse(
        'This project has no shared copy set up.',
        'Keep it to yourself for now, or set one up outside this app.',
      );
    }
    try {
      await this.#git(['push', '--quiet', shared, await this.#mainlineName()]);
      return done({ sent: true });
    } catch {
      return refuse(
        'The shared copy could not be reached, so this work is settled here but not sent.',
        'Send it again when you are back online.',
      );
    }
  }

  /**
   * Let an effort go.
   *
   * Because ground was isolated from the start, the project itself was never
   * touched and needs no undoing — abandonment is close to free, which is
   * exactly the property that makes delegating boldly feel safe. The ground is
   * kept, quietly, so the decision stays reversible for a while.
   */
  async abandon(effort) {
    const where = this.#groundFor(effort);
    if (!existsSync(where)) return done({ held: false });
    return done({ held: true, recoverable: where });
  }

  /** Recover an abandoned effort within its grace period. */
  async recover(effort) {
    const where = this.#groundFor(effort);
    if (!existsSync(where)) {
      return refuse(
        'This effort is no longer available to bring back.',
        'Begin it again with the same words.',
      );
    }
    return done({ ground: where });
  }

  /**
   * Reclaim the ground of an effort that was let go and never recovered.
   * Silent, automatic and distant — the developer is never asked about this
   * (Workflow F).
   */
  async release(effort) {
    await this.#teardown(effort);
    return done({ reclaimed: true });
  }

  // ---- everything below is mechanism, and never named above ------------

  #groundFor(effort) { return join(this.#groundRoot, effort); }
  #lane(effort) { return `viberant/${effort}`; }

  async #git(args, cwd = this.#root) {
    return run('git', args, { cwd, maxBuffer: 32 * 1024 * 1024 });
  }

  async #mainline() {
    const { stdout } = await this.#git(['rev-parse', 'HEAD']);
    return stdout.trim();
  }

  async #mainlineName() {
    const { stdout } = await this.#git(['rev-parse', '--abbrev-ref', 'HEAD']);
    return stdout.trim();
  }

  /**
   * Does this effort's ground actually differ from the project as it stands?
   *
   * Comparing trees rather than counting entries matters: an assistant that
   * wrote a file and then undid it has produced entries but changed nothing, and
   * telling the developer there is something to settle would be a small lie.
   */
  async #hasWork(where) {
    // Anything the assistant left lying about counts. Assistants routinely stop
    // without tidying up, and an effort whose work is sitting right there is
    // plainly not an empty one.
    const { stdout: loose } = await this.#git(['status', '--porcelain'], where);
    if (loose.trim()) return true;

    const mainline = await this.#mainlineName();
    try {
      await this.#git(['diff', '--quiet', `${mainline}..HEAD`], where);
      return false;
    } catch (e) {
      return e.code === 1;
    }
  }

  async #sharedCopy() {
    try {
      const { stdout } = await this.#git(['remote']);
      const first = stdout.split('\n').map((s) => s.trim()).filter(Boolean)[0];
      return first || null;
    } catch { return null; }
  }

  /**
   * Is this project something we can work with honestly? MVP §7.3: a project we
   * cannot support is declined in one sentence rather than half-supported.
   */
  async #healthCheck() {
    if (!existsSync(this.#root)) {
      return refuse('This project is not where it used to be.', 'Point the app at it again.');
    }
    try {
      await this.#git(['rev-parse', '--is-inside-work-tree']);
    } catch {
      return refuse(
        'This project does not keep a history the app can work with.',
        'Open it with your usual tools instead.',
      );
    }
    try {
      await this.#git(['rev-parse', 'HEAD']);
    } catch {
      return refuse(
        'This project has no work saved in it yet.',
        'Save something in it first, then begin an effort.',
      );
    }
    return null;
  }

  async #teardown(effort) {
    const where = this.#groundFor(effort);
    try { await this.#git(['worktree', 'remove', '--force', where]); } catch {}
    try { await rm(where, { recursive: true, force: true }); } catch {}
    try { await this.#git(['worktree', 'prune']); } catch {}
    try { await this.#git(['branch', '-D', this.#lane(effort)]); } catch {}
  }

  /**
   * Every ground currently on this machine. Used to answer "how much room is
   * this costing you" honestly, which the measurements make necessary.
   */
  async grounds() {
    if (!existsSync(this.#groundRoot)) return [];
    return (await readdir(this.#groundRoot, { withFileTypes: true }))
      .filter((d) => d.isDirectory())
      .map((d) => ({ effort: d.name, location: join(this.#groundRoot, d.name) }));
  }
}
