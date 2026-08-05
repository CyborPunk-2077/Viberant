/**
 * The Summarizer.
 *
 * Two things are tested here. First, that a borrowed assistant cannot make the
 * product speak badly — whatever it returns is checked, and rejected if it would
 * embarrass us. Second, that the path with no assistant at all still produces
 * something a person would accept, because that path is always available and
 * will be used more than we would like.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { summarize, describe as plainly, prompt, whileYouWereAway } from '../src/summarizer.mjs';
import { checkSentence } from '../src/lexicon.mjs';

/** An assistant that answers however we tell it to. */
const answering = (...replies) => {
  let i = 0;
  const calls = [];
  return {
    name: 'borrowed',
    calls,
    inference: async (p) => { calls.push(p); return replies[Math.min(i++, replies.length - 1)]; },
  };
};

const effort = {
  intent: 'the export flow needs a progress indicator',
  directions: [],
};

const touched = [
  { path: 'src/export/run.js', kind: 'changed' },
  { path: 'src/export/progress.js', kind: 'added' },
];

// ---------------------------------------------------------------------------

describe('borrowing an assistant', () => {
  test('a good sentence is used as it stands', async () => {
    const tool = answering('The export flow now reports progress as it runs.');
    const r = await summarize({ effort, touched, inference: tool });

    assert.equal(r.sentence, 'The export flow now reports progress as it runs.');
    assert.equal(r.source, 'borrowed');
    assert.equal(r.kind, 'account');
    assert.equal(tool.calls.length, 1);
  });

  test('the wrapping models like to add is stripped', async () => {
    for (const wrapped of [
      '"The export flow now reports progress."',
      '```\nThe export flow now reports progress.\n```',
      "Here's the sentence: The export flow now reports progress.",
      'Summary: The export flow now reports progress.',
      'The export flow now reports progress.\n\nLet me know if you want more detail.',
    ]) {
      const r = await summarize({ effort, touched, inference: answering(wrapped) });
      assert.equal(r.sentence, 'The export flow now reports progress.', `failed on: ${wrapped}`);
    }
  });

  test('a sentence that breaks the vocabulary is sent back once, with the reason', async () => {
    const tool = answering(
      'Committed the changes to a new branch.',
      'The export flow now reports progress as it runs.',
    );
    const r = await summarize({ effort, touched, inference: tool });

    assert.equal(r.sentence, 'The export flow now reports progress as it runs.');
    assert.equal(tool.calls.length, 2, 'it was asked again');
    assert.match(tool.calls[1], /previous answer was rejected/);
    assert.match(tool.calls[1], /forbidden term "committed"/,
      'the complaint names the exact word, including its inflected form');
    assert.match(tool.calls[1], /forbidden term "branch"/);
  });

  test('a tool that will not behave is dropped, not indulged', async () => {
    const tool = answering('Merged the branch!', 'Rebased onto main!!');
    const r = await summarize({ effort, touched, inference: tool });

    assert.equal(tool.calls.length, 2, 'asked twice and no more');
    assert.equal(r.kind, 'description', 'we fall back rather than print nonsense');
    assert.equal(checkSentence(r.sentence).ok, true);
  });

  test('a tool that throws costs the effort nothing', async () => {
    const broken = { name: 'broken', inference: async () => { throw new Error('no'); } };
    const r = await summarize({ effort, touched, inference: broken });
    assert.equal(r.kind, 'description');
    assert.equal(checkSentence(r.sentence).ok, true);
  });

  test('the prompt tells the assistant what it may not say', () => {
    const p = prompt({ effort, touched, account: null, complaints: null });
    assert.match(p, /exactly one sentence/i);
    assert.match(p, /Never mention version control/);
    assert.match(p, /Never begin with a count of files/);
    assert.match(p, /the export flow needs a progress indicator/);
    assert.match(p, /changed src\/export\/run\.js/);
  });

  test('the prompt carries every direction, so nothing the developer said is lost', () => {
    const p = prompt({
      effort: { intent: 'add billing', directions: ['use the existing rates table', 'no new dependencies'] },
      touched: [], account: null, complaints: null,
    });
    assert.match(p, /use the existing rates table/);
    assert.match(p, /no new dependencies/);
  });
});

describe('when nobody can answer', () => {
  test('an empty effort says so plainly', () => {
    assert.equal(plainly([]), 'Nothing has changed here yet.');
  });

  test('one file reads like a person wrote it', () => {
    assert.equal(plainly([{ path: 'billing.js', kind: 'added' }]), 'Added billing.js.');
  });

  test('two files read like a person wrote it', () => {
    assert.equal(
      plainly([{ path: 'billing.js', kind: 'added' }, { path: 'rates.js', kind: 'added' }]),
      'Added billing.js and rates.js.',
    );
  });

  test('many files are counted in words, not digits, and never lead the sentence', () => {
    const many = ['a', 'b', 'c', 'd', 'e'].map((n) => ({ path: `${n}.js`, kind: 'changed' }));
    const s = plainly(many);
    assert.equal(s, 'Changed a.js and four others.');
    assert.equal(checkSentence(s).ok, true);
  });

  test('work in one area says where', () => {
    const s = plainly([
      { path: 'src/billing/charge.js', kind: 'added' },
      { path: 'src/billing/rates.js', kind: 'changed' },
    ]);
    assert.equal(s, 'Work in billing: added charge.js and changed rates.js.');
  });

  test('several kinds of change read in order', () => {
    const s = plainly([
      { path: 'new.js', kind: 'added' },
      { path: 'old.js', kind: 'removed' },
      { path: 'main.js', kind: 'changed' },
    ]);
    assert.equal(s, 'Added new.js, changed main.js, and removed old.js.');
  });

  test('every description it can produce is speakable', () => {
    const names = ['a.js', 'src/b.ts', 'lib/deep/c.py', 'x/y/z/d.rs', 'e'];
    const kinds = ['added', 'changed', 'removed'];
    let checked = 0;
    for (let n = 0; n <= names.length; n++) {
      for (const kind of kinds) {
        const touched = names.slice(0, n).map((path) => ({ path, kind }));
        const s = plainly(touched);
        const r = checkSentence(s);
        assert.equal(r.ok, true, `"${s}" — ${r.problems.join('; ')}`);
        assert.match(s, /\.$/, `"${s}" should end as a sentence`);
        checked++;
      }
    }
    assert.ok(checked >= 15);
  });

  test('a description never claims to understand the work', () => {
    const s = plainly([{ path: 'auth.js', kind: 'changed' }]);
    assert.doesNotMatch(s, /\b(fixed|improved|now|works|correctly|successfully)\b/i,
      'saying what changed is honest; saying it works is not ours to claim');
  });
});

describe('what happened while you were away', () => {
  test('says the situation in one sentence', () => {
    assert.equal(
      whileYouWereAway([
        { state: 'waiting' }, { state: 'waiting' }, { state: 'moving' }, { state: 'done' },
      ]),
      'Two efforts are waiting on you, one still moving, and one settled.',
    );
  });

  test('one thing waiting reads as one thing', () => {
    assert.equal(whileYouWereAway([{ state: 'waiting' }]), 'One effort is waiting on you.');
  });

  test('a calm morning is a success state, not an empty one', () => {
    assert.equal(whileYouWereAway([]), 'Nothing needs you.');
    assert.equal(whileYouWereAway([{ state: 'dissolved' }]), 'Nothing needs you.');
  });

  test('and all of it is speakable', () => {
    const states = ['waiting', 'moving', 'done'];
    for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) for (let c = 0; c < 4; c++) {
      const efforts = [
        ...Array(a).fill({ state: states[0] }),
        ...Array(b).fill({ state: states[1] }),
        ...Array(c).fill({ state: states[2] }),
      ];
      const s = whileYouWereAway(efforts);
      assert.equal(checkSentence(s).ok, true, `"${s}"`);
    }
  });
});
