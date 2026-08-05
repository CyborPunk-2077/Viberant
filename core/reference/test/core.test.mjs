/**
 * The conformance suite.
 *
 * These are not ordinary unit tests. Several of them are constitutional
 * guarantees written as executable assertions, so that a promise made in prose
 * fails a build rather than fails a user. Where a test corresponds to a release
 * criterion, it says so.
 *
 * The Rust core will be held to this same suite.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { ulid, isUlid, Clock, compareEvents } from '../src/identity.mjs';
import { checkSentence, audit, requireSpeakable, LexiconViolation } from '../src/lexicon.mjs';
import { Author, Developer, reason, REASON_KINDS, SchemaViolation } from '../src/events.mjs';
import { checkTransition, isLegal, IllegalTransition, TRANSITIONS, STATES } from '../src/state.mjs';
import { Log, fold, homeOrder } from '../src/log.mjs';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setup({ machine = ulid(), start = 1_000_000 } = {}) {
  let t = start;
  const clock = new Clock(() => t);
  const project = ulid();
  const author = new Author({ clock, machine, project });
  const dev = new Developer(author);
  return { author, dev, project, machine, clock, advance: (ms) => { t += ms; } };
}

/** Begin an effort and delegate it, returning the events. */
function movingEffort(ctx, intent = 'add billing') {
  const { effort, event: begun } = ctx.dev.begin({ intent });
  const delegated = ctx.author.delegated({ effort, assistant: 'claude-code', causedBy: begun.id });
  const moved = ctx.dev.transitioned({ effort, to: 'moving', causedBy: delegated.id });
  return { effort, events: [begun, delegated, moved] };
}

// ---------------------------------------------------------------------------

describe('identity and causal ordering', () => {
  test('identifiers are unique, sortable and machine-independent', () => {
    const ids = Array.from({ length: 5000 }, () => ulid());
    assert.equal(new Set(ids).size, 5000, 'no collisions');
    assert.ok(ids.every(isUlid));
    assert.deepEqual([...ids].sort(), ids, 'minting order is sort order');
  });

  test('the clock never goes backwards even if the machine clock does', () => {
    let now = 5000;
    const clock = new Clock(() => now);
    const a = clock.tick();
    now = 1000;                       // the machine clock jumps backwards
    const b = clock.tick();
    assert.ok(b.wall >= a.wall, 'wall time is monotonic');
    assert.ok(b.wall > a.wall || b.counter > a.counter, 'the pair always advances');
  });

  test('observing another machine keeps causality', () => {
    const mine = new Clock(() => 1000);
    const theirs = { wall: 9999, counter: 3 };
    const after = mine.observe(theirs);
    assert.ok(after.wall > theirs.wall || (after.wall === theirs.wall && after.counter > theirs.counter),
      'anything I do next sorts after what I just saw');
  });

  test('total order is deterministic and breaks ties by machine', () => {
    const e = (wall, counter, machine) => ({ at: { wall, counter }, machine });
    const a = e(1, 0, 'AAAA'), b = e(1, 0, 'BBBB');
    assert.ok(compareEvents(a, b) < 0);
    assert.ok(compareEvents(b, a) > 0);
    assert.equal(compareEvents(a, a), 0);
  });
});

describe('the vocabulary contract', () => {
  test('version-control terms are refused', () => {
    for (const bad of [
      'I committed the changes to the branch',
      'merge conflict in four files',
      'the worktree is dirty',
      'pushed to the repository',
      'rebase onto main',
      'detached HEAD state',
    ]) {
      assert.equal(checkSentence(bad).ok, false, `should refuse: ${bad}`);
    }
  });

  test('plain sentences pass', () => {
    for (const good of [
      'Billing now charges the right amount, and the tests agree.',
      'Stopped after changing the signup form; it needs a decision from you.',
      'Nothing has happened here since Tuesday.',
      'Accepted. Sent to the shared copy.',
    ]) {
      const r = checkSentence(good);
      assert.equal(r.ok, true, `should accept: ${good} (${r.problems.join('; ')})`);
    }
  });

  test('machine error text and shouting are refused', () => {
    assert.equal(checkSentence('ERROR: exception in module').ok, false);
    assert.equal(checkSentence('Done!').ok, false);
    assert.equal(checkSentence('4 files changed').ok, false, 'leads with a count, not meaning');
  });

  test('the audit reports every offender at once (MVP release criterion 11.8)', () => {
    const result = audit([
      { where: 'summary/1', sentence: 'Rewrote the parser.' },
      { where: 'summary/2', sentence: 'Committed to a new branch.' },
    ]);
    assert.equal(result.clean, false);
    assert.equal(result.failures.length, 1);
    assert.equal(result.failures[0].where, 'summary/2');
  });

  test('suspect words warn without failing', () => {
    const r = checkSentence('There is a conflict between what you asked for and what happened.');
    assert.equal(r.ok, true);
    assert.ok(r.suspect.includes('conflict'));
  });
});

describe('the failure shape is a schema requirement, not a convention', () => {
  test('a reason needing an action cannot be built without one', () => {
    assert.throws(() => reason('failed', 'The assistant stopped early.'), SchemaViolation);
    assert.throws(() => reason('question', 'It asked whether to keep the old column.'), SchemaViolation);
    assert.ok(reason('failed', 'The assistant stopped early.', 'Send it back with more direction.'));
  });

  test('reasons that need no action may omit it', () => {
    assert.ok(reason('parked', 'You set this aside for later.'));
    assert.ok(reason('review_ready', 'Billing is finished and waiting for you to read it.'));
  });

  test('an unspeakable reason cannot reach the log', () => {
    assert.throws(
      () => reason('failed', 'Could not merge the branch.', 'Try again.'),
      LexiconViolation,
    );
  });

  test('every reason kind is ranked for Home', () => {
    for (const kind of REASON_KINDS) {
      assert.ok(Number.isInteger(REASON_KINDS.indexOf(kind)));
    }
    assert.equal(REASON_KINDS[0], 'question', 'an idle machine is the costliest thing to leave');
    assert.equal(REASON_KINDS.at(-1), 'parked', 'what you chose to defer is never urgent');
  });
});

describe('machines cannot settle work (Architecture §2.3)', () => {
  const machineActors = ['assistant', 'world', 'system'];

  test('no machine actor can reach done, from any state, by any trigger', () => {
    let attempts = 0;
    for (const actor of machineActors) {
      for (const from of [null, ...STATES]) {
        for (const [to, triggers] of Object.entries(TRANSITIONS[from ?? 'null'] ?? {})) {
          for (const trigger of triggers) {
            if (to !== 'done' && to !== 'dissolved') continue;
            attempts++;
            assert.throws(
              () => checkTransition({ from, to, trigger, actor, reason: null }),
              IllegalTransition,
              `${actor} must not reach ${to} from ${from} by ${trigger}`,
            );
          }
        }
      }
    }
    assert.ok(attempts > 0, 'the test actually tried something');
  });

  test('a verdict cannot be minted except through the developer', () => {
    const { author } = setup();
    assert.equal(typeof author.judge, 'undefined', 'the Author has no way to judge');
  });

  test('there are exactly three verdicts', () => {
    const { dev } = setup();
    const { effort } = dev.begin({ intent: 'x' });
    for (const v of ['accept', 'redirect', 'abandon']) {
      assert.ok(dev.judge({ effort, verdict: v }));
    }
    assert.throws(() => dev.judge({ effort, verdict: 'approve' }), SchemaViolation);
    assert.throws(() => dev.judge({ effort, verdict: 'merge' }), SchemaViolation);
  });

  test('the developer can settle work', () => {
    assert.ok(checkTransition({ from: 'waiting', to: 'done', trigger: 'accept', actor: 'developer' }));
  });
});

describe('the transition table is closed', () => {
  test('an assistant may report that it stopped, but only into waiting', () => {
    assert.ok(checkTransition({
      from: 'moving', to: 'waiting', trigger: 'assistant_stopped', actor: 'assistant',
      reason: reason('review_ready', 'Billing is finished and waiting for you to read it.'),
    }));
    assert.equal(isLegal({ from: 'moving', to: 'done', trigger: 'assistant_stopped', actor: 'assistant' }), false);
  });

  test('waiting always carries a reason', () => {
    assert.throws(() => checkTransition({
      from: 'moving', to: 'waiting', trigger: 'assistant_stopped', actor: 'assistant', reason: null,
    }), SchemaViolation);
  });

  test('a moving effort can be redirected without waiting for the machine', () => {
    assert.ok(checkTransition({ from: 'moving', to: 'moving', trigger: 'redirect', actor: 'developer' }));
  });

  test('a moving effort can be abandoned without waiting for the machine (Workflow F)', () => {
    assert.ok(checkTransition({ from: 'moving', to: 'dissolved', trigger: 'abandon', actor: 'developer' }));
  });

  test('nonsense is refused', () => {
    assert.equal(isLegal({ from: 'done', to: 'done', trigger: 'accept', actor: 'developer' }), false);
    assert.equal(isLegal({ from: 'dissolved', to: 'dissolved', trigger: 'abandon', actor: 'developer' }), false);
    assert.equal(isLegal({ from: null, to: 'done', trigger: 'accept', actor: 'developer' }), false,
      'an effort cannot be born settled');
  });
});

describe('the log folds to truth', () => {
  test('an effort walks its whole life', () => {
    const ctx = setup();
    const log = new Log();
    const { effort, events } = movingEffort(ctx, 'fix the flaky auth test');
    events.forEach((e) => log.append(e));

    ctx.advance(60_000);
    const stopped = ctx.author.transitioned({
      effort, to: 'waiting', actor: 'assistant',
      reason: reason('review_ready', 'The auth test passes now, and nothing else changed.'),
    });
    log.append(stopped);
    log.append(ctx.author.summarized({
      effort, sentence: 'The auth test passes now, and nothing else changed.', source: 'claude-code',
    }));

    ctx.advance(1000);
    const verdict = ctx.dev.judge({ effort, verdict: 'accept' });
    log.append(verdict);
    log.append(ctx.dev.transitioned({ effort, to: 'done', causedBy: verdict.id }));
    log.append(ctx.dev.published({ effort }));

    const { efforts, refusals } = fold(log);
    const ef = efforts.get(effort);
    assert.deepEqual(refusals, []);
    assert.equal(ef.state, 'done');
    assert.equal(ef.published, true);
    assert.equal(ef.intent, 'fix the flaky auth test');
    assert.equal(ef.assistant, 'claude-code');
    assert.ok(ef.story.length >= 5);
  });

  test('replay is deterministic regardless of arrival order', () => {
    const ctx = setup();
    const { effort, events } = movingEffort(ctx);
    const more = [
      ctx.author.transitioned({
        effort, to: 'waiting', actor: 'assistant',
        reason: reason('review_ready', 'Billing is finished and waiting for you to read it.'),
      }),
    ];
    const all = [...events, ...more];

    const forward = fold(Log.fromJSONL(all.map((e) => JSON.stringify(e)).join('\n')));
    const shuffled = [...all].reverse();
    const backward = fold(Log.fromJSONL(shuffled.map((e) => JSON.stringify(e)).join('\n')));

    assert.deepEqual(
      JSON.parse(JSON.stringify([...backward.efforts])),
      JSON.parse(JSON.stringify([...forward.efforts])),
      'the same events in any order fold to identical truth',
    );
  });

  test('merging two machines is a union and a fold — nothing more', () => {
    // Machine A begins and delegates.
    const a = setup({ machine: '0000000000000000000000000A' });
    const { effort, events: aEvents } = movingEffort(a, 'add billing');

    // Machine B has seen A's log and carries on from there.
    const b = setup({ machine: '0000000000000000000000000B', start: 1_000_000 });
    aEvents.forEach((e) => b.clock.observe(e.at));
    b.advance(5000);
    const bEvent = b.author.transitioned({
      effort, to: 'waiting', actor: 'assistant',
      reason: reason('review_ready', 'Billing is finished and waiting for you to read it.'),
    });

    const logA = new Log(); logA.merge(aEvents); logA.merge([bEvent]);
    const logB = new Log(); logB.merge([bEvent]); logB.merge(aEvents);

    assert.equal(logA.toJSONL(), logB.toJSONL(), 'both machines agree on order');
    assert.equal(fold(logA).efforts.get(effort).state, 'waiting');
    assert.equal(fold(logB).efforts.get(effort).state, 'waiting');
  });

  test('merging is idempotent — syncing twice changes nothing', () => {
    const ctx = setup();
    const { events } = movingEffort(ctx);
    const log = new Log();
    log.merge(events);
    const once = log.toJSONL();
    log.merge(events);
    log.merge(events);
    assert.equal(log.toJSONL(), once);
  });

  test('an illegal event from elsewhere is refused, not obeyed, and never crashes us', () => {
    const ctx = setup();
    const log = new Log();
    const { effort, events } = movingEffort(ctx);
    events.forEach((e) => log.append(e));

    // A forged event: an assistant claiming the work is settled.
    log.append({
      ...ctx.author.transitioned({ effort, to: 'moving' }),
      to: 'done', actor: 'assistant',
    });

    const { efforts, refusals } = fold(log);
    assert.equal(efforts.get(effort).state, 'moving', 'the forgery had no effect');
    assert.equal(refusals.length, 1);
    assert.match(refusals[0].why, /only the developer can settle/);
  });

  test('a torn final line does not lose acknowledged intent (release criterion 11.11)', () => {
    const ctx = setup();
    const { events } = movingEffort(ctx);
    const jsonl = events.map((e) => JSON.stringify(e)).join('\n');
    const torn = jsonl + '\n' + '{"v":1,"id":"01J' // a crash mid-append
    const log = Log.fromJSONL(torn);
    assert.equal(log.size, events.length, 'every completed event survived');
  });

  test('an unknown event type from a newer build is ignored, not fatal', () => {
    const ctx = setup();
    const { events } = movingEffort(ctx);
    const log = new Log();
    log.merge(events);
    log.append({ ...events[0], id: ulid(), type: 'effort.blessed_by_a_future_version' });
    assert.doesNotThrow(() => fold(log));
  });
});

describe('Home shows the right thing first', () => {
  test('waiting outranks moving outranks done, and reasons order within', () => {
    const mk = (state, kind, changedAt) => ({
      state, changedAt,
      reason: kind ? { kind, sentence: 's', action: 'a' } : null,
    });
    const ordered = homeOrder([
      mk('done', null, 500),
      mk('moving', null, 400),
      mk('waiting', 'parked', 300),
      mk('waiting', 'question', 100),
      mk('waiting', 'review_ready', 200),
    ]);
    assert.deepEqual(
      ordered.map((e) => e.reason?.kind ?? e.state),
      ['question', 'review_ready', 'parked', 'moving', 'done'],
    );
  });

  test('an idle machine outranks a big review', () => {
    const [first] = homeOrder([
      { state: 'waiting', reason: { kind: 'review_ready' }, changedAt: 999 },
      { state: 'waiting', reason: { kind: 'question' }, changedAt: 1 },
    ]);
    assert.equal(first.reason.kind, 'question');
  });
});

describe('switching tools mid-effort keeps the thread', () => {
  test('an effort remembers every assistant that touched it', () => {
    const ctx = setup();
    const log = new Log();
    const { effort, events } = movingEffort(ctx, 'port the exporter');
    events.forEach((e) => log.append(e));

    log.append(ctx.author.accountCaptured({
      effort, assistant: 'claude-code', kind: 'transcript', ref: 'accounts/01.md',
    }));
    ctx.advance(1000);
    log.append(ctx.author.delegated({ effort, assistant: 'codex-cli' }));
    log.append(ctx.author.accountCaptured({
      effort, assistant: 'codex-cli', kind: 'transcript', ref: 'accounts/02.md',
    }));

    const ef = fold(log).efforts.get(effort);
    assert.deepEqual(ef.assistants, ['claude-code', 'codex-cli']);
    assert.equal(ef.assistant, 'codex-cli', 'the current tool is the last one delegated to');
    assert.equal(ef.story.filter((s) => s.kind === 'account').length, 2,
      'both tools left an account behind, so the next one starts oriented');
  });
});
