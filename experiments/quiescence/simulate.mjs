/**
 * A simulator of how AI coding assistants actually behave over time.
 *
 * The question this exists to answer: watching only the files in an effort's
 * ground, can we tell "still working" from "stopped and waiting for you"?
 *
 * Everything about working with tools we have never seen rests on that. If the
 * answer is no, the product promises something it cannot deliver, and we should
 * find out now rather than in month six.
 *
 * The behaviour parameters below are stated assumptions, not measurements. They
 * are drawn from how these tools observably behave — bursts of edits, pauses
 * while the model thinks, long silent stretches while tests run. A recording
 * from a real session should replace them, and the experiment is built so that
 * swapping the numbers changes the conclusion honestly rather than requiring a
 * rewrite.
 */

/** Deterministic randomness, so a finding can be reproduced exactly. */
export function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 0x100000000;
  };
}

const pick = (r, xs) => xs[Math.floor(r() * xs.length)];
const between = (r, lo, hi) => lo + r() * (hi - lo);

/**
 * What an assistant is doing at any moment.
 *
 * `working` phases mean the developer should be left alone. `needsYou` phases
 * mean the effort genuinely belongs in front of them.
 */
export const PHASES = {
  // Writing code. Files change every second or so.
  edit:    { working: true,  writeEvery: [0.2, 2.0],   lasts: [3, 25] },

  // Waiting on the model. Nothing touches the disk at all. This is the phase
  // that makes short thresholds dangerous.
  think:   { working: true,  writeEvery: null,          lasts: [2, 45] },

  // Running tests or a build. Output usually goes to the terminal, not into the
  // ground, so from the outside this can look like total silence for minutes.
  test:    { working: true,  writeEvery: [8, 60],       lasts: [10, 300] },

  // Installing dependencies. Writes constantly, but often outside the paths we
  // would consider interesting.
  install: { working: true,  writeEvery: [0.1, 1.0],    lasts: [20, 180] },

  // Stopped, asking the developer a question, process still alive. This is the
  // case we must catch, and the case that looks exactly like `think`.
  //
  // The tail is long enough that even the slowest threshold we test has room to
  // fire inside it — otherwise the experiment would report a slow detector as
  // an inaccurate one, which is a different and much worse thing to believe.
  blocked: { working: false, writeEvery: null,          lasts: [900, 900] },

  // Stopped for good. The process exits, which is a signal we can see directly.
  finished:{ working: false, writeEvery: null,          lasts: [900, 900], exits: 0 },
  crashed: { working: false, writeEvery: null,          lasts: [900, 900], exits: 1 },
};

/**
 * Build one plausible session.
 *
 * @returns {{events: number[], truth: {at: number, working: boolean}[], exit: {at:number, code:number}|null, ends: string, length: number}}
 */
export function session(seed, { maxWork = 900 } = {}) {
  const r = rng(seed);
  const events = [];          // times, in seconds, when something was written
  const truth = [];           // when the ground truth changed
  let t = 0;
  let last = null;

  const enter = (name) => {
    const p = PHASES[name];
    if (last !== p.working) { truth.push({ at: t, working: p.working }); last = p.working; }
    return p;
  };

  // A session is a run of working phases, then it stops one way or another.
  while (t < maxWork) {
    const name = pick(r, ['edit', 'think', 'edit', 'test', 'edit', 'think', 'install']);
    const p = enter(name);
    const dur = between(r, ...p.lasts);
    if (p.writeEvery) {
      let w = t + between(r, ...p.writeEvery);
      while (w < t + dur) { events.push(w); w += between(r, ...p.writeEvery); }
    }
    t += dur;
  }

  // How it ends. Blocking on a question is common; so is simply finishing.
  const ends = pick(r, ['blocked', 'blocked', 'finished', 'finished', 'finished', 'crashed']);
  const p = enter(ends);
  const stoppedAt = t;
  t += p.lasts[0];

  return {
    events,
    truth,
    exit: p.exits === undefined ? null : { at: stoppedAt, code: p.exits },
    ends,
    stoppedAt,
    length: t,
  };
}

/** What was actually true at a moment. */
export function truthAt(s, at) {
  let working = true;
  for (const t of s.truth) { if (t.at <= at) working = t.working; }
  return working;
}
