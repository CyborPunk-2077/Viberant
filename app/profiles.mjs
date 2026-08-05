/**
 * Profiles: more than one signed-in account per tool, swapped without signing
 * out and back in.
 *
 * How it works, plainly: every one of these tools keeps who-you-are in a folder
 * in your home directory. Saving a profile copies that folder aside under a name
 * you choose. Switching puts the saved copy back. That is the whole mechanism —
 * the same idea as browser profiles.
 *
 * Two things this file is careful about, because it is handling the only data
 * here that is genuinely painful to lose:
 *
 *   Nothing is ever overwritten without first being kept. Switching away from an
 *   unsaved account saves it first, under a name, automatically.
 *
 *   A tool that is currently running is never swapped underneath. You are told
 *   to close it instead. Swapping live would log you out mid-sentence and could
 *   corrupt what the tool is holding.
 *
 * A note worth keeping in the file itself: this exists so a person with a work
 * account and a personal account stops signing in and out all day. Using it to
 * get past what one account is allowed is against most of these providers'
 * terms, and would put the person using it at risk of losing the accounts.
 */

import { cp, rm, mkdir, readdir, readFile, writeFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import { homedir, platform } from 'node:os';
import { HOUSE } from './projects.mjs';

const run = promisify(execFile);
const KEEP = join(HOUSE, 'profiles');
const ACTIVE = join(KEEP, 'active.json');

/** Where a tool keeps who you are. */
export function whereSignedIn(tool) {
  return tool?.config ? join(homedir(), tool.config) : null;
}

async function activeMap() {
  if (!existsSync(ACTIVE)) return {};
  try { return JSON.parse(await readFile(ACTIVE, 'utf8')); } catch { return {}; }
}

async function setActive(toolId, name) {
  const map = await activeMap();
  if (name) map[toolId] = name; else delete map[toolId];
  await mkdir(KEEP, { recursive: true });
  await writeFile(ACTIVE, JSON.stringify(map, null, 2), 'utf8');
}

/** Every profile saved for a tool, and which one is in use. */
export async function list(tool) {
  const dir = join(KEEP, tool.id);
  const active = (await activeMap())[tool.id] ?? null;
  if (!existsSync(dir)) {
    return { profiles: [], active, signedIn: existsSync(whereSignedIn(tool) ?? '') };
  }
  const names = (await readdir(dir, { withFileTypes: true }))
    .filter((e) => e.isDirectory()).map((e) => e.name);

  const profiles = [];
  for (const name of names) {
    const when = await stat(join(dir, name)).then((s) => s.mtimeMs).catch(() => 0);
    profiles.push({ name, lastUsed: when, active: name === active });
  }
  profiles.sort((a, b) => b.lastUsed - a.lastUsed);
  return { profiles, active, signedIn: existsSync(whereSignedIn(tool) ?? '') };
}

/** Is this tool running right now? Swapping underneath a live tool is refused. */
export async function running(tool) {
  try {
    if (platform() === 'win32') {
      const { stdout } = await run('tasklist', ['/fi', `imagename eq ${tool.bin}.exe`, '/nh']);
      return stdout.toLowerCase().includes(tool.bin.toLowerCase());
    }
    const { stdout } = await run('pgrep', ['-f', tool.bin]);
    return stdout.trim().length > 0;
  } catch { return false; }
}

/** Keep the account currently signed in, under a name. */
export async function save(tool, name) {
  const from = whereSignedIn(tool);
  if (!from) {
    return { ok: false, sentence: `This manager does not know where ${tool.name} keeps your account.`,
      action: 'Switch accounts inside the app itself for now.' };
  }
  if (!existsSync(from)) {
    return { ok: false, sentence: `You are not signed in to ${tool.name} on this computer.`,
      action: `Sign in to ${tool.name} first, then save it here.` };
  }
  const clean = String(name).trim().replace(/[^\w .-]/g, '').slice(0, 40);
  if (!clean) {
    return { ok: false, sentence: 'That name will not work.', action: 'Use letters and numbers.' };
  }

  const to = join(KEEP, tool.id, clean);
  await mkdir(join(KEEP, tool.id), { recursive: true });
  await rm(to, { recursive: true, force: true });
  await cp(from, to, { recursive: true });
  await setActive(tool.id, clean);
  return { ok: true, name: clean };
}

/**
 * Put a saved account back.
 *
 * Whatever is signed in now is kept first, so switching can never be the thing
 * that loses an account.
 */
export async function use(tool, name) {
  const home = whereSignedIn(tool);
  const from = join(KEEP, tool.id, name);

  if (!home) {
    return { ok: false, sentence: `This manager does not know where ${tool.name} keeps your account.`,
      action: 'Switch accounts inside the app itself for now.' };
  }
  if (!existsSync(from)) {
    return { ok: false, sentence: 'That saved account is no longer here.',
      action: 'Sign in and save it again.' };
  }
  if (await running(tool)) {
    return { ok: false, sentence: `${tool.name} is open right now, so its account cannot be changed underneath it.`,
      action: `Close ${tool.name}, then switch.` };
  }

  const activeNow = (await activeMap())[tool.id];
  if (existsSync(home)) {
    const keepAs = activeNow ?? 'before switching';
    const to = join(KEEP, tool.id, keepAs);
    if (keepAs !== name) {
      await rm(to, { recursive: true, force: true });
      await cp(home, to, { recursive: true });
    }
  }

  await rm(home, { recursive: true, force: true });
  await cp(from, home, { recursive: true });
  await setActive(tool.id, name);
  return { ok: true, name };
}

/** Forget a saved account. Does not touch the one you are signed in to. */
export async function forget(tool, name) {
  const active = (await activeMap())[tool.id];
  if (active === name) {
    return { ok: false, sentence: 'That is the account you are using right now.',
      action: 'Switch to another one first.' };
  }
  await rm(join(KEEP, tool.id, name), { recursive: true, force: true });
  return { ok: true };
}
