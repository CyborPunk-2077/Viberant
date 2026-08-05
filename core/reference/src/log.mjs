/**
 * The append-only log, and the fold that turns it into truth.
 *
 * Storage is one JSON-per-line file per project. That choice is deliberate:
 * Architecture §11.1 requires the authoritative store to be "in an inspectable,
 * documented form," and a text file the developer can open in any editor is the
 * least hostage-taking format that exists. It also means the local store and the
 * copy that travels between machines are the same format — one thing to get
 * right instead of two.
 *
 * Merging two machines' logs is a union followed by this same fold. There is no
 * separate merge algorithm, no conflict resolution pass, and no reconciliation
 * of divergent snapshots — which is the entire reason the event log was chosen
 * over storing current state.
 */

import { compareEvents } from './identity.mjs';
import { checkTransition } from './state.mjs';
import { reasonRank } from './events.mjs';

/**
 * An in-memory log. Persistence is a thin wrapper (see `readLog`/`writeLog`);
 * the fold below is the part that has to be exactly right.
 */
export class Log {
  #events = [];
  #seen = new Set();

  /** Append one event. Ignores an event already present, so merging is idempotent. */
  append(event) {
    if (this.#seen.has(event.id)) return false;
    this.#seen.add(event.id);
    this.#events.push(event);
    return true;
  }

  /** Union with another machine's events. Idempotent and order-independent. */
  merge(events) {
    let added = 0;
    for (const e of events) if (this.append(e)) added++;
    return added;
  }

  /** Events in their canonical total order. */
  ordered() {
    return [...this.#events].sort(compareEvents);
  }

  get size() { return this.#events.length; }
  toJSONL() { return this.ordered().map((e) => JSON.stringify(e)).join('\n') + '\n'; }

  static fromJSONL(text) {
    const log = new Log();
    for (const line of text.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        log.append(JSON.parse(trimmed));
      } catch {
        // A torn final line is the normal shape of a crash during append.
        // Skipping it is correct: the event was never acknowledged, so no
        // developer intent is lost. Corruption here is a performance event,
        // never a data-loss event.
      }
    }
    return log;
  }
}

/**
 * Fold a log into current truth.
 *
 * Pure: same events in, same state out, on any machine, forever. Illegal
 * transitions are recorded rather than thrown, because a log arriving from
 * another machine must never be able to crash this one — an event we cannot
 * honour becomes a visible refusal, not an exception.
 *
 * @returns {{project: object, efforts: Map<string, object>, refusals: object[]}}
 */
export function fold(log) {
  const project = { id: null, name: null, location: null, bound: false };
  const efforts = new Map();
  const refusals = [];

  for (const e of log.ordered()) {
    project.id ??= e.project;

    switch (e.type) {
      case 'project.bound':
        project.name = e.name; project.location = e.location; project.bound = true;
        break;

      case 'project.unbound':
        project.bound = false;
        break;

      case 'effort.begun':
        efforts.set(e.effort, {
          id: e.effort,
          intent: e.intent,
          directions: [],
          state: null,
          reason: null,
          summary: null,
          summarySource: null,
          assistant: null,
          assistants: [],
          ground: null,
          published: false,
          graceUntil: null,
          priorState: null,
          chapters: [],
          story: [],
          begunAt: e.at.wall,
          changedAt: e.at.wall,
        });
        push(efforts, e, 'begun', e.intent);
        break;

      case 'effort.direction_added': {
        const ef = efforts.get(e.effort); if (!ef) break;
        ef.directions.push(e.direction);
        push(efforts, e, 'directed', e.direction);
        break;
      }

      case 'effort.delegated': {
        const ef = efforts.get(e.effort); if (!ef) break;
        ef.assistant = e.assistant;
        if (!ef.assistants.includes(e.assistant)) ef.assistants.push(e.assistant);
        if (e.ground) ef.ground = e.ground;
        push(efforts, e, 'delegated', e.assistant);
        break;
      }

      case 'ground.prepared': {
        const ef = efforts.get(e.effort); if (!ef) break;
        ef.ground = e.location;
        break;
      }

      case 'ground.released': {
        const ef = efforts.get(e.effort); if (!ef) break;
        ef.ground = null;
        break;
      }

      case 'effort.summarized': {
        const ef = efforts.get(e.effort); if (!ef) break;
        ef.summary = e.sentence;
        ef.summarySource = e.source;
        break;
      }

      case 'effort.account_captured': {
        const ef = efforts.get(e.effort); if (!ef) break;
        ef.story.push({ at: e.at.wall, kind: 'account', assistant: e.assistant, ref: e.ref, detail: e.kind });
        break;
      }

      case 'effort.transitioned': {
        const ef = efforts.get(e.effort); if (!ef) break;
        const trigger = triggerFor(e, log);
        try {
          checkTransition({
            from: ef.state, to: e.to, trigger, actor: e.actor, reason: e.reason,
          });
        } catch (err) {
          refusals.push({ event: e.id, why: err.message });
          break;
        }
        if (e.to === 'dissolved') ef.priorState = ef.state;
        ef.state = e.to;
        ef.reason = e.to === 'waiting' ? e.reason : null;
        ef.changedAt = e.at.wall;
        push(efforts, e, 'turned', e.to);
        break;
      }

      case 'effort.judged': {
        const ef = efforts.get(e.effort); if (!ef) break;
        push(efforts, e, 'judged', e.verdict);
        break;
      }

      case 'effort.dissolved': {
        const ef = efforts.get(e.effort); if (!ef) break;
        ef.graceUntil = e.graceUntil;
        break;
      }

      case 'effort.restored': {
        const ef = efforts.get(e.effort); if (!ef) break;
        ef.graceUntil = null;
        break;
      }

      case 'effort.chapter_opened': {
        const ef = efforts.get(e.effort); if (!ef) break;
        ef.chapters.push({ intent: e.intent, at: e.at.wall });
        ef.intent = e.intent;
        push(efforts, e, 'reopened', e.intent);
        break;
      }

      case 'effort.published': {
        const ef = efforts.get(e.effort); if (!ef) break;
        ef.published = true;
        push(efforts, e, 'sent', null);
        break;
      }

      default:
        break; // Unknown types are ignored, so an older build can read a newer log.
    }
  }

  return { project, efforts, refusals };
}

function push(efforts, e, kind, detail) {
  const ef = efforts.get(e.effort);
  if (!ef) return;
  ef.story.push({ at: e.at.wall, kind, detail, actor: e.actor, machine: e.machine, event: e.id });
}

/**
 * Work out which trigger a transition event represents.
 *
 * A transition never stands alone — it always names the event that caused it, and
 * the cause tells us what the developer or the world actually did. This is the
 * traceability chain doing real work rather than sitting in a field unread.
 */
function triggerFor(event, log) {
  if (event.trigger) return event.trigger;
  if (!event.causedBy) return event.to === 'waiting' ? reasonTrigger(event.reason) : 'delegate';

  const cause = log.ordered().find((c) => c.id === event.causedBy);
  if (!cause) return event.to === 'waiting' ? reasonTrigger(event.reason) : 'delegate';

  switch (cause.type) {
    case 'effort.judged':
      return cause.verdict === 'accept' ? 'accept'
        : cause.verdict === 'abandon' ? 'abandon' : 'redirect';
    case 'effort.delegated': return 'delegate';
    case 'effort.chapter_opened': return 'reopen';
    case 'effort.restored': return 'restore';
    case 'effort.begun': return event.to === 'waiting' ? 'park' : 'delegate';
    default:
      return event.to === 'waiting' ? reasonTrigger(event.reason) : 'delegate';
  }
}

function reasonTrigger(reason) {
  switch (reason?.kind) {
    case 'question': return 'question';
    case 'failed': return 'failure';
    case 'unknown': return 'lost_sight';
    case 'overlap': return 'overlap';
    case 'parked': return 'park';
    default: return 'assistant_stopped';
  }
}

/** Sort efforts the way Home shows them. Opinionated; not configurable. */
export function homeOrder(efforts) {
  const rank = { waiting: 0, moving: 1, done: 2, dissolved: 3 };
  return [...efforts].sort((a, b) => {
    const ra = rank[a.state] ?? 9, rb = rank[b.state] ?? 9;
    if (ra !== rb) return ra - rb;
    if (a.state === 'waiting') {
      const qa = reasonRank(a.reason?.kind), qb = reasonRank(b.reason?.kind);
      if (qa !== qb) return qa - qb;
    }
    return b.changedAt - a.changedAt;
  });
}
