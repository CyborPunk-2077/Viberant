/**
 * The state machine.
 *
 * Workflow §1 defines exactly three visible states plus one invisible terminal
 * state. This module is the sole authority over them. Two properties matter more
 * than anything else here:
 *
 *   1. No machine can settle work. A transition into `done` or `dissolved` is
 *      refused unless the event that caused it was authored by the developer.
 *      Architecture §2.3 asks for this to be "unrepresentable, not merely
 *      rejected" — in the Rust core it will be a type; here it is a guard plus a
 *      conformance test that tries every machine-authored path and fails if any
 *      one of them succeeds.
 *
 *   2. Every arrival in `waiting` carries a reason capable of rendering as one
 *      plain sentence, and — where it is a failure — one suggested action. The
 *      failure shape is a schema requirement, not a UI convention.
 */

import { SchemaViolation } from './events.mjs';

/** The three visible states, plus the terminal one that surfaces never show. */
export const STATES = Object.freeze(['moving', 'waiting', 'done', 'dissolved']);

/**
 * The closed transition table.
 *
 * Read as: from this state, these are the only states reachable, and only by
 * these triggers. Anything absent is illegal — not discouraged, illegal.
 */
export const TRANSITIONS = Object.freeze({
  // An effort that does not exist yet.
  null: {
    moving: ['delegate'],
    waiting: ['park'],
  },
  moving: {
    waiting: ['assistant_stopped', 'question', 'failure', 'lost_sight', 'overlap', 'park'],
    // Redirecting a moving effort is legal. Workflow E implies redirection comes
    // from `waiting`, but Workflow F already establishes that the developer never
    // waits for a machine's permission to stop it. The same reasoning applies to
    // correcting it: making the developer wait for a wrong-headed agent to finish
    // before steering it would be an odd kind of respect for the machine.
    moving: ['redirect', 'delegate'],
    done: ['accept'],
    dissolved: ['abandon'],
  },
  waiting: {
    moving: ['redirect', 'delegate'],
    done: ['accept'],
    dissolved: ['abandon'],
    waiting: ['question', 'failure', 'lost_sight', 'overlap', 'park', 'assistant_stopped'],
  },
  done: {
    // Reopening with new intent. Same effort, new chapter — not a new effort,
    // so the story of an intention stays continuous across weeks.
    moving: ['reopen'],
    // Unwinding settled work returns it for judgement rather than silently
    // undoing it.
    waiting: ['reverse'],
    dissolved: ['abandon'],
  },
  dissolved: {
    // Recovery within the grace period returns the effort exactly as it was.
    moving: ['restore'],
    waiting: ['restore'],
    done: ['restore'],
  },
});

/** Triggers only the developer may pull. */
const DEVELOPER_ONLY = Object.freeze(['accept', 'abandon', 'redirect', 'reopen', 'reverse', 'restore', 'park']);

/** States only a developer-authored trigger may reach. */
const DEVELOPER_ONLY_STATES = Object.freeze(['done', 'dissolved']);

export class IllegalTransition extends Error {
  constructor(from, to, trigger, why) {
    super(`cannot go from ${from ?? 'nothing'} to ${to} by ${trigger}: ${why}`);
    this.name = 'IllegalTransition';
    this.from = from; this.to = to; this.trigger = trigger;
  }
}

/**
 * Decide whether a transition is legal, and refuse it if not.
 *
 * @param {string|null} from
 * @param {string} to
 * @param {string} trigger
 * @param {'developer'|'assistant'|'world'|'system'} actor
 * @param {object|null} reasonValue required when `to` is 'waiting'
 */
export function checkTransition({ from, to, trigger, actor, reason = null }) {
  if (!STATES.includes(to)) throw new SchemaViolation(`unknown state "${to}"`);

  const allowed = TRANSITIONS[from ?? 'null'];
  if (!allowed) throw new SchemaViolation(`unknown state "${from}"`);

  const triggers = allowed[to];
  if (!triggers) {
    throw new IllegalTransition(from, to, trigger, 'that is not a legal destination from here');
  }

  // The constitutional guarantee is evaluated before anything else about the
  // trigger. A forged event from a compromised assistant may well name a legal
  // trigger; what matters — and what the log should record — is that a machine
  // tried to settle the developer's work. Reporting "wrong trigger" for that
  // would be technically true and forensically useless.
  if (DEVELOPER_ONLY_STATES.includes(to) && actor !== 'developer') {
    throw new IllegalTransition(from, to, trigger,
      `only the developer can settle or discard work; this was authored by "${actor}"`);
  }

  if (!triggers.includes(trigger)) {
    throw new IllegalTransition(from, to, trigger, `legal triggers here are: ${triggers.join(', ')}`);
  }

  if (DEVELOPER_ONLY.includes(trigger) && actor !== 'developer') {
    throw new IllegalTransition(from, to, trigger,
      `"${trigger}" is the developer's to pull; this was authored by "${actor}"`);
  }

  if (to === 'waiting' && !reason) {
    throw new SchemaViolation('a transition to waiting on you must carry a reason');
  }

  return true;
}

/** Whether a transition is legal, without throwing. */
export function isLegal(args) {
  try { return checkTransition(args); } catch { return false; }
}

/**
 * Every state an effort could legally reach next. Used by the palette to offer
 * only verbs that can actually be pulled, so the interface never advertises an
 * action that would fail.
 */
export function reachableFrom(from) {
  const table = TRANSITIONS[from ?? 'null'] ?? {};
  return Object.fromEntries(Object.entries(table).map(([to, triggers]) => [to, [...triggers]]));
}
