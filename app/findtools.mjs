/**
 * Making sure the manager can find the commands it depends on.
 *
 * A program started from the Start menu does not inherit the PATH your terminal
 * has. It gets the one Windows hands to the desktop, which is set at sign-in and
 * misses anything installed since — and misses per-user npm folders more often
 * than not.
 *
 * The result is the worst kind of failure: `gh` is plainly installed, works
 * everywhere else, and this app says it is not there. Or worse, says nothing,
 * because a missing command and a command that failed look identical from a
 * distance.
 *
 * So before anything else runs, the places these things actually install into
 * are added to this process's PATH. It affects nothing outside this process and
 * nothing on the computer.
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
