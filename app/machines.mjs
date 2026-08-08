/**
 * What one computer is, so two of them can be compared.
 *
 * The question this exists for is the one everybody has actually asked out
 * loud: *why does this work on my machine and not on theirs?* It is nearly
 * always answerable from a short list of facts — a different Node, a different
 * package manager, a setting one machine has a name for and the other does not
 * — and nearly always answered by two people reading version numbers to each
 * other down a phone.
 *
 * So this collects that list, on each computer, and puts the two side by side.
 *
 * **Names, never values.** The single most useful line in the comparison is
 * "this machine has a setting called `DATABASE_URL` and that one does not", and
 * the single most damaging thing this could do is say what it is. Every
 * environment fact here is a name. There is no code path that reads a value,
 * and a test asserts it.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { platform, release, arch, cpus, totalmem, hostname } from 'node:os';

import * as providers from './providers.mjs';

const run = promisify(execFile);
const quiet = async (fn, fallback = null) => { try { return await fn(); } catch { return fallback; } };

/** The version of one command, or nothing if it is not here. */
async function versionOf(command, args = ['--version']) {
  const out = await quiet(() => run(command, args, { timeout: 5000, windowsHide: true }));
  if (!out) return null;
  const said = `${out.stdout ?? ''}${out.stderr ?? ''}`.trim();
  const m = /(\d+\.\d+(?:\.\d+)?)/.exec(said);
  return m ? m[1] : (said.split('\n')[0]?.slice(0, 40) || null);
}

/** How this computer names itself, in words rather than in codes. */
function whatKindOfComputer() {
  const named = { win32: 'Windows', darwin: 'macOS', linux: 'Linux' }[platform()] ?? platform();
  return `${named} ${release()}`;
}

/**
 * Everything about this computer worth comparing with another.
 *
 * Deliberately short. A hundred facts is a wall nobody reads; these are the
 * ones that have actually been the answer.
 */
export async function whatThisIs({ dir = null } = {}) {
  const [node, npm, pnpm, yarn, bun, git, python] = await Promise.all([
    Promise.resolve(process.version.replace(/^v/, '')),
    versionOf('npm'),
    versionOf('pnpm'),
    versionOf('yarn'),
    versionOf('bun'),
    versionOf('git'),
    versionOf('python', ['--version']),
  ]);

  const about = {
    name: hostname(),
    kind: whatKindOfComputer(),
    processor: `${arch()}, ${cpus().length} cores`,
    memory: `${Math.round(totalmem() / 1e9)} GB`,
    tools: { Node: node, npm, pnpm, yarn, bun, Git: git, Python: python },
  };

  if (!dir) return about;

  const look = await providers.inspect(dir);
  return {
    ...about,
    project: {
      framework: look?.framework ?? null,
      manager: look?.manager ?? null,
      /**
       * The names a project says it expects, and whether this computer has a
       * file of settings for it at all.
       *
       * Deliberately **not** the names inside that file. Reading them means
       * opening it, and the file with real values in it is never opened
       * anywhere in this product (D-125) — one careless regex between here and
       * a prompt and somebody's key has left the building. "Expects twelve, has
       * a settings file" answers the question almost every time, and the times
       * it does not are worth losing.
       */
      expects: look?.environment?.expected ?? [],
      hasSettingsFile: !!look?.environment?.hasLocalFile,
      canBuild: !!look?.build,
      canRun: !!look?.dev,
    },
  };
}

/**
 * Two computers, side by side, with the differences named.
 *
 * The differences are what somebody wants; the sameness is what tells them the
 * differences are the whole list. Both are returned, and the page shows the
 * differences first.
 */
export function compare(mine, theirs) {
  const differences = [];
  const same = [];

  const note = (what, a, b) => {
    if (a === b) same.push({ what, both: a ?? 'not here' });
    else differences.push({ what, mine: a ?? 'not here', theirs: b ?? 'not here' });
  };

  note('This computer', mine.kind, theirs.kind);

  const tools = new Set([...Object.keys(mine.tools ?? {}), ...Object.keys(theirs.tools ?? {})]);
  for (const one of tools) {
    if (!mine.tools?.[one] && !theirs.tools?.[one]) continue;
    note(one, mine.tools?.[one], theirs.tools?.[one]);
  }

  if (mine.project && theirs.project) {
    note('Package manager', mine.project.manager, theirs.project.manager);
    note('Built with', mine.project.framework, theirs.project.framework);

    // What each project says it expects, by name, and whether each machine has
    // been given a file of settings at all. Names on both sides, always.
    const here = new Set(mine.project.expects ?? []);
    const there = new Set(theirs.project.expects ?? []);
    const onlyHere = [...here].filter((n) => !there.has(n));
    const onlyThere = [...there].filter((n) => !here.has(n));

    if (onlyHere.length || onlyThere.length) {
      differences.push({
        what: 'Settings expected, by name',
        mine: `${here.size}${onlyHere.length ? ` (${onlyHere.join(', ')} only here)` : ''}`,
        theirs: `${there.size}${onlyThere.length ? ` (${onlyThere.join(', ')} only there)` : ''}`,
        // Said on the row itself, because somebody reading a list of setting
        // names should be told plainly that this is all they will ever see.
        note: 'Names only. What any of them is set to never leaves the computer it is on.',
      });
    } else {
      same.push({ what: 'Settings expected, by name', both: `${here.size} on both` });
    }

    note('Has a settings file',
      mine.project.hasSettingsFile ? 'yes' : 'no',
      theirs.project.hasSettingsFile ? 'yes' : 'no');
  }

  return {
    differences,
    same,
    sentence: differences.length
      ? `${differences.length} difference${differences.length === 1 ? '' : 's'} between these two computers.`
      : 'These two computers look the same in every way this checks.',
  };
}

/**
 * The comparison as something a model can be given.
 *
 * Built here rather than at the call site so there is one place that decides
 * what a model is told about somebody's machines — and so the "names only"
 * rule is kept by construction rather than by whoever writes the next prompt.
 */
export function forAModel(mine, theirs, work) {
  const lines = [
    `Machine A (${mine.name}): ${mine.kind}`,
    `Machine B (${theirs.name}): ${theirs.kind}`,
    '',
    'Differences:',
    ...work.differences.map((d) => `- ${d.what}: A has ${d.mine}, B has ${d.theirs}`),
  ];
  if (mine.project && theirs.project) {
    lines.push(
      '',
      `A can build: ${mine.project.canBuild ? 'yes' : 'no'}. B can build: ${theirs.project.canBuild ? 'yes' : 'no'}.`,
      'Environment settings are given by name only; their values are never available.',
    );
  }
  return lines.join('\n');
}

export const __testOnly = { versionOf, whatKindOfComputer };
