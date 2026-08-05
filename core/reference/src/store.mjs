/**
 * Persistence, and the carrier that moves truth between machines.
 *
 * There is deliberately almost nothing here. Because truth is an append-only
 * log with a deterministic fold, "synchronise two machines" is: concatenate the
 * files, drop duplicates by id, fold. No merge algorithm, no conflict
 * resolution, no server. That was the whole reason for choosing an event log,
 * and this file is where the choice pays for itself.
 *
 * The carrier is dumb by design (Architecture §11.2). It is a passive medium —
 * a directory inside the developer's own repository, a folder on a drive they
 * own. All the intelligence lives in `fold`, locally.
 */

import { appendFile, readFile, writeFile, mkdir, rename, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { Log, fold } from './log.mjs';

/**
 * A file-backed log for one project.
 *
 * Appends are line-at-a-time to a JSON-per-line file. A crash mid-append leaves
 * a torn final line, which `Log.fromJSONL` skips — the event was never
 * acknowledged, so no developer intent is lost. That is the whole durability
 * story, and it is short on purpose.
 */
export class Store {
  #path;
  #log = null;

  constructor(path) { this.#path = path; }

  get path() { return this.#path; }

  async load() {
    if (!existsSync(this.#path)) {
      this.#log = new Log();
      return this.#log;
    }
    this.#log = Log.fromJSONL(await readFile(this.#path, 'utf8'));
    return this.#log;
  }

  get log() {
    if (!this.#log) throw new Error('load() the store before using it');
    return this.#log;
  }

  /**
   * Append events durably.
   *
   * The in-memory log is updated first so the interface can reflect the
   * developer's intent immediately, then the write follows. That ordering is the
   * optimistic-acknowledgement model of Architecture §6.2 — but the write is
   * awaited before this resolves, so an intent that has been *confirmed* is an
   * intent that survives a power cut.
   */
  async append(...events) {
    const fresh = events.filter((e) => this.log.append(e));
    if (fresh.length === 0) return 0;
    await mkdir(dirname(this.#path), { recursive: true });
    await appendFile(this.#path, fresh.map((e) => JSON.stringify(e)).join('\n') + '\n', 'utf8');
    return fresh.length;
  }

  /** Current truth. */
  state() { return fold(this.log); }

  /**
   * Rewrite the file in canonical order. Never changes what the log means —
   * ordering is already deterministic at fold time — it only makes the file
   * pleasant for a human to read, which matters because the constitution
   * promises an inspectable store.
   */
  async compact() {
    const tmp = this.#path + '.rewriting';
    await writeFile(tmp, this.log.toJSONL(), 'utf8');
    await rename(tmp, this.#path);
  }
}

/**
 * The projection: a copy of domain truth in a fenced directory the developer
 * already owns and already synchronises — typically inside their repository.
 *
 * Off by default. When on, it is the whole multi-machine story: machine A writes
 * its log here and it travels by whatever means the developer already uses;
 * machine B reads it and folds. Nothing else is required, and no service exists.
 */
export class Projection {
  #dir;
  constructor(dir) { this.#dir = dir; }

  fileFor(projectId, machineId) {
    return join(this.#dir, 'efforts', `${projectId}.${machineId}.jsonl`);
  }

  /** Write this machine's events for a project into the carrier. */
  async put(projectId, machineId, log) {
    const path = this.fileFor(projectId, machineId);
    await mkdir(dirname(path), { recursive: true });
    const mine = log.ordered().filter((e) => e.machine === machineId);
    const tmp = path + '.writing';
    await writeFile(tmp, mine.map((e) => JSON.stringify(e)).join('\n') + '\n', 'utf8');
    await rename(tmp, path);
    await this.#describe();
    return mine.length;
  }

  /** Read every machine's events for a project out of the carrier. */
  async collect(projectId) {
    const dir = join(this.#dir, 'efforts');
    if (!existsSync(dir)) return [];
    const names = (await readdir(dir)).filter((n) => n.startsWith(projectId + '.') && n.endsWith('.jsonl'));
    const events = [];
    for (const name of names) {
      const log = Log.fromJSONL(await readFile(join(dir, name), 'utf8'));
      events.push(...log.ordered());
    }
    return events;
  }

  /**
   * Self-description, so that a person who finds this directory in a repository
   * years from now — or a reinstalled app with no memory — can understand it
   * without us. Architecture §5 requires the projection be "legible, minimal and
   * self-describing"; this is that requirement, honoured literally.
   */
  async #describe() {
    const path = join(this.#dir, 'README.md');
    if (existsSync(path)) return;
    await writeFile(path, [
      '# What this directory is',
      '',
      'A record of the work that happened here: what someone set out to do, what',
      'was done about it, and what they decided. One line per thing that happened,',
      'in JSON, oldest first.',
      '',
      'It is written by a tool that helps developers keep track of work done with',
      'AI assistants. It is safe to delete — nothing else depends on it, and the',
      'code in this project is unaffected. It is safe to ignore — it changes',
      'nothing about how this project is built or run.',
      '',
      'Each file holds the record from one machine. Reading them together, oldest',
      'first, replays everything that happened.',
      '',
    ].join('\n'), 'utf8');
  }
}

/**
 * Bring in everything other machines have recorded.
 *
 * Returns what changed, so the surface can say one honest sentence about it at
 * glance time — never as an interruption.
 */
export async function absorb(store, projection, projectId) {
  const incoming = await projection.collect(projectId);
  const before = store.state();
  const added = await store.append(...incoming);
  const after = store.state();

  const changed = [];
  for (const [id, effort] of after.efforts) {
    const was = before.efforts.get(id);
    if (!was) changed.push({ effort: id, intent: effort.intent, change: 'new' });
    else if (was.state !== effort.state) {
      changed.push({ effort: id, intent: effort.intent, change: 'moved', from: was.state, to: effort.state });
    }
  }
  return { added, changed, refusals: after.refusals };
}
