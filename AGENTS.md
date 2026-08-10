# Viberant — agent operating notes

## Project

Viberant is a Windows desktop manager (Electron shell + zero-dependency Node
backend + vanilla-JS frontend) that lets a developer open one project across
several AI coding apps (Claude Code, Codex, Cursor, etc.), manage more than one
account per app, and collaborate with other computers/people through a
peer-to-peer "Workspace": shared projects, presence, live chat, file/folder
offers, incremental sync, and conflict resolution. No database, no cloud
service of Viberant's own — state is JSON/JSONL files under the user's home
folder, and computer-to-computer communication is direct (LAN broadcast +
TCP/relay), authenticated by an Ed25519 device key.

Runtime: Node 22+, ES modules (`.mjs`), **zero npm dependencies** in `app/` and
`core/` (only `electron`/`electron-builder` as devDependencies for packaging).

## Architecture at a glance

- **`desktop/main.js`** — Electron shell. Spawns `app/server.mjs` as a child
  process, waits for it to answer on `http://127.0.0.1:7777`, opens a
  `BrowserWindow` pointed at it. Holds no app logic.
- **`app/server.mjs`** — one big HTTP server (~3500 lines) with a `routes`
  object mapping `'METHOD /path'` strings to handlers, plus the SSE endpoint
  (`GET /events`) and the peer-connection listener (`anywhere.whenSomebodyArrives`
  → `answerPeer`) that answers other computers over the network.
- **`app/*.mjs`** — ~40 single-purpose modules the server imports as
  `import * as name from './name.mjs'`. Each owns one concern (github, deploy,
  workspace, sync, members, chatter, lan, peers, assistant, …). No module
  reaches into another's private state; they compose through the functions
  they export.
- **`app/ui/`** — the entire frontend: `shell.html` (skeleton), `style.css`
  (~3800 lines, one design-token system), `app.js` (~8500 lines: router,
  `SCREENS.*` per tab, all fetch calls, all DOM building via template
  literals — no framework, no build step, no JSX).
- **`core/reference/src/`** — a separate, older "effort" event-sourcing engine
  (state machine + append-only store) used by the project-tracking side of the
  app; has its own test suite under `core/reference/test/`.
- Two workspace layers exist historically: an older GitHub-repo-backed one
  (`app/workspace.mjs`, still reachable from the Workspace screen as "your own
  computers, through GitHub") and the current one built on `app/members.mjs` +
  `app/anywhere.mjs`/`app/peers.mjs`/`app/chatter.mjs`, which is what the
  Workspace tab now renders by default. Don't conflate the two.

## Important paths

- `app/server.mjs` — every HTTP route; the source of truth for what the
  backend can do. `grep -n "'GET \|'POST " app/server.mjs` lists all ~150 routes.
- `app/ui/app.js` — every screen (`SCREENS.projects`, `.ask`, `.apps`,
  `.terminals`, `.workspace`, `.activity`, `.ship`, `.settings`, `.feedback`)
  and the tab list (`const TABS`, near the top).
- `app/members.mjs` — workspace membership: create/invite/redeem/revoke, roles
  and capabilities (`WHAT_ROLES_MAY_DO`), the synchronous `members.now()`
  snapshot used by the peer listener (must never `await` inside a socket
  handler — see `app/peers.mjs`'s `listenDirect`).
- `app/anywhere.mjs` / `app/peers.mjs` — presence + direct/relay connections
  between computers; `beAbout()` opens the listener, `reach()` dials another
  computer, `askPeer`/`answerPeer` (in `server.mjs`) is the request/response
  protocol over one connection split into channels (`app/channels.mjs`).
- `app/chatter.mjs` — the append-only event log for workspace notes and
  `project.changed`/`sync.completed` events; `GET /events` (SSE) and
  `GET /workspace/notes` both read from it. **Do not add a second store for
  anything that should show up in the Workspace UI live** — it must go through
  `chatter.anEvent` + `chatter.remember` + `sayItToTheOthers`.
- `app/sync.mjs` / `app/parcel.mjs` — the incremental-sync and whole-folder
  transfer primitives (`manifest`, `compare`, `conflicts`, `bring`, `serve`,
  `wrap`/`survey`). Reused everywhere something moves between computers.
- `app/lan.mjs` — LAN discovery/broadcast and the offers registry
  (`offer`/`withdraw`/`offeredBy`/`offers`) for files/folders one computer is
  sharing.
- `app/assistant.mjs` — AI provider catalogue (Claude/OpenAI/Gemini), the
  `TROUBLE` classification for provider failures, and `askAbout`/`diagnose`/
  `reviewChanges`/`proposeChange` — the "Ask" feature's backend.
- `app/github.mjs` / `app/deploy.mjs` / `app/providers.mjs` — GitHub save/send
  flow, and website/Vercel deployment.
- `app/test/*.test.mjs` — `node --test`, one file per concern; several
  (`workspace-flow.test.mjs`, `delivery.test.mjs`, `across.test.mjs`,
  `syncing-across.test.mjs`) spin up two real `server.mjs` processes to prove
  cross-computer behavior end to end. `app/test/words.test.mjs` scans every
  user-facing string for version-control jargon — see Working rules.
- `core/reference/` — the older effort/event-sourcing engine; separate test
  suite, mostly independent of the rest of the app.
- `00_DECISIONS.md` / `STATUS.md` / `NEXT.md` — the project's own running log
  of design decisions, current state, and open work. Read `NEXT.md` first for
  "what's half-done right now."

## Working rules

- This is an existing, mostly-complete project. Do not perform a general
  repository audit before every task — start from the files directly related
  to the requested feature or bug.
- Search for the relevant route/function/screen name first
  (`grep -rn "name" app/`) before opening many files.
- Follow dependencies only as needed; most bugs are contained inside one
  `.mjs` module or one `SCREENS.*` function.
- Do not refactor unrelated working code, and preserve existing architecture
  unless explicitly asked to change it.
- Prefer targeted patches over broad rewrites — this codebase's own convention
  is one small, well-commented fix per change.
- **Zero dependencies is a hard rule.** Do not add an npm package to `app/` or
  `core/` without it being recorded as a decision in `00_DECISIONS.md`.
- **No version-control vocabulary in anything a user reads** (commit, branch,
  merge, repository, push, worktree, etc.) — enforced by
  `app/test/words.test.mjs`. Write "save", "send", "the shared copy", etc.
- Every user-facing failure returns `{ ok: false, sentence, action }` — one
  plain sentence about what is true, one thing to do about it. Never a raw
  exception message or error code reaching the UI.
- Never claim something happened when it didn't (a save/send succeeded,
  something reached another computer) without confirmation from the far end —
  this project has been burned by exactly that bug twice.
- Do not silently remove existing functionality, and do not continue hunting
  for unrelated improvements once the requested task is complete.
- Reuse existing patterns: the sync/transfer machinery in `sync.mjs`/
  `parcel.mjs`, the peer protocol in `peers.mjs`/`channels.mjs`, the inspector
  pattern in `app.js` (`inspect()`, `inspectSharedProject`, `inspectTeamDevice`,
  `inspectPerson`) — do not build parallel versions of these.
- Read `NEXT.md` and `docs/CODEX_PROJECT_MAP.md` when broader architectural
  context is actually required (e.g. touching Workspace, sync, or the peer
  protocol).

## Validation

```bash
# full suite (what CI/the project itself considers "done")
npm test
# equivalent to:
node --test "core/reference/test/*.test.mjs"
node --test "app/test/*.test.mjs"

# one file, while iterating
node --test app/test/workspace-flow.test.mjs

# syntax-check a single file fast, without running anything
node --check app/server.mjs
node --input-type=module --check < app/ui/app.js   # app.js has no import/export at top level

# run the app itself
node app/server.mjs         # then open http://localhost:7777
npm run desktop             # Electron window

# rebuild the packaged installer (only when explicitly asked)
npm run build                # -> dist/Viberant-Setup-<version>.exe
```

There is no linter and no type checker configured (no `.eslintrc`, no
TypeScript) — `node --check` / `node --test` are the validation surface.
Run the single relevant test file first; run the full `npm test` (200+
core tests, 600+ app tests) before considering a change to shared
infrastructure (sync, peers, members, chatter, server routing) finished.
The two-computer tests (`workspace-flow.test.mjs`, `delivery.test.mjs`,
`across.test.mjs`, `syncing-across.test.mjs`) take 10–60s each because they
spawn real child processes — normal, not a hang.

## High-risk areas

- **`app/peers.mjs` / `app/anywhere.mjs` / `app/members.mjs`** — the peer
  connection listener must never `await` before deciding whether to accept a
  connection (loses the first message), and `allow` closures must read live
  state (`members.now()`), not a workspace object captured at listener-setup
  time. Both have caused real, hard-to-diagnose bugs.
- **`app/server.mjs`'s `answerPeer`** — one `if (asked.what === '...')` branch
  per message kind; a duplicate kind silently shadows the earlier branch.
- **`app/chatter.mjs`** is the single source for anything that must appear
  live in the Workspace UI. A second ad hoc store for "the same kind of thing"
  is how notes/events silently stop showing up.
- **`app/ui/app.js`** is one 8500-line file with no module boundaries — changes
  to shared helpers (`draw()`, `fill()`, `inspect()`, `SCREENS.workspace`) can
  affect every tab. Search for a function's usages before changing its
  signature.
- **`app/sync.mjs` closing-count check** (in `bring`) — must exclude files the
  receiver kept for itself or files only the receiver has, or a correct sync
  gets reported as a failure (this has broken twice; see D-194/D-211 in
  `00_DECISIONS.md`).
