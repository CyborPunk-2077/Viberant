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
/**
 * Which part of the settings page each of these belongs on.
 *
 * They were one undivided card of twenty-odd rows, in the order they happened
 * to be written in: what this computer is called, then where projects go, then
 * a terminal, then eight about colour, then two about a Google application,
 * then three keys. Nobody reads a list like that — they scan it, fail to find
 * the one they came for, and scroll past it twice.
 *
 * The order below is unchanged, because other things read this list in order.
 * Only where each one is drawn is new.
 */
export const PARTS = [
  { id: 'look', name: 'How it looks', why: 'Colour only. A look never changes a layout, a control, or a sentence.' },
  { id: 'computer', name: 'This computer', why: 'What it is called, where work goes, and what opens when something needs a terminal.' },
  { id: 'others', name: 'Your other computers', why: 'How this one is found, and what it will do without asking.' },
  { id: 'joined', name: 'Signing in with Google', why: 'Only needed if you want the Google button to work. Nothing else uses this.' },
];

export const KNOWN = [
  {
    id: 'machineName',
    where: 'computer',
    name: 'What this computer is called',
    why: 'Your other computers see this name. Make it one you would recognise in a list.',
    kind: 'text',
    fallback: () => hostname(),
  },
  {
    id: 'workFolder',
    where: 'computer',
    name: 'Where your projects live',
    why: 'Choosing a folder starts here, and anything you bring down from GitHub or another computer is put here unless you say otherwise.',
    kind: 'folder',
    fallback: () => join(homedir(), 'Documents'),
  },
  {
    id: 'terminal',
    where: 'computer',
    name: 'Which terminal to use',
    why: 'When a command-line app opens, this is the terminal it opens in. Leave it on whichever is here and the manager picks for you.',
    kind: 'terminal',
    fallback: () => null,
  },
  {
    id: 'appearance',
    where: 'look',
    name: 'Appearance',
    why: 'A look changes colours and nothing else — never a layout, never a control, never a sentence.',
    kind: 'appearance',
    choices: [
      { id: 'system', name: 'Follow this computer', why: 'Light or dark, whichever this computer is set to.' },
      { id: 'dark', name: 'Obsidian Signal', why: 'The one it is designed in. Near-black, one violet accent, meaning in colour.' },
      { id: 'graphite', name: 'Minimal Graphite', why: 'Neutral throughout. Colour appears only where something is happening.' },
      { id: 'light', name: 'Light Precision', why: 'A warm off-white, precise borders, the same restraint the other way up.' },
      { id: 'space', name: 'Deep Space', why: 'A star field at three depths, drifting.', scene: true },
      { id: 'orbital', name: 'Orbital', why: 'The edge of a planet, its air catching light.', scene: true },
      { id: 'nebula', name: 'Nebula', why: 'Clouds of colour moving past each other.', scene: true },
      { id: 'andromeda', name: 'Andromeda', why: 'A galaxy at an angle, turning once every twelve minutes.', scene: true },
      { id: 'deepfield', name: 'Deep Field', why: 'Almost nothing, very far away. The quietest one.', scene: true },
      { id: 'horizon', name: 'Event Horizon', why: 'Light bent around something that is not there. The darkest one.', scene: true },
      { id: 'mars', name: 'Mars Horizon', why: 'Rust-coloured ground under a thin sky. The only warm one.', scene: true },
      { id: 'rig', name: 'Rig Room', why: 'A dark workstation, lit the way a photograph would light one.', scene: true },
      { id: 'steam', name: 'Deep Blue', why: 'Cool slate and a bright blue.' },
      { id: 'neon', name: 'Neon Arena', why: 'Deep violet with a hard cyan edge.' },
      { id: 'fire', name: 'Ember', why: 'Warm dark, amber and orange.' },
      { id: 'tactical', name: 'Tactical', why: 'Near-black and one hard orange. Nothing else carries colour.' },
      { id: 'crimson', name: 'Crimson', why: 'Dark plum and magenta.' },
      { id: 'yours', name: 'A picture of your own', why: 'One you choose, from this computer.', scene: true },
    ],
    fallback: () => 'system',
  },
  {
    /**
     * A picture of your own.
     *
     * The path only. Nothing is copied anywhere and nothing is sent anywhere:
     * the file stays where you left it, and the manager reads it when it draws.
     * Delete the picture and the look falls back with a sentence rather than a
     * blank screen.
     */
    id: 'wallPicture',
    where: 'look',
    name: 'Which picture',
    why: 'Any picture on this computer. It is read where it sits — nothing is copied, and nothing about it leaves here.',
    kind: 'picture',
    fallback: () => null,
  },
  {
    id: 'wallMotion',
    where: 'look',
    name: 'Movement behind the app',
    why: 'The looks with a picture behind them drift, slowly enough that you notice only if you look. Off here, and off automatically if this computer asks for less movement.',
    kind: 'yesNo',
    fallback: () => true,
  },
  {
    id: 'wallDim',
    where: 'look',
    name: 'How dark behind the app',
    why: 'How much of the picture is covered before anything is drawn on top of it. Higher is easier to read.',
    kind: 'slider',
    min: 20,
    max: 90,
    fallback: () => 55,
  },
  {
    id: 'wallBlur',
    where: 'look',
    name: 'How soft behind the app',
    why: 'Blurring the picture pushes it further back. It costs a little while something is moving.',
    kind: 'slider',
    min: 0,
    max: 24,
    fallback: () => 0,
  },
  {
    id: 'opening',
    where: 'look',
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
    where: 'joined',
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
    where: 'joined',
    name: 'Google sign-in: client secret',
    why: 'The second half of the same thing. It stays on this computer, in the settings file, and goes nowhere but Google.',
    kind: 'secret',
    optional: true,
    longest: 200,
    fallback: () => '',
  },
  {
    /**
     * Which one is asked.
     *
     * A choice rather than a fallback order. Somebody who pays for one of these
     * already should not have to start paying for another to use this at all,
     * and a manager that quietly asked a different company than the one you
     * chose would be spending your money without saying so.
     */
    id: 'askWho',
    where: 'asking',
    unlisted: true,
    name: 'Which one to ask',
    why: 'Whichever you already pay for. The question, and the few files it needs, go to that one and nowhere else.',
    kind: 'choice',
    choices: [
      { id: 'claude', name: 'Claude' },
      { id: 'openai', name: 'ChatGPT' },
      { id: 'gemini', name: 'Gemini' },
    ],
    fallback: () => 'claude',
  },
  {
    id: 'anthropicKey',
    where: 'asking',
    unlisted: true,
    name: 'Key for Claude',
    why: 'Lets this manager ask Claude about a project when something fails. It stays on this computer, in the settings file, and is never sent anywhere but Claude. Get one from console.anthropic.com.',
    kind: 'secret',
    optional: true,
    longest: 200,
    fallback: () => '',
  },
  {
    id: 'openaiKey',
    where: 'asking',
    unlisted: true,
    name: 'Key for ChatGPT',
    why: 'The same thing for ChatGPT. It stays on this computer, in the settings file, and is never sent anywhere but OpenAI. Get one from platform.openai.com.',
    kind: 'secret',
    optional: true,
    longest: 200,
    fallback: () => '',
  },
  {
    id: 'geminiKey',
    where: 'asking',
    unlisted: true,
    name: 'Key for Gemini',
    why: 'The same thing for Gemini. It stays on this computer, in the settings file, and is never sent anywhere but Google. Get one from aistudio.google.com.',
    kind: 'secret',
    optional: true,
    longest: 200,
    fallback: () => '',
  },
  {
    /**
     * Where the small service that introduces computers lives.
     *
     * Empty means the one inside this app, which needs no account and costs
     * nothing and is enough for your own computers on your own network. An
     * address here points at one somewhere else, which is what lets two
     * computers on different networks find each other.
     */
    id: 'workspaceService',
    where: 'others',
    name: 'Where your computers find each other',
    why: 'Leave this empty and your computers find each other on this network. An address here lets them find each other from anywhere. It never carries your files — only which computers are about.',
    kind: 'text',
    optional: true,
    longest: 200,
    fallback: () => '',
  },
  {
    id: 'relayService',
    where: 'others',
    name: 'Where to pass through when a direct line is not possible',
    why: 'Most home connections cannot be reached from outside, so two computers need somewhere to meet. Whatever passes through cannot be read by it — both ends agree a key first.',
    kind: 'text',
    optional: true,
    longest: 200,
    fallback: () => '',
  },
  {
    /**
     * Which model each company should use.
     *
     * Not on the settings list, because the choice only means anything next to
     * the company it belongs to and the key that pays for it — which is on the
     * screen where somebody is already asking questions. `unlisted` rather than
     * a kind of its own: it is an ordinary line of text that is kept, it simply
     * is not one of the things the settings page draws.
     */
    id: 'model:claude',
    name: 'Model for Claude',
    why: 'Which of Claude models answers.',
    kind: 'text',
    optional: true,
    unlisted: true,
    longest: 80,
    fallback: () => '',
  },
  {
    id: 'model:openai',
    name: 'Model for ChatGPT',
    why: 'Which of ChatGPT models answers.',
    kind: 'text',
    optional: true,
    unlisted: true,
    longest: 80,
    fallback: () => '',
  },
  {
    id: 'model:gemini',
    name: 'Model for Gemini',
    why: 'Which of Gemini models answers.',
    kind: 'text',
    optional: true,
    unlisted: true,
    longest: 80,
    fallback: () => '',
  },
  {
    id: 'grains',
    where: 'look',
    name: 'Sand from the pointer',
    why: 'Fine grains fall from the cursor as it moves. They mean nothing and mark nothing — turn them off if they are a distraction.',
    kind: 'yesNo',
    fallback: () => true,
  },
  {
    id: 'watchFolder',
    where: 'computer',
    name: 'Notice when a folder changes',
    why: 'Work in another app and come back, and the picture is already right. Turn it off on a very large project if it feels slow.',
    kind: 'yesNo',
    fallback: () => true,
  },
  {
    id: 'localSharing',
    where: 'others',
    name: 'Let your other computers reach this one',
    why: 'Needed to send folders to and from the computers on the same network as this one. Nothing is ever sent without you asking.',
    kind: 'yesNo',
    fallback: () => true,
  },
  {
    id: 'confirmPublic',
    where: 'others',
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
  return KNOWN.filter((s) => s.kind !== 'hidden' && !s.unlisted).map((s) => ({
    id: s.id, name: s.name, why: s.why, kind: s.kind, where: s.where ?? 'computer',
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
  if (known.kind === 'slider') {
    // Held to its own ends rather than trusted. A number arriving from a page
    // is a number somebody could have typed into the address bar.
    const n = Number(value);
    if (!Number.isFinite(n)) {
      return { ok: false, sentence: `${known.name} has to be a number.`, action: 'Move the slider instead.' };
    }
    clean = Math.min(known.max, Math.max(known.min, Math.round(n)));
  }
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
