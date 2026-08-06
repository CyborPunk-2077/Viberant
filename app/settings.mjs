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
    name: 'Colours',
    why: 'Follow this computer, or pick a look and stay in it. A theme changes colours and nothing else.',
    kind: 'choice',
    choices: [
      { id: 'system', name: 'Follow this computer' },
      { id: 'light', name: 'Light' },
      { id: 'dark', name: 'Dark' },
      { id: 'steam', name: 'Deep blue' },
      { id: 'neon', name: 'Neon' },
      { id: 'fire', name: 'Fire' },
      { id: 'crimson', name: 'Crimson' },
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

/** The list the settings page draws itself from. */
export async function described() {
  const now = await all();
  return KNOWN.map((s) => ({
    id: s.id, name: s.name, why: s.why, kind: s.kind,
    choices: s.choices ?? null,
    value: now[s.id],
    isDefault: JSON.stringify(now[s.id]) === JSON.stringify(s.fallback()),
  }));
}

/** Change one. */
export async function set(id, value) {
  const known = KNOWN.find((s) => s.id === id);
  if (!known) {
    return { ok: false, sentence: 'That is not one of the settings.', action: 'Pick one from the list.' };
  }

  let clean = value;
  if (known.kind === 'yesNo') clean = !!value;
  if (known.kind === 'text') clean = String(value ?? '').trim().slice(0, 60);
  if (known.kind === 'choice' && !known.choices.some((c) => c.id === value)) {
    return { ok: false, sentence: 'That is not one of the choices.', action: 'Pick one from the list.' };
  }
  if (known.kind === 'text' && !clean) {
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
