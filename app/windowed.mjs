/**
 * Is this program a window, or is it a terminal thing?
 *
 * Every Windows program says which of the two it is, in its own header, and has
 * done since 1993. So the manager reads it rather than guessing from the name.
 *
 * This matters more than it sounds. Several of these assistants install a file
 * called `claude.exe` or `codex.exe` that is not a window at all — it is the
 * command-line program, several hundred megabytes of it, sitting in a folder
 * that looks exactly like where a desktop app would live. Offering that as
 * "open in its own window" would start something invisible and look like the
 * button did nothing.
 *
 * Measured rather than argued, which is the house rule.
 */

import { open } from 'node:fs/promises';

const GUI = 2;
const CONSOLE = 3;

/**
 * What kind of program a file is: 'window', 'terminal', or null if the file is
 * not a Windows program at all.
 */
export async function kindOfProgram(path) {
  let file;
  try {
    file = await open(path, 'r');

    // The old DOS header at the front points at the real one.
    const dos = Buffer.alloc(4);
    await file.read(dos, 0, 4, 0x3c);
    const peAt = dos.readUInt32LE(0);

    const signature = Buffer.alloc(4);
    await file.read(signature, 0, 4, peAt);
    if (signature.toString('latin1') !== 'PE\0\0') return null;

    // Past the four-byte signature and the twenty-byte file header is the
    // optional header, and 68 bytes into that is the answer — at the same place
    // whether the program is 32-bit or 64-bit, because everything before it is
    // the same size in both.
    const subsystem = Buffer.alloc(2);
    await file.read(subsystem, 0, 2, peAt + 4 + 20 + 68);

    const which = subsystem.readUInt16LE(0);
    if (which === GUI) return 'window';
    if (which === CONSOLE) return 'terminal';
    return null;
  } catch {
    return null;
  } finally {
    await file?.close();
  }
}

/** Would starting this put a window on screen? */
export async function isWindowed(path) {
  return (await kindOfProgram(path)) === 'window';
}
