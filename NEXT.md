# Next

*Written at the end of a pass, for whoever picks it up. Exact state, exact
continuation point. Everything below is unstarted unless it says otherwise.*

**Where it is:** working tree clean, 677 tests passing (570 app, 107 core).

**What now works, verified with two independent profiles on one machine:**
joining by code (D-178), mutual presence (D-183, D-185, D-186), realtime notes
in under 30ms without GitHub (D-184), and comparing a project across two
computers without moving anything (D-187).

**Two copies on one machine can be told apart** with `VIBERANT_PORT_SHIFT=10`
on the second one, plus its own `USERPROFILE` and `PORT`. That is how the above
was tested and how anything else here should be. It shifts only the ports a
single process must hold alone; the shout everybody listens to does not move.

---

## 1. Running a sync, not just seeing one

`POST /workspace/changes` says what differs. Nothing yet acts on it.

Everything needed exists and none of it should be rewritten:

- `sync.compare` gives `toSend` — exactly the files that must move
- `sync.whatToSend` narrows a survey to those, and hands it to the same
  `wrap` that resume and integrity already go through
- `sync.bring` takes `snapshotWith`, so the copies about to be written over are
  kept first and appear under Ways back
- `sync.conflicts` already names the files both sides changed, and
  `KEEP_MINE` / `KEEP_THEIRS` / `LOOK_FIRST` are already the three answers

**What to build:** a route that takes a device, an offer and a decision for any
conflicting file, and runs `bring` as a job. The Activity screen already draws
jobs, so progress and the result need nothing new.

**Do not** let it run without a decision for every conflicting file. The
comparison already refuses to guess; the transfer must too.

## 2. More kinds of event

`chatter.mjs` carries anything with a `kind`. Only `note` is sent and only
`note` is drawn. The obvious next ones — a member joining, a device arriving or
leaving, a project changing — need a `chatter.anEvent` at the moment they
happen and a branch in `somethingHappened` in the page.

`sayItToTheOthers(ws, event)` in `app/server.mjs` already fans out to every
member who is reachable.

## 3. Watching a shared project for changes

Nothing watches yet, so `project.changed` has nowhere to come from. `watchFolder`
already exists for the open project; a shared project needs the same with
debouncing, and the manifest recomputed at most once every few seconds rather
than once per filesystem notification.

## 4. Signing in at first run

There is no first-run sign-in. Account-dependent parts of the page say so in
each place rather than once.

## 5. Contextual inspectors

Workspace has one (member, device, offered item). Projects, Project Detail, AI
Apps and Terminals do not: selecting a row does nothing beside the list.

`inspect()` takes facts, counts, an action list and a topology map. `wireInspect`
makes a row select without a press on a control inside it selecting it. It is
composition, not new machinery.

---

## Things worth knowing before touching any of this

**`view.innerHTML` is guarded.** It compares against what a screen last
*produced*, not against the page, because several screens draw in two stages.
Writing the same page twice is free; rely on it (D-171).

**Answers are combined state-first, answer-last** — `withWorkspace()`. Writing
`{ ...out, ...around() }` by hand reverses it and turns refusals into successes
(D-179). That shipped nine times.

**Never spread a peer.** Spreading keeps only what an object owns, and a
connection's methods are not that. It passes every check and fails when
something tries to speak (D-186).

**A channel is written to with `write`, a connection with `send`.** Handing one
to something expecting the other throws at the moment it speaks, which looks
exactly like the far end being absent.

**The joining door may only ever carry one message.** A test reads
`app/joining.mjs` and fails if a second kind is added (D-178).

**Three tests read source rather than behaviour** and will fail loudly if the
shape changes: `membership.test.mjs` counts the places that add to the member
list, `leftrunning.test.mjs` counts clocks against the things that clear them,
and `saying.test.mjs` holds the membership check on the stream. All deliberate.
