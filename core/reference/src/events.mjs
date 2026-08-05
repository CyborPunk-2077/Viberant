/**
 * Event schema v1 — the permanent format.
 *
 * This is the one thing in the product that can never be rewritten. Architecture
 * §19.3 and MVP §8.4 both promise that log history is never migrated, so the
 * shape defined here is the shape forever. New event types may be added; existing
 * ones may never change meaning.
 *
 * Every event carries, without exception:
 *   id        a globally unique identifier
 *   at        a hybrid logical timestamp (causal ordering across machines)
 *   machine   which machine originated it
 *   actor     which class of actor caused it: developer / assistant / world / system
 *   project   which project's log it belongs to
 *   type      what happened
 *   causedBy  the event that caused this one, or null
 *
 * `actor` and `causedBy` together are the constitutional traceability guarantee
 * made mechanical: "nothing happens without the developer's intent being
 * traceable to it." You can always walk backwards from any change to the human
 * sentence that caused it.
 */

import { ulid, isUlid } from './identity.mjs';
import { requireSpeakable } from './lexicon.mjs';

export const SCHEMA_VERSION = 1;

/** Who caused an event. Only `developer` may author a verdict. */
export const ACTORS = Object.freeze(['developer', 'assistant', 'world', 'system']);

export const EVENT_TYPES = Object.freeze([
  // Projects
  'project.bound',
  'project.unbound',

  // The life of an effort
  'effort.begun',
  'effort.delegated',
  'effort.direction_added',
  'effort.transitioned',
  'effort.summarized',
  'effort.judged',
  'effort.dissolved',
  'effort.restored',
  'effort.chapter_opened',
  'effort.published',

  // Material gathered for the story and for handing an effort to a different
  // assistant than the one that started it. Added in v1 because switching tools
  // mid-effort without losing context is the founder's primary daily problem.
  'effort.account_captured',

  // Isolated working ground. Prepared at first delegation, not at creation
  // (decision D-5, measured).
  'ground.prepared',
  'ground.released',

  // Modelled now, unused until arrival absorption ships.
  'arrival.detected',
  'overlap.declared',
]);

/**
 * The reasons an effort can be waiting on the developer.
 *
 * This list is also the intra-rank ordering on Home. The design system said
 * rank 1 items are "led by their reasons" but never said in what order — which
 * left the product's most important surface undefined. The order below is
 * cost-of-delay: how much is lost by not looking at this for an hour.
 */
export const REASON_KINDS = Object.freeze([
  'question',      // a machine is idle waiting on one word from you
  'overlap',       // two efforts are diverging further every minute
  'failed',        // work stopped; nothing degrades further
  'review_ready',  // work is complete and safe; only your time is at stake
  'unknown',       // we lost sight of this and cannot say what is true
  'parked',        // you chose this
]);

/** Reasons that must carry a suggested action (cross-rule 8's failure shape). */
const REASONS_NEEDING_ACTION = Object.freeze(['failed', 'unknown', 'overlap', 'question']);

export function reasonRank(kind) {
  const i = REASON_KINDS.indexOf(kind);
  return i === -1 ? REASON_KINDS.length : i;
}

/**
 * Build a Reason. Validated at construction so an unspeakable sentence can never
 * reach the log, let alone a surface.
 *
 * @param {'question'|'overlap'|'failed'|'review_ready'|'unknown'|'parked'} kind
 * @param {string} sentence one plain sentence about reality
 * @param {string|null} action one suggested action
 */
export function reason(kind, sentence, action = null) {
  if (!REASON_KINDS.includes(kind)) {
    throw new SchemaViolation(`unknown reason kind "${kind}"`);
  }
  requireSpeakable(sentence, `reason.sentence (${kind})`);
  if (REASONS_NEEDING_ACTION.includes(kind)) {
    if (!action) throw new SchemaViolation(`reason "${kind}" must carry one suggested action`);
    requireSpeakable(action, `reason.action (${kind})`);
  }
  return Object.freeze({ kind, sentence, action });
}

export class SchemaViolation extends Error {
  constructor(message) {
    super(message);
    this.name = 'SchemaViolation';
  }
}

/**
 * Mints events for one machine, in one project.
 *
 * Verdicts are deliberately not available here — see `Developer` below. That
 * separation is the reason a machine cannot settle work: there is no code path
 * from an assistant-authored fact to a verdict event.
 */
export class Author {
  #clock; #machine; #project;

  constructor({ clock, machine, project }) {
    if (!isUlid(machine)) throw new SchemaViolation('machine must be a ULID');
    if (!isUlid(project)) throw new SchemaViolation('project must be a ULID');
    this.#clock = clock;
    this.#machine = machine;
    this.#project = project;
  }

  get project() { return this.#project; }
  get machine() { return this.#machine; }

  /** @internal shared by this class and `Developer` */
  _emit(actor, type, payload, causedBy = null) {
    if (!ACTORS.includes(actor)) throw new SchemaViolation(`unknown actor "${actor}"`);
    if (!EVENT_TYPES.includes(type)) throw new SchemaViolation(`unknown event type "${type}"`);
    return Object.freeze({
      v: SCHEMA_VERSION,
      id: ulid(),
      at: this.#clock.tick(),
      machine: this.#machine,
      actor,
      project: this.#project,
      type,
      causedBy,
      ...payload,
    });
  }

  // ---- Events any actor may author -------------------------------------

  bindProject(name, location) {
    return this._emit('developer', 'project.bound', { name, location });
  }

  delegated({ effort, assistant, ground = null, causedBy = null }) {
    return this._emit('developer', 'effort.delegated', { effort, assistant, ground }, causedBy);
  }

  groundPrepared({ effort, location, causedBy = null }) {
    return this._emit('system', 'ground.prepared', { effort, location }, causedBy);
  }

  groundReleased({ effort, causedBy = null }) {
    return this._emit('system', 'ground.released', { effort }, causedBy);
  }

  /**
   * A machine's account of what it did. Raw material for the summary and for
   * the story; never displayed verbatim on a resting surface.
   */
  accountCaptured({ effort, assistant, kind, ref, causedBy = null }) {
    return this._emit('assistant', 'effort.account_captured', { effort, assistant, kind, ref }, causedBy);
  }

  /**
   * The one-sentence account. `source` records which assistant produced it, or
   * "template" when we fell back (decision D-9).
   */
  summarized({ effort, sentence, source, causedBy = null }) {
    requireSpeakable(sentence, 'summary');
    return this._emit('system', 'effort.summarized', { effort, sentence, source }, causedBy);
  }

  /**
   * A state transition. Any actor may propose most transitions — but the state
   * machine, not this method, decides legality, and it refuses to let a
   * non-developer actor reach `done` or `dissolved`.
   */
  transitioned({ effort, to, reason: r = null, actor = 'system', causedBy = null }) {
    if (to === 'waiting' && !r) {
      throw new SchemaViolation('a transition to waiting on you must carry a reason');
    }
    return this._emit(actor, 'effort.transitioned', { effort, to, reason: r }, causedBy);
  }
}

/**
 * The developer's own hand.
 *
 * Verdicts and intents can only be minted through this class. Nothing in the
 * Assistant Gateway or the World Watcher is ever handed a `Developer`, so
 * "machines cannot settle work" is enforced by what code can reach what object,
 * not by a check someone might forget to write.
 */
export class Developer {
  #author;
  constructor(author) { this.#author = author; }

  /** Begin an effort. The sentence is the developer's own; it is never validated
   *  against the lexicon — the contract binds the app's voice, not the human's. */
  begin({ effort = ulid(), intent }) {
    if (!intent || !String(intent).trim()) throw new SchemaViolation('an effort needs an intent');
    return { effort, event: this.#author._emit('developer', 'effort.begun', { effort, intent: String(intent).trim() }) };
  }

  addDirection({ effort, direction, causedBy = null }) {
    if (!direction || !String(direction).trim()) throw new SchemaViolation('a redirection needs a direction');
    return this.#author._emit('developer', 'effort.direction_added', { effort, direction: String(direction).trim() }, causedBy);
  }

  /** @param {'accept'|'redirect'|'abandon'} verdict */
  judge({ effort, verdict, causedBy = null }) {
    if (!['accept', 'redirect', 'abandon'].includes(verdict)) {
      throw new SchemaViolation(`there are exactly three verdicts; "${verdict}" is not one`);
    }
    return this.#author._emit('developer', 'effort.judged', { effort, verdict }, causedBy);
  }

  transitioned(args) {
    return this.#author.transitioned({ ...args, actor: 'developer' });
  }

  dissolved({ effort, graceUntil, causedBy = null }) {
    return this.#author._emit('developer', 'effort.dissolved', { effort, graceUntil }, causedBy);
  }

  restored({ effort, causedBy = null }) {
    return this.#author._emit('developer', 'effort.restored', { effort }, causedBy);
  }

  openChapter({ effort, intent, causedBy = null }) {
    if (!intent || !String(intent).trim()) throw new SchemaViolation('a chapter needs an intent');
    return this.#author._emit('developer', 'effort.chapter_opened', { effort, intent: String(intent).trim() }, causedBy);
  }

  /** Sending settled work to the shared copy (decision D-1). */
  published({ effort, causedBy = null }) {
    return this.#author._emit('developer', 'effort.published', { effort }, causedBy);
  }
}
