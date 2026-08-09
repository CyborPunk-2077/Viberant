# Next

*Written at the end of a pass, for whoever picks it up. Exact state, exact
continuation point. Everything below is unstarted unless it says otherwise.*

**Where it is:** working tree clean, 665 tests passing (558 app, 107 core),
three consecutive clean runs.

**Joining works** (`app/joining.mjs`, D-178) and **members recognise each other
without GitHub** (`members.beaconKey`, D-183). Two independent instances: A
creates, A invites, B joins, both agree, membership survives a restart, revoking
B keeps B out, and the recognition value works out identical on both sides.

**Two copies on one machine cannot both be findable** — the beacon uses fixed
ports 47777/47778. That is a limit of testing two profiles on one box, not of
the code; on two machines each holds its own. If you want it testable locally,
those two would have to become configurable.

---

## 1. Notes between computers, and the event channel

**The nearest thing to finished.**

A note appears on the screen the moment it is pressed and never redraws the page
(D-181). It still travels through GitHub, so the other computer sees it on the
next sync rather than at once.

The peer channel in `app/server.mjs` (`askPeer` / `answerPeer`, around line 2325)
already carries authenticated messages between members and is the right place: a
`note` message, membership-checked like every other branch there. That plus one
subscription in the page — rather than the per-screen timers — is the event bus.

**Do not add a second transport.** The one that exists is authenticated,
membership-checked and already used by four message kinds.

## 2. Shared projects and sync

`syncing.manifest` and the `manifest` peer message exist; the transfer engine
with resume and verification exists; snapshots before anything is written over
exist (`app/snapshots.mjs`, surfaced under Activity).

What is missing is the surface: which projects a workspace shares, per-member
state (up to date, so many changes, syncing, conflict, offline), and a way in
from the member's inspector. Sharing must stay explicit — a project is not
shared because it is open.

## 3. Signing in at first run

There is no first-run sign-in, and account-dependent parts of the page say so
in each place rather than once.

## 4. Pages still short of the reference

Terminals and AI Apps now open with their own summary, and Terminals shows what
is running on it for somebody else and what a terminal here can reach — it no
longer leaves most of the window empty.

What is still missing on both, and on Projects and Project Detail, is the right
inspector: selecting a row should describe it beside the list rather than doing
nothing. `inspect()` already takes facts, counts, an action list and a topology
map, and `wireInspect` already makes a row select without a press on a control
inside it selecting it. It is composition, not new machinery.

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
