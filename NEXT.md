# Next

*Viberant 2.x is finished. What follows is what was deliberately left out, so
nobody has to rediscover the reasoning.*

**Where it is:** 712 tests passing (605 app, 107 core). The installer needs
building again — `npm run build` — because everything below the last line of
this file changed after `dist/Viberant-Setup-0.1.0.exe` was made.

---

## What works, and was verified by doing it

Joining a workspace with a code, from a computer that has never seen it.
Membership that survives a restart, and a revoked computer that cannot come
back with a fresh code. Mutual presence. Notes in under thirty milliseconds
over the authenticated channel between members, with no hosting service in the
path. A shared folder that settles saying one thing rather than one thing per
file. Comparing a project across two computers without moving anything, and
then a sync that moves only what changed, keeps what somebody chose to keep,
takes a copy of anything about to be written over, and checks the result.

**And the whole errand end to end, between two copies actually running.**
`app/test/workspace-flow.test.mjs` starts them, forms a workspace through the
routes the buttons use, and drives it: enter, see who is there, see a project
somebody else changed, look at what is different, bring it over, settle a
disagreement, up to date. It found three faults that every test above had passed
over — D-193, D-194, D-196 — and two of them were only visible on the second
press. Anything added to the workspace belongs in that file.

The same thing by hand, with two independent profiles on one machine:

```
USERPROFILE=<a folder> PORT=7801 node app/server.mjs
USERPROFILE=<another>  PORT=7802 VIBERANT_PORT_SHIFT=10 node app/server.mjs
```

`VIBERANT_PORT_SHIFT` moves only the ports one process must hold alone. The
broadcast everybody listens to does not move, because two computers that have
never spoken must agree where to shout without being told.

---

## The one thing that is not proved, and exactly how far it got

**A change made on one computer does not reach the other, between two copies
running on this machine.** It is the last link in the flagship errand and it is
the only part of it that is not held by a test.

What was measured, in this order, so nobody has to repeat it:

- The computer that changes a folder **produces the summary correctly**. One
  added and one rewritten, from an edit that did exactly that, with the file
  names. Held by a test.
- Both copies **see each other online**, both ways, once the doors are spaced
  twenty apart rather than one (D-205).
- `lan.offeredBy` works **both ways** — each copy lists the other's projects.
- `anywhere.reach` **succeeds both ways** with spaced doors: it returns a peer
  rather than "could not be reached".
- `askPeer` then fails. `POST /workspace/changes` between them answers *that
  computer would not say what it has* in **both** directions, and a note posted
  on one reports `reached: 0` while that computer can plainly see the other.
- It is not the roles table: `seeOffered` is true for a member.
- It is not the operating system: two sockets bound to one UDP port with
  `reuseAddr` both receive broadcasts here — measured, eight datagrams each.

So the fault is between a peer connection being opened and a question being
answered over it, and it is not new. Every earlier test drove the one direction
that happened to work.

**Where to start:** `answerPeer` in `server.mjs` has **two branches for
`what === 'said'`** — one for a workspace event, one for what a remote terminal
printed. The first shadows the second entirely. That is a certain fault whether
or not it is this one, and it is four lines away from the thing that is failing.

Until it is fixed, the workspace is honest but quiet across machines: it shows
what each computer knows and every button on it works, and a change made
elsewhere arrives when somebody presses rather than on its own.

---

## Deliberately not built

**A first-run sign-in.** There is no Viberant account, and everything works
without one — GitHub and Google are integrations, and a workspace stands on
device keys rather than on any account. Adding a sign-in means adding a service
to sign in to, which is a different product decision than a screen.

**Inspectors on Projects, Project Detail, AI Apps and Terminals.** Workspace
has one. The others have the summary cards and the shared row system but
selecting a row does nothing beside the list. `inspect()` takes facts, counts,
an action list and a topology map; `wireInspect` makes a row select without a
press on a control inside it selecting it. It is composition, not machinery.

**More kinds of event.** `chatter.mjs` carries anything with a `kind`. Notes,
project changes and finished syncs are sent and drawn. Members joining and
leaving, and devices arriving, would each need one `chatter.anEvent` where they
happen and one branch in `somethingHappened`.

**Block-level delta sync.** File-level is what is built, and it is enough: the
comparison is by size and time with hashing where being wrong would be
expensive, and only changed files move.

---

## Things worth knowing before touching any of this

**`view.innerHTML` is guarded.** It compares against what a screen last
*produced*, not against the page, because several screens draw in two stages
(D-171).

**Answers are combined state-first, answer-last** — `withWorkspace()`. Writing
`{ ...out, ...around() }` by hand reverses it and turns refusals into successes
(D-179). That shipped nine times.

**Never spread a peer.** Spreading keeps only what an object owns, and a
connection's methods are not that (D-186).

**A channel is written to with `write`, a connection with `send`.** Handing one
to the other throws at the moment it speaks, which looks exactly like the far
end being absent.

**Watch a folder at the path it was offered at, not its resolved path.** On
Windows the resolved form is accepted and then reports nothing at all (D-189).

**The joining door may only ever carry one message** (D-178).

**Four tests read source rather than behaviour** and will fail loudly if the
shape changes: `membership.test.mjs` counts the places that add to the member
list, `leftrunning.test.mjs` counts clocks against the things that clear them,
`saying.test.mjs` holds the membership check on the stream, and
`keeping.test.mjs` holds the order in which a kept file is read and put back.
All deliberate.

---

## The one external blocker

The installer is unsigned. Windows will warn on first run until there is a
code-signing certificate. Nothing in the app can fix that, and the update path
stays deliberately manual until it exists (D-132).
