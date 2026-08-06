/**
 * Picking a folder by looking at it.
 *
 * Typing a path is a small thing that goes wrong in a lot of ways: a backslash
 * the wrong way round, a folder renamed last week, a space you cannot see. So
 * this offers two ways to point at a folder and neither of them is typing.
 *
 *   walk   — the manager lists what is inside a folder and you click down into
 *            it. Works everywhere, including inside its own window.
 *   dialog — the folder chooser Windows itself puts up. Familiar, and it
 *            remembers where you were last.
 *
 * Nothing here writes anything. It reads folder names and says which of them
 * look like projects.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve, dirname, parse } from 'node:path';
import { homedir, platform } from 'node:os';

const run = promisify(execFile);
const WINDOWS = platform() === 'win32';

/** The places worth starting from, so the first click is never into nothing. */
export async function starts() {
  const home = homedir();
  const guesses = [
    { name: 'Home', path: home },
    { name: 'Desktop', path: join(home, 'Desktop') },
    { name: 'Documents', path: join(home, 'Documents') },
    { name: 'Downloads', path: join(home, 'Downloads') },
  ];
  const places = guesses.filter((p) => existsSync(p.path));

  for (const d of await drives()) places.push({ name: d, path: d });
  return places;
}

/** Every drive on this computer. Empty anywhere that does not have the idea. */
export async function drives() {
  if (!WINDOWS) return ['/'];
  const found = [];
  for (const letter of 'CDEFGHIJKLMNOPQRSTUVWXYZAB') {
    const root = `${letter}:\\`;
    try { await stat(root); found.push(root); } catch { /* no such drive */ }
  }
  return found;
}

/** Does this folder look like something you would work on? */
export function looksLikeAProject(dir) {
  return existsSync(join(dir, '.git'))
    || existsSync(join(dir, 'package.json'))
    || existsSync(join(dir, 'pyproject.toml'))
    || existsSync(join(dir, 'Cargo.toml'))
    || existsSync(join(dir, 'go.mod'))
    || existsSync(join(dir, 'pom.xml'))
    || existsSync(join(dir, 'index.html'));
}

/**
 * What is inside a folder.
 *
 * Folders only — you are choosing a place, not a file — and hidden ones are
 * left out unless you ask, because a list of forty dot-folders is not a list
 * anybody reads.
 */
export async function look(at, { hidden = false } = {}) {
  const dir = at ? resolve(at) : homedir();

  if (!existsSync(dir)) {
    return {
      ok: false,
      sentence: 'That folder is not there any more.',
      action: 'Go up a level and look again.',
      at: dir,
    };
  }

  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return {
      ok: false,
      sentence: 'This computer will not let the manager look inside that folder.',
      action: 'Pick a different one.',
      at: dir,
    };
  }

  const folders = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    if (!hidden && (e.name.startsWith('.') || e.name.startsWith('$'))) continue;
    const path = join(dir, e.name);
    folders.push({ name: e.name, path, project: looksLikeAProject(path) });
  }
  folders.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

  const root = parse(dir).root;
  return {
    ok: true,
    at: dir,
    up: dir === root ? null : dirname(dir),
    project: looksLikeAProject(dir),
    folders,
  };
}

/**
 * The folder chooser this computer already has.
 *
 * Windows has a perfectly good one and people know it, so on Windows we use it
 * rather than reinventing it. It is put in front of everything else on purpose —
 * a dialog that opens behind the window you asked it from is the same as a
 * dialog that did not open.
 *
 * Anywhere else, and any time this fails, the answer is honest: use the list.
 */
export async function chooseFolder({ startAt = null } = {}) {
  if (!WINDOWS) {
    return {
      ok: false,
      sentence: 'This computer has no folder chooser the manager can open.',
      action: 'Use the list to click down to the folder instead.',
    };
  }

  const script = `
    Add-Type -AssemblyName System.Windows.Forms | Out-Null
    $d = New-Object System.Windows.Forms.FolderBrowserDialog
    $d.Description = 'Choose a project folder'
    $d.ShowNewFolderButton = $true
    ${startAt ? `$d.SelectedPath = '${String(startAt).replace(/'/g, "''")}'` : ''}
    $top = New-Object System.Windows.Forms.Form
    $top.TopMost = $true
    $top.ShowInTaskbar = $false
    if ($d.ShowDialog($top) -eq [System.Windows.Forms.DialogResult]::OK) { Write-Output $d.SelectedPath }
    $top.Dispose()
  `;

  try {
    const { stdout } = await run(
      'powershell',
      ['-NoProfile', '-STA', '-ExecutionPolicy', 'Bypass', '-Command', script],
      { windowsHide: true, timeout: 5 * 60 * 1000 },
    );
    const picked = stdout.trim();
    if (!picked) return { ok: false, cancelled: true };
    return { ok: true, path: picked, project: looksLikeAProject(picked) };
  } catch {
    return {
      ok: false,
      sentence: 'The folder chooser would not open.',
      action: 'Use the list to click down to the folder instead.',
    };
  }
}
