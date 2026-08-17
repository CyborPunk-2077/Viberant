/**
 * Getting this process's own surroundings right, before it starts anything.
 *
 * Two faults live here, and they are the same fault twice: the manager inherited
 * something from however it was launched, and it was not fit to use as it stood.
 * Once it was too narrow to find things with. Once it was too wide to pass on.
 * Both were invisible from a terminal, which is where all the testing happened.
 *
 * **Too narrow — the PATH.** A program started from the Start menu does not
 * inherit the PATH your terminal has. It gets the one Windows hands to the
 * desktop, which is set at sign-in and misses anything installed since — and
 * misses per-user npm folders more often than not.
 *
 * The result is the worst kind of failure: `gh` is plainly installed, works
 * everywhere else, and this app says it is not there. Or worse, says nothing,
 * because a missing command and a command that failed look identical from a
 * distance.
 *
 * So before anything else runs, the places these things actually install into
 * are added to this process's PATH. It affects nothing outside this process and
 * nothing on the computer.
 *
 * **Too wide — the marks our own window left.** Explained where it is cleared,
 * below, because it takes a paragraph and deserves one.
 */

import { existsSync } from 'node:fs';
import { join, delimiter } from 'node:path';
import { homedir, platform } from 'node:os';

const WINDOWS = platform() === 'win32';

/** Where the things this manager leans on put themselves. */
function likelyPlaces() {
  if (!WINDOWS) return ['/usr/local/bin', join(homedir(), '.local', 'bin')];

  const home = homedir();
  const local = process.env.LOCALAPPDATA ?? join(home, 'AppData', 'Local');
  const roaming = process.env.APPDATA ?? join(home, 'AppData', 'Roaming');
  const programs = process.env.PROGRAMFILES ?? 'C:\\Program Files';
  const programsX86 = process.env['PROGRAMFILES(X86)'] ?? 'C:\\Program Files (x86)';

  return [
    join(programs, 'GitHub CLI'),
    join(programsX86, 'GitHub CLI'),
    join(programs, 'Git', 'cmd'),
    join(programs, 'Git', 'bin'),
    join(programs, 'nodejs'),
    join(roaming, 'npm'),
    join(local, 'Programs', 'Python', 'Python312', 'Scripts'),
    join(local, 'Microsoft', 'WindowsApps'),
    // Where Aider lands. Its installer puts the command in this folder and says
    // out loud that the folder is not on the PATH, which on Windows stays true
    // for everything already running — so without this, installing Aider ends
    // by saying it is installed while this page goes on saying it is missing.
    join(home, '.local', 'bin'),
    join(home, '.bun', 'bin'),
    join(home, 'scoop', 'shims'),
    join(local, 'Programs', 'cursor', 'resources', 'app', 'bin'),
    join(local, 'Programs', 'Microsoft VS Code', 'bin'),
    join(local, 'Programs', 'antigravity', 'bin'),
  ];
}

/**
 * Widen this process's PATH to include anywhere these tools really live.
 *
 * Returns what was added, so it can be said out loud if somebody asks why a
 * command was found that the terminal cannot see.
 */
export function widenPath() {
  const already = new Set(
    (process.env.PATH ?? '').split(delimiter).filter(Boolean).map((p) => p.toLowerCase()),
  );

  const added = [];
  for (const place of likelyPlaces()) {
    if (!place || already.has(place.toLowerCase()) || !existsSync(place)) continue;
    added.push(place);
    already.add(place.toLowerCase());
  }

  if (added.length) {
    process.env.PATH = `${process.env.PATH ?? ''}${delimiter}${added.join(delimiter)}`;
  }
  return added;
}

/**
 * Marks left on this process by the window it was started from, which must not
 * be passed on to anything the manager starts.
 *
 * This is the whole of a fault that took a long time to find, and it is worth
 * writing down properly because nothing about it looks like what it is.
 *
 * When Viberant runs as a window of its own, the window starts the manager with
 * one instruction in its surroundings: *be plain Node, not a window*. That is
 * how the manager runs on a computer with no Node installed, and it is correct.
 * The instruction is read once, at the instant that process starts, and after
 * that it means nothing — except that it is still sitting there, and everything
 * the manager starts inherits it.
 *
 * Several of the apps in this list are built the same way underneath. Handed
 * that instruction, they obediently do not put a window up. From where you are
 * sitting: you press Open, and nothing happens. No error, no window, nothing —
 * and only when Viberant is run from its own window, never from a terminal,
 * which is why it survived being tested.
 *
 * Cleared here, once, before anything is started. It has already done its work.
 */
const NOT_OURS_TO_PASS_ON = [
  'ELECTRON_RUN_AS_NODE',
  'ELECTRON_NO_ATTACH_CONSOLE',
  'ELECTRON_NO_ASAR',
  'ELECTRON_FORCE_IS_PACKAGED',
  'ELECTRON_DEFAULT_ERROR_MODE',
];

export function stopPassingOnOurOwnSurroundings() {
  const cleared = [];
  for (const name of NOT_OURS_TO_PASS_ON) {
    if (process.env[name] === undefined) continue;
    delete process.env[name];
    cleared.push(name);
  }
  return cleared;
}
