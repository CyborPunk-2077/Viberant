/**
 * The Assistant Gateway.
 *
 * The boundary to AI tools. Its whole job is to carry an effort to whichever
 * assistant the developer chose, watch what happens, and report plain facts
 * upward. It decides nothing: Core decides what a fact means.
 *
 * The important inversion here, and it is deliberate: **observation is the
 * universal path and adapters are enrichment**, not the other way round. Most
 * products would build integrations first and treat the generic path as
 * degraded. Doing it in this order is what makes "works with every tool,
 * including ones that do not exist yet" true rather than claimed.
 *
 * Nothing in this file may rank, recommend or default to any assistant. The
 * registry is an unordered set. That is not politeness — the moment we privilege
 * one tool we become its accessory rather than the developer's home.
 */

import { spawn } from 'node:child_process';
import { watch, realpathSync } from 'node:fs';
import { stat, readdir } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { existsSync } from 'node:fs';

/**
 * How long a ground must be completely silent before we conclude the assistant
 * has stopped.
 *
 * Measured, not chosen: see experiments/quiescence/FINDINGS.md. At 90 seconds we
 * would wrongly interrupt the developer every third session; at 180 the error
 * rate is one in a hundred. Finding out twice as fast is not worth teaching them
 * to disbelieve the picture.
 */
export const SILENCE_MEANS_STOPPED = 180_000;

/** Facts the Gateway reports. Core turns these into meaning; they carry none. */
export const FACTS = Object.freeze([
  'started',      // an assistant is now running on this effort
  'active',       // something changed in the ground
  'quiet',        // nothing has changed for long enough to matter
  'ended',        // the process finished
  'failed',       // the process finished badly
  'asking',       // the assistant says it needs an answer (adapters only)
]);

/**
 * Paths we ignore when saying *what changed*, but still watch when deciding
 * whether anything is *alive*.
 *
 * These are two different questions and they need two different scopes. A test
 * run may touch nothing but build output for minutes; if we watched only source
 * files we would call that silence and be wrong (decision D-22).
 */
const NOT_MEANINGFUL = [
  'node_modules', '.git', 'target', 'dist', 'build', '.next', '.venv',
  '__pycache__', '.pytest_cache', 'coverage', '.turbo', '.cache', 'vendor',
];

const isMeaningful = (rel) =>
  !rel.split(sep).some((part) => NOT_MEANINGFUL.includes(part));

/**
 * Starting a command-line tool on Windows.
 *
 * Most of these assistants install as a small shim rather than a program —
 * `claude.cmd`, `codex.cmd` — and a shim can only be started through a shell.
 * Going through a shell means nothing quotes arguments for us any more, so
 * anything holding a space has to carry its own quotes or it arrives cut in
 * half. Both halves of that are Windows facts, and both belong here rather than
 * in every caller.
 */
const WINDOWS = process.platform === 'win32';
const quoted = (s) =>
  WINDOWS && /\s/.test(s) && !s.startsWith('"') ? `"${s}"` : s;

/**
 * An adapter teaches the Gateway one family of assistants. Four duties, and
 * deliberately no fifth:
 *
 *   present   is this tool on the machine?
 *   command   how do I start it on an effort, with the effort's context?
 *   reads     given its output, what plain fact does that represent?
 *   inference can it answer a question for us? (used for summaries, D-4)
 *
 * Adapters translate. They hold no state, propose nothing in domain terms, and
 * are individually removable without touching anything true.
 */
export class Adapter {
  constructor({ name, present, command, reads = () => null, inference = null }) {
    this.name = name;
    this.present = present;
    this.command = command;
    this.reads = reads;
    this.inference = inference;
  }
}

/**
 * The fallback for everything else, including tools that do not exist yet.
 *
 * It knows nothing about the assistant except how to start it, and learns
 * everything else by watching. Coarser account, identical loop.
 */
export function observedOnly(name, argv) {
  return new Adapter({
    name,
    present: async () => true,
    // The context goes in on standard input. Every command-line tool can read
    // it, including ones nobody has written yet, and it needs no knowledge of
    // any particular tool's flags. Without this the assistant would start cold,
    // which would defeat the entire point of handing an effort over.
    command: (context) => ({ file: argv[0], args: argv.slice(1), input: context }),
  });
}

/**
 * Watches one effort's ground and reports when it goes quiet.
 *
 * Recursive watching is one handle per tree on the platform we are building for
 * first, which is the reason this stays cheap when several efforts run at once.
 */
/** A folder by the name the computer itself uses for it, or the name we were given. */
const realOf = (where) => { try { return realpathSync.native(where); } catch { return where; } };

export class GroundWatch {
  #where; #onFact; #timer = null; #watcher = null;
  #lastActivity = 0; #touched = new Map(); #silence;
  #stopped = false;

  constructor(where, onFact, { silence = SILENCE_MEANS_STOPPED } = {}) {
    this.#where = where;
    this.#onFact = onFact;
    this.#silence = silence;
  }

  start() {
    this.#lastActivity = Date.now();
    try {
      // Watched by the name the computer itself would use for this folder.
      // Windows keeps a shortened second name for anything longer than eight
      // characters, and handing that one over ends the whole process from
      // inside the watcher — not as an error anybody can catch, but as an
      // assertion that stops it where it stands. The `catch` below cannot help,
      // because the process is gone before there is anything to catch.
      this.#watcher = watch(realOf(this.#where), { recursive: true }, (_event, name) => {
        if (!name) return;
        this.#lastActivity = Date.now();
        const rel = String(name);
        if (isMeaningful(rel)) this.#touched.set(rel, Date.now());
        this.#onFact({ kind: 'active', path: isMeaningful(rel) ? rel : null });
        this.#arm();
      });
    } catch {
      // Some platforms and filesystems refuse recursive watching. Falling back
      // to polling is slower but never wrong, and being slower is allowed —
      // being wrong is not.
      this.#poll();
    }
    this.#arm();
    return this;
  }

  #arm() {
    if (this.#timer) clearTimeout(this.#timer);
    if (this.#stopped) return;
    this.#timer = setTimeout(() => {
      this.#onFact({ kind: 'quiet', quietFor: Date.now() - this.#lastActivity });
    }, this.#silence);
    this.#timer.unref?.();
  }

  #poll() {
    const tick = async () => {
      if (this.#stopped) return;
      try {
        const seen = await newestUnder(this.#where);
        if (seen > this.#lastActivity) {
          this.#lastActivity = seen;
          this.#onFact({ kind: 'active', path: null });
          this.#arm();
        }
      } catch { /* the ground may have been reclaimed underneath us */ }
      this.#timer = setTimeout(tick, 2000);
      this.#timer.unref?.();
    };
    tick();
  }

  /** What meaningfully changed, for the account. */
  touched() { return [...this.#touched.keys()]; }

  stop() {
    this.#stopped = true;
    if (this.#timer) clearTimeout(this.#timer);
    this.#watcher?.close();
  }
}

async function newestUnder(dir, deepest = 0) {
  if (deepest > 6) return 0;
  let newest = 0;
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (NOT_MEANINGFUL.includes(entry.name) && entry.name !== 'node_modules') continue;
      newest = Math.max(newest, await newestUnder(path, deepest + 1));
    } else {
      try { newest = Math.max(newest, (await stat(path)).mtimeMs); } catch {}
    }
  }
  return newest;
}

/**
 * One assistant, working on one effort.
 *
 * The relationship between an effort and the tools that work on it is one to
 * many, over time: the developer moves a single effort between assistants when
 * one reaches its limits, and each hand-off must carry what came before. That is
 * why a session is a thing here at all.
 */
export class Session {
  #child = null; #watch = null; #facts = []; #onFact;

  constructor({ effort, adapter, ground, context, onFact = () => {} }) {
    this.effort = effort;
    this.adapter = adapter;
    this.ground = ground;
    this.context = context;
    this.startedAt = null;
    this.endedAt = null;
    this.#onFact = onFact;
  }

  #report(fact) {
    const stamped = { ...fact, effort: this.effort, assistant: this.adapter.name, at: Date.now() };
    this.#facts.push(stamped);
    this.#onFact(stamped);
  }

  /** Facts observed so far, oldest first. */
  facts() { return [...this.#facts]; }

  /** What meaningfully changed while this assistant worked. */
  touched() { return this.#watch?.touched() ?? []; }

  async start({ silence } = {}) {
    const { file, args, input } = this.adapter.command(this.context);
    this.startedAt = Date.now();

    this.#watch = new GroundWatch(this.ground, (f) => this.#report(f), { silence }).start();

    this.#child = spawn(quoted(file), args.map(quoted), {
      cwd: this.ground,
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: WINDOWS,
      env: { ...process.env },
    });

    if (input) { this.#child.stdin.write(input); }
    this.#child.stdin.end();

    let said = '';
    const listen = (stream) => stream.on('data', (chunk) => {
      said += chunk.toString();
      // An adapter may recognise something in what the tool says. A tool that
      // announces it is waiting for an answer is the one case observation alone
      // can never catch, so this is where adapters earn their keep.
      const fact = this.adapter.reads(chunk.toString());
      if (fact) this.#report(fact);
    });
    listen(this.#child.stdout);
    listen(this.#child.stderr);

    this.#report({ kind: 'started' });

    return new Promise((resolve) => {
      this.#child.on('close', (code) => {
        this.endedAt = Date.now();
        this.#watch.stop();
        this.#report({ kind: code === 0 ? 'ended' : 'failed', code });
        resolve({ code, said });
      });
      this.#child.on('error', () => {
        this.endedAt = Date.now();
        this.#watch.stop();
        this.#report({ kind: 'failed', code: null });
        resolve({ code: null, said });
      });
    });
  }

  /** Stop this assistant. The developer never waits for a machine's permission. */
  stop() {
    this.#watch?.stop();
    if (this.#child && this.endedAt === null) {
      try { this.#child.kill('SIGTERM'); } catch {}
    }
  }
}

/**
 * The registry, and the way in.
 *
 * Assistants are an unordered set. Nothing here ranks them, and nothing above
 * here may branch on which one is in use.
 */
export class Gateway {
  #adapters = new Map();
  #sessions = new Map();

  register(adapter) { this.#adapters.set(adapter.name, adapter); return this; }

  /** Which assistants are actually on this machine. Order is arbitrary and meaningless. */
  async available() {
    const found = [];
    for (const a of this.#adapters.values()) {
      if (await a.present()) found.push(a.name);
    }
    return found;
  }

  get(name) { return this.#adapters.get(name) ?? null; }

  /**
   * Which assistant should answer a question for us (summaries, decision D-9).
   *
   * The rule is mechanical, never preferential: whoever worked on this effort,
   * because they already hold its context; failing that, whoever is present;
   * failing that, nobody and we fall back to plain description. There is no
   * setting for this, because a setting would be a ranking.
   */
  async inferenceFor(effort) {
    const worked = this.#sessions.get(effort)?.adapter;
    if (worked?.inference) return worked;
    for (const a of this.#adapters.values()) {
      if (a.inference && await a.present()) return a;
    }
    return null;
  }

  /**
   * Carry an effort to an assistant.
   *
   * `context` is everything the assistant needs to start oriented rather than
   * cold: the developer's original sentence, every direction since, and what
   * previous assistants already did. That last part is what makes changing tools
   * mid-effort cost nothing.
   */
  async delegate({ effort, assistant, ground, context, onFact, silence }) {
    const adapter = this.#adapters.get(assistant);
    if (!adapter) {
      return { ok: false, sentence: 'That assistant is not set up on this machine.', action: 'Choose one that is, or set it up outside this app.' };
    }
    if (!existsSync(ground)) {
      return { ok: false, sentence: 'This effort has nowhere to work yet.', action: 'Begin it again.' };
    }

    const session = new Session({ effort, adapter, ground, context, onFact });
    this.#sessions.set(effort, session);
    return { ok: true, session };
  }

  sessionFor(effort) { return this.#sessions.get(effort) ?? null; }

  /** Stop whatever is working on an effort. Used when letting it go. */
  stop(effort) {
    this.#sessions.get(effort)?.stop();
    this.#sessions.delete(effort);
  }
}

/**
 * Everything an assistant needs to pick up an effort someone else started.
 *
 * Reading a past account is evidence, not conversation — nothing here composes
 * or sends anything. The product remains the hallway.
 */
export function contextFor(effort) {
  const lines = [effort.intent];
  for (const d of effort.directions ?? []) lines.push(`Then: ${d}`);

  const previous = (effort.assistants ?? []).slice(0, -1);
  if (previous.length) {
    lines.push('', `Work has already been done on this by: ${previous.join(', ')}.`);
    const accounts = (effort.story ?? []).filter((s) => s.kind === 'account');
    if (accounts.length) {
      lines.push(`Their notes are in: ${accounts.map((a) => a.ref).join(', ')}.`);
    }
    if (effort.summary) lines.push(`Where it stands: ${effort.summary}`);
  }
  return lines.join('\n');
}
