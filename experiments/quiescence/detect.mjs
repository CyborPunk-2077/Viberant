/**
 * Deciding whether an assistant has stopped.
 *
 * Two detectors, so the experiment can say what each signal is actually worth.
 *
 *   `quietOnly`   — the honest worst case: we can see files change and nothing
 *                   else. This is what we have for a tool we have never seen
 *                   and cannot launch ourselves.
 *
 *   `quietAndExit`— we launched the assistant ourselves, so we also know when
 *                   its process ends. Costs us ownership of the process; the
 *                   experiment shows what that buys.
 */

/**
 * @param {object} session
 * @param {{quiet: number, useExit: boolean}} options quiet threshold in seconds
 * @returns {{verdicts: {at: number, says: 'needs-you'}[], firstStopSeen: number|null}}
 */
export function detect(session, { quiet, useExit }) {
  const verdicts = [];
  let firstStopSeen = null;

  // Walk the timeline second by second, the way a watcher actually would.
  let nextEvent = 0;
  let lastWrite = 0;
  let announced = false;

  for (let t = 0; t <= session.length; t += 1) {
    while (nextEvent < session.events.length && session.events[nextEvent] <= t) {
      lastWrite = session.events[nextEvent];
      nextEvent++;
      // Activity means the effort is moving again; we are willing to be told
      // we were wrong, because the picture is allowed to change.
      announced = false;
    }

    const exited = useExit && session.exit && t >= session.exit.at;
    const silent = t - lastWrite >= quiet;

    if (!announced && (exited || silent)) {
      verdicts.push({ at: t, says: 'needs-you', because: exited ? 'it ended' : 'it went quiet' });
      announced = true;
      if (firstStopSeen === null && t >= session.stoppedAt) firstStopSeen = t;
    }
  }

  return { verdicts, firstStopSeen };
}

/**
 * Score a detector against what was really happening.
 *
 * `falseAlarms` is the number that matters most. Every one of them drags an
 * effort into the developer's attention for nothing — which is precisely the
 * anxiety this product exists to remove. A detector that catches everything by
 * crying wolf is worse than useless here.
 */
export function score(session, result) {
  let falseAlarms = 0;
  for (const v of result.verdicts) {
    const reallyWorking = truthAt(session, v.at);
    if (reallyWorking) falseAlarms++;
  }
  const latency = result.firstStopSeen === null ? null : result.firstStopSeen - session.stoppedAt;
  return { falseAlarms, latency, caught: result.firstStopSeen !== null };
}

function truthAt(s, at) {
  let working = true;
  for (const t of s.truth) { if (t.at <= at) working = t.working; }
  return working;
}
