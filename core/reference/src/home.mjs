/**
 * The Home projection.
 *
 * Home is answered, never assembled. Everything expensive happened already; by
 * the time the developer looks, this is a shape sitting in memory waiting to be
 * read. That is the whole reason the interface can promise to respond faster
 * than a person notices.
 *
 * This file contains no rendering. It produces the answer; how it looks is the
 * surface's business, and there may one day be more than one surface.
 */

import { homeOrder } from './log.mjs';
import { reasonRank } from './events.mjs';
import { whileYouWereAway } from './summarizer.mjs';

/**
 * How many efforts Home shows in full before it starts compressing.
 *
 * The constitution forbids scrolling to understand the situation, and forbids
 * paginating the truth. That leaves compression, and compression needs a
 * threshold. Seven is chosen for an ordinary reason: it is about as many
 * distinct things as a person holds at a glance, and the whole product is built
 * around a glance.
 */
export const SHOWN_IN_FULL = 7;

/**
 * Build Home.
 *
 * @param {{efforts: Map<string,object>, project: object}} truth
 * @param {{now?: number}} [options]
 */
export function home(truth, { now = Date.now() } = {}) {
  const live = [...truth.efforts.values()].filter((e) => e.state && e.state !== 'dissolved');
  const ordered = homeOrder(live);

  const waiting = ordered.filter((e) => e.state === 'waiting');
  const moving = ordered.filter((e) => e.state === 'moving');
  const settled = ordered.filter((e) => e.state === 'done');

  return {
    project: truth.project?.name ?? null,
    empty: live.length === 0,

    // The one sentence that answers "what is my situation" before the eye moves.
    situation: live.length ? whileYouWereAway(live) : 'Nothing needs you.',

    // Rank order is absolute and not configurable. What waits on you is the
    // product's headline, always.
    ranks: [
      rank('waiting on you', waiting, now),
      rank('moving', moving, now),
      rank('settled', settled, now),
    ].filter((r) => r.efforts.length || r.compressed),

    // Where the eye is meant to land, and where the keyboard already is.
    focus: ordered[0]?.id ?? null,
  };
}

function rank(name, efforts, now) {
  const shown = efforts.slice(0, SHOWN_IN_FULL);
  const rest = efforts.length - shown.length;
  return {
    name,
    efforts: shown.map((e) => card(e, now)),
    // Growth is absorbed by compressing, never by adding a pane, shrinking the
    // type, or hiding the truth behind a page.
    compressed: rest > 0 ? compress(efforts.slice(SHOWN_IN_FULL)) : null,
  };
}

function card(effort, now) {
  return {
    id: effort.id,
    // The developer's own words, always set stronger than anything we say.
    intent: effort.intent,
    // Ours, always quieter.
    account: effort.summary ?? null,
    accountIsOurs: effort.summarySource === 'description',
    state: effort.state,
    reason: effort.reason?.kind ?? null,
    // A failure carries its one suggested action; nothing else offers one.
    says: effort.reason?.sentence ?? null,
    action: effort.reason?.action ?? null,
    assistant: effort.assistant ?? null,
    changedAt: effort.changedAt,
    ago: ago(now - effort.changedAt),
    stale: effort.stale ?? false,
  };
}

function compress(rest) {
  const kinds = new Map();
  for (const e of rest) {
    const k = e.reason?.kind ?? e.state;
    kinds.set(k, (kinds.get(k) ?? 0) + 1);
  }
  const worst = [...kinds.keys()].sort((a, b) => reasonRank(a) - reasonRank(b))[0];
  return {
    count: rest.length,
    sentence: rest.length === 1
      ? 'One more, further down the list.'
      : `${capitalise(word(rest.length))} more, ${worst === 'parked' ? 'all set aside' : 'none of them urgent'}.`,
  };
}

const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight',
  'nine', 'ten', 'eleven', 'twelve'];
const word = (n) => WORDS[n] ?? String(n);
const capitalise = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Time, said the way a person says it.
 *
 * Never a live-updating clock: a number that ticks is a thing that moves without
 * cause, and nothing here moves without cause.
 */
export function ago(ms) {
  const m = Math.round(ms / 60000);
  if (m < 1) return 'just now';
  if (m === 1) return 'a minute ago';
  if (m < 50) return `${word(Math.round(m / 5) * 5) ?? m} minutes ago`;
  const h = Math.round(m / 60);
  if (h === 1) return 'an hour ago';
  if (h < 20) return `${word(h)} hours ago`;
  const d = Math.round(h / 24);
  return d === 1 ? 'yesterday' : `${word(d)} days ago`;
}

/**
 * Render Home as plain text.
 *
 * Kept because it is the fastest way to see whether the *ordering* is right
 * without arguing about anything visual, and because a surface that cannot be
 * read aloud in rank order is a surface that will not work for assistive access
 * either.
 */
export function asText(h) {
  if (h.empty) return `${h.situation}\n\n    begin an effort`;

  const out = [h.situation, ''];
  for (const r of h.ranks) {
    if (!r.efforts.length && !r.compressed) continue;
    out.push(r.name.toUpperCase());
    for (const e of r.efforts) {
      out.push(`  ${e.intent}`);
      if (e.says) out.push(`    ${e.says}`);
      else if (e.account) out.push(`    ${e.account}`);
      if (e.action) out.push(`    → ${e.action}`);
    }
    if (r.compressed) out.push(`  ${r.compressed.sentence}`);
    out.push('');
  }
  return out.join('\n').trimEnd();
}
