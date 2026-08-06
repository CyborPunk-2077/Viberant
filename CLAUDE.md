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
app/          the thing you run
  server.mjs    the local server and every route
  ui/           the page: shell.html, style.css, app.js
  tools.mjs     AI apps, and the ways into each one
  terminals.mjs terminals, deliberately kept apart from the AI apps
  projects.mjs  projects, marks, saving and sending
  profiles.mjs  more than one account per app
  github.mjs    everything GitHub, said in plain English
  deploy.mjs    a website and an application, as two separate errands
  workspace.mjs your other computers, meeting through your own GitHub account
  browse.mjs    picking a folder by clicking
  jobs.mjs      long errands, watched while they run
core/         the record of what happened and the rules about it (reference/src)
desktop/      the Electron shell — starts the server, opens a window, nothing else
experiments/  questions answered by measuring rather than arguing
```

Run it: `node app/server.mjs`, then open `http://localhost:7777`. Node 22+, zero dependencies anywhere in this project.

Run the tests:

```
node --test "core/reference/test/*.test.mjs"
node --test "app/test/*.test.mjs"
```

200 tests. **They must all pass before you finish a session.** They are not a safety net, they are where the decisions are enforced — if a change breaks a test, the likely cause is that the change broke a decision.

One of them is `app/test/words.test.mjs`, which reads every line of prose in the app and the page and fails on any version-control vocabulary. The rule below is not a discipline any more; it is a test.

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

The app runs on Windows, has its own window, and now covers the whole errand: projects, AI apps by whichever way they open, terminals, accounts, GitHub, putting things out into the world, and your other computers meeting through your own GitHub account with no server anywhere.

**The open risks are all the same shape — paths that are fully tested but have never been pressed once for real:** joining the shared workspace (it makes a project on your account), signing in to an AI app through a terminal we opened, switching accounts against real Claude Code or Codex, and the last step of a deploy that actually reaches Vercel or makes a release.

Next planned: an icon of its own · custom app entries · tidying up the shared workspace, which grows a small save every two minutes and never prunes.

Full detail in `STATUS.md`.
