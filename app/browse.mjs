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
 * The file chooser this computer already has.
 *
 * The same argument as the folder one below: Windows has a good one, people
 * know it, and the alternative is a list of every file on a disk rendered by
 * us. It is given the window in front as its owner for the same reason — a
 * dialog that opens behind what you asked it from did not open.
 *
 * Deliberately one file. Offering several at once is a different errand with a
 * different question attached ("as one thing, or as several?"), and guessing
 * which somebody meant is how a transfer arrives in a shape nobody asked for.
 */
export async function chooseFile({ startAt = null } = {}) {
  if (!WINDOWS) {
    return {
      ok: false,
      sentence: 'This computer has no file chooser the manager can open.',
      action: 'Offer the folder the file is in instead.',
    };
  }

  /*
   * Rooted at the computer, always — never at where you happen to be.
   *
   * The fourth argument is the *root* of the tree, not a starting selection,
   * and passing the current folder made it the top of the world: opened from
   * Documents, the chooser showed Documents and nothing above it, with no way
   * to reach another drive. Somebody wanting a folder on D: had to cancel and
   * find another way in.
   *
   * There is no way to ask this chooser to open somewhere and still show
   * everything, so it shows everything. The path box below it is how somebody
   * who knows where they are going gets there in one go.
   */
  const script = `
    Add-Type -AssemblyName System.Windows.Forms
    Add-Type -Namespace Native -Name Win -MemberDefinition '
      [DllImport("user32.dll")] public static extern System.IntPtr GetForegroundWindow();'
    $owner = New-Object System.Windows.Forms.NativeWindow
    $owner.AssignHandle([Native.Win]::GetForegroundWindow())
    $box = New-Object System.Windows.Forms.OpenFileDialog
    $box.Title = 'Choose a file to offer'
    $box.Filter = 'Any file (*.*)|*.*'
    $box.Multiselect = $false
    ${start ? `$box.InitialDirectory = '${start}'` : ''}
    if ($box.ShowDialog($owner) -eq [System.Windows.Forms.DialogResult]::OK) {
      Write-Output $box.FileName
    }
    $owner.ReleaseHandle()
  `;

  try {
    const { stdout } = await run(
      'powershell',
      ['-NoProfile', '-STA', '-ExecutionPolicy', 'Bypass', '-Command', script],
      { windowsHide: true, timeout: 5 * 60 * 1000 },
    );
    const picked = stdout.trim();
    if (!picked) return { ok: false, cancelled: true };
    if (!existsSync(picked)) {
      return {
        ok: false,
        sentence: 'That is not a file on this computer.',
        action: 'Choose a file on one of your drives.',
      };
    }
    return { ok: true, path: picked };
  } catch {
    return {
      ok: false,
      sentence: 'The file chooser would not open.',
      action: 'Offer the folder the file is in instead.',
    };
  }
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
export async function chooseFolder() {
  if (!WINDOWS) {
    return {
      ok: false,
      sentence: 'This computer has no folder chooser the manager can open.',
      action: 'Use the list to click down to the folder instead.',
    };
  }

  /*
   * Windows has two folder choosers and they are not equally good.
   *
   * The one in the forms library is the older tree, it starts at Desktop with
   * no way up to the drives, and it has no owner window — which on this machine
   * meant it opened behind everything and looked like nothing happened at all.
   *
   * This is the other one: the shell's own browser, asked for in its modern
   * form, rooted at the computer so every drive is reachable, and given the
   * window that is in front as its owner so it opens on top of it. Typing a
   * path into it is allowed too, for anyone who would rather.
   */
  const script = `
    Add-Type -Namespace Native -Name Win -MemberDefinition '
      [DllImport("user32.dll")] public static extern System.IntPtr GetForegroundWindow();'
    $owner = [Native.Win]::GetForegroundWindow()
    $shell = New-Object -ComObject Shell.Application
    $NEW_STYLE = 64; $EDIT_BOX = 16; $ONLY_FOLDERS = 1
    $MY_COMPUTER = 17
    $chosen = $shell.BrowseForFolder(
      [int]$owner, 'Choose a project folder',
      $NEW_STYLE -bor $EDIT_BOX -bor $ONLY_FOLDERS,
      $MY_COMPUTER)
    if ($chosen -ne $null) {
      try { Write-Output $chosen.Self.Path } catch { Write-Output '' }
    }
  `;

  try {
    const { stdout } = await run(
      'powershell',
      ['-NoProfile', '-STA', '-ExecutionPolicy', 'Bypass', '-Command', script],
      { windowsHide: true, timeout: 5 * 60 * 1000 },
    );
    const picked = stdout.trim();
    // Some places in this tree are not folders on a disk at all — This PC
    // itself, or a phone plugged in. Those come back with nothing usable, and
    // saying so is better than handing back a path that does not exist.
    if (!picked) return { ok: false, cancelled: true };
    if (!existsSync(picked)) {
      return {
        ok: false,
        sentence: 'That is not a folder on this computer.',
        action: 'Choose a folder on one of your drives.',
      };
    }
    return { ok: true, path: picked, project: looksLikeAProject(picked) };
  } catch {
    return {
      ok: false,
      sentence: 'The folder chooser would not open.',
      action: 'Use the list to click down to the folder instead.',
    };
  }
}
