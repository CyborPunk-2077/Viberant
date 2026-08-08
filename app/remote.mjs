/**
 * Doing something on one of your other computers.
 *
 * This is the most dangerous file in the product and it is worth saying why in
 * one place: everything else here moves data, and this runs commands. A mistake
 * anywhere above costs somebody a folder. A mistake here costs them a machine.
 *
 * So four things hold, and none of them is a preference:
 *
 *   **Nobody gets this by joining.** Being in a workspace is not a reason to
 *   run a command on somebody's computer. The owner of that computer turns it
 *   on, for one device, one capability at a time (`members.may`).
 *
 *   **The far end decides, not the near end.** Every check below happens where
 *   the command would run. A caller asking nicely is not authorisation; the
 *   only thing that matters is what the machine being asked believes.
 *
 *   **Nothing is executed because a model suggested it.** A model may propose;
 *   a person presses. There is no path from an answer to a running process, and
 *   there is not going to be one.
 *
 *   **Everything that happens is written down.** Who asked, which computer,
 *   what ran, when it stopped. A remote command nobody can see afterwards is
 *   indistinguishable from one that never happened.
 */

import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import * as members from './members.mjs';
import * as jobs from './jobs.mjs';

/** The kinds of thing that may be asked of another computer. */
export const TERMINAL = 'remoteTerminal';
export const RUN = 'remoteRun';
export const BUILD = 'remoteBuild';

/** How long a session may sit with nobody typing before it is closed. */
const IDLE = 15 * 60 * 1000;
/** How many may be open at once, from everybody, on this computer. */
const AT_ONCE = 4;
/** How much output one session may produce before it is cut off. */
const MOST_OUTPUT = 4 * 1024 * 1024;

const going = new Map();

/**
 * What is happening on this computer, at somebody else's asking.
 *
 * Read by the page, and by whoever wants to know what a computer of theirs has
 * been doing. Never the output — that goes to whoever asked for it — only the
 * fact of it.
 */
export const openSessions = () => [...going.values()].map((one) => ({
  id: one.id,
  kind: one.kind,
  who: one.whoName,
  device: one.fromDevice,
  what: one.what,
  where: one.where,
  began: one.began,
  running: !one.finished,
}));

/**
 * May this computer be asked to do this, by this device, right now?
 *
 * The one gate. Everything below goes through it, and it answers with a
 * sentence rather than a boolean so that a refusal can be shown to a person
 * instead of appearing as nothing happening.
 */
export function mayAsk({ workspace, fromDevice, kind }) {
  if (!workspace) {
    return { ok: false, sentence: 'This computer is not in a workspace.', action: 'Make one, or join one.' };
  }
  if (!going.has(fromDevice) && going.size >= AT_ONCE) {
    return {
      ok: false,
      sentence: 'This computer is already doing as much as it will at once.',
      action: 'Wait for one of those to finish.',
    };
  }
  if (members.isRevoked(workspace, fromDevice)) {
    return { ok: false, sentence: 'That computer is not in this workspace any more.', action: null };
  }
  if (!members.may(workspace, fromDevice, kind)) {
    const named = workspace.devices?.[fromDevice]?.displayName ?? 'That computer';
    return {
      ok: false,
      sentence: `${named} is not allowed to do that on this computer.`,
      action: 'Whoever owns this computer can allow it, one thing at a time, on the Workspace page.',
    };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// A terminal on a computer of yours
// ---------------------------------------------------------------------------

/**
 * Open a shell here, because a device that is allowed to asked for one.
 *
 * The shell is this computer's own — PowerShell on Windows, the login shell
 * elsewhere — with no command supplied. That is deliberate: this is a terminal,
 * not a way to run one thing, and dressing up "run this string" as a terminal
 * would be the same power with less of an audit trail.
 */
export function openTerminal({ workspace, fromDevice, whoName, where, onOutput }) {
  const allowed = mayAsk({ workspace, fromDevice, kind: TERMINAL });
  if (!allowed.ok) return allowed;

  const at = where && existsSync(where) ? resolve(where) : process.cwd();

  const shell = process.platform === 'win32'
    ? { command: 'powershell.exe', args: ['-NoLogo', '-NoProfile'] }
    : { command: process.env.SHELL || '/bin/sh', args: ['-i'] };

  const child = spawn(shell.command, shell.args, {
    cwd: at,
    env: { ...process.env, VIBERANT_REMOTE: '1' },
    windowsHide: true,
  });

  const one = {
    id: randomUUID(),
    kind: TERMINAL,
    fromDevice,
    whoName,
    what: shell.command,
    where: at,
    began: Date.now(),
    finished: null,
    child,
    sent: 0,
  };
  going.set(one.id, one);

  const job = jobs.begin({
    what: `${whoName} opened a terminal on this computer`,
    where: at,
    kind: 'remote',
  });
  one.job = job;

  const say = (text) => {
    one.sent += text.length;
    if (one.sent > MOST_OUTPUT) {
      onOutput?.('\n[this session produced more than it is allowed to and was stopped]\n');
      return closeTerminal(one.id);
    }
    onOutput?.(text);
  };

  child.stdout.on('data', (b) => say(b.toString()));
  child.stderr.on('data', (b) => say(b.toString()));
  child.on('error', (e) => { say(`\n[${e.message}]\n`); closeTerminal(one.id); });
  child.on('exit', (code) => {
    one.finished = Date.now();
    jobs.end(job, {
      ok: true,
      sentence: `That terminal on this computer is closed.`,
      action: null,
    });
    onOutput?.(`\n[closed${code === null ? '' : ` (${code})`}]\n`);
    going.delete(one.id);
  });

  one.idle = setTimeout(() => closeTerminal(one.id), IDLE);
  one.idle.unref?.();

  return {
    ok: true,
    session: one.id,
    at,
    // What the person on the other end reads at the top of the window.
    sentence: `A terminal on this computer, in ${at}.`,
  };
}

/** Type something into an open session. */
export function typeInto(id, text) {
  const one = going.get(id);
  if (!one || one.kind !== TERMINAL) {
    return { ok: false, sentence: 'That terminal is not open any more.', action: 'Open a new one.' };
  }
  clearTimeout(one.idle);
  one.idle = setTimeout(() => closeTerminal(id), IDLE);
  one.idle.unref?.();

  one.child.stdin.write(String(text ?? ''));
  return { ok: true };
}

/** End one, from either side. */
export function closeTerminal(id) {
  const one = going.get(id);
  if (!one) return { ok: true, sentence: 'That was already closed.' };
  clearTimeout(one.idle);
  try { one.child.kill(); } catch { /* already gone */ }
  going.delete(id);
  if (one.job && !one.finished) {
    jobs.end(one.job, { ok: true, sentence: 'That terminal on this computer is closed.' });
  }
  return { ok: true, sentence: 'That terminal is closed.' };
}

// ---------------------------------------------------------------------------
// Running and building, on a computer of yours
// ---------------------------------------------------------------------------

/**
 * The commands a project may be asked to run, and where they come from.
 *
 * **Out of the project's own configuration, never out of the request.** A
 * caller says "build"; this computer decides what "build" means by reading the
 * project. Taking a command string off the wire would make every one of the
 * checks above pointless — the capability would be "run anything", spelled
 * differently.
 */
export async function whatItCanDo(dir) {
  const providers = await import('./providers.mjs');
  const look = await providers.inspect(dir);

  const scripts = look?.scripts ?? {};
  const manager = look?.manager ?? 'npm';

  const named = {};
  for (const name of ['build', 'dev', 'start', 'test', 'preview']) {
    if (scripts[name]) named[name] = `${manager} run ${name}`;
  }

  return {
    framework: look?.framework ?? null,
    manager,
    commands: named,
    // Said plainly, because "no build script" is a thing somebody can fix and
    // "build failed" when there is nothing to build is not.
    canBuild: !!named.build,
    canRun: !!(named.dev || named.start),
  };
}

/**
 * Do one named thing, here, because an allowed device asked.
 *
 * The name is chosen from the list above and nothing else is accepted. There is
 * no path from a string somebody sent to a process that starts.
 */
export async function doNamed({
  workspace, fromDevice, whoName, dir, name, kind = RUN, onOutput,
}) {
  const allowed = mayAsk({ workspace, fromDevice, kind });
  if (!allowed.ok) return allowed;

  if (!dir || !existsSync(dir)) {
    return { ok: false, sentence: 'That project is not on this computer.', action: 'Send it over first.' };
  }

  const can = await whatItCanDo(dir);
  const command = can.commands[name];
  if (!command) {
    return {
      ok: false,
      sentence: `This project has nothing called ${name} to run.`,
      action: `It offers: ${Object.keys(can.commands).join(', ') || 'nothing'}.`,
    };
  }

  const job = jobs.begin({
    what: `${name} on this computer, asked for by ${whoName}`,
    where: dir,
    kind: kind === BUILD ? 'build' : 'remote',
  });

  const [runner, ...args] = command.split(' ');
  const child = spawn(runner, args, {
    cwd: resolve(dir),
    shell: process.platform === 'win32',
    windowsHide: true,
    env: { ...process.env, VIBERANT_REMOTE: '1', CI: '1' },
  });

  const one = {
    id: randomUUID(),
    kind,
    fromDevice,
    whoName,
    what: command,
    where: dir,
    began: Date.now(),
    finished: null,
    child,
    job,
    sent: 0,
    lines: [],
    ports: new Set(),
  };
  going.set(one.id, one);

  const say = (text) => {
    one.sent += text.length;
    for (const line of text.split('\n')) {
      if (!line.trim()) continue;
      one.lines.push(line);
      if (one.lines.length > 500) one.lines.shift();
      for (const port of portsIn(line)) one.ports.add(port);
      jobs.write(job, line);
    }
    onOutput?.(text);
    if (one.sent > MOST_OUTPUT) {
      onOutput?.('\n[this produced more output than it is allowed to and was stopped]\n');
      stopNamed(one.id);
    }
  };

  child.stdout.on('data', (b) => say(b.toString()));
  child.stderr.on('data', (b) => say(b.toString()));
  child.on('error', (e) => {
    one.finished = Date.now();
    going.delete(one.id);
    jobs.end(job, {
      ok: false,
      sentence: `${name} could not be started on this computer.`,
      action: e.message,
    });
  });
  child.on('exit', (code) => {
    one.finished = Date.now();
    going.delete(one.id);
    jobs.end(job, {
      ok: code === 0,
      sentence: code === 0
        ? `${name} finished on this computer.`
        : `${name} stopped with a problem on this computer.`,
      action: code === 0 ? null : 'The last of what it said is above.',
    });
  });

  return {
    ok: true,
    session: one.id,
    // The name of the errand, not the errand itself. Everything that watches a
    // job looks it up by name, which is what lets one outlive the page that
    // started it.
    job: job.id,
    command,
    sentence: `${command} is running on this computer.`,
  };
}

/** Stop something that is running. */
export function stopNamed(id) {
  const one = going.get(id);
  if (!one) return { ok: true, sentence: 'That had already stopped.' };
  try { one.child.kill(); } catch { /* already gone */ }
  going.delete(id);
  return { ok: true, sentence: 'Stopped.' };
}

/** What one session has said, and any address it seems to be listening on. */
export function whatItSaid(id) {
  const one = going.get(id);
  if (!one) return { ok: false, sentence: 'That is not running any more.', action: null };
  return {
    ok: true,
    lines: one.lines.slice(-200),
    ports: [...one.ports],
    running: !one.finished,
  };
}

/**
 * Addresses a development server has mentioned.
 *
 * Read out of what it printed rather than by looking at what this computer has
 * open, because the second is a list of everything on the machine and this
 * only ever wants the thing that was just started. It is a guess, and it is
 * offered as one — a preview that does not open is a disappointment, and a
 * list of every port on somebody's computer is a leak.
 */
export function portsIn(line) {
  const out = [];
  for (const m of String(line).matchAll(/(?:localhost|127\.0\.0\.1|0\.0\.0\.0):(\d{2,5})\b/g)) {
    const port = Number(m[1]);
    if (port > 0 && port < 65536) out.push(port);
  }
  return out;
}

/** For tests, and for shutting everything down. */
export function closeEverything() {
  for (const id of [...going.keys()]) {
    const one = going.get(id);
    if (one?.kind === TERMINAL) closeTerminal(id); else stopNamed(id);
  }
}

export const __testOnly = { going, AT_ONCE, MOST_OUTPUT };
