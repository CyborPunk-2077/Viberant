/**
 * Keyboard shortcuts that the page can genuinely execute.
 *
 * Kept outside the page so an edited binding survives a restart, and so
 * conflict detection has one answer. A binding is deliberately small: Ctrl
 * plus one printable key. Viberant never takes a bare key from somebody who
 * may be typing, and it never claims a shortcut for an action that has no
 * corresponding screen or control.
 */

import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { HOUSE } from './projects.mjs';

const FILE = join(HOUSE, 'keybinds.json');

export const GROUPS = [
  {
    id: 'navigation', name: 'Navigation',
    actions: [
      ['home', 'Home', 'Open the command center', '0'],
      ['projects', 'Projects', 'Browse and open projects', '1'],
      ['ask', 'AI Assistant', 'Open the project assistant', '2'],
      ['apps', 'AI apps', 'Open the developer tools launcher', '3'],
      ['terminals', 'Terminals', 'Open terminal controls', '4'],
      ['workspace', 'Workspace', 'Return to Workspace Home', '5'],
      ['activity', 'Activity', 'Open operational activity', '6'],
      ['ship', 'Deploy', 'Open release and deployment', '7'],
      ['settings', 'Settings', 'Open preferences', ','],
      ['keybinds', 'Keybinds', 'Open this shortcut list', '/'],
    ],
  },
  {
    id: 'global', name: 'Global',
    actions: [
      ['palette', 'Search Viberant', 'Find a screen or action', 'k'],
    ],
  },
];

const catalogue = () => GROUPS.flatMap((group) => group.actions.map(([id, name, why, key]) => ({
  id, name, why, group: group.id, default: key,
})));

async function saved() {
  if (!existsSync(FILE)) return {};
  try { return JSON.parse(await readFile(FILE, 'utf8')) ?? {}; } catch { return {}; }
}

const cleanKey = (value) => String(value ?? '').trim().toLowerCase();
const allowed = (key) => key.length === 1 && !/\s/.test(key);

export async function all() {
  const held = await saved();
  const actions = catalogue().map((one) => ({ ...one, key: held[one.id] ?? one.default }));
  return {
    groups: GROUPS.map((group) => ({
      id: group.id,
      name: group.name,
      actions: actions.filter((one) => one.group === group.id),
    })),
    bindings: Object.fromEntries(actions.map((one) => [one.id, one.key])),
  };
}

export async function set(id, value) {
  const known = catalogue().find((one) => one.id === id);
  if (!known) return { ok: false, sentence: 'That action has no editable shortcut.', action: 'Choose one from this page.' };

  const key = cleanKey(value);
  if (!allowed(key)) {
    return { ok: false, sentence: 'A shortcut needs one printable key after Ctrl.', action: 'Press one letter, number, or punctuation key.' };
  }

  const now = await all();
  const taken = Object.entries(now.bindings).find(([other, bound]) => other !== id && bound === key);
  if (taken) {
    const other = catalogue().find((one) => one.id === taken[0]);
    return {
      ok: false,
      conflict: taken[0],
      sentence: `Ctrl ${key.toUpperCase()} is already used by ${other?.name ?? 'another action'}.`,
      action: 'Choose a different key, or reset the other shortcut first.',
    };
  }

  const held = await saved();
  held[id] = key;
  await mkdir(HOUSE, { recursive: true });
  await writeFile(FILE, JSON.stringify(held, null, 2), 'utf8');
  return { ok: true, sentence: `${known.name} now uses Ctrl ${key.toUpperCase()}.`, ...(await all()) };
}

export async function reset(id = null) {
  if (!id) {
    await rm(FILE, { force: true });
    return { ok: true, sentence: 'Every shortcut is back to its default.', ...(await all()) };
  }

  const known = catalogue().find((one) => one.id === id);
  if (!known) return { ok: false, sentence: 'That action has no shortcut to reset.', action: null };
  const held = await saved();
  delete held[id];
  await mkdir(HOUSE, { recursive: true });
  await writeFile(FILE, JSON.stringify(held, null, 2), 'utf8');
  return { ok: true, sentence: `${known.name} is back to Ctrl ${known.default.toUpperCase()}.`, ...(await all()) };
}

export const RECORD_FILE = FILE;
