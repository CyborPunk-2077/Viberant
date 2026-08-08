/**
 * The icon, and the fact that it is the app's own mark.
 *
 * It wore Electron's default for the whole of this project's life, and the note
 * said it needed a drawing rather than code. It needed a drawing; it did not
 * need a drawing *program*. The mark already existed — the rounded square with
 * a violet gradient and a V — so the icon is that, generated.
 *
 * Two things are worth holding. The first is that the file is a real icon:
 * writing the ICO container by hand is the kind of thing that produces a file
 * Windows quietly refuses, and "quietly refuses" is how it wore the default for
 * so long. The second is that it still reads at sixteen pixels, which is where
 * an icon spends most of its life and where scaling the large one straight down
 * makes the V very nearly disappear.
 */

import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const build = join(here, '..', '..', 'build');

let maker;
before(async () => { maker = await import('../../build/icon.mjs'); });

describe('the icon file is one Windows will actually take', () => {
  test('it is there at all, which is the whole of what was missing', () => {
    assert.equal(existsSync(join(build, 'icon.ico')), true,
      'run `npm run icon` — the build does it too');
    assert.equal(existsSync(join(build, 'icon.png')), true);
  });

  test('the container says what it is and holds every size', async () => {
    const ico = await readFile(join(build, 'icon.ico'));

    assert.equal(ico.readUInt16LE(0), 0, 'the reserved field must be zero');
    assert.equal(ico.readUInt16LE(2), 1, 'an icon rather than a cursor');

    const count = ico.readUInt16LE(4);
    assert.equal(count, maker.SIZES.length);

    const found = [];
    for (let i = 0; i < count; i += 1) {
      const at = 6 + i * 16;
      // 256 is written as zero: the field is one byte and 256 does not fit.
      found.push(ico[at] === 0 ? 256 : ico[at]);

      const length = ico.readUInt32LE(at + 8);
      const offset = ico.readUInt32LE(at + 12);
      assert.ok(offset + length <= ico.length,
        'an entry points past the end of the file, which Windows reads as damaged');

      // Every entry holds a whole PNG, which is what makes this small.
      const signature = ico.subarray(offset, offset + 8);
      assert.deepEqual([...signature], [137, 80, 78, 71, 13, 10, 26, 10],
        'that entry is not a picture');
    }
    assert.deepEqual(found, maker.SIZES);
    assert.ok(found.includes(16) && found.includes(256),
      'the two that matter are the smallest and the largest');
  });

  test('the pictures inside say the size the directory claims for them', async () => {
    const ico = await readFile(join(build, 'icon.ico'));
    const count = ico.readUInt16LE(4);

    for (let i = 0; i < count; i += 1) {
      const at = 6 + i * 16;
      const claimed = ico[at] === 0 ? 256 : ico[at];
      const offset = ico.readUInt32LE(at + 12);

      // The first chunk of a PNG is always the header, and it carries the size.
      const width = ico.readUInt32BE(offset + 16);
      const height = ico.readUInt32BE(offset + 20);
      assert.equal(width, claimed, `the directory says ${claimed} and the picture says ${width}`);
      assert.equal(height, claimed);
      assert.equal(ico[offset + 24], 8, 'eight bits per channel');
      assert.equal(ico[offset + 25], 6, 'and an alpha channel, or the corners are black');
    }
  });
});

describe('it is still the mark at the size an icon actually lives at', () => {
  /** How much of the picture the white letter takes up, as a fraction. */
  const howMuchIsLetter = (size) => {
    const px = maker.draw(size);
    let letter = 0;
    let solid = 0;
    for (let i = 0; i < px.length; i += 4) {
      if (px[i + 3] < 128) continue;
      solid += 1;
      // The letter is what has been pulled towards white; the square is not.
      if (px[i] > 200 && px[i + 1] > 200 && px[i + 2] > 220) letter += 1;
    }
    return letter / solid;
  };

  /**
   * A mark drawn smaller must not get lighter.
   *
   * This is the rule that separates a drawn icon from a scaled one, and picking
   * it took measuring rather than guessing. A first version of this test asked
   * only that the V be more than a twentieth of the picture at 16px — which the
   * badly scaled version also passes, at 6.0% against 10.3%. It proved nothing,
   * and that was found by deliberately removing the fix and watching it pass.
   *
   * The honest rule: as a picture gets smaller, a thin stroke fades, so the
   * letter has to take up *at least* as much of the mark at 16 pixels as it
   * does at 256. Scaling the large one straight down gives 6.0% against 8.7%
   * and fails. Drawing the small ones heavier gives 10.3% and passes.
   */
  test('the V takes up at least as much of the mark at 16 pixels as at 256', () => {
    const small = howMuchIsLetter(16);
    const large = howMuchIsLetter(256);
    assert.ok(small >= large,
      `the V is ${(small * 100).toFixed(1)}% of the mark at 16px and ${(large * 100).toFixed(1)}% at 256px — a stroke that thin fades, so the small sizes have to be drawn heavier rather than scaled`);
  });

  test('and it is about the same weight at every size, so it reads as one mark', () => {
    const at = maker.SIZES.map((s) => howMuchIsLetter(s));
    const least = Math.min(...at);
    const most = Math.max(...at);
    assert.ok(most / least < 1.6,
      `the V is ${(least * 100).toFixed(1)}% of the mark at one size and ${(most * 100).toFixed(1)}% at another, which is two marks rather than one`);
  });

  test('the corners are transparent, or it is a square on every background', () => {
    const px = maker.draw(64);
    const corner = (x, y) => px[(y * 64 + x) * 4 + 3];
    for (const [x, y] of [[0, 0], [63, 0], [0, 63], [63, 63]]) {
      assert.equal(corner(x, y), 0, `the corner at ${x},${y} is not transparent`);
    }
    // And the middle is not.
    assert.equal(px[(32 * 64 + 32) * 4 + 3], 255);
  });
});

describe('the app wears it, rather than only shipping it', () => {
  test('the window and the tray both ask for the same picture', async () => {
    const main = await readFile(join(here, '..', '..', 'desktop', 'main.js'), 'utf8');
    assert.match(main, /icon:\s*theMark\(\)/, 'the window does not wear it');
    assert.match(main, /theMark\(\)\?\.resize/, 'the tray does not wear it');
    assert.match(main, /build', 'icon\.png'/, 'and it must be the generated one');
  });

  test('the build makes it before packaging, so it can never be stale', async () => {
    const pkg = JSON.parse(await readFile(join(here, '..', '..', 'package.json'), 'utf8'));
    assert.match(pkg.scripts.build, /icon\.mjs/,
      'the build must draw the icon, or it ships whatever was last left in build/');
    assert.equal(pkg.build.win.icon, 'build/icon.ico');
  });
});
