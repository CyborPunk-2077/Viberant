/**
 * Home.
 *
 * The constitution makes three promises about this surface that can be tested
 * rather than admired: the whole situation is legible without interacting, what
 * waits on you always comes first, and growth is absorbed by compression rather
 * than by scrolling. All three are here.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { home, asText, ago, SHOWN_IN_FULL } from '../src/home.mjs';
import { checkSentence } from '../src/lexicon.mjs';

const effort = (over = {}) => ({
  id: over.id ?? Math.random().toString(36).slice(2),
  intent: 'add billing',
  state: 'moving',
  reason: null,
  summary: null,
  summarySource: null,
  assistant: null,
  changedAt: 1_000_000,
  ...over,
});

const truthOf = (...efforts) => ({
  project: { name: 'export tool' },
  efforts: new Map(efforts.map((e) => [e.id, e])),
});

const NOW = 1_000_000;
const waiting = (kind, over = {}) => effort({
  state: 'waiting',
  reason: { kind, sentence: `Something about ${kind}.`, action: kind === 'parked' ? null : 'Do the thing.' },
  ...over,
});

// ---------------------------------------------------------------------------

describe('the whole situation, without interacting', () => {
  test('one sentence answers it before the eye moves', () => {
    const h = home(truthOf(
      waiting('review_ready'), waiting('parked'), effort({ state: 'moving' }), effort({ state: 'done' }),
    ), { now: NOW });

    assert.equal(h.situation, 'Two efforts are waiting on you, one still moving, and one settled.');
    assert.equal(checkSentence(h.situation).ok, true);
  });

  test('an empty Home is a success state, not a blank one', () => {
    const h = home(truthOf(), { now: NOW });
    assert.equal(h.empty, true);
    assert.equal(h.situation, 'Nothing needs you.');
    assert.deepEqual(h.ranks, []);
    assert.match(asText(h), /begin an effort/);
  });

  test('efforts that were let go are simply not there', () => {
    const h = home(truthOf(effort({ state: 'dissolved' }), effort({ state: 'moving' })), { now: NOW });
    assert.equal(h.ranks.reduce((n, r) => n + r.efforts.length, 0), 1);
  });
});

describe('what waits on you comes first, always', () => {
  test('rank order is absolute', () => {
    const h = home(truthOf(
      effort({ state: 'done', id: 'D' }),
      effort({ state: 'moving', id: 'M' }),
      waiting('review_ready', { id: 'W' }),
    ), { now: NOW });

    assert.deepEqual(h.ranks.map((r) => r.name), ['waiting on you', 'moving', 'settled']);
    assert.equal(h.focus, 'W', 'the keyboard is already on the thing that matters');
  });

  test('an idle assistant outranks a finished review', () => {
    const h = home(truthOf(
      waiting('review_ready', { id: 'review', changedAt: NOW }),
      waiting('question', { id: 'asked', changedAt: NOW - 3600_000 }),
    ), { now: NOW });

    assert.equal(h.ranks[0].efforts[0].id, 'asked');
    assert.equal(h.focus, 'asked');
  });

  test('what you set aside yourself is never urgent', () => {
    const h = home(truthOf(
      waiting('parked', { id: 'later' }),
      waiting('failed', { id: 'broke' }),
      waiting('review_ready', { id: 'read' }),
    ), { now: NOW });

    assert.deepEqual(h.ranks[0].efforts.map((e) => e.id), ['broke', 'read', 'later']);
  });

  test('a failure carries its one action, and nothing else does', () => {
    const h = home(truthOf(
      waiting('failed', { id: 'broke' }),
      waiting('parked', { id: 'later' }),
    ), { now: NOW });

    const [broke, later] = h.ranks[0].efforts;
    assert.ok(broke.action, 'a failure always offers the one thing to do');
    assert.equal(later.action, null, 'nothing you chose needs an action offered');
  });
});

describe('the developer outranks the app', () => {
  test('their words and ours are kept apart', () => {
    const h = home(truthOf(effort({
      intent: 'the export flow needs a progress indicator',
      summary: 'The export flow now reports progress as it runs.',
      summarySource: 'claude-code',
    })), { now: NOW });

    const card = h.ranks[0].efforts[0];
    assert.equal(card.intent, 'the export flow needs a progress indicator');
    assert.equal(card.account, 'The export flow now reports progress as it runs.');
    assert.equal(card.accountIsOurs, false);
  });

  test('a plain description is marked as ours, so the surface can be quieter about it', () => {
    const h = home(truthOf(effort({
      summary: 'Added billing.js and rates.js.', summarySource: 'description',
    })), { now: NOW });
    assert.equal(h.ranks[0].efforts[0].accountIsOurs, true);
  });
});

describe('growth is absorbed by compressing, never by scrolling', () => {
  test('a busy day still fits', () => {
    const many = Array.from({ length: 20 }, (_, i) =>
      waiting(i < 3 ? 'review_ready' : 'parked', { id: `E${i}`, changedAt: NOW - i * 1000 }));
    const h = home(truthOf(...many), { now: NOW });

    const shown = h.ranks[0].efforts.length;
    assert.equal(shown, SHOWN_IN_FULL, 'the surface never grows without limit');
    assert.ok(h.ranks[0].compressed, 'the rest is compressed, not hidden and not paged');
    assert.equal(h.ranks[0].compressed.count, 13);
    assert.equal(checkSentence(h.ranks[0].compressed.sentence).ok, true);
  });

  test('compression tells the truth about what it folded away', () => {
    const many = Array.from({ length: 10 }, (_, i) => waiting('parked', { id: `P${i}` }));
    const h = home(truthOf(...many), { now: NOW });
    assert.match(h.ranks[0].compressed.sentence, /set aside/);
  });

  test('the most important thing is never the thing compressed away', () => {
    const noise = Array.from({ length: 12 }, (_, i) => waiting('parked', { id: `P${i}` }));
    const urgent = waiting('question', { id: 'asked' });
    const h = home(truthOf(...noise, urgent), { now: NOW });

    assert.equal(h.ranks[0].efforts[0].id, 'asked');
    assert.equal(h.focus, 'asked');
  });
});

describe('time is said the way a person says it', () => {
  test('never a number that ticks', () => {
    assert.equal(ago(20_000), 'just now');
    assert.equal(ago(60_000), 'a minute ago');
    assert.equal(ago(11 * 60_000), 'ten minutes ago');
    assert.equal(ago(60 * 60_000), 'an hour ago');
    assert.equal(ago(3 * 3600_000), 'three hours ago');
    assert.equal(ago(26 * 3600_000), 'yesterday');
    assert.equal(ago(3 * 24 * 3600_000), 'three days ago');
  });
});

describe('read aloud, in rank order', () => {
  test('the text form carries the same priority a sighted reader sees', () => {
    const h = home(truthOf(
      effort({ id: 'M', state: 'moving', intent: 'port the exporter', summary: 'Still working.' }),
      waiting('question', { id: 'Q', intent: 'add billing' }),
      effort({ id: 'D', state: 'done', intent: 'tidy settings' }),
    ), { now: NOW });

    const lines = asText(h).split('\n').filter(Boolean);
    assert.equal(lines[1], 'WAITING ON YOU');
    assert.ok(lines.indexOf('MOVING') > lines.indexOf('WAITING ON YOU'));
    assert.ok(lines.indexOf('SETTLED') > lines.indexOf('MOVING'));
    assert.ok(lines[2].includes('add billing'), 'the developer\'s words lead');
  });
});
