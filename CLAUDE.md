# Viberant

A manager for opening one project across several AI coding apps. Pick a project once, start whichever app you feel like already pointed at that folder, keep more than one account per app and switch without signing out, and save and send to GitHub in one press.

Built by the founder (AKA) with an AI co-founder. Windows is the target. Dogfooding is the highest priority: **every decision is judged by whether it makes the founder stop reaching for their old workflow.**

---

## Read these first, every session

Do not start work before reading, in this order:

1. **`STATUS.md`** — what is done, what is left, what is blocked. The single source of truth for where things stand.
2. **`00_DECISIONS.md`** — all 23+ decisions, why each was made, and what was rejected. **Do not re-litigate anything in here.** If you think a decision is wrong, say so and explain why; do not silently reverse it.

Optional, when relevant: `DESIGN_REVIEW_REPORT.md` (the analysis the original specification was put through), `core/README.md` (the record format and state machine), `experiments/quiescence/FINDINGS.md` (why silence is set at 180 seconds).

`VIBE.txt` is the original specification. It has been substantially superseded — treat it as history, not instruction. `00_DECISIONS.md` outranks it everywhere they disagree.

---

## Layout

```
app/          the thing you run: server.mjs, shell.html, tools, projects, profiles
core/         the record of what happened and the rules about it (reference/src)
experiments/  questions answered by measuring rather than arguing
```

Run it: `node app/server.mjs`, then open `http://localhost:7777`. Node 22+, zero dependencies anywhere in this project.

Run the tests:

```
node --test "core/reference/test/*.test.mjs"
node --test "app/test/*.test.mjs"
```

141 tests. **They must all pass before you finish a session.** They are not a safety net, they are where the decisions are enforced — if a change breaks a test, the likely cause is that the change broke a decision.

---

## Working rules

**Zero dependencies.** Everything is Node standard library. Do not add a package without a decision recorded in `00_DECISIONS.md` explaining why nothing in the standard library would do.

**Every sentence the app shows must be plain English.** No version-control vocabulary anywhere a person can see — no commit, branch, merge, repository, push, worktree. This is enforced by `core/reference/src/lexicon.mjs` and tested. It applies to error messages too.

**One failure shape.** Anything that goes wrong returns `{ ok: false, sentence, action }` — one plain sentence about what is true, and one thing to do about it. Never an exception message, never a code, never an alarm.

**Never claim something happened when it did not.** Two bugs have already been caught here: saying a save failed when it had actually succeeded, and saying work was sent to GitHub without knowing. Honesty about state is the product.

**Never act on the developer's own work without their intent.** Do not stash, reset, or discard anything a person has in progress. If in doubt, refuse with a sentence and an action.

**Prefer subtraction.** Every abstraction earns its existence. If something can be simpler, simplify it.

---

## Recording decisions

Any non-obvious choice goes in `00_DECISIONS.md` as a new `D-NN` entry with: the decision, why, and what else was considered. Use the status markers already in that file:

`[LOCKED]` founder decision · `[DECIDED]` engineering decision, reopen freely with better evidence · `[ASSUMED]` believed, not verified · `[OPEN]` known gap with an owner

Measure rather than argue where you can. Two decisions in this project came from experiments and both changed the design; both are in `experiments/`.

---

## Before you finish, always

1. All tests pass.
2. `STATUS.md` updated — what changed, what is now left, what is blocked.
3. Any new decision recorded in `00_DECISIONS.md`.
4. Committed, with a message that says what changed and why in plain language.

---

## Where things stand right now

The app works and is tested, but **has never been run on Windows** — that is the largest open risk. Account switching is well tested against a stand-in tool but never against real Claude Code or Codex; if either keeps credentials outside the folder we swap, switching will half-work.

Next planned, in order: a `start.bat` so it launches like an app · packaging as an `.exe` with Electron · watching for folder changes from inside other apps · custom app entries.

Full detail in `STATUS.md`.
