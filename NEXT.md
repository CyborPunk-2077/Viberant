# Next

*Written at the end of a pass, for whoever picks it up. Exact state, exact
continuation point. Everything below is unstarted unless it says otherwise.*

**Where it is:** `01b3afe`, working tree clean, 653 tests passing (546 app,
107 core), three consecutive clean runs.

---

## 1. Joining a workspace from a computer that has never seen it — D-174

**This is the one that matters.** Everything else here is polish; this is a
promise the product makes and does not keep.

A code is permission to join. It is not the workspace. The workspace record —
who is in it, what each may do, the keys they know each other by — lives on the
computer that made it, in `~/.viberant/members.json`. Something has to carry it
across, and today only a service both computers can reach does.

`POST /team/join` refuses when there is no local workspace, and now says exactly
that. Reproduced with two instances on one machine (`PORT=7788` and a separate
`USERPROFILE`): A creates, A invites, B joins → refused, correctly.

**What is already built and can be used.** `app/server.mjs` has an authenticated
question-and-answer channel between computers — `askPeer` / `answerPeer`, around
line 2325. It already carries `machine`, `manifest`, `can` and `do`. Adding a
`join` message is a small amount of code.

**The one real obstacle.** Every branch of `answerPeer` begins by checking that
the asker is already in the workspace:

```js
if (!ws?.devices?.[from] || membersOf.isRevoked(ws, from)) return reply({ ok: false });
```

That is the right check for every message except the one whose whole job is to
create membership. A `join` branch must be authorised by **the code itself** —
`membersOf.redeem` already does that work, already refuses expired, used and
made-up codes, and is already held by tests in `app/test/membership.test.mjs`.

**Before that can be reached,** a computer with no workspace has to discover the
one that has it. `lan.start()` in `app/server.mjs` around line 221 is given a
`key` derived from the workspace, so discovery today is between computers that
already share one. Joining needs a narrower announcement — something like "I am
looking for the workspace this code opens" — that carries the code's hash and
nothing else. Do not weaken the existing discovery to get there.

**The shape to aim for:** joiner announces the hash of the code on the network →
whoever holds a live invitation matching it answers → the joiner asks that peer
`what: 'join'` with the code → the owner redeems it and replies with the
workspace card → the joiner writes it down. Both sides then already work.

**Do not** put the workspace record in the invitation. Ten characters read aloud
over a desk is the point of the code, and anything a code has to carry stops
being ten characters.

---

## 2. Real-time workspace events

Notes between computers arrive on the next poll rather than when they are sent,
and the pipeline is per-page rather than shared. One subscription that carries
membership changes, notes, project changes and transfer progress, delivered
whichever screen is open, would replace several polls.

The flicker fix (D-171) makes this cheap to do well: a screen redrawn with
identical content now costs nothing, so an event that changes nothing is free.

---

## 3. Workspace project sync

Manifest comparison exists (`syncing.manifest`, and `what: 'manifest'` on the
peer channel). What is missing is the surface: per-member per-project state —
up to date, so many changes available, syncing, conflict, offline — and a way in
from the member's inspector.

Snapshots already keep a way back before anything is written over
(`app/snapshots.mjs`, listed under Activity), so the safety half is done.

---

## 4. Signing in at first run

There is no first-run sign-in. Account-dependent parts of the page are drawn
whether or not anybody is signed in, and say so in each place rather than once.

---

## 5. Pages still on the old layout

Projects, Project Detail, AI Apps and Terminals were not recomposed. They use
the shared row system and the summary cards, so they are consistent, but they
are not the reference composition: no inspector, and Terminals in particular
leaves most of the window empty.

The pieces to build them from all exist: `summary()`, `inspect()` with its
counts / actions / map, `.sheetlist` with per-table `-cols`, and the
`wireInspect` helper that makes a row select without a press on a control
selecting it.

---

## Things worth knowing before touching any of this

**`view.innerHTML` is guarded** (`app/ui/app.js`, near the top). It compares
against what a screen last *produced*, not against the page, because several
screens draw in two stages. Writing the same page twice is free; rely on it.

**A screen that needs to notice something must ask on its own.** Activity does
(`activityTimer`), Workspace does (`workspaceTimer`). Both clear on leaving.

**The vocabulary audit reads three-character runs** now, so short labels are
checked. `app/test/words.test.mjs`.

**Two tests read source rather than behaviour** and will fail loudly if the
shape changes: `app/test/membership.test.mjs` counts the places that add to the
member list, and `app/test/leftrunning.test.mjs` counts clocks against the
things that clear them. Both are deliberate.
