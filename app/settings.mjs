/**
 * Settings.
 *
 * Deliberately short. Every setting here is one somebody would go looking for
 * and be annoyed not to find — what this computer is called, where new work
 * goes, which terminal is meant, whether the opening plays. Nothing here
 * changes what the manager tells you is true, only how it behaves while telling
 * you.
 *
 * Kept in one small readable file next to everything else in
 * `%USERPROFILE%\.viberant`. Delete it and the defaults come back.
 */

import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { hostname, homedir } from 'node:os';

import { HOUSE } from './projects.mjs';

const FILE = join(HOUSE, 'settings.json');
/** Where this computer's name used to live, before it moved in here. */
const OLD_NAME = join(HOUSE, 'machine-name');

/**
 * Every setting, what it means in words, and what it is when nobody has said.
 *
 * The descriptions live here rather than in the page so there is one place to
 * change what a setting claims to do.
 */
export const KNOWN = [
  {
    id: 'machineName',
    name: 'What this computer is called',
    why: 'Your other computers see this name. Make it one you would recognise in a list.',
    kind: 'text',
    fallback: () => hostname(),
  },
  {
    id: 'workFolder',
    name: 'Where your projects live',
    why: 'Choosing a folder starts here, and anything you bring down from GitHub or another computer is put here unless you say otherwise.',
    kind: 'folder',
    fallback: () => join(homedir(), 'Documents'),
  },
  {
    id: 'terminal',
    name: 'Which terminal to use',
    why: 'When a command-line app opens, this is the terminal it opens in. Leave it on whichever is here and the manager picks for you.',
    kind: 'terminal',
    fallback: () => null,
  },
  {
    id: 'appearance',
    name: 'Appearance',
    why: 'A look changes colours and nothing else — never a layout, never a control, never a sentence.',
    kind: 'appearance',
    choices: [
      { id: 'system', name: 'Follow this computer', why: 'Light or dark, whichever this computer is set to.' },
      { id: 'dark', name: 'Obsidian Signal', why: 'The one it is designed in. Near-black, one violet accent, meaning in colour.' },
      { id: 'graphite', name: 'Minimal Graphite', why: 'Neutral throughout. Colour appears only where something is happening.' },
      { id: 'light', name: 'Light Precision', why: 'A warm off-white, precise borders, the same restraint the other way up.' },
      { id: 'steam', name: 'Deep Blue', why: 'Cool slate and a bright blue.' },
      { id: 'neon', name: 'Neon', why: 'Deep violet with a hard cyan edge.' },
      { id: 'fire', name: 'Ember', why: 'Warm dark, amber and orange.' },
      { id: 'crimson', name: 'Crimson', why: 'Dark plum and magenta.' },
    ],
    fallback: () => 'system',
  },
  {
    id: 'opening',
    name: 'Play the opening',
    why: 'The name of the app, once, when it starts. Turning this off makes it appear straight away.',
    kind: 'yesNo',
    fallback: () => true,
  },
  {
    // Not shown on the settings page: it is a fact about what has happened
    // rather than a choice, and a settings list is for choices.
    id: 'welcomed',
    name: 'Has been welcomed',
    why: 'Whether the way in has already been offered on this computer.',
    kind: 'hidden',
    fallback: () => false,
  },
  {
    id: 'googleClientId',
    name: 'Google sign-in: client ID',
    why: 'A Google sign-in cannot exist without an application registered with Google — that is true of every Google button anywhere. Make one at console.cloud.google.com (type: TV and Limited Input) and paste its ID here.',
    kind: 'text',
    // Empty is a real answer here: it means "no Google application yet", which
    // is what every computer starts as. Google's own are about seventy
    // characters, so the ordinary limit would cut one in half.
    optional: true,
    longest: 200,
    fallback: () => '',
  },
  {
    id: 'googleClientSecret',
    name: 'Google sign-in: client secret',
    why: 'The second half of the same thing. It stays on this computer, in the settings file, and goes nowhere but Google.',
    kind: 'secret',
    optional: true,
    longest: 200,
    fallback: () => '',
  },
  {
    id: 'grains',
    name: 'Sand from the pointer',
    why: 'Fine grains fall from the cursor as it moves. They mean nothing and mark nothing — turn them off if they are a distraction.',
    kind: 'yesNo',
    fallback: () => true,
  },
  {
    id: 'watchFolder',
    name: 'Notice when a folder changes',
    why: 'Work in another app and come back, and the picture is already right. Turn it off on a very large project if it feels slow.',
    kind: 'yesNo',
    fallback: () => true,
  },
  {
    id: 'localSharing',
    name: 'Let your other computers reach this one',
    why: 'Needed to send folders to and from the computers on the same network as this one. Nothing is ever sent without you asking.',
    kind: 'yesNo',
    fallback: () => true,
  },
  {
    id: 'confirmPublic',
    name: 'Ask before letting anyone see a project',
    why: 'A second question before a project on GitHub becomes readable by anybody. Worth keeping on.',
    kind: 'yesNo',
    fallback: () => true,
  },
];

let held = null;

async function load() {
  if (held) return held;
  held = {};
  if (existsSync(FILE)) {
    try { held = JSON.parse(await readFile(FILE, 'utf8')) ?? {}; } catch { held = {}; }
  }
  // The name of this computer used to have a file of its own.
  if (held.machineName === undefined && existsSync(OLD_NAME)) {
    try { held.machineName = (await readFile(OLD_NAME, 'utf8')).trim(); } catch { /* leave it */ }
  }
  return held;
}

/** Everything, with anything unsaid filled in. */
export async function all() {
  const saved = await load();
  const out = {};
  for (const s of KNOWN) {
    out[s.id] = saved[s.id] !== undefined && saved[s.id] !== null ? saved[s.id] : s.fallback();
  }
  return out;
}

/** One setting, filled in the same way. */
export async function get(id) {
  return (await all())[id];
}

/**
 * Everything, with anything a page has no business seeing left out.
 *
 * A secret's whole claim is that it stays here. Handing it to the page would
 * make that sentence false, and the page has no use for it — all it ever needs
 * to know is whether one has been set.
 */
export async function allSafely() {
  const now = await all();
  for (const s of KNOWN) if (s.kind === 'secret') now[s.id] = now[s.id] ? true : false;
  return now;
}

/** The list the settings page draws itself from. */
export async function described() {
  const now = await allSafely();
  return KNOWN.filter((s) => s.kind !== 'hidden').map((s) => ({
    id: s.id, name: s.name, why: s.why, kind: s.kind,
    choices: s.choices ?? null,
    value: now[s.id],
    isDefault: s.kind === 'secret'
      ? now[s.id] === false
      : JSON.stringify(now[s.id]) === JSON.stringify(s.fallback()),
  }));
}

/** Change one. */
export async function set(id, value) {
  const known = KNOWN.find((s) => s.id === id);
  if (!known) {
    return { ok: false, sentence: 'That is not one of the settings.', action: 'Pick one from the list.' };
  }

  let clean = value;
  if (known.kind === 'yesNo' || known.kind === 'hidden') clean = !!value;
  if (known.kind === 'text' || known.kind === 'secret') {
    clean = String(value ?? '').trim().slice(0, known.longest ?? 60);
  }
  // Anything that has choices is held to them, rather than anything whose kind
  // happens to be called `choice`. Those two were the same thing until a
  // setting was drawn a different way and quietly stopped being checked —
  // caught by a test, which is the honest way to report it.
  if (known.choices && !known.choices.some((c) => c.id === value)) {
    return { ok: false, sentence: 'That is not one of the choices.', action: 'Pick one from the list.' };
  }
  if (known.kind === 'text' && !known.optional && !clean) {
    return { ok: false, sentence: `${known.name} cannot be empty.`, action: 'Type something.' };
  }

  const saved = await load();
  saved[id] = clean;
  await mkdir(HOUSE, { recursive: true });
  await writeFile(FILE, JSON.stringify(saved, null, 2), 'utf8');
  return { ok: true, sentence: `${known.name}: saved.` };
}

/** Put everything back to how it came. */
export async function forgetAll() {
  held = null;
  await rm(FILE, { force: true });
  await rm(OLD_NAME, { force: true });
  return { ok: true, sentence: 'Every setting is back to how it started.' };
}

/** Where the record of everything lives, for the settings page to point at. */
export const recordFolder = HOUSE;
