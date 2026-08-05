/**
 * The vocabulary contract, as running code.
 *
 * The constitution's non-negotiable — "no version-control vocabulary on any
 * primary surface, ever" — was previously a rule people were expected to
 * remember. Decision D-8 made summaries machine-generated, which means the
 * rule now has to be enforced against text no human reviewed. So it lives here,
 * as a validator every sentence passes before it can become a summary or a
 * reason.
 *
 * This also gives MVP release criterion 11.8 ("a full-product vocabulary audit
 * finds zero version-control terms") something to audit against, automatically,
 * from the first commit rather than the last week.
 */

/**
 * Terms that may never appear in any sentence the product shows.
 * Unambiguous version-control vocabulary only.
 */
export const FORBIDDEN = [
  'commit', 'commits', 'committed', 'committing',
  'branch', 'branches', 'branched', 'branching',
  'merge', 'merged', 'merging', 'merges',
  'rebase', 'rebased', 'rebasing',
  'stash', 'stashed', 'stashing',
  'checkout', 'checked out',
  'push', 'pushed', 'pushing',
  'pull request', 'pull-request',
  'worktree', 'worktrees', 'work tree',
  'repository', 'repositories', 'repo', 'repos',
  'staging area', 'staged', 'unstaged',
  'detached head', 'head',
  'cherry-pick', 'cherry pick',
  'submodule', 'submodules',
  'upstream', 'downstream',
  'origin/', 'refspec', 'reflog',
  'sha', 'commit hash', 'revision',
  'git',
];

/**
 * Terms that are usually fine in ordinary English but are also version-control
 * vocabulary. These do not fail validation; they are reported so a human can
 * glance at them. Being noisy here is cheaper than being wrong on a surface.
 */
export const SUSPECT = [
  'conflict', 'conflicts', 'remote', 'index', 'tree', 'tag', 'tags',
  'diff', 'patch', 'revert', 'clone', 'fetch', 'blame',
];

/**
 * The closed lexicon: the only product-specific terms surfaces may use.
 * Everything else must be ordinary English, or the developer's own words.
 * Extending this list is a constitution-level decision (Design System §18.3).
 *
 * `send` and `the shared copy` were added by decision D-1.
 */
export const LEXICON = [
  'effort', 'efforts',
  'moving',
  'waiting on you',
  'done',
  'arrived',
  'accept', 'accepted',
  'redirect', 'redirected',
  'let go',
  'send', 'sent',
  'the shared copy',
];

const WORD_BOUNDARY = /[a-z0-9]+(?:[-'][a-z0-9]+)*/g;

/**
 * Check one sentence against the contract.
 *
 * @param {string} sentence
 * @returns {{ok: boolean, forbidden: string[], suspect: string[], problems: string[]}}
 */
export function checkSentence(sentence) {
  const problems = [];
  const lower = String(sentence).toLowerCase();

  const forbidden = FORBIDDEN.filter((term) => containsTerm(lower, term));
  const suspect = SUSPECT.filter((term) => containsTerm(lower, term));

  for (const term of forbidden) {
    problems.push(`uses forbidden term "${term}"`);
  }

  // Shape rules. The product's voice is one plain sentence in an honest clerk's
  // register — not a log line, not an exception, not an announcement.
  const trimmed = String(sentence).trim();
  if (trimmed.length === 0) problems.push('is empty');
  if (trimmed.length > 160) problems.push(`is ${trimmed.length} characters; one sentence should be at most 160`);
  if (/[!]/.test(trimmed)) problems.push('contains an exclamation mark');
  if (/\b[A-Z]{3,}\b/.test(trimmed)) problems.push('contains shouting capitals');
  if (/\b(error|exception|failed with|errno|stacktrace|traceback)\b/i.test(trimmed)) {
    problems.push('reads as machine error text rather than a plain sentence');
  }
  if (/^\s*\d+\s+files?\b/i.test(trimmed)) {
    problems.push('leads with a file count rather than meaning');
  }

  return { ok: problems.length === 0, forbidden, suspect, problems };
}

function containsTerm(lowerText, term) {
  if (term.includes(' ') || term.includes('/')) return lowerText.includes(term);
  const words = lowerText.match(WORD_BOUNDARY) ?? [];
  return words.includes(term);
}

/**
 * Assert a sentence is fit to show. Used at the boundary where machine-written
 * text enters domain truth: a sentence that fails is never displayed, it is
 * regenerated once and then replaced by a template (decision D-8).
 *
 * @throws {LexiconViolation}
 */
export function requireSpeakable(sentence, where = 'sentence') {
  const result = checkSentence(sentence);
  if (!result.ok) throw new LexiconViolation(where, sentence, result.problems);
  return sentence;
}

export class LexiconViolation extends Error {
  constructor(where, sentence, problems) {
    super(`${where} violates the vocabulary contract: ${problems.join('; ')}`);
    this.name = 'LexiconViolation';
    this.sentence = sentence;
    this.problems = problems;
  }
}

/**
 * Audit a whole corpus of sentences at once — the mechanical form of MVP
 * release criterion 11.8.
 *
 * @param {Array<{where: string, sentence: string}>} entries
 */
export function audit(entries) {
  const failures = [];
  const warnings = [];
  for (const { where, sentence } of entries) {
    const r = checkSentence(sentence);
    if (!r.ok) failures.push({ where, sentence, problems: r.problems });
    if (r.suspect.length) warnings.push({ where, sentence, suspect: r.suspect });
  }
  return { clean: failures.length === 0, failures, warnings };
}
