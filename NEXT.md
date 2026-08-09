# Next

*Written at the end of a pass, for whoever picks it up. Exact state, exact
continuation point. Everything below is unstarted unless it says otherwise.*

**Where it is:** working tree clean, 658 tests passing (551 app, 107 core),
three consecutive clean runs.

**Joining works now.** The thing this file used to be about is done — see
`app/joining.mjs` and D-178. Two independent instances, separate profiles,
separate ports: A creates, A invites, B joins, both sides agree, membership
survives a restart, revoking B keeps B out.

---

## 1. Presence inside a members workspace

**The nearest thing to finished, and the most worth doing.**

Two computers that have joined the same workspace list each other correctly and
both say *offline*, because presence still comes from the older discovery: the
beacon in `lan.mjs` is keyed on the **GitHub** workspace secret
(`app/server.mjs`, `localSharing()`, around line 221), so computers that joined
by code have no key to recognise each other with.

**What to do.** Give the beacon a second identity: the members workspace's own
id plus a key both sides now hold — every device's public card is in
`ws.devices`, so a shared value can be derived without inventing anything. Do
not weaken the existing GitHub-keyed beacon; add alongside it.

Once that lands, `anywhere.around()` already computes `online` and `how`
correctly — it reads `lan.around()` and the introducing service — so presence
lights up with no page changes at all.

## 2. Notes between computers, and the event channel

A note appears on the screen the moment it is pressed and never redraws the page
(D-181). It still travels through GitHub, so the other computer sees it on the
next sync rather than at once.

The peer channel in `app/server.mjs` (`askPeer` / `answerPeer`, around line 2325)
already carries authenticated messages between members and is the right place: a
`note` message, membership-checked like every other branch there. That plus one
subscription in the page — rather than the per-screen timers — is the event bus.

**Do not add a second transport.** The one that exists is authenticated,
membership-checked and already used by four message kinds.

## 3. Shared projects and sync

`syncing.manifest` and the `manifest` peer message exist; the transfer engine
with resume and verification exists; snapshots before anything is written over
exist (`app/snapshots.mjs`, surfaced under Activity).

What is missing is the surface: which projects a workspace shares, per-member
state (up to date, so many changes, syncing, conflict, offline), and a way in
from the member's inspector. Sharing must stay explicit — a project is not
shared because it is open.

## 4. Signing in at first run

There is no first-run sign-in, and account-dependent parts of the page say so
in each place rather than once.

## 5. Pages still on the old layout

Projects, Project Detail, AI Apps and Terminals use the shared row system and
the summary cards, so they are consistent, but they are not the reference
composition: no inspector, and Terminals leaves most of the window empty.

The pieces exist: `summary()`, `inspect()` with counts / action list / topology
map, `.sheetlist` with per-table `-cols`, and `wireInspect`.

---

## Things worth knowing before touching any of this

**`view.innerHTML` is guarded.** It compares against what a screen last
*produced*, not against the page, because several screens draw in two stages.
Writing the same page twice is free; rely on it (D-171).

**Answers are combined state-first, answer-last** — `withWorkspace()` in
`app/server.mjs`. Writing `{ ...out, ...around() }` by hand reverses it and
turns refusals into successes (D-179). That bug shipped nine times.

**The joining door may only ever carry one message.** A test reads
`app/joining.mjs` and fails if a second kind is added. That single purpose is
the entire reason it is allowed to skip the membership check (D-178).

**Ports are fixed and tests run in parallel.** `joining` binds 47779; a bind
that fails now reports rather than hanging, which is what caused two unrelated
tests to fail when a stray server was running.

**Two tests read source rather than behaviour** and will fail loudly if the
shape changes: `membership.test.mjs` counts the places that add to the member
list, `leftrunning.test.mjs` counts clocks against the things that clear them.
Both are deliberate.
