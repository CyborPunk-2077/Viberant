/**
 * The icon, drawn rather than shipped.
 *
 * It wore Electron's default until now, and the note said this needs a drawing
 * rather than code. It needs a drawing; it does not need a *drawing program*.
 * The mark already exists — the rounded square with a violet gradient and a V
 * that sits at the top of the rail and on the opening — and the whole point of
 * having a mark is that the icon is the same one. So this is that mark, at the
 * five sizes Windows asks for, written out as an icon file.
 *
 * Zero dependencies, like everything else here. That means writing two file
 * formats by hand, and both are small:
 *
 *   **PNG** is a signature, then chunks. Each chunk is a length, a four-letter
 *   name, its bytes, and a checksum. The pixels go in one chunk, compressed by
 *   `zlib`, with a filter byte at the start of every row saying how that row was
 *   encoded — zero, meaning "as it is", which is the honest and simple choice.
 *
 *   **ICO** is a header, then one directory entry per size, then the images. An
 *   entry may hold a whole PNG rather than a bitmap, which every Windows since
 *   Vista understands, and which is why this is a hundred lines rather than a
 *   thousand.
 *
 * Run it: `node build/icon.mjs`. It writes `build/icon.ico`, which is what
 * electron-builder looks for.
 */

import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

/** The two ends of the gradient, taken from the look the app is designed in. */
const VIBE_A = [124, 92, 252];
const VIBE_B = [155, 125, 255];

/** The sizes Windows actually reaches for, smallest to largest. */
const SIZES = [16, 24, 32, 48, 64, 128, 256];

// ---------------------------------------------------------------------------
// Drawing it
// ---------------------------------------------------------------------------

const mix = (a, b, t) => a.map((one, i) => Math.round(one + (b[i] - one) * t));

/**
 * How far a point is from a line segment.
 *
 * The V is two strokes with rounded ends, and a rounded stroke is exactly the
 * set of points within half its width of the line. So the whole letter is this
 * function twice, which is both the shortest way to draw it and the one that
 * gives clean edges at sixteen pixels across without any special casing.
 */
function distanceToLine(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const along = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  const cx = ax + along * dx;
  const cy = ay + along * dy;
  return Math.hypot(px - cx, py - cy);
}

/** How far a point is outside a rounded square. Negative means inside. */
function outsideRounded(px, py, left, top, right, bottom, radius) {
  const cx = Math.max(left + radius, Math.min(right - radius, px));
  const cy = Math.max(top + radius, Math.min(bottom - radius, py));
  return Math.hypot(px - cx, py - cy) - radius;
}

/**
 * One size of the mark, as raw pixels.
 *
 * Sampled four times across and four down per pixel rather than once. A curve
 * decided by a single sample in the middle of each pixel has a staircase along
 * it, and at sixteen pixels a staircase is most of what you see.
 */
function draw(size) {
  const px = Buffer.alloc(size * size * 4);
  const unit = size / 32;

  /**
   * The same mark, adjusted by eye at the small sizes.
   *
   * Scaling the page's numbers straight down puts the V's stroke at 1.3 pixels
   * across in a 16-pixel icon, and it very nearly disappears — which is where
   * an icon spends most of its life, in a taskbar and a title bar. So below 48
   * the stroke thickens, the corners round less, and the square grows into its
   * space. This is what every icon set does and it is not cheating: the mark
   * that reads correctly is the one that is correct.
   *
   * Measured, not guessed — each size was drawn, blown up so every pixel
   * showed, and looked at.
   */
  const small = Math.max(0, Math.min(1, (48 - size) / 32));
  const inset = 2 - small * 0.9;
  const corner = 9 - small * 2.2;

  const box = {
    left: inset * unit,
    top: inset * unit,
    right: (32 - inset) * unit,
    bottom: (32 - inset) * unit,
    radius: corner * unit,
  };
  const stroke = (2.6 + small * 1.5) * unit;
  const v = {
    ax: (10 - small * 0.5) * unit,
    ay: 11.5 * unit,
    mx: 16 * unit,
    my: (21 + small * 0.4) * unit,
    bx: (22 + small * 0.5) * unit,
    by: 11.5 * unit,
  };

  const STEPS = 4;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let inBox = 0;
      let inLetter = 0;

      for (let sy = 0; sy < STEPS; sy += 1) {
        for (let sx = 0; sx < STEPS; sx += 1) {
          const fx = x + (sx + 0.5) / STEPS;
          const fy = y + (sy + 0.5) / STEPS;

          if (outsideRounded(fx, fy, box.left, box.top, box.right, box.bottom, box.radius) <= 0) inBox += 1;

          const toLetter = Math.min(
            distanceToLine(fx, fy, v.ax, v.ay, v.mx, v.my),
            distanceToLine(fx, fy, v.mx, v.my, v.bx, v.by),
          );
          if (toLetter <= stroke / 2) inLetter += 1;
        }
      }

      const total = STEPS * STEPS;
      const solid = inBox / total;
      const letter = (inLetter / total) * solid;

      // Down the diagonal, which is where a gradient reads as light falling
      // rather than as a colour change.
      const along = (x / size + y / size) / 2;
      const base = mix(VIBE_A, VIBE_B, along);
      // The letter is white at the same strength the page draws it.
      const colour = base.map((one) => Math.round(one + (255 - one) * letter * 0.92));

      const at = (y * size + x) * 4;
      px[at] = colour[0];
      px[at + 1] = colour[1];
      px[at + 2] = colour[2];
      px[at + 3] = Math.round(solid * 255);
    }
  }
  return px;
}

// ---------------------------------------------------------------------------
// Writing a PNG
// ---------------------------------------------------------------------------

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(bytes) {
  let c = 0xFFFFFFFF;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function chunk(name, body) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(body.length);
  const named = Buffer.concat([Buffer.from(name, 'ascii'), body]);
  const check = Buffer.alloc(4);
  check.writeUInt32BE(crc32(named));
  return Buffer.concat([length, named, check]);
}

function toPng(size, px) {
  // One filter byte per row, saying how the row is encoded. Zero: as it is.
  const rows = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y += 1) {
    const at = y * (size * 4 + 1);
    rows[at] = 0;
    px.copy(rows, at + 1, y * size * 4, (y + 1) * size * 4);
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;   // eight bits per channel
  header[9] = 6;   // colour with an alpha channel
  header[10] = 0;  // deflate, the only compression PNG has
  header[11] = 0;  // the only filtering method
  header[12] = 0;  // not interlaced

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(rows, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------------------
// Writing an ICO
// ---------------------------------------------------------------------------

function toIco(images) {
  const head = Buffer.alloc(6);
  head.writeUInt16LE(0, 0);              // reserved
  head.writeUInt16LE(1, 2);              // an icon rather than a cursor
  head.writeUInt16LE(images.length, 4);

  const entries = [];
  let at = 6 + images.length * 16;

  for (const { size, png } of images) {
    const entry = Buffer.alloc(16);
    // 256 is written as zero, because the field is one byte and 256 does not
    // fit in one. Everybody agrees zero means the largest.
    entry[0] = size >= 256 ? 0 : size;
    entry[1] = size >= 256 ? 0 : size;
    entry[2] = 0;                        // not a palette
    entry[3] = 0;                        // reserved
    entry.writeUInt16LE(1, 4);           // one plane
    entry.writeUInt16LE(32, 6);          // bits per pixel
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(at, 12);
    entries.push(entry);
    at += png.length;
  }

  return Buffer.concat([head, ...entries, ...images.map((i) => i.png)]);
}

// ---------------------------------------------------------------------------

const images = SIZES.map((size) => ({ size, png: toPng(size, draw(size)) }));
const ico = toIco(images);

writeFileSync(join(here, 'icon.ico'), ico);
// The same mark on its own, for anywhere that wants one picture rather than an
// icon file — a page, a listing, a shortcut somewhere that is not Windows.
writeFileSync(join(here, 'icon.png'), images.find((i) => i.size === 256).png);

console.log(`icon.ico  ${SIZES.join(', ')} px  ${(ico.length / 1024).toFixed(1)} KB`);
console.log(`icon.png  256 px  ${(images.at(-1).png.length / 1024).toFixed(1)} KB`);

export { draw, toPng, toIco, SIZES };
