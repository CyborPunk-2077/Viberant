/**
 * The experiment.
 *
 * Sweep the one parameter we get to choose — how long a silence must last
 * before we conclude the assistant has stopped — and report what each choice
 * costs. Run with:  node experiments/quiescence/run.mjs
 *
 * The results are broken out by how a session ended, because the two endings
 * are not the same problem and averaging them together hides the finding that
 * matters.
 */

import { session } from './simulate.mjs';
import { detect, score } from './detect.mjs';

const SESSIONS = 400;
const THRESHOLDS = [15, 30, 45, 60, 90, 120, 180, 300, 600];
const r1 = (n) => (n === null ? '—' : Math.round(n));

function trial({ quiet, useExit }) {
  const stats = {
    falseAlarms: 0,
    ended: { blocked: { n: 0, caught: 0, waits: [] }, quit: { n: 0, caught: 0, waits: [] } },
  };

  for (let i = 0; i < SESSIONS; i++) {
    const s = session(i + 1);
    const sc = score(s, detect(s, { quiet, useExit }));
    stats.falseAlarms += sc.falseAlarms;
    const bucket = s.ends === 'blocked' ? stats.ended.blocked : stats.ended.quit;
    bucket.n++;
    if (sc.caught) { bucket.caught++; bucket.waits.push(sc.latency); }
  }

  const summarise = (b) => {
    const w = [...b.waits].sort((a, c) => a - c);
    return {
      caughtPct: b.n ? (b.caught / b.n) * 100 : 0,
      median: w.length ? w[Math.floor(w.length / 2)] : null,
      worst: w.length ? w[w.length - 1] : null,
    };
  };

  return {
    quiet,
    falseAlarms: stats.falseAlarms / SESSIONS,
    blocked: summarise(stats.ended.blocked),
    quit: summarise(stats.ended.quit),
  };
}

function table(title, useExit) {
  console.log(`\n${title}`);
  console.log('─'.repeat(76));
  console.log('       │ false  │  it stopped to ask you   │  it finished or died');
  console.log(' quiet │ alarms │  caught   median   worst │  caught   median   worst');
  console.log('  (s)  │ /sess  │            (s)      (s)  │            (s)      (s)');
  console.log('─'.repeat(76));
  const rows = [];
  for (const quiet of THRESHOLDS) {
    const r = trial({ quiet, useExit });
    rows.push(r);
    console.log(
      String(r.quiet).padStart(6) + ' │' +
      r.falseAlarms.toFixed(2).padStart(7) + ' │' +
      (r.blocked.caughtPct.toFixed(0) + '%').padStart(8) +
      String(r1(r.blocked.median)).padStart(9) + String(r1(r.blocked.worst)).padStart(8) + ' │' +
      (r.quit.caughtPct.toFixed(0) + '%').padStart(8) +
      String(r1(r.quit.median)).padStart(9) + String(r1(r.quit.worst)).padStart(8),
    );
  }
  console.log('─'.repeat(76));
  return rows;
}

console.log('QUIESCENCE EXPERIMENT');
console.log(`${SESSIONS} simulated sessions per threshold, deterministic seeds.`);
console.log('A false alarm is telling the developer an effort needs them while the');
console.log('assistant was in fact still working. That is the cost that matters:');
console.log('every one of them is exactly the anxiety this product exists to remove.');

const blind = table('A. Watching files only  —  a tool we never launched and have never seen', false);
const owned = table('B. Watching files, and knowing when the process ends  —  we launched it', true);

const ACCEPTABLE = 0.05;
const pickThreshold = (rows) => rows.find((r) => r.falseAlarms <= ACCEPTABLE) ?? null;
const a = pickThreshold(blind);
const b = pickThreshold(owned);

console.log('\n\nFINDINGS');
console.log('═'.repeat(76));

console.log('\n1. Short thresholds are unusable, and it is not close.');
const short = blind.find((x) => x.quiet === 30);
console.log(`   At 30 seconds we would interrupt the developer ${short.falseAlarms.toFixed(1)} times per session`);
console.log('   for nothing. Assistants pause to think, and thinking looks exactly like');
console.log('   stopping. Any design assuming near-instant detection is wrong.');

console.log(`\n2. The shortest silence worth trusting is about ${a.quiet} seconds.`);
console.log(`   Below that, false alarms climb fast. At ${a.quiet}s they are ${a.falseAlarms.toFixed(2)} per session.`);

console.log('\n3. Owning the process solves one ending completely and the other not at all.');
const oa = blind.find((x) => x.quiet === a.quiet);
const ob = owned.find((x) => x.quiet === a.quiet);
console.log(`   At ${a.quiet}s, for an assistant that finished or died:`);
console.log(`      watching only        median ${r1(oa.quit.median)}s`);
console.log(`      knowing it ended     median ${r1(ob.quit.median)}s`);
console.log(`   For an assistant that stopped to ask a question:`);
console.log(`      watching only        median ${r1(oa.blocked.median)}s`);
console.log(`      knowing it ended     median ${r1(ob.blocked.median)}s   ← no help whatsoever`);
console.log('   A process waiting for an answer has not ended. Nothing about owning it');
console.log('   tells us anything, because there is nothing to observe.');

console.log('\n4. So there are three tiers, and they are honest ones.');
console.log('   Adapter, for tools we teach:   the tool tells us. Instant, both endings.');
console.log(`   We launched it:                instant when it ends, ~${a.quiet}s when it asks.`);
console.log(`   Never seen it:                 ~${a.quiet}s either way.`);
console.log('   The loop is identical in all three. Only how fast the picture catches up');
console.log('   differs — which is exactly the difference the design already allows.');

console.log('\n5. Consequence for the product.');
console.log(`   Worst case, an assistant sits idle roughly ${a.quiet} seconds before we notice.`);
console.log('   That is fine if the developer is looking somewhere they can see it, and');
console.log('   bad if it is buried in a window they have closed. This raises the value');
console.log('   of the quiet state marker outside the app rather than lowering it.');
console.log('═'.repeat(76));
