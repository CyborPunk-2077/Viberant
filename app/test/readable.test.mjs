/**
 * How much of the picture may show through, and who decides.
 *
 * The rule is that a background is atmosphere and the interface is
 * information: if a scene ever competes with a sentence, the scene is wrong.
 * That rule was being enforced by a guess — the panels were 92% opaque because
 * somebody picked 92, and a note beside them said the scenes were barely
 * visible and that this was the price of being readable.
 *
 * It was not the price. Measured against the worst case the app actually
 * permits — a pure white point in the scene, directly under a panel, at the
 * lowest covering the slider allows, with the faintest text this design uses —
 * 92% reads at 6.5 to 1 where 4.5 is the line. Eight points of the picture were
 * being spent for nothing.
 *
 * So the number is now held here instead of guessed: whatever the panels are,
 * the faintest text on them must still clear 4.5 to 1 in that worst case, with
 * enough margin that it is not sitting on the line. Anybody who wants more of
 * the picture may have it, up to the point where a sentence gets harder to
 * read, and this says where that point is.
 */

import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

let css;
before(async () => { css = await readFile(join(here, '..', 'ui', 'style.css'), 'utf8'); });

/** The dark palette these looks fall back to, read out of the stylesheet. */
function baseColours(text) {
  // The first block, which is `:root, [data-theme="dark"]` — the one every
  // look that does not state a colour of its own falls back to.
  const block = /:root,\s*\[data-theme="dark"\]\s*\{([\s\S]*?)\}/.exec(text);
  if (!block) throw new Error('the fallback palette is not where this expects it');
  const out = {};
  for (const one of block[1].matchAll(/(--[\w-]+)\s*:\s*(#[0-9a-f]{6})/gi)) out[one[1]] = one[2];
  return out;
}

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

const luminance = (c) => {
  const s = c.map((v) => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * s[0] + 0.7152 * s[1] + 0.0722 * s[2];
};

const contrast = (a, b) => {
  const l1 = luminance(a);
  const l2 = luminance(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
};

/** What a panel over the worst part of a scene actually comes out as. */
function panelOver(card, opacity, { dim }) {
  // The brightest thing any scene can put behind a panel: a white star.
  const scene = [255, 255, 255].map((c) => c * (1 - dim));
  return card.map((c, i) => c * opacity + scene[i] * (1 - opacity));
}

/** Every `.has-wall` surface and how opaque it is, out of the stylesheet. */
function surfaces(text) {
  const out = [];
  const bare = text.replace(/\/\*[\s\S]*?\*\//g, ' ');
  for (const m of bare.matchAll(
    /\.has-wall[^{]*\{[^}]*color-mix\(in srgb,\s*var\((--[\w-]+)\)\s*(\d+)%/g)) {
    out.push({ from: m[1], opacity: Number(m[2]) / 100 });
  }
  return out;
}

/**
 * The faintest thing that sits *directly* on each surface.
 *
 * Read off the running page rather than assumed. It matters which: the rail
 * carries small labels, the top bar carries only the name of where you are, and
 * a row carries secondary text. Holding every surface to the dimmest colour in
 * the whole design would fail things that are not on it, and holding them all
 * to the brightest would pass things that are.
 */
const FAINTEST_ON = {
  nav: '--quiet',
  '--card': '--quiet',
  '--page': '--ink',
};

describe('a scene may never make a sentence harder to read', () => {
  test('the faintest text clears the line in the worst case the app permits', () => {
    const colours = baseColours(css);

    // The lowest covering the slider offers, which anybody may choose.
    const worst = { dim: 0.20 };

    const found = surfaces(css);
    assert.ok(found.length >= 3, `only found ${found.length} surfaces to check`);

    for (const { from, opacity } of found) {
      const base = rgb(colours[from] ?? colours['--card']);
      const text = rgb(colours[FAINTEST_ON[from] ?? '--quiet']);
      const over = panelOver(base, opacity, worst);
      const reads = contrast(text, over);
      assert.ok(reads >= 4.5,
        `${from} at ${Math.round(opacity * 100)}% puts ${FAINTEST_ON[from] ?? '--quiet'} at ${reads.toFixed(1)} to 1, and 4.5 is the line`);
    }
  });

  /**
   * The colour that could not afford a background, written down.
   *
   * `--faint` sits at 4.47 to 1 on an opaque card — the line, to two decimal
   * places, and deliberate. It follows that it can never clear the line with
   * anything showing through behind it, at any opacity that still shows a
   * picture. That is not a bug to be fixed by tuning; it is arithmetic, and the
   * answer was to stop using it on a see-through surface.
   */
  test('the colour that cannot survive a background is not used on one', () => {
    const colours = baseColours(css);
    const onCard = contrast(rgb(colours['--faint']), rgb(colours['--card']));
    assert.ok(onCard < 5,
      `--faint reads at ${onCard.toFixed(2)} on an opaque card, so this test is checking something that moved`);

    // And so it is lifted wherever a scene is behind it.
    assert.match(css, /\.has-wall .rail .label-tiny\s*\{\s*color:\s*var\(--quiet\)/,
      'the rail labels are --faint, which cannot be read over any scene');
  });

  test('and it is not sitting on the line, so a darker scene has room', () => {
    const colours = baseColours(css);
    const quiet = rgb(colours['--quiet']);
    const panels = surfaces(css).filter((s) => s.from === '--card');

    for (const { opacity } of panels) {
      const reads = contrast(quiet, panelOver(rgb(colours['--card']), opacity, { dim: 0.20 }));
      assert.ok(reads >= 5.0,
        `a panel at ${Math.round(opacity * 100)}% reads at ${reads.toFixed(1)} to 1 — passing, but with nothing left over`);
    }
  });

  test('the picture is genuinely showing through, not merely allowed to', () => {
    // The other half of the same rule. A panel at 96% is readable and pointless.
    for (const { from, opacity } of surfaces(css)) {
      assert.ok(opacity <= 0.9,
        `${from} at ${Math.round(opacity * 100)}% is opaque enough that there is no reason to draw a scene behind it`);
    }
  });
});

describe('the look for a picture of your own falls back on purpose', () => {
  test('it has no palette of its own, and takes the dark one', () => {
    // Deliberate rather than missing: the picture is the variable here, and a
    // palette tuned to one photograph would be wrong for the next one.
    assert.equal(/\[data-theme="yours"\]/.test(css), false,
      'if this ever gets its own block, it needs the full set like every other look');

    const colours = baseColours(css);
    for (const needed of ['--page', '--card', '--ink', '--quiet', '--live', '--trouble']) {
      assert.ok(colours[needed], `the fallback palette has no ${needed}, so a picture look would inherit nothing`);
    }
  });
});
