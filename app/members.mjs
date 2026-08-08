/**
 * Who is in a workspace, and which of their computers are allowed in it.
 *
 * The shape, stated once so nothing has to guess at it:
 *
 *   a **person** is one Viberant account;
 *   a **workspace** belongs to whoever made it;
 *   a **member** is a person in a workspace, with a role;
 *   a **device** is one installation belonging to one member, known by the
 *     public half of a key it made itself and never gives away.
 *
 * GitHub and Google are neither of these. They are places this app can reach on
 * your behalf, and D-130 already holds that nothing which decides where work
 * goes may read them. A workspace is Viberant's own idea and stands on the
 * device keys in `device.mjs` and nothing else.
 *
 * Two roles now: **owner** and **member**. `readOnly` is written into the
 * capability table below with everything already switched off, so adding it
 * later is a change to one list rather than a change to every check.
 *
 * **Nothing here is a permission on its own.** Every capability defaults to no,
 * a device gets what its member's role allows *and* what that device has been
 * trusted with separately, and a computer somebody else owns starts with less
 * than one of your own. Being in a workspace has never been a reason to run a
 * command on somebody's machine and is not going to become one.
 */

import { randomBytes, createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { HOUSE } from './projects.mjs';

const BOOK = join(HOUSE, 'members.json');

const quiet = async (fn, fallback = null) => { try { return await fn(); } catch { return fallback; } };

/** The roles there are. Order matters only for showing them. */
export const ROLES = ['owner', 'member', 'readOnly'];

/**
 * What each role may do, and the answer is no unless it says otherwise.
 *
 * Written as a table rather than as conditions scattered through the code,
 * because the question "what can this person actually do" has to be answerable
 * by reading one thing. Everything that is not listed is refused.
 */
export const WHAT_ROLES_MAY_DO = {
  owner: {
    seeOffered: true,
    bring: true,
    offer: true,
    remoteTerminal: true,
    remoteRun: true,
    remoteBuild: true,
    manageMembers: true,
  },
  member: {
    seeOffered: true,
    bring: true,
    offer: true,
    // Off by default even for a full member. Running a command on somebody
    // else's computer is not something joining a workspace should hand you; the
    // owner of that computer turns it on, per device.
    remoteTerminal: false,
    remoteRun: false,
    remoteBuild: false,
    manageMembers: false,
  },
  readOnly: {
    seeOffered: true,
    bring: false,
    offer: false,
    remoteTerminal: false,
    remoteRun: false,
    remoteBuild: false,
    manageMembers: false,
  },
};

export const CAPABILITIES = Object.keys(WHAT_ROLES_MAY_DO.owner);

/** Everything this computer knows about who is in what. */
async function book() {
  if (!existsSync(BOOK)) return { workspaces: {}, joined: null };
  return (await quiet(async () => JSON.parse(await readFile(BOOK, 'utf8'))))
    ?? { workspaces: {}, joined: null };
}

async function keep(state) {
  await mkdir(HOUSE, { recursive: true });
  await writeFile(BOOK, JSON.stringify(state, null, 2), 'utf8');
}

// ---------------------------------------------------------------------------
// Making one, and being in one
// ---------------------------------------------------------------------------

/** Start a workspace. Whoever does it owns it. */
export async function create({ name, owner, device }) {
  const called = String(name ?? '').trim().slice(0, 60);
  if (!called) return { ok: false, sentence: 'A workspace needs a name.', action: 'Type one.' };

  const state = await book();
  const id = randomBytes(16).toString('hex');

  state.workspaces[id] = {
    id,
    name: called,
    madeAt: Date.now(),
    members: {
      [owner]: { person: owner, role: 'owner', joinedAt: Date.now() },
    },
    devices: {
      [device.deviceId]: {
        ...device,
        person: owner,
        // Your own computer, in a workspace you own. Everything its owner's
        // role allows, because refusing you access to your own machine is
        // security theatre.
        trusted: true,
        addedAt: Date.now(),
      },
    },
    invites: {},
    revoked: {},
  };
  state.joined = id;
  await keep(state);

  return { ok: true, workspace: state.workspaces[id], sentence: `${called} is yours.` };
}

/** The workspace this computer is taking part in, if any. */
export async function current() {
  const state = await book();
  return state.joined ? state.workspaces[state.joined] ?? null : null;
}

/** Every workspace this computer knows about. */
export async function all() {
  const state = await book();
  return Object.values(state.workspaces);
}

/** Take part in a different one. */
export async function switchTo(id) {
  const state = await book();
  if (!state.workspaces[id]) {
    return { ok: false, sentence: 'This computer is not in that workspace.', action: 'Join it first.' };
  }
  state.joined = id;
  await keep(state);
  return { ok: true, sentence: `${state.workspaces[id].name} is the workspace now.` };
}

/** Write a workspace back, however it changed. */
export async function save(workspace) {
  const state = await book();
  state.workspaces[workspace.id] = workspace;
  await keep(state);
  return workspace;
}

// ---------------------------------------------------------------------------
// Invitations
// ---------------------------------------------------------------------------

/** Letters that cannot be mistaken for each other when read aloud. */
const SAYABLE = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

/** How long an invitation is worth anything. */
export const INVITE_LASTS = 10 * 60 * 1000;
/** How many may be outstanding at once, so making them is not an attack. */
export const INVITES_AT_ONCE = 5;

/**
 * A code somebody can read down a phone, backed by something nobody can guess.
 *
 * Eight characters from an alphabet of thirty-two is forty bits. That is not a
 * password and is not treated as one: it lasts ten minutes, it can be used
 * once, five may exist at a time, and guessing is counted and cut off. It is a
 * way to start a conversation, not the thing that keeps the conversation
 * private — **that is the device keys**, and the invitation never becomes part
 * of them.
 *
 * What is kept here is a hash, not the code. Somebody reading this file finds
 * nothing they could use.
 */
export async function invite({ workspace, by, role = 'member' }) {
  const live = Object.values(workspace.invites ?? {})
    .filter((one) => !one.usedAt && Date.now() < one.expiresAt);

  if (live.length >= INVITES_AT_ONCE) {
    return {
      ok: false,
      sentence: `There are already ${live.length} invitations waiting to be used.`,
      action: 'Cancel one of those, or wait for it to run out.',
    };
  }
  if (!WHAT_ROLES_MAY_DO[role]) {
    return { ok: false, sentence: 'That is not a role.', action: 'Choose owner, member or read only.' };
  }

  const raw = randomBytes(8);
  let code = '';
  for (let i = 0; i < 8; i += 1) code += SAYABLE[raw[i] % SAYABLE.length];
  const shown = `${code.slice(0, 4)}-${code.slice(4)}`;

  workspace.invites ??= {};
  workspace.invites[hashOf(shown)] = {
    of: hashOf(shown),
    role,
    by,
    madeAt: Date.now(),
    expiresAt: Date.now() + INVITE_LASTS,
    usedAt: null,
    tries: 0,
  };
  await save(workspace);

  return {
    ok: true,
    // The only time the code exists in the clear is on its way to the screen.
    code: shown,
    expiresAt: Date.now() + INVITE_LASTS,
    sentence: `${shown} lets one person join, for the next ten minutes.`,
    action: 'Read it to them. It works once.',
  };
}

const hashOf = (code) => createHash('sha256')
  .update(String(code ?? '').toUpperCase().replace(/[^0-9A-Z]/g, ''))
  .digest('hex');

/** Stop an invitation working, whether or not anybody has seen it. */
export async function cancelInvite(workspace, of) {
  if (!workspace.invites?.[of]) {
    return { ok: false, sentence: 'That invitation is already gone.', action: null };
  }
  delete workspace.invites[of];
  await save(workspace);
  return { ok: true, sentence: 'That invitation will not work now.' };
}

/** How many wrong guesses one invitation gets before it is thrown away. */
export const GUESSES = 5;

/**
 * Read a code and say whether it lets somebody in.
 *
 * Every way of being wrong answers the same way, so trying codes tells you
 * nothing about which part was wrong. A wrong guess is counted against the
 * whole workspace rather than against one invitation, because counting it per
 * invitation is no defence at all when the guesser does not know which one they
 * are guessing at.
 */
export async function redeem({ workspace, code, person, device }) {
  const no = {
    ok: false,
    sentence: 'That invitation does not work.',
    action: 'Check the code, or ask for a new one.',
  };

  workspace.tries = (workspace.tries ?? 0) + 1;
  if (workspace.tries > GUESSES * INVITES_AT_ONCE) {
    await save(workspace);
    return {
      ok: false,
      sentence: 'Too many invitations have been tried on this workspace.',
      action: 'Ask the owner to make a new one.',
    };
  }

  const one = workspace.invites?.[hashOf(code)];
  if (!one) { await save(workspace); return no; }
  if (one.usedAt) { await save(workspace); return no; }
  if (Date.now() >= one.expiresAt) { await save(workspace); return no; }

  one.usedAt = Date.now();
  one.usedBy = person;
  workspace.tries = 0;

  workspace.members ??= {};
  workspace.members[person] ??= { person, role: one.role, joinedAt: Date.now() };

  workspace.devices ??= {};
  workspace.devices[device.deviceId] = {
    ...device,
    person,
    // Somebody else's computer, joining. It can see and take what is offered
    // and nothing else until the owner says otherwise, whatever its role says.
    trusted: false,
    addedAt: Date.now(),
  };

  await save(workspace);
  return {
    ok: true,
    workspace,
    role: one.role,
    sentence: `You are in ${workspace.name}.`,
    action: 'Your computers can see what the others are offering.',
  };
}

// ---------------------------------------------------------------------------
// What somebody may actually do
// ---------------------------------------------------------------------------

/**
 * May this device do this thing, in this workspace?
 *
 * Three answers have to agree and the default is no: the device is known and
 * not revoked, its member's role allows it, and — for anything that runs code
 * — that particular device has been trusted for it. A capability nobody has
 * heard of is refused rather than allowed.
 */
export function may(workspace, deviceId, capability) {
  if (!workspace || !deviceId) return false;
  if (!CAPABILITIES.includes(capability)) return false;
  if (workspace.revoked?.[deviceId]) return false;

  const device = workspace.devices?.[deviceId];
  if (!device) return false;

  const member = workspace.members?.[device.person];
  if (!member) return false;
  if (workspace.revoked?.[`person:${device.person}`]) return false;

  const byRole = WHAT_ROLES_MAY_DO[member.role]?.[capability] === true;
  if (!byRole) {
    // A device may be granted something its role does not give it, one thing at
    // a time, by whoever owns the workspace.
    return device.allowed?.[capability] === true && device.trusted === true;
  }

  // Running code on a computer needs that computer to have said yes to this
  // device, over and above whatever the role allows.
  const runsCode = capability === 'remoteTerminal' || capability === 'remoteRun' || capability === 'remoteBuild';
  if (runsCode) return device.trusted === true && device.allowed?.[capability] !== false;

  return true;
}

/** Let one device do one thing, or stop it. Only an owner may ask. */
export async function allow(workspace, deviceId, capability, yes) {
  if (!CAPABILITIES.includes(capability)) {
    return { ok: false, sentence: 'That is not something a computer can be allowed.', action: null };
  }
  const device = workspace.devices?.[deviceId];
  if (!device) return { ok: false, sentence: 'That computer is not in this workspace.', action: null };

  device.allowed ??= {};
  device.allowed[capability] = !!yes;
  if (yes) device.trusted = true;
  await save(workspace);

  return {
    ok: true,
    sentence: yes
      ? `${device.displayName} may now do that.`
      : `${device.displayName} may no longer do that.`,
  };
}

// ---------------------------------------------------------------------------
// Taking it back
// ---------------------------------------------------------------------------

/**
 * Stop a computer, or a person, taking part.
 *
 * What this does: every future request from them fails, everywhere, because
 * every check above reads the same list.
 *
 * What this does not do, and must never start doing: reach into their computer.
 * Their copies of your projects stay theirs, their GitHub account is untouched,
 * and nothing of theirs is deleted. Revoking is about what happens next, and a
 * product that deleted somebody's work because a workspace owner pressed a
 * button would be a product nobody could safely join.
 */
export async function revoke(workspace, what) {
  const device = workspace.devices?.[what];
  const person = workspace.members?.[what];
  if (!device && !person) {
    return { ok: false, sentence: 'That is not in this workspace.', action: null };
  }

  workspace.revoked ??= {};

  if (device) {
    workspace.revoked[what] = { at: Date.now(), kind: 'device' };
    delete workspace.devices[what];
    await save(workspace);
    return {
      ok: true,
      sentence: `${device.displayName} can no longer take part.`,
      action: 'Nothing on that computer was touched, and nothing of theirs was deleted.',
    };
  }

  workspace.revoked[`person:${what}`] = { at: Date.now(), kind: 'person' };
  delete workspace.members[what];
  for (const [id, one] of Object.entries(workspace.devices ?? {})) {
    if (one.person === what) {
      workspace.revoked[id] = { at: Date.now(), kind: 'device' };
      delete workspace.devices[id];
    }
  }
  await save(workspace);
  return {
    ok: true,
    sentence: `${what} is no longer in ${workspace.name}.`,
    action: 'Their own files and their own GitHub are untouched.',
  };
}

/** Has this device been thrown out? Asked on every connection. */
export const isRevoked = (workspace, deviceId) => !!workspace?.revoked?.[deviceId];

/** For tests, and for signing out of everything. */
export async function forgetAll() {
  await keep({ workspaces: {}, joined: null });
}

export const BOOK_FILE = BOOK;
export const __testOnly = { hashOf };
